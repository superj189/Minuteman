# Progress Log & Resume Guide

A running record of what's built and exactly how to pick up where we left off.

---

## Session — 2026-06-06 (Phase 2 kickoff)

Went from nothing to a working, multi-tenant, auth-gated voter app on live data in
one session. Order of work:

1. **Schema v1** — migrations `0001`–`0005`: extensions/enums, tenancy, voters +
   households, contact/consent/logs, turf/SOS/audit. Multi-tenant (`campaign_id`
   everywhere) and consent-aware from line one. **Deployed to Supabase.**
2. **RLS** — migration `0006`: helper functions + per-table policies + grants.
   Campaign isolation enforced in the database. **Deployed.**
3. **Import** — `scripts/import_hd100.py` loaded HD-100 as tenant #1.
   Re-encoded the authoritative 6-tier classifier (the on-disk `ga_voter_merge.py`
   is a stale 5-tier version — do NOT reuse it). Patched a `best_tier` rollup bug
   (T6+T4/T5 doors were NULL) and added upsert retry on transient drops.
   **43,944 voters + 18,705 households loaded and verified.**
4. **GATE PASSED** — counts + tier distribution + household linkage all check out.
   (Counts differ slightly from the Phase 1 doc because we loaded the ~1,380
   non-geocoded voters Phase 1 excluded — this is correct, not a bug.)
5. **Web app slice 1** — `web/` (Vite + React + TS + Tailwind v4, supabase-js).
   Email/password auth, membership-gated, and a live **voter list** (tier summary
   cards, debounced search, sortable columns, server-side pagination). Working.

**Key decision locked:** the React app talks to Supabase **directly** via supabase-js.
No separate API server in v1 — RLS makes the thin client safe. Edge Functions come
later only for the SOS cron.

---

## Facts you'll need to resume

| Thing | Value |
|---|---|
| GitHub repo | https://github.com/superj189/Votehub (branch `main`) |
| Supabase project ref | `oggpadhkqwtohnjngbxe` |
| HD-100 `campaign_id` | `e4673209-c3ea-46d0-b3b4-4e1aabd734fa` |
| Admin user | `superj189@gmail.com` — role `manager`, `is_platform_owner = true` |
| Source data (local, gitignored) | `../targeted_voters.csv` |

---

## How to run the app

```powershell
cd web
npm run dev
```
Open the printed URL (usually http://localhost:5173) and sign in.

Requires `web/.env.local` (gitignored) with:
```
VITE_SUPABASE_URL=https://oggpadhkqwtohnjngbxe.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable/anon key>
```

To re-run the data import: create `.env` in the repo root with `SUPABASE_URL` +
`SUPABASE_SERVICE_KEY`, then `python scripts/import_hd100.py` (idempotent).

---

## Next builds (pick up here)

Recommended order:
1. **Map page** — Leaflet + household markers (color by `best_tier`) + the real
   district boundary + list/map toggle. This completes the "list-first canvassing
   with a map toggle" core (objective 3).
2. **Stats page** — port the Phase 1 Chart.js views (turnout/registration/tier
   composition) as React components.
3. **Contact logging + consent capture** — voter detail panel: outcome, support
   score, notes, phone/email collection, and consent records. This is the write-path
   and the legally novel part (the `consent_records` / `contact_*` tables exist).
4. **Turf cutting** → **SOS hourly cron** → **PWA packaging**.

---

## Security review (2026-06-06)

Audit found: no secrets in the repo or git history; client code uses only the
publishable/anon key (service_role never reaches the browser); all 14 tables have
RLS; self-promotion to platform-owner is blocked; consent/contact attribution is
pinned to `auth.uid()`. Open items:

- [ ] **Rotate the Supabase DB password** — it was shared in chat; treat as compromised.
      Settings → Database → Reset. *(highest priority)*
- [ ] **Re-enable email confirmation** before real users (toggled OFF for testing).
- [ ] **Deploy migrations `0007` and `0008`** — `0007` pins SECURITY DEFINER
      `search_path = ''` and tightens audit-log attribution; `0008` adds consent
      "void / entered-by-mistake" support (the in-app "mistake?" button needs it).
      Both written, **not yet run** in Supabase. Run them in the SQL Editor in order.
- [ ] **Run Supabase Security Advisor** (Dashboard → Advisors → Security) and clear findings.
- [ ] **Enable leaked-password protection** (Auth settings).
- [ ] Consider **invite-only signup** for production (open signup is safe today since
      membership gates all data, but invite-only is cleaner for a campaign tool).
- Note: with the direct-supabase-js model, any authorized member can query their own
      campaign's voters via the API (RLS still isolates per campaign). Export-prevention
      for the `viewer` role is UI-level only — revisit if a stricter analytics-only
      viewer is wanted (flagged in `0006`).

## Other reminders

- [ ] The Phase 1 dashboard (`../hd100_dashboard.html`) still works standalone and is
      untouched — fine to keep using it alongside during the build.
- [ ] No automated tests yet; verification has been manual (SQL checks + eyeballing).
