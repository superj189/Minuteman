-- ════════════════════════════════════════════════════════════════════════
-- 0002_identity_and_tenancy.sql
-- Tenancy + identity: campaigns (the tenant), user profiles, and the
-- membership table that ties a user to a campaign with a role.
--
-- The multi-tenant rule: EVERY business table downstream carries a
-- campaign_id, and EVERY RLS policy (migration 0006) scopes access through
-- campaign_members. This is the spine of the data-isolation guarantee.
-- ════════════════════════════════════════════════════════════════════════

-- ── campaigns: the tenant table ─────────────────────────────────────────
-- HD-100 is the first row. 2028 campaigns are additional rows; their data is
-- walled off purely by campaign_id + RLS, no schema changes needed.
create table campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,          -- url-safe handle, e.g. 'hd-100'
  district_label text,                           -- e.g. 'GA HD-100'
  state          text not null default 'GA',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ── profiles: one row per authenticated user (mirrors auth.users) ───────
-- Supabase manages the real account in auth.users; we keep app-facing fields
-- (name, platform-owner flag) in public.profiles, joined 1:1 by id.
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             citext,
  full_name         text,
  -- Platform owner = Josh. Lets him create campaigns and manage members.
  -- NOTE: this flag does NOT auto-grant access to any campaign's voter data —
  -- that always flows through campaign_members, even for the owner (see README §licensing).
  is_platform_owner boolean not null default false,
  created_at        timestamptz not null default now()
);

-- Auto-create a profile row whenever a new user signs up via Supabase Auth.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── campaign_members: which user has which role in which campaign ───────
-- The join table that powers all RLS checks. One role per user per campaign.
create table campaign_members (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references profiles(id)  on delete cascade,
  role        member_role not null default 'volunteer',
  created_at  timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index on campaign_members (user_id);
create index on campaign_members (campaign_id);
