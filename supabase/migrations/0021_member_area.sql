-- ════════════════════════════════════════════════════════════════════════
-- 0021_member_area.sql
-- Member logins, board-assigned access, and the member area.
--
--   • Regular members (role 'member') get a login but NOT staff data.
--     `is_campaign_member()` now means "staff" (any role except 'member'), so
--     every existing staff-only rule (voters, roster, contact logs, turf, …)
--     keeps members out automatically. `is_club_member()` = anyone in the club.
--   • Chairman ('manager') alone can add/remove board ('deputy') or chairman.
--   • access_grants: board gives individual members extra pages
--     (precinct_info, voter_outreach, event_checkin, recruiting).
--   • membership_requests: people sign up, board approves.
--   • announcements, member-visible events, public events on the homepage,
--     and "my profile" for members to edit their own info.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Helper functions ─────────────────────────────────────────────────
-- "Staff" = chairman, board, and the legacy campaign roles. Excludes 'member'.
create or replace function public.is_campaign_member(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign_id and m.user_id = auth.uid()
      and m.role <> 'member'
  );
$$;

-- Anyone in the club, members included.
create or replace function public.is_club_member(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_chairman(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign_id and m.user_id = auth.uid() and m.role = 'manager'
  );
$$;

-- Staff can see the names of people in their club; regular members can't
-- browse other people's profiles.
create or replace function public.shares_campaign(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.campaign_members me
    join public.campaign_members them on them.campaign_id = me.campaign_id
    where me.user_id = auth.uid() and me.role <> 'member' and them.user_id = p_user_id
  );
$$;

grant execute on function public.is_club_member(uuid), public.is_chairman(uuid) to authenticated;

-- ── 2. Tenancy tables: let members see their own club + own membership ──
drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns for select
  using ( is_club_member(id) or is_platform_owner() );

drop policy if exists members_select on campaign_members;
create policy members_select on campaign_members for select
  using ( is_campaign_member(campaign_id) or user_id = auth.uid() or is_platform_owner() );

-- ── 3. Only the chairman changes who is on the board ────────────────────
create or replace function public.guard_board_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid := coalesce(new.campaign_id, old.campaign_id);
  v_others   int;
begin
  -- System writes (signup trigger, import scripts) have no signed-in user.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- Never leave a club without a chairman.
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'manager'
     and (tg_op = 'DELETE' or new.role <> 'manager') then
    select count(*) into v_others from public.campaign_members
    where campaign_id = v_campaign and role = 'manager' and user_id <> old.user_id;
    if v_others = 0 then
      raise exception 'The club needs at least one chairman.';
    end if;
  end if;

  if public.is_chairman(v_campaign) or public.is_platform_owner() then
    return coalesce(new, old);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.role in ('manager', 'deputy') then
    raise exception 'Only the chairman can add board members.';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.role in ('manager', 'deputy') then
    raise exception 'Only the chairman can change or remove board members.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists campaign_members_guard on campaign_members;
create trigger campaign_members_guard
  before insert or update or delete on campaign_members
  for each row execute function public.guard_board_roles();

create or replace function public.guard_board_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.role in ('manager', 'deputy')
     and not (public.is_chairman(new.campaign_id) or public.is_platform_owner()) then
    raise exception 'Only the chairman can invite board members.';
  end if;
  return new;
end;
$$;

drop trigger if exists invitations_guard on invitations;
create trigger invitations_guard
  before insert or update on invitations
  for each row execute function public.guard_board_invites();

-- ── 4. Link member records to logins ────────────────────────────────────
alter table members add column if not exists user_id uuid references profiles(id) on delete set null;
create unique index if not exists members_campaign_user_idx on members (campaign_id, user_id) where user_id is not null;

alter table members drop constraint if exists members_source_check;
alter table members add constraint members_source_check
  check (source in ('signup_page', 'event', 'manual', 'import', 'account'));

-- Consent log: tell apart sign-up page, the member themself, and an officer.
create or replace function public.log_member_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := case
    when tg_op = 'INSERT' then new.source
    when auth.uid() is null then 'signup_page'
    when auth.uid() = new.user_id then 'member_self'
    else 'officer_edit' end;
begin
  if tg_op = 'INSERT' or new.email_opt_in is distinct from old.email_opt_in then
    if tg_op = 'UPDATE' or new.email_opt_in then
      insert into public.member_consent_events (campaign_id, member_id, channel, granted, consent_text, source, recorded_by)
      values (new.campaign_id, new.id, 'email', new.email_opt_in,
              case when new.email_opt_in then new.consent_text end, v_source, auth.uid());
    end if;
  end if;
  if tg_op = 'INSERT' or new.sms_opt_in is distinct from old.sms_opt_in then
    if tg_op = 'UPDATE' or new.sms_opt_in then
      insert into public.member_consent_events (campaign_id, member_id, channel, granted, consent_text, source, recorded_by)
      values (new.campaign_id, new.id, 'sms', new.sms_opt_in,
              case when new.sms_opt_in then new.consent_text end, v_source, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

-- ── 5. Access grants (board → member) ───────────────────────────────────
create table if not exists access_grants (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  feature     text not null check (feature in ('precinct_info', 'voter_outreach', 'event_checkin', 'recruiting')),
  granted_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (campaign_id, user_id, feature)
);

alter table access_grants enable row level security;
drop policy if exists grants_select on access_grants;
drop policy if exists grants_insert on access_grants;
drop policy if exists grants_delete on access_grants;
create policy grants_select on access_grants for select
  using (is_campaign_admin(campaign_id) or user_id = auth.uid());
create policy grants_insert on access_grants for insert with check (
  is_campaign_admin(campaign_id)
  and exists (select 1 from campaign_members m where m.campaign_id = access_grants.campaign_id and m.user_id = access_grants.user_id)
);
create policy grants_delete on access_grants for delete using (is_campaign_admin(campaign_id));
revoke all on access_grants from anon;
grant select, insert, delete on access_grants to authenticated;

-- Does the current user have this page? Board always does.
create or replace function public.has_access(p_campaign_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_campaign_admin(p_campaign_id) or exists (
    select 1 from public.access_grants g
    join public.campaign_members m on m.campaign_id = g.campaign_id and m.user_id = g.user_id
    where g.campaign_id = p_campaign_id and g.user_id = auth.uid() and g.feature = p_feature
  );
$$;

create or replace function public.my_access(p_campaign_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when public.is_campaign_admin(p_campaign_id)
      then array['precinct_info', 'voter_outreach', 'event_checkin', 'recruiting']
    else coalesce((
      select array_agg(g.feature order by g.feature) from public.access_grants g
      join public.campaign_members m on m.campaign_id = g.campaign_id and m.user_id = g.user_id
      where g.campaign_id = p_campaign_id and g.user_id = auth.uid()
    ), '{}')
  end;
$$;

-- ── 6. Membership requests (self sign-up → board approves) ──────────────
create table if not exists membership_requests (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  full_name   text not null,
  email       citext not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by  uuid references profiles(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (campaign_id, user_id)
);

alter table membership_requests enable row level security;
drop policy if exists requests_select on membership_requests;
create policy requests_select on membership_requests for select
  using (is_campaign_admin(campaign_id) or user_id = auth.uid());
revoke all on membership_requests from anon;
grant select on membership_requests to authenticated;   -- writes only through the functions below

create or replace function public.request_membership(p_slug text, p_full_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_email    text;
  v_name     text := nullif(trim(p_full_name), '');
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if v_name is null or length(v_name) > 120 then raise exception 'Please enter your full name.'; end if;

  select id into v_campaign from public.campaigns where slug = p_slug and is_active;
  if v_campaign is null then raise exception 'Club not found.'; end if;

  if exists (select 1 from public.campaign_members where campaign_id = v_campaign and user_id = auth.uid()) then
    return 'member';
  end if;

  select email into v_email from public.profiles where id = auth.uid();
  update public.profiles set full_name = coalesce(full_name, v_name) where id = auth.uid();

  insert into public.membership_requests (campaign_id, user_id, full_name, email)
  values (v_campaign, auth.uid(), v_name, v_email)
  on conflict (campaign_id, user_id) do update
    set full_name = excluded.full_name, status = 'pending', decided_by = null, decided_at = null, created_at = now()
    where public.membership_requests.status <> 'approved';
  return 'pending';
end;
$$;

create or replace function public.approve_membership(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.membership_requests;
  v_first text;
  v_last  text;
  v_found uuid;
begin
  select * into r from public.membership_requests where id = p_request_id;
  if r.id is null then raise exception 'Request not found.'; end if;
  if not public.is_campaign_admin(r.campaign_id) then raise exception 'Only board members can approve.'; end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (r.campaign_id, r.user_id, 'member')
  on conflict (campaign_id, user_id) do nothing;

  -- Link to their existing member record (matched by email), or create one.
  select id into v_found from public.members
  where campaign_id = r.campaign_id and (user_id = r.user_id or email = r.email)
  order by (user_id = r.user_id) desc nulls last
  limit 1;

  if v_found is not null then
    update public.members set user_id = r.user_id where id = v_found and user_id is null;
  else
    v_first := split_part(r.full_name, ' ', 1);
    v_last  := trim(substr(r.full_name, length(v_first) + 1));
    insert into public.members (campaign_id, first_name, last_name, email, source, status, user_id, created_by)
    values (r.campaign_id, v_first, v_last, r.email, 'account', 'active', r.user_id, auth.uid());
  end if;

  update public.membership_requests
  set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where id = r.id;
  return 'approved';
end;
$$;

create or replace function public.deny_membership(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from public.membership_requests where id = p_request_id;
  if v_campaign is null or not public.is_campaign_admin(v_campaign) then
    raise exception 'Only board members can do that.';
  end if;
  update public.membership_requests
  set status = 'denied', decided_by = auth.uid(), decided_at = now()
  where id = p_request_id;
  return 'denied';
end;
$$;

-- ── 7. Announcements ────────────────────────────────────────────────────
create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  title       text not null,
  body        text not null,
  pinned      boolean not null default false,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists announcements_campaign_idx on announcements (campaign_id, pinned desc, created_at desc);

drop trigger if exists announcements_set_updated_at on announcements;
create trigger announcements_set_updated_at
  before update on announcements
  for each row execute function set_updated_at();

alter table announcements enable row level security;
drop policy if exists announcements_select on announcements;
drop policy if exists announcements_write on announcements;
create policy announcements_select on announcements for select using (is_club_member(campaign_id));
create policy announcements_write on announcements for all
  using (is_campaign_admin(campaign_id)) with check (is_campaign_admin(campaign_id));
revoke all on announcements from anon;
grant select, insert, update, delete on announcements to authenticated;

-- ── 8. Events: members can see them; some are shown on the homepage ─────
alter table events add column if not exists is_public boolean not null default false;

drop policy if exists events_select on events;
create policy events_select on events for select using (is_club_member(campaign_id));

create or replace function public.public_upcoming_events(p_slug text)
returns table (name text, starts_at timestamptz, location text, description text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.name, e.starts_at, e.location, e.description
  from public.events e
  join public.campaigns c on c.id = e.campaign_id
  where c.slug = p_slug and c.is_active and e.is_public
    and e.starts_at > now() - interval '3 hours'
  order by e.starts_at
  limit 6;
$$;

-- Check-in desk (members granted event_checkin): open/close + see who's in.
create or replace function public.set_checkin_open(p_event_id uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from public.events where id = p_event_id;
  if v_campaign is null or not public.has_access(v_campaign, 'event_checkin') then
    raise exception 'You do not have check-in access.';
  end if;
  update public.events set checkin_open = p_open where id = p_event_id;
end;
$$;

create or replace function public.event_roster(p_event_id uuid)
returns table (first_name text, last_name text, was_new boolean, source text, checked_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from public.events where id = p_event_id;
  if v_campaign is null or not public.has_access(v_campaign, 'event_checkin') then
    raise exception 'You do not have check-in access.';
  end if;
  return query
    select m.first_name, m.last_name, a.was_new, a.source, a.checked_in_at
    from public.event_attendance a join public.members m on m.id = a.member_id
    where a.event_id = p_event_id
    order by a.checked_in_at desc;
end;
$$;

-- ── 9. My profile (a member editing their own record) ───────────────────
create or replace function public.my_profile(p_campaign_id uuid)
returns table (
  first_name text, last_name text, email text, phone text, birth_date date, zip text,
  email_opt_in boolean, sms_opt_in boolean, status public.club_member_status, joined timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.first_name, m.last_name, m.email::text, m.phone, m.birth_date, m.zip,
         m.email_opt_in, m.sms_opt_in, m.status, m.created_at
  from public.members m
  where m.campaign_id = p_campaign_id and m.user_id = auth.uid();
$$;

create or replace function public.update_my_profile(
  p_campaign_id  uuid,
  p_first_name   text,
  p_last_name    text,
  p_phone        text,
  p_birth_date   date,
  p_zip          text,
  p_email_opt_in boolean,
  p_sms_opt_in   boolean,
  p_consent_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m       public.members;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_zip   text := nullif(trim(p_zip), '');
  v_in    boolean;
begin
  select * into m from public.members where campaign_id = p_campaign_id and user_id = auth.uid();
  if m.id is null then raise exception 'No member record is linked to your account yet.'; end if;

  if nullif(trim(p_first_name), '') is null or nullif(trim(p_last_name), '') is null then
    raise exception 'Please enter your first and last name.';
  end if;
  if length(v_phone) = 11 and left(v_phone, 1) = '1' then v_phone := substr(v_phone, 2); end if;
  if v_phone = '' then v_phone := null; end if;
  if v_phone is not null and length(v_phone) <> 10 then raise exception 'Please enter a 10-digit phone number.'; end if;
  if coalesce(p_sms_opt_in, false) and v_phone is null then raise exception 'Add a phone number to get text updates.'; end if;
  if v_zip is not null and v_zip !~ '^[0-9]{5}$' then raise exception 'Please enter a 5-digit ZIP code.'; end if;

  v_in := (coalesce(p_email_opt_in, false) and not m.email_opt_in) or (coalesce(p_sms_opt_in, false) and not m.sms_opt_in);

  update public.members set
    first_name   = left(trim(p_first_name), 60),
    last_name    = left(trim(p_last_name), 60),
    phone        = v_phone,
    birth_date   = p_birth_date,
    zip          = v_zip,
    email_opt_in = coalesce(p_email_opt_in, false),
    sms_opt_in   = coalesce(p_sms_opt_in, false),
    consent_text = case when v_in then left(p_consent_text, 1000) else consent_text end,
    consent_at   = case when v_in then now() else consent_at end
  where id = m.id;
end;
$$;

-- ── 10. Function permissions ────────────────────────────────────────────
revoke all on function public.has_access(uuid, text), public.my_access(uuid),
  public.request_membership(text, text), public.approve_membership(uuid), public.deny_membership(uuid),
  public.public_upcoming_events(text), public.set_checkin_open(uuid, boolean), public.event_roster(uuid),
  public.my_profile(uuid),
  public.update_my_profile(uuid, text, text, text, date, text, boolean, boolean, text)
from public;

grant execute on function public.has_access(uuid, text), public.my_access(uuid),
  public.request_membership(text, text), public.approve_membership(uuid), public.deny_membership(uuid),
  public.set_checkin_open(uuid, boolean), public.event_roster(uuid),
  public.my_profile(uuid),
  public.update_my_profile(uuid, text, text, text, date, text, boolean, boolean, text)
to authenticated;
grant execute on function public.public_upcoming_events(text) to anon, authenticated;
