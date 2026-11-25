# Minuteman — Session Handoff

**Last updated:** 2026-11-25 · **Last code commit:** 2026-07-14 · **Branch:** `main`

This is the single document to read first when resuming. It captures the complete
state of the project so you can pick up cold. (Companion docs: `PROGRESS.md` = running
log; `README.md` = repo overview; `../HD100_PROJECT_DOCUMENTATION.md` = Phase 1 history.)

---

## 1. TL;DR — where things stand

**Minuteman is a fully-built, live, multi-tenant voter-contact platform** for political
campaigns, deployed at **https://minuteman.vote**. Phase 1 (a single-file analytics
dashboard) evolved into Phase 2 (this real app: Supabase + React, installable on phones).

- **Feature-complete** for core canvassing: voter list, interactive map, turf cutting,
  contact/consent logging, team management, live analytics, dark mode, mobile PWA.
- **One tenant loaded:** Georgia State House District 100 (HD-100) — 43,944 voters,
  18,705 households.
- **Not yet hardened for production launch** — a short pre-launch checklist remains
  (see §8), the most important being **upgrade Supabase off the free tier**.
- **Context for this resume:** it's now late November 2026; the November 3 general
  election has passed. No code changes since July 14. **The free-tier Supabase database
  has very likely auto-paused again** (see §7) — check that first if the app looks down.

---

## 2. What it is

A Republican campaign built this to target door-knocking in **GA HD-100** (suburban
Atlanta: Forsyth, Gwinnett, Hall counties). Owner: **Josh** (`superj189@gmail.com`),
who is **not a coder** — communicate in plain language and do as much of the hands-on
work as possible (see memory `working-preferences`).

**The vision:** a platform Josh owns and licenses to campaigns as an in-kind donation,
multi-tenant from day one (HD-100 is tenant #1; more campaigns in 2028).

**The 6-tier voter classification** (the core analytic; priority order T6→T1→T2→T3→T4→T5,
first match wins):

| Tier | Name | Definition | ~count |
|---|---|---|---|
| T1 | Loyal Republican | voted 2026 R primary | 6,366 |
| T2 | High Target | voted 2024 R primary, not 2026 | 1,038 |
| T3 | Persuasion Target | voted 2024 general, no primary, white/unspecified | 11,916 |
| T4 | White Non-General | white/unspecified, no general, no primary | 5,729 |
| T5 | Unlikely Target | remaining non-DNC | 14,469 |
| T6 | Do Not Contact | voted a Dem primary & not 2026 R | 4,426 |

> ⚠️ The on-disk `../ga_voter_merge.py` is a **stale 5-tier** classifier — do NOT reuse it.
> The authoritative 6-tier logic lives in `scripts/import_hd100.py`.

---

## 3. Key facts & credentials

| Thing | Value |
|---|---|
| **Live site** | https://minuteman.vote (apex → `www.minuteman.vote`) |
| **GitHub repo** | https://github.com/superj189/Minuteman (branch `main`) |
| **Hosting** | Vercel (project `minuteman`, **root directory = `web`**, auto-deploys on push to `main`) |
| **Domain registrar** | Porkbun (minuteman.vote); DNS A `@`→`216.198.79.1`, CNAME `www`→vercel |
| **Database** | Supabase, project ref `oggpadhkqwtohnjngbxe`, **free tier (see §7)** |
| **HD-100 `campaign_id`** | `e4673209-c3ea-46d0-b3b4-4e1aabd734fa` |
| **Admin user** | `superj189@gmail.com` — role `manager`, `is_platform_owner = true` |
| **Product name** | **Minuteman** (working name; needs trademark clearance before public marketing — "Votehub", the original, was trademark-crowded) |

**Secrets** live only in local gitignored files, never in the repo:
- `web/.env.local` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key; safe in client)
- `hd100-platform/.env` → `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secret — scripts only), `SUPABASE_DB_URL` (Session-pooler Postgres URI, used by `run_migrations.mjs`)
- In Vercel: the two `VITE_` vars are set as project env vars.

---

## 4. Architecture & stack

- **Database/Auth/API:** Supabase (Postgres 15 + PostGIS + RLS + GoTrue auth).
- **Frontend:** Vite + React + TypeScript + Tailwind v4, `web/` directory.
- **Data access:** the React app talks to Supabase **directly via `supabase-js`** — there
  is **no separate API server**. **Row Level Security is the security boundary**; a thin
  client is safe because every table's access is enforced in the database. (Edge Functions
  were only ever planned for the SOS cron, never built.)
- **Maps:** Leaflet + react-leaflet, CartoDB dark tiles, `@geoman-io/leaflet-geoman-free`
  for drawing turf. PostGIS stores points/polygons as `geography(...,4326)`.
- **Charts:** Chart.js + react-chartjs-2.
- **PWA:** `vite-plugin-pwa` (autoUpdate service worker, installable, offline app shell).
- **Roles** (`member_role` enum, enforced via RLS, not just UI):
  `manager` / `deputy` = admins; `volunteer` = field worker; `viewer` = analytics-only.

---

## 5. What's built (feature inventory)

All of this is live at minuteman.vote. Pages are gated by auth + campaign membership.

- **Login** (`LoginPage`) — email/password sign in / sign up.
- **Voter List** (`VoterListPage`) — tier summary cards (click to filter), search,
  **Response filter** (contacted / not-yet / supporters / opposed / not-home), sortable
  columns, server-side pagination. **Mobile = tidy cards, desktop = table** (no side-scroll).
  Each voter shows a response chip. Click a voter → detail drawer.
- **Voter Detail drawer** (`VoterDetail`) — log a contact (outcome, support 1–5, channel),
  capture **consent** per type (grant/revoke, plus **"mistake?" void** that strikes an
  erroneous entry while keeping the audit trail), collect phone/email with provenance,
  freeform notes. Each contact shows **which volunteer logged it**. Delete buttons on
  logs/contacts/notes.
- **Map** (`MapPage`) — unified canvass + turf view (no mode toggle):
  - ~18.7k household markers colored by best tier, sized by household size; tier filter
    legend (collapsible on mobile); real **1,473-vertex district boundary**.
  - Click a household → roster card → tap a resident → log a contact.
  - **Turf cutting** (admins): draw polygons with Geoman; **vertices snap to the district
    edge**, and drawn shapes are **auto-clipped to the district boundary** (overshoot the
    edge and it trims). Zones show **voter counts that respect the tier filter**; assign a
    zone to a volunteer; delete zones.
- **Stats** (`StatsPage`) — demographic charts (tier distribution, gender, race, age,
  turnout by race/age with election selector) + **Canvassing responses** section
  (outcome donut, support-level bar) that is **click-through to the underlying voters**.
- **Team / Manager tools** (`TeamPage`, admins only) — roster with roles (change/remove),
  **invite** people (adds existing users immediately, or auto-joins them on signup),
  **per-volunteer zone assignment**, and **hit-rate stats** (contacts / talked % /
  supporters) with an **all-time / 7-day / 30-day** selector. The stat numbers are
  **clickable → drill-down list** of those voters (`CanvassDrill`).
- **Account** (`AccountPage`, everyone) — change name, change password, **Appearance
  (Light / Dark / System)**, sign out.
- **Dark mode** — full light/dark/system theming (CSS-override approach in `index.css`;
  `lib/theme.ts` manages it; no-flash inline script in `index.html`).
- **PWA** — installable on phones (iOS: Safari → Share → Add to Home Screen), app icon,
  iOS safe-area handled on header + drawers, `dvh` so panels clear the browser toolbar.

---

## 6. Database (17 migrations, all deployed)

Apply/replay any with `node scripts/run_migrations.mjs supabase/migrations/NNNN_*.sql`
(needs `SUPABASE_DB_URL` in `.env`). All are idempotent-safe to re-run.

| # | File | What it does |
|---|---|---|
| 0001 | extensions_and_enums | pgcrypto/postgis/citext; all enums; `set_updated_at` |
| 0002 | identity_and_tenancy | `campaigns`, `profiles` (1:1 auth.users, `is_platform_owner`), signup trigger, `campaign_members` |
| 0003 | voters_and_households | `households` (hh_key, geom, rollups), `voters` (full SOS cols + vote flags + tier + geom + `raw` jsonb + early-vote fields) |
| 0004 | contact_consent_logs | `contact_info`, `contact_logs`, `notes`, `consent_records` (append-only), `current_consent` view, `yard_signs` |
| 0005 | turf_and_sos | `turfs` (geography polygon), `turf_assignments`, `voters_in_turf()`, `sos_imports`, `audit_log` |
| 0006 | rls_policies | helper fns + **RLS on all tables** + grants (the isolation spine) |
| 0007 | security_hardening | pin `search_path=''` on SECURITY DEFINER fns; tighten audit insert |
| 0008 | consent_void | `voided_*` cols on consent; current_consent ignores voided; void policy |
| 0009 | stats_function | `campaign_stats()` RPC |
| 0010 | turf_functions | `create_turf()`, `turfs_geojson` view, `turf_voter_count()` |
| 0011 | perf_stats_and_points | **perf fix** — `campaign_stats` + new `campaign_map_points` as DEFINER + single membership check + materialized CTE (fixed Stats timeout & slow map load) |
| 0012 | turf_clip_to_district | `campaigns.boundary`; `create_turf` clips to district via `ST_Intersection` |
| 0013 | turf_tier_breakdown | `turf_tier_breakdown()` — per-tier counts inside a zone |
| 0014 | invitations_and_team | `invitations` table, `invite_member()` RPC, signup trigger auto-joins invited emails |
| 0015 | response_tracking | per-voter contact summary cols + trigger; `canvass_report()` RPC |
| 0016 | canvass_report_dates | `canvass_report` takes optional `p_since`/`p_until` |
| 0017 | harden_remaining_functions | pin search_path on `set_updated_at` + `voters_in_turf` |

**Data loaded:** 43,944 voters, 18,705 households, district boundary set, 2 team members
(Josh + 1), 0 contact_logs (demo data was intentionally cleared pre-launch).

---

## 7. ⚠️ CRITICAL operational issue — Supabase free-tier auto-pause

**Free Supabase projects auto-pause after ~1 week of inactivity.** When paused, the API
hostname **stops resolving entirely** and the app goes blank for everyone — it *looks*
like a front-end bug but is not. This already happened once (June/July) and was restored
from the dashboard with **zero data loss**.

**Given the months-long gap, the project is almost certainly paused right now.**

- **To diagnose:** `nslookup oggpadhkqwtohnjngbxe.supabase.co 8.8.8.8` — "Non-existent
  domain" = paused. Also check `nslookup` + a `/rest/v1/` fetch (see scripts pattern).
- **To fix:** Josh opens supabase.com → the project → **"Restore"**. Takes a few minutes.
- **The permanent fix / hard pre-launch requirement:** **upgrade to Supabase Pro (~$25/mo)**
  so it can never pause during a live campaign.

> Debugging rule: if the app is blank, check Supabase reachability **first** before any
> front-end/cache theory.

---

## 8. Pre-launch checklist (open items)

Needed before putting it in front of real volunteers. The dashboard items are Josh's
to toggle (they require his Supabase login).

- [ ] **Upgrade Supabase to Pro** — see §7. *Hard requirement.*
- [ ] **Re-enable email confirmation** (Auth settings — turned OFF for testing). *(dashboard)*
- [ ] **Enable leaked-password protection** (Auth settings). *(dashboard)*
- [ ] **Invite-only signup** — disable open signups (optional but cleaner). *(dashboard)*
- [ ] **Trademark clearance** for "Minuteman" before any public marketing.
- [ ] **Rotate DB password** once more (hygiene — it passed through chat); then update
      `SUPABASE_DB_URL` in `.env` directly (never chat).
- Done already: all tables have RLS; all functions have pinned search_path; demo data cleared.

---

## 9. Planned / future features (not built)

1. **Vote-timing propensity** — early vs. election-day voter flag. Needs the *vote method*
   per past election (not in current data); re-download the free GA SOS voter history
   files from mvp.sos.ga.gov, extract method, add a `voters` field, compute propensity.
2. **Live GA SOS early-vote ingestion** — hourly job to pull GA's early-vote file during
   the voting window and update a live tracker. Schema is prepped (`voters.voted_early`
   etc. + `sos_imports`). Would be an Edge Function + cron. (The 2026 window has now passed.)
3. **Phone-number login** — needs an SMS provider (Twilio) + budget.
4. **Invites that actually send** an email or text (today it just creates a pending record;
   manager tells the person to sign up). Email needs SMTP; SMS shares #3's provider.
5. **(Minor)** date-range selector on the Stats response charts (Team already has one).

---

## 10. Dev workflow & gotchas

**Run locally:** `cd web && npm run dev` → open the printed URL, sign in.
**Deploy:** push to `main` → Vercel auto-builds (root dir `web`).
**Apply a migration:** `node scripts/run_migrations.mjs supabase/migrations/NNNN_*.sql`.
**I (Claude) can run SQL/admin tasks** myself via the `pg` connection + Supabase admin
REST API using the keys in `.env` — used throughout for migrations, verification,
creating/deleting test users, and seeding/clearing demo data.

**Gotchas / landmines:**
- **Never commit `playwright` in `web/package.json`** — its postinstall downloads browsers
  and breaks the Vercel build. The screenshot/diagnostic workflow installs it temporarily,
  then uninstalls before any commit. (`web/shoot.mjs`, `web/diag*.mjs` are gitignored.)
- **Visual self-check at phone size:** recreate a test login (`scripts/make_test_user.mjs`
  → mobiletest@example.com / TestPass123!), `npm i -D playwright` + `npx playwright install
  chromium` (and `webkit` to catch Safari-only issues) in `web/`, run dev server, then
  `node web/shoot.mjs` (THEME=dark for dark mode). Delete the test user + uninstall
  playwright after.
- **Demo data:** `scripts/create_demo_data.mjs` seeds demo volunteers + contacts so the
  analytics populate; `scripts/clear_demo_data.mjs` wipes them. Both gitignored (test creds).
  Currently cleared.
- **Key bug fixed (don't regress):** `AuthProvider` must filter `campaign_members` by
  `.eq('user_id', session.user.id)` — the roster is readable to all members, so without the
  filter a volunteer loads everyone and misreads their own role as a manager's (looked like
  a permissions bug; was display-only, RLS still blocked actions).
- **No automated tests** — verification is manual (SQL checks + headless screenshots).
- `.env.example` on disk documents the required env var shape.

---

## 11. First moves when resuming

1. **Check if Supabase is paused** (§7) — most likely the first thing needed. Restore it.
2. **Verify data intact + app loads** (voter/household counts, a real login via the anon key).
3. Ask Josh the direction: wrap up HD-100 / post-election analysis, or pivot toward the
   **multi-campaign 2028 platform** the architecture was built for (add a 2nd `campaigns`
   tenant, onboarding flow, etc.).
4. If going live again: knock out the **pre-launch checklist** (§8), Pro upgrade first.
