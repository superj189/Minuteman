"""
import_hd100.py
==============
Loads targeted_voters.csv into Supabase as the HD-100 campaign (tenant #1).

What it does
------------
1. Reads targeted_voters.csv (the Phase 1 output with geocodes + tier flags).
2. Re-applies the authoritative 6-tier classifier from scratch so the DB copy
   is always correct regardless of which legacy script produced the CSV.
3. Builds the households table (one row per hh_key, rollups computed locally).
4. Upserts voters in batches (safe to re-run; existing rows are updated).
5. Links each voter to its household row.

Requirements
------------
    pip install supabase pandas python-dotenv tqdm

Setup
-----
Create  hd100-platform/.env  (already gitignored) with:

    SUPABASE_URL=https://<your-project-ref>.supabase.co
    SUPABASE_SERVICE_KEY=<your service_role key>     # Settings → API in Supabase

The service_role key bypasses RLS so the bulk import can write freely.
NEVER use the anon key here, and NEVER commit .env to GitHub.

Run
---
From the hd100-platform/ directory:
    python scripts/import_hd100.py

Or point at a different CSV:
    python scripts/import_hd100.py --csv /path/to/targeted_voters.csv
"""

import argparse
import json
import math
import os
import sys
import time

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

# ── Config ──────────────────────────────────────────────────────────────────
CAMPAIGN_ID = "e4673209-c3ea-46d0-b3b4-4e1aabd734fa"
DEFAULT_CSV = os.path.join(os.path.dirname(__file__), "..", "..", "targeted_voters.csv")
BATCH_SIZE  = 500   # rows per upsert call; Supabase default payload limit ~1 MB

# ── 6-tier classifier (authoritative — re-derived from source flags) ─────────
# Priority order: T6 → T1 → T2 → T3 → T4 → T5 (first match wins).
# Source: HD100_PROJECT_DOCUMENTATION.md §4.
TIER_META = {
    6: ("Do Not Contact",    "Voted Democratic primary — do not contact"),
    1: ("Loyal Republican",  "Voted 2026 R primary — core base, confirm support"),
    2: ("High Target",       "Voted 2024 R primary, not 2026 — mobilize"),
    3: ("Persuasion Target", "Voted 2024 general, no primary, white/unspecified race"),
    4: ("White Non-General", "White/unspecified, no 2024 general, no primary"),
    5: ("Unlikely Target",   "Non-white specified race, low engagement"),
}

WHITE_RACES = {"WHITE", "UNKNOWN", ""}   # treat blank/unknown as white per §4

def classify(row) -> int:
    r26d = _b(row, "voted_any_d_primary")
    r26r = _b(row, "voted_2026_r_primary")
    r24r = _b(row, "voted_2024_r_primary")
    r24g = _b(row, "voted_2024_general")
    race  = str(row.get("Race", "") or "").strip().upper()
    white = race in WHITE_RACES

    if r26d and not r26r:   return 6
    if r26r:                return 1
    if r24r:                return 2
    if r24g and white:      return 3
    if white:               return 4
    return 5

def _b(row, col) -> bool:
    """Coerce CSV boolean strings ('True'/'False'/True/False/NaN) to bool."""
    v = row.get(col, False)
    if isinstance(v, bool): return v
    return str(v).strip().lower() == "true"

# ── Helpers ──────────────────────────────────────────────────────────────────
def nan_to_none(v):
    """Replace float NaN / pandas NA with None (JSON null) for Supabase."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v

def clean(row: dict) -> dict:
    """Apply nan_to_none to every value in the row dict."""
    return {k: nan_to_none(v) for k, v in row.items()}

def batch(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def upsert(client, table: str, rows: list[dict], conflict: str, retries: int = 5):
    """Upsert a batch into Supabase, retrying on transient network errors.

    Supabase occasionally drops a connection mid-stream (WinError 10054 / ReadError)
    on a long import. Upserts are idempotent (on_conflict), so retrying a batch is safe.
    """
    for attempt in range(retries):
        try:
            res = client.table(table).upsert(rows, on_conflict=conflict).execute()
            if hasattr(res, "error") and res.error:
                raise RuntimeError(f"{table} upsert error: {res.error}")
            return
        except RuntimeError:
            raise  # an API/data error, not transient — don't retry
        except Exception as e:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt  # 1, 2, 4, 8s backoff
            print(f"\n  ! {table} batch failed ({type(e).__name__}); retry {attempt+1}/{retries-1} in {wait}s")
            time.sleep(wait)

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Import HD-100 voter data into Supabase")
    parser.add_argument("--csv", default=DEFAULT_CSV, help="Path to targeted_voters.csv")
    parser.add_argument("--dry-run", action="store_true", help="Parse + classify but don't write to DB")
    args = parser.parse_args()

    # ── Load env ────────────────────────────────────────────────────────────
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in hd100-platform/.env\n"
            "       See the docstring at the top of this file for setup instructions."
        )

    client = create_client(url, key)
    print(f"Connected to Supabase: {url}")
    print(f"Campaign ID: {CAMPAIGN_ID}\n")

    # ── Load CSV ─────────────────────────────────────────────────────────────
    csv_path = os.path.abspath(args.csv)
    if not os.path.exists(csv_path):
        sys.exit(f"ERROR: CSV not found at {csv_path}")
    print(f"Loading {csv_path} …")
    df = pd.read_csv(csv_path, dtype=str, low_memory=False)
    print(f"  {len(df):,} rows, {len(df.columns)} columns\n")

    # ── Re-classify (authoritative 6-tier) ───────────────────────────────────
    print("Classifying voters into 6 tiers …")
    df["_tier"] = df.apply(classify, axis=1)
    for t, (label, desc) in TIER_META.items():
        n = (df["_tier"] == t).sum()
        print(f"  T{t} {label:<22} {n:>6,}")
    print()

    if args.dry_run:
        print("Dry run — exiting before any DB writes.")
        return

    # ════════════════════════════════════════════════════════════════════════
    # PASS 1: Households
    # Build one row per hh_key with rollups, upsert into households table.
    # ════════════════════════════════════════════════════════════════════════
    print("Building households …")

    # Coerce lat/lon to float for aggregation
    df["_lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["_lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df["_tier_int"] = df["_tier"].astype(int)

    hh_rows = []
    for hh_key, grp in df.groupby("hh_key", dropna=True):
        tiers    = grp["_tier_int"].tolist()
        has_dnc  = 6 in tiers
        targets  = [t for t in tiers if t in (1, 2, 3)]
        has_tgt  = bool(targets)
        # best_tier = highest-priority (lowest #) NON-DNC tier present at the door.
        # A T6+T4/T5 door now surfaces its T4/T5 (previously fell through to NULL,
        # which would have left those doors uncolored on the map). A door that is
        # entirely T6 has no non-DNC tier, so best_tier stays NULL by design.
        non_dnc  = [t for t in tiers if t != 6]
        best     = min(non_dnc) if non_dnc else None
        is_mixed = has_tgt and has_dnc

        lat = grp["_lat"].dropna().mean()
        lon = grp["_lon"].dropna().mean()

        hh_rows.append({
            "campaign_id": CAMPAIGN_ID,
            "hh_key":      hh_key,
            "full_address": nan_to_none(grp["full_address"].iloc[0]),
            "city":         nan_to_none(grp["Residence City"].iloc[0]),
            "zip":          nan_to_none(grp["Residence Zipcode"].iloc[0]),
            "lat":          None if (isinstance(lat, float) and math.isnan(lat)) else float(lat),
            "lon":          None if (isinstance(lon, float) and math.isnan(lon)) else float(lon),
            "voter_count":  len(grp),
            "best_tier":    nan_to_none(best),
            "has_target":   has_tgt,
            "has_dnc":      has_dnc,
            "is_mixed":     is_mixed,
        })

    print(f"  {len(hh_rows):,} distinct households")
    print(f"  Upserting in batches of {BATCH_SIZE} …")
    for b in tqdm(list(batch(hh_rows, BATCH_SIZE)), unit="batch"):
        upsert(client, "households", b, "campaign_id,hh_key")
    print()

    # Fetch back all household rows to get their UUIDs for the voter FK
    print("Fetching household IDs from DB …")
    hh_map = {}   # hh_key → uuid
    page, page_size = 0, 1000
    while True:
        res = (client.table("households")
               .select("id,hh_key")
               .eq("campaign_id", CAMPAIGN_ID)
               .range(page * page_size, (page + 1) * page_size - 1)
               .execute())
        rows = res.data or []
        for r in rows:
            hh_map[r["hh_key"]] = r["id"]
        if len(rows) < page_size:
            break
        page += 1
    print(f"  {len(hh_map):,} households retrieved\n")

    # ════════════════════════════════════════════════════════════════════════
    # PASS 2: Voters
    # Map CSV columns → DB columns, attach tier + household FK, upsert.
    # ════════════════════════════════════════════════════════════════════════

    # Long-tail SOS district columns that go into raw jsonb
    RAW_COLS = [
        "Judicial District", "County Commission District", "School Board District",
        "City Council District", "Municipal School Board District", "Water Board District",
        "Super Council District", "Super Commissioner District", "Super School Board District",
        "Fire District", "Combo", "Land Lot", "Land District",
        "Municipal Precinct", "Municipal Precinct Description",
        "Last Modified Date", "Date of Last Contact", "Voter Created Date",
        "id_x", "id_y",
    ]

    def parse_date(v):
        if not v or str(v).strip() in ("", "nan", "None", "NaT"):
            return None
        try:
            return pd.to_datetime(v).date().isoformat()
        except Exception:
            return None

    def parse_int(v):
        try:
            i = int(float(v))
            return i
        except (TypeError, ValueError):
            return None

    print(f"Building voter records …")
    voter_rows = []
    for _, row in tqdm(df.iterrows(), total=len(df), unit="voter"):
        tier = int(row["_tier"])
        label, desc = TIER_META[tier]
        hh_key = nan_to_none(row.get("hh_key"))

        raw = {c: nan_to_none(row.get(c)) for c in RAW_COLS if c in df.columns}

        v = {
            "campaign_id":           CAMPAIGN_ID,
            "registration_number":   str(row.get("Voter Registration Number", "")).strip(),
            "household_id":          hh_map.get(hh_key) if hh_key else None,
            "hh_key":                hh_key,

            # Identity
            "county":                nan_to_none(row.get("County")),
            "status":                nan_to_none(row.get("Status")),
            "status_reason":         nan_to_none(row.get("Status Reason")),
            "last_name":             nan_to_none(row.get("Last Name")),
            "first_name":            nan_to_none(row.get("First Name")),
            "middle_name":           nan_to_none(row.get("Middle Name")),
            "suffix":                nan_to_none(row.get("Suffix")),
            "birth_year":            parse_int(row.get("Birth Year")),
            "age":                   parse_int(row.get("Age")),
            "race":                  nan_to_none(row.get("Race")),
            "gender":                nan_to_none(row.get("Gender")),

            # Residence address
            "res_street_number":     nan_to_none(row.get("Residence Street Number")),
            "res_pre_direction":     nan_to_none(row.get("Residence Pre Direction")),
            "res_street_name":       nan_to_none(row.get("Residence Street Name")),
            "res_street_type":       nan_to_none(row.get("Residence Street Type")),
            "res_post_direction":    nan_to_none(row.get("Residence Post Direction")),
            "res_apt_unit":          nan_to_none(row.get("Residence Apt Unit Number")),
            "res_city":              nan_to_none(row.get("Residence City")),
            "res_zip":               nan_to_none(row.get("Residence Zipcode")),
            "full_address":          nan_to_none(row.get("full_address")),

            # Mailing address
            "mail_street_number":    nan_to_none(row.get("Mailing Street Number")),
            "mail_street_name":      nan_to_none(row.get("Mailing Street Name")),
            "mail_apt_unit":         nan_to_none(row.get("Mailing Apt Unit Number")),
            "mail_city":             nan_to_none(row.get("Mailing City")),
            "mail_zip":              nan_to_none(row.get("Mailing Zipcode")),
            "mail_state":            nan_to_none(row.get("Mailing State")),
            "mail_country":          nan_to_none(row.get("Mailing Country")),

            # Key districts
            "congressional_district": nan_to_none(row.get("Congressional District")),
            "state_senate_district":  nan_to_none(row.get("State Senate District")),
            "state_house_district":   nan_to_none(row.get("State House District")),
            "county_precinct":        nan_to_none(row.get("County Precinct")),
            "county_precinct_desc":   nan_to_none(row.get("County Precinct Description")),
            "municipality":           nan_to_none(row.get("Municipality")),

            # Dates
            "registration_date":     parse_date(row.get("Registration Date")),
            "last_party_voted":      nan_to_none(row.get("Last Party Voted")),
            "last_vote_date":        parse_date(row.get("Last Vote Date")),

            # Vote history flags
            "voted_2026_primary":    _b(row, "voted_2026_primary"),
            "voted_2024_primary":    _b(row, "voted_2024_primary"),
            "voted_2024_general":    _b(row, "voted_2024_general"),
            "voted_2026_r_primary":  _b(row, "voted_2026_r_primary"),
            "voted_2024_r_primary":  _b(row, "voted_2024_r_primary"),
            "voted_any_d_primary":   _b(row, "voted_any_d_primary"),

            # Tier (re-classified)
            "tier":                  tier,
            "tier_label":            label,
            "tier_desc":             desc,

            # Geocode
            "lat":                   nan_to_none(row.get("_lat")),
            "lon":                   nan_to_none(row.get("_lon")),

            # Raw SOS data (lossless)
            "raw":                   json.dumps(raw) if raw else None,
        }
        voter_rows.append(clean(v))

    print(f"\nUpserting {len(voter_rows):,} voters in batches of {BATCH_SIZE} …")
    for b in tqdm(list(batch(voter_rows, BATCH_SIZE)), unit="batch"):
        upsert(client, "voters", b, "campaign_id,registration_number")

    print("\n✅ Import complete.")
    print(f"   Households : {len(hh_rows):,}")
    print(f"   Voters     : {len(voter_rows):,}")
    print("\nNext step: run the verification queries in scripts/verify_import.sql")


if __name__ == "__main__":
    main()
