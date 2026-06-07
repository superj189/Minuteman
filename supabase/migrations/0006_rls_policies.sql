-- ════════════════════════════════════════════════════════════════════════
-- 0006_rls_policies.sql
-- Row Level Security: the permission model enforced IN THE DATABASE.
--
-- This is the spine of the data-isolation guarantee (locked objective 2).
-- Even if the app has a bug, the database refuses to return another campaign's
-- rows to a user who isn't a member of that campaign.
--
-- READING THIS FILE
--   • Helper functions (top) answer "who is the current user, and what may they
--     do in campaign X?" They are SECURITY DEFINER so they read membership
--     directly without triggering RLS recursion.
--   • Then every table gets RLS enabled + named policies, each with a one-line
--     plain-English explanation.
--   • Then GRANTs — RLS only filters rows the role is *already* allowed to touch,
--     so the table privileges matter too.
--
-- ROLE MODEL (member_role)
--   manager / deputy  → admins: full campaign control
--   volunteer         → field worker: read voters, log contacts/consent/notes
--   viewer            → analytics only: read aggregate-relevant data, NO writes,
--                       NO operational PII (phone/email/notes), NO export (UI-enforced)
--
--   platform owner (Josh) → can create campaigns + manage members, but gets NO
--                           automatic access to any campaign's voter rows. Voter
--                           access ALWAYS flows through a campaign_members row.
--                           (This is what keeps each licensed campaign walled off.)
--
--   service_role (import script, SOS cron) → bypasses RLS entirely by design.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- 1. HELPER FUNCTIONS
--    SECURITY DEFINER + a fixed search_path so they run as the owner and read
--    membership without recursing through the very policies that call them.
-- ════════════════════════════════════════════════════════════════════════

-- Is the current user the platform owner (Josh)?
create or replace function is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_platform_owner from profiles where id = auth.uid()),
    false
  );
$$;

-- Is the current user a member of this campaign in ANY role (incl. viewer)?
create or replace function is_campaign_member(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid()
  );
$$;

-- Is the current user a "field member" — manager, deputy, or volunteer?
-- These roles may WRITE field data and may read operational PII (phone/email/notes).
-- Viewers are deliberately excluded.
create or replace function is_field_member(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid()
      and role in ('manager','deputy','volunteer')
  );
$$;

-- Is the current user an admin (manager or deputy) of this campaign?
create or replace function is_campaign_admin(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid()
      and role in ('manager','deputy')
  );
$$;

-- The current user's role in a campaign (or null). Handy for the app.
create or replace function current_campaign_role(p_campaign_id uuid)
returns member_role language sql stable security definer set search_path = public as $$
  select role from campaign_members
  where campaign_id = p_campaign_id and user_id = auth.uid();
$$;

-- Does the current user share at least one campaign with another user?
-- Used so members can see each other's names (in logs, assignments) but not
-- the names of strangers in other campaigns.
create or replace function shares_campaign(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from campaign_members me
    join campaign_members them on them.campaign_id = me.campaign_id
    where me.user_id = auth.uid() and them.user_id = p_user_id
  );
$$;

grant execute on function
  is_platform_owner(), is_campaign_member(uuid), is_field_member(uuid),
  is_campaign_admin(uuid), current_campaign_role(uuid), shares_campaign(uuid),
  voters_in_turf(uuid)
to authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- 2. ENABLE RLS ON EVERY TABLE
--    With RLS on and no matching policy, access is denied by default.
-- ════════════════════════════════════════════════════════════════════════
alter table campaigns         enable row level security;
alter table profiles          enable row level security;
alter table campaign_members  enable row level security;
alter table households        enable row level security;
alter table voters            enable row level security;
alter table contact_info      enable row level security;
alter table contact_logs      enable row level security;
alter table notes             enable row level security;
alter table consent_records   enable row level security;
alter table yard_signs        enable row level security;
alter table turfs             enable row level security;
alter table turf_assignments  enable row level security;
alter table sos_imports       enable row level security;
alter table audit_log         enable row level security;


-- ════════════════════════════════════════════════════════════════════════
-- 3. POLICIES
-- ════════════════════════════════════════════════════════════════════════

-- ── campaigns ───────────────────────────────────────────────────────────
-- Read: members of the campaign, plus the platform owner (who manages all).
create policy campaigns_select on campaigns for select
  using ( is_campaign_member(id) or is_platform_owner() );
-- Only the platform owner spins up a new campaign (tenant).
create policy campaigns_insert on campaigns for insert
  with check ( is_platform_owner() );
-- Owner or a campaign admin may edit campaign settings.
create policy campaigns_update on campaigns for update
  using ( is_platform_owner() or is_campaign_admin(id) )
  with check ( is_platform_owner() or is_campaign_admin(id) );
-- Only the owner may delete a tenant.
create policy campaigns_delete on campaigns for delete
  using ( is_platform_owner() );

-- ── profiles ────────────────────────────────────────────────────────────
-- Read: yourself; anyone you share a campaign with (to show names); owner sees all.
create policy profiles_select on profiles for select
  using ( id = auth.uid() or is_platform_owner() or shares_campaign(id) );
-- Update: only your own row. (Column grant below prevents editing is_platform_owner.)
create policy profiles_update on profiles for update
  using ( id = auth.uid() )
  with check ( id = auth.uid() );
-- No insert/delete policy: profiles are created by the signup trigger and removed
-- by the auth.users cascade — never directly by a client.

-- ── campaign_members ────────────────────────────────────────────────────
-- Read: members can see the roster of campaigns they belong to; owner sees all.
create policy members_select on campaign_members for select
  using ( is_campaign_member(campaign_id) or is_platform_owner() );
-- Add/change/remove members: campaign admins, or the platform owner.
create policy members_insert on campaign_members for insert
  with check ( is_campaign_admin(campaign_id) or is_platform_owner() );
create policy members_update on campaign_members for update
  using ( is_campaign_admin(campaign_id) or is_platform_owner() )
  with check ( is_campaign_admin(campaign_id) or is_platform_owner() );
create policy members_delete on campaign_members for delete
  using ( is_campaign_admin(campaign_id) or is_platform_owner() );

-- ── households ──────────────────────────────────────────────────────────
-- Read: any member (needed for the household map/list and analytics).
create policy households_select on households for select
  using ( is_campaign_member(campaign_id) );
-- Write: admins only (populated by the import; corrected by admins).
create policy households_write on households for all
  using ( is_campaign_admin(campaign_id) )
  with check ( is_campaign_admin(campaign_id) );

-- ── voters ──────────────────────────────────────────────────────────────
-- Read: any member of the campaign — including viewer, so the stats/map
-- (computed client-side, as in Phase 1) work.  ⚠ DECISION POINT: if you want
-- viewers to NOT see raw voter rows (true "analytics without raw files", §13),
-- change is_campaign_member → is_field_member here and serve viewers aggregate
-- views instead. Left permissive for v1 to match the existing dashboard.
--
-- Also note: volunteers can read ALL voters in the campaign, not just their
-- assigned turf. Turf is an operational focus, not a hard security boundary in
-- v1. Tightening this to turf-scoped reads is a later option (spatial policy).
create policy voters_select on voters for select
  using ( is_campaign_member(campaign_id) );
-- Write: admins only. (Bulk import + the SOS early-vote cron run as service_role
-- and bypass RLS; this covers manual admin corrections.)
create policy voters_write on voters for all
  using ( is_campaign_admin(campaign_id) )
  with check ( is_campaign_admin(campaign_id) );

-- ── contact_info (phone / email — operational PII) ──────────────────────
-- Read: field members only. A finance VIEWER does not need raw phone/email.
create policy contact_info_select on contact_info for select
  using ( is_field_member(campaign_id) );
-- Insert: field members (collected at the door / appended).
create policy contact_info_insert on contact_info for insert
  with check ( is_field_member(campaign_id) );
-- Update/delete: an admin, or the volunteer who created the row.
create policy contact_info_update on contact_info for update
  using ( is_campaign_admin(campaign_id) or created_by = auth.uid() )
  with check ( is_campaign_admin(campaign_id) or created_by = auth.uid() );
create policy contact_info_delete on contact_info for delete
  using ( is_campaign_admin(campaign_id) or created_by = auth.uid() );

-- ── contact_logs (canvass interactions) ─────────────────────────────────
-- Read: any member (support scores/outcomes feed analytics).
create policy contact_logs_select on contact_logs for select
  using ( is_campaign_member(campaign_id) );
-- Insert: a field member logging THEIR OWN interaction.
create policy contact_logs_insert on contact_logs for insert
  with check ( is_field_member(campaign_id) and contacted_by = auth.uid() );
-- Update/delete: an admin, or the volunteer who logged it.
create policy contact_logs_update on contact_logs for update
  using ( is_campaign_admin(campaign_id) or contacted_by = auth.uid() )
  with check ( is_campaign_admin(campaign_id) or contacted_by = auth.uid() );
create policy contact_logs_delete on contact_logs for delete
  using ( is_campaign_admin(campaign_id) or contacted_by = auth.uid() );

-- ── notes (freeform — operational PII) ──────────────────────────────────
-- Read: field members only (not viewers).
create policy notes_select on notes for select
  using ( is_field_member(campaign_id) );
-- Insert: a field member authoring their own note.
create policy notes_insert on notes for insert
  with check ( is_field_member(campaign_id) and author_id = auth.uid() );
-- Update/delete: an admin, or the author.
create policy notes_update on notes for update
  using ( is_campaign_admin(campaign_id) or author_id = auth.uid() )
  with check ( is_campaign_admin(campaign_id) or author_id = auth.uid() );
create policy notes_delete on notes for delete
  using ( is_campaign_admin(campaign_id) or author_id = auth.uid() );

-- ── consent_records (APPEND-ONLY legal log) ─────────────────────────────
-- Read: any member (consent counts feed analytics; admins audit provenance).
create policy consent_select on consent_records for select
  using ( is_campaign_member(campaign_id) );
-- Insert: a field member attesting to a consent they personally captured.
create policy consent_insert on consent_records for insert
  with check ( is_field_member(campaign_id) and attested_by = auth.uid() );
-- NO update/delete policies, on purpose: consent history is immutable. A change
-- of mind is a NEW row (granted = false). This is the TCPA-defensible design.

-- ── yard_signs (consent → delivered workflow) ───────────────────────────
-- Read: any member (delivery list/layer).
create policy yard_signs_select on yard_signs for select
  using ( is_campaign_member(campaign_id) );
-- Insert/update: field members (volunteers move signs through the lifecycle).
create policy yard_signs_insert on yard_signs for insert
  with check ( is_field_member(campaign_id) );
create policy yard_signs_update on yard_signs for update
  using ( is_field_member(campaign_id) )
  with check ( is_field_member(campaign_id) );
-- Delete: admins only.
create policy yard_signs_delete on yard_signs for delete
  using ( is_campaign_admin(campaign_id) );

-- ── turfs (drawn polygons) ──────────────────────────────────────────────
-- Read: any member (volunteers need to see their turf on the map).
create policy turfs_select on turfs for select
  using ( is_campaign_member(campaign_id) );
-- Cut/edit/delete turf: admins only.
create policy turfs_write on turfs for all
  using ( is_campaign_admin(campaign_id) )
  with check ( is_campaign_admin(campaign_id) );

-- ── turf_assignments ────────────────────────────────────────────────────
-- Read: admins (manage all) OR the volunteer the turf is assigned to.
create policy turf_assign_select on turf_assignments for select
  using ( is_campaign_admin(campaign_id) or assigned_to = auth.uid() );
-- Assign/reassign/unassign: admins only.
create policy turf_assign_insert on turf_assignments for insert
  with check ( is_campaign_admin(campaign_id) );
-- A volunteer may update the STATUS of their own assignment (in_progress/complete);
-- admins may update any. (Column-level lock-down of which fields a volunteer can
-- change is an app-layer concern in v1.)
create policy turf_assign_update on turf_assignments for update
  using ( is_campaign_admin(campaign_id) or assigned_to = auth.uid() )
  with check ( is_campaign_admin(campaign_id) or assigned_to = auth.uid() );
create policy turf_assign_delete on turf_assignments for delete
  using ( is_campaign_admin(campaign_id) );

-- ── sos_imports (early-vote ingestion log) ──────────────────────────────
-- Read + write: admins only. (The cron job itself runs as service_role.)
create policy sos_imports_select on sos_imports for select
  using ( is_campaign_admin(campaign_id) );
create policy sos_imports_write on sos_imports for all
  using ( is_campaign_admin(campaign_id) )
  with check ( is_campaign_admin(campaign_id) );

-- ── audit_log (APPEND-ONLY governance trail) ────────────────────────────
-- Read: admins only. Insert: any member (so app actions can be logged).
create policy audit_select on audit_log for select
  using ( is_campaign_admin(campaign_id) );
create policy audit_insert on audit_log for insert
  with check ( is_campaign_member(campaign_id) );
-- No update/delete: the trail is tamper-evident.


-- ════════════════════════════════════════════════════════════════════════
-- 4. TABLE PRIVILEGES
--    RLS filters ROWS, but a role still needs the table privilege to act at all.
--    We grant to `authenticated` (logged-in users) and keep `anon` locked out.
-- ════════════════════════════════════════════════════════════════════════

-- No anonymous access to any application table.
revoke all on all tables in schema public from anon;

-- Standard read/write tables (rows still gated by the policies above).
grant select, insert, update, delete on
  campaigns, campaign_members, households, voters,
  contact_info, contact_logs, notes,
  yard_signs, turfs, turf_assignments, sos_imports
to authenticated;

-- Append-only tables: grant SELECT + INSERT only (no update/delete privilege
-- at all — belt-and-suspenders alongside the missing update/delete policies).
grant select, insert on consent_records to authenticated;
grant select, insert on audit_log to authenticated;

-- profiles: read allowed by policy; users may edit only their own name/email.
-- Withholding UPDATE on is_platform_owner prevents self-promotion to owner.
grant select on profiles to authenticated;
grant update (email, full_name) on profiles to authenticated;

-- The current-consent convenience view. security_invoker makes it honor the
-- querying user's RLS on consent_records (rather than the view owner's).
alter view current_consent set (security_invoker = on);
grant select on current_consent to authenticated;
