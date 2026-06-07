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
| GitHub repo | https://github.com/superj189/Minuteman (branch `main`) |
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

- [x] **Migrations `0007` and `0008` deployed** (2026-06-07) via `scripts/run_migrations.mjs`.
      `0007` hardened SECURITY DEFINER search_path + audit attribution; `0008` added
      consent void support. Future migrations: I run them with that script (needs
      `SUPABASE_DB_URL` in `.env`).
- [ ] **DB password hygiene** — password was rotated once, but the new connection
      string (with password) was pasted in chat. Optionally rotate again and update
      `SUPABASE_DB_URL` in `.env` directly (Notepad), never via chat.
- [x] **Database-level advisor findings cleared** (2026-06-07, migration `0017`):
      all 14 tables have RLS; every function now has a pinned search_path.
      Remaining advisor findings are auth toggles (below).
- [x] **Demo data cleared** (2026-06-07) via `scripts/clear_demo_data.mjs`.
- [ ] **Re-enable email confirmation** before real users (toggled OFF for testing). *(dashboard)*
- [ ] **Enable leaked-password protection** (Auth settings). *(dashboard)*
- [ ] Consider **invite-only signup** for production (open signup is safe today since
      membership gates all data, but invite-only is cleaner for a campaign tool).
- Note: with the direct-supabase-js model, any authorized member can query their own
      campaign's voters via the API (RLS still isolates per campaign). Export-prevention
      for the `viewer` role is UI-level only — revisit if a stricter analytics-only
      viewer is wanted (flagged in `0006`).

## Requested features (planned, not urgent)

1. **Vote-timing propensity** — a stat showing whether a voter tends to vote early
   vs. on election day. Needs the *vote method* per past election, which is NOT in
   `targeted_voters.csv` (only yes/no "did they vote" flags were kept). The method
   lives in the GA SOS **voter history files** (free, re-downloadable from
   mvp.sos.ga.gov). Build path: re-download history files → extract absentee/advance
   vs. election-day method → add a `voters` field (additive migration) → compute
   propensity. No data lost by waiting.
2. **Live GA SOS early-vote retrieval** — the hourly ingestion (objective 7). Schema is
   already prepped: `voters.voted_early / early_vote_date / early_vote_method` +
   `sos_imports` table. Nothing to ingest until early voting opens (~mid-Oct 2026).
   Build the cron/Edge Function closer to then.

   *Synergy:* #1 (likely-to-vote-early) + #2 (already-voted) together let the campaign
   stop canvassing people who've already voted and focus election-day GOTV on
   supporters who typically wait.
3. **Phone-number login** — allow signing in with a cell number as an alternative to
   email. Supabase Auth supports phone/OTP, but it needs an SMS provider (Twilio/etc.)
   configured + costs per message. Decide provider + budget when we build it.
4. **Invites send an email or text** — currently inviting just creates a pending record;
   the manager tells the person to sign up. Make `invite_member` (or an Edge Function)
   actually send an email invite (Supabase `inviteUserByEmail`, needs SMTP config) or an
   SMS (needs the same SMS provider as #3).
5. **Dark mode** — for both the web app and the installed PWA. Tailwind `dark:` variants
   + a theme toggle (and respect the OS setting); update the PWA theme_color too.

## Dev tooling notes

- **Mobile/visual self-check:** I can screenshot the app at a phone viewport without
  the user. Recreate a throwaway manager login with `node scripts/make_test_user.mjs`
  (mobiletest@example.com / TestPass123!), `npm install -D playwright` + `npx playwright
  install chromium` inside `web/`, run the dev server, then `node web/shoot.mjs`. These
  files are gitignored (test creds) and playwright must be uninstalled from `web/` before
  committing (its postinstall downloads browsers → would break the Vercel build). Delete
  the test user afterward via the auth admin API.
- The web app is responsive as of 2026-06-07 (voter cards on mobile, collapsible map
  panels, fitted header).

## Other reminders

- [ ] The Phase 1 dashboard (`../hd100_dashboard.html`) still works standalone and is
      untouched — fine to keep using it alongside during the build.
- [ ] No automated tests yet; verification has been manual (SQL checks + eyeballing).
