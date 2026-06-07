# Minuteman

> Working product name (chosen 2026-06; needs attorney trademark clearance + a domain
> before public launch — see `docs/PROGRESS.md`).

Multi-tenant, consent-aware voter-contact platform for campaigns. Evolves the Phase 1
single-file dashboard into a real backend + app, debuting live for the **November 2026
general** (HD-100) and architected to host additional campaigns in 2028.

See the canonical project doc (`../HD100_PROJECT_DOCUMENTATION.md`) for full background.

---

## Status

| Stage | State |
|---|---|
| **Schema v1** (`0001`–`0005`) | ✅ deployed to Supabase |
| **Row Level Security policies** (`0006`) | ✅ deployed |
| **Import script** — HD-100 loaded as tenant #1 | ✅ 43,944 voters + 18,705 households, verified |
| **GATE:** data loads & isolation holds | ✅ **passed** |
| **Web app — auth + voter list** (`web/`) | ✅ working live against Supabase |
| **Map page** — boundary + household markers + roster cards | ✅ working |
| **Contact logging + consent capture** (list & map) | ✅ working (incl. consent void) |
| **Stats page** — live charts (`0009` stats function) | ✅ working |
| **Turf cutting** — draw/assign zones, district clipping + snapping (`0010`/`0012`/`0013`) | ✅ working (merged into Map) |
| **PWA** — installable on phones, app icon, offline app shell | ✅ working |
| **Deploy to Vercel** (HTTPS; needed for phone install) | ⏳ next |
| SOS hourly early-vote cron (build ~Oct 2026) | ⏳ |

See [`docs/PROGRESS.md`](docs/PROGRESS.md) for the session log and how to resume.

> **Review gate:** the schema is reviewed and deployed *before* any application
> code. Changing the schema after a frontend exists is the expensive mistake.

---

## Stack

- **Database:** Supabase (Postgres + PostGIS) — Row Level Security for permissions, realtime for live updates.
- **Auth:** Supabase Auth → `public.profiles` (1:1 with `auth.users`).
- **Spatial:** PostGIS — voter/household points and turf polygons as `geography(...,4326)`.
- Frontend (React), API, PWA, and the SOS cron come after the gate.

---

## Repo layout

```
hd100-platform/
├── README.md
├── .gitignore                 # ignores all PII/data files — never commit voter data
└── supabase/
    └── migrations/
        ├── 0001_extensions_and_enums.sql
        ├── 0002_identity_and_tenancy.sql      campaigns, profiles, campaign_members
        ├── 0003_voters_and_households.sql     the voter roll + household grouping
        ├── 0004_contact_consent_logs.sql      contact_info, contact_logs, notes,
        │                                       consent_records, yard_signs
        ├── 0005_turf_and_sos.sql              turfs, turf_assignments, sos_imports, audit_log
        └── 0006_rls_policies.sql              RLS: helper fns + per-table policies + grants
```

> ⚠️ **Never commit voter data.** `targeted_voters.csv`, the SOS file, and the
> dashboard HTML all contain PII and are git-ignored. The import script reads them
> from a local path; they do not belong in GitHub.

---

## How to deploy the schema (Supabase)

**Option A — SQL editor (simplest):** open your Supabase project → SQL Editor →
paste the contents of each migration **in numeric order** (`0001` → `0005`) and run.

**Option B — Supabase CLI:** `supabase db push` (the CLI runs files in
`supabase/migrations/` in order; filenames already sort correctly).

PostGIS and pgcrypto are enabled by the first migration (`create extension …`).

---

## Multi-tenancy model (how isolation works)

- **`campaigns`** is the tenant table. HD-100 is row #1; 2028 campaigns are just more rows.
- **Every** business table carries a `campaign_id`.
- **Every** RLS policy (migration 0006) scopes access through `campaign_members`,
  so a user only ever sees rows for campaigns they belong to.
- **Platform owner (Josh)** has `profiles.is_platform_owner = true` to create
  campaigns and manage members — but this flag does **not** auto-grant access to any
  campaign's voter rows. Even the owner sees voter data only via a `campaign_members`
  row. This keeps each campaign's purchased voter file walled off (addresses the
  §21-2-601 commercial-use posture and the licensing model).

### Roles (`member_role`)
| Role | Intent |
|---|---|
| `manager` | Full campaign control: all voters, cut/assign turf, manage volunteers. |
| `deputy` | Same operational powers as manager. |
| `volunteer` | Works assigned turf/lists; logs contacts, consent, notes. |
| `viewer` | Read-only analytics (finance/consultants) — no raw voter export. |

Exact per-table read/write rules are defined and explained in migration `0006`.

---

## The 6-tier classification (lives in the import pipeline, not the schema)

The schema stores `tier` (1–6) + `tier_label` + `tier_desc`; it does **not**
compute them. The classifier is reconstructed in the import script. Priority order
(a voter falls into the first tier they qualify for): **T6 → T1 → T2 → T3 → T4 → T5**.

| Tier | Name | Definition |
|---|---|---|
| T6 | Do Not Contact | Voted any Dem primary (2024/2026) and not the 2026 R primary |
| T1 | Loyal Republican | Voted 2026 R primary |
| T2 | High Target | Voted 2024 R primary, not 2026, not DNC |
| T3 | Persuasion Target | Voted 2024 general, no primary, white/unspecified race |
| T4 | White Non-General | White/unspecified, no 2024 general, no primary |
| T5 | Unlikely Target | All remaining non-T6 |

> ⚠️ The on-disk `ga_voter_merge.py` from Phase 1 implements an **older 5-tier**
> scheme and must NOT be reused as-is. The current 6-tier logic exists only in the
> `targeted_voters.csv` output and the project doc; the import script will encode it.

---

## Design choices made in Schema v1 (override any of these before deploy)

- **Consent is channel-aware** (`consent_kind` enum: general / email / phone / sms /
  donation_solicitation / yard_sign), append-only, with method + attesting volunteer
  recorded per event — for TCPA defensibility. A `current_consent` view exposes the
  latest state per voter/type.
- **Yard signs** carry a full `consented → delivered` lifecycle (objective 5b). No
  sign-inventory counting (parked for later, §16).
- **PostGIS** is used for voter/household points and turf polygons, with a
  `voters_in_turf(turf_id)` helper for spatial walk lists. (If your Supabase PostGIS
  version rejects the generated `geom` column as non-immutable, the fallback is a
  BEFORE-INSERT/UPDATE trigger — note it during review and I'll switch it.)
- **`donation_solicitation`** consent records only "OK to ask" — there is no
  money movement anywhere in this schema (link out to ActBlue/WinRed/Anedot).
- **`raw jsonb`** on `voters` preserves the full original SOS row, so the long tail
  of district/precinct fields is never lost even though only the common ones are columns.

---

## Tables at a glance

| Table | Purpose |
|---|---|
| `campaigns` | Tenant. Every table scopes to this. |
| `profiles` | App-facing user record (1:1 with `auth.users`). |
| `campaign_members` | User ↔ campaign ↔ role. Powers all RLS. |
| `households` | One row per address; rollups + spatial point for turf/map. |
| `voters` | The roll. Ports `targeted_voters.csv` + early-vote fields + `raw`. |
| `contact_info` | Phone/email with source provenance. |
| `contact_logs` | One row per canvass interaction. |
| `notes` | Freeform voter notes. |
| `consent_records` | Append-only consent event log (+ `current_consent` view). |
| `yard_signs` | Consent → delivered fulfillment. |
| `turfs` / `turf_assignments` | Drawn turf polygons and volunteer ownership. |
| `sos_imports` | Log of each SOS early-vote pull. |
| `audit_log` | Light data-governance trail. |
