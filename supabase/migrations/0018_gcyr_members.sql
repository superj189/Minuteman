-- ════════════════════════════════════════════════════════════════════════
-- 0018_gcyr_members.sql
-- Pivot to Gwinnett County Young Republicans (GCYR).
--
--   • Adds GCYR as a new organization (a row in `campaigns`, the tenant table).
--   • Retires HD-100 (marked inactive; its data is kept, not deleted).
--   • `members`: people who joined or are interested in the club.
--   • `member_consent_events`: append-only record of every email/text opt-in
--     or opt-out (needed to prove consent before texting anyone).
--   • Two public functions the anonymous sign-up page may call:
--       public_org(slug)  → the club's display name
--       public_join(...)  → adds a sign-up. The page NEVER reads the table.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- ── Organizations: allow public sign-up per org ─────────────────────────
alter table campaigns add column if not exists public_signup boolean not null default false;

insert into campaigns (name, slug, district_label, state, is_active, public_signup)
values ('Gwinnett County Young Republicans', 'gcyr', 'Gwinnett County, GA', 'GA', true, true)
on conflict (slug) do update set public_signup = true, is_active = true;

-- Retire HD-100 (kept for reference; hidden from the app).
update campaigns set is_active = false where id = 'e4673209-c3ea-46d0-b3b4-4e1aabd734fa';

-- The platform owner (Josh) runs the new club as manager.
insert into campaign_members (campaign_id, user_id, role)
select c.id, p.id, 'manager'
from campaigns c cross join profiles p
where c.slug = 'gcyr' and p.is_platform_owner
on conflict (campaign_id, user_id) do nothing;

-- ── members ─────────────────────────────────────────────────────────────
do $$ begin
  create type club_member_status as enum ('new', 'contacted', 'active', 'dues_paid', 'inactive');
exception when duplicate_object then null; end $$;

create table if not exists members (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  email         citext,
  phone         text,                       -- digits only, 10 long (US)
  birth_date    date,
  zip           text,
  interests     text[] not null default '{}',
  how_heard     text,
  email_opt_in  boolean not null default false,
  sms_opt_in    boolean not null default false,
  consent_text  text,                       -- exact wording they agreed to
  consent_at    timestamptz,
  status        club_member_status not null default 'new',
  source        text not null default 'manual'
                check (source in ('signup_page', 'event', 'manual', 'import')),
  notes         text,
  voter_id      uuid references voters(id) on delete set null,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, email),
  check (email is not null or phone is not null)
);

create index if not exists members_campaign_idx on members (campaign_id, created_at desc);

drop trigger if exists members_set_updated_at on members;
create trigger members_set_updated_at
  before update on members
  for each row execute function set_updated_at();

-- ── consent history (append-only) ───────────────────────────────────────
create table if not exists member_consent_events (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  channel      text not null check (channel in ('email', 'sms')),
  granted      boolean not null,
  consent_text text,
  source       text not null,
  recorded_by  uuid references profiles(id) on delete set null,
  occurred_at  timestamptz not null default now()
);

create index if not exists member_consent_member_idx on member_consent_events (member_id, occurred_at desc);

-- Log a consent event automatically whenever an opt-in flag is set or changes.
create or replace function log_member_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.email_opt_in is distinct from old.email_opt_in then
    if tg_op = 'UPDATE' or new.email_opt_in then
      insert into public.member_consent_events (campaign_id, member_id, channel, granted, consent_text, source, recorded_by)
      values (new.campaign_id, new.id, 'email', new.email_opt_in, case when new.email_opt_in then new.consent_text end,
              case when tg_op = 'INSERT' then new.source when auth.uid() is null then 'signup_page' else 'officer_edit' end, auth.uid());
    end if;
  end if;
  if tg_op = 'INSERT' or new.sms_opt_in is distinct from old.sms_opt_in then
    if tg_op = 'UPDATE' or new.sms_opt_in then
      insert into public.member_consent_events (campaign_id, member_id, channel, granted, consent_text, source, recorded_by)
      values (new.campaign_id, new.id, 'sms', new.sms_opt_in, case when new.sms_opt_in then new.consent_text end,
              case when tg_op = 'INSERT' then new.source when auth.uid() is null then 'signup_page' else 'officer_edit' end, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists members_log_consent on members;
create trigger members_log_consent
  after insert or update of email_opt_in, sms_opt_in on members
  for each row execute function log_member_consent();

-- ── Row Level Security ──────────────────────────────────────────────────
-- Officers (manager/deputy/volunteer) can see and edit members; only admins
-- can delete. Viewers and the public get nothing.
alter table members enable row level security;
alter table member_consent_events enable row level security;

drop policy if exists members_select on members;
drop policy if exists members_insert on members;
drop policy if exists members_update on members;
drop policy if exists members_delete on members;
create policy members_select on members for select using (is_field_member(campaign_id));
create policy members_insert on members for insert with check (is_field_member(campaign_id));
create policy members_update on members for update
  using (is_field_member(campaign_id)) with check (is_field_member(campaign_id));
create policy members_delete on members for delete using (is_campaign_admin(campaign_id));

drop policy if exists member_consent_select on member_consent_events;
create policy member_consent_select on member_consent_events for select using (is_field_member(campaign_id));
-- No insert/update/delete policies: rows are written only by the trigger above.

revoke all on members, member_consent_events from anon;
grant select, insert, update, delete on members to authenticated;
grant select on member_consent_events to authenticated;

-- ── Public functions for the sign-up page ───────────────────────────────
create or replace function public_org(p_slug text)
returns table (name text, district_label text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.district_label
  from public.campaigns c
  where c.slug = p_slug and c.is_active and c.public_signup;
$$;

create or replace function public_join(
  p_slug         text,
  p_first_name   text,
  p_last_name    text,
  p_email        text,
  p_phone        text,
  p_birth_date   date,
  p_zip          text,
  p_interests    text[],
  p_how_heard    text,
  p_email_opt_in boolean,
  p_sms_opt_in   boolean,
  p_consent_text text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_email    text := lower(nullif(trim(p_email), ''));
  v_phone    text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_first    text := nullif(trim(p_first_name), '');
  v_last     text := nullif(trim(p_last_name), '');
  v_zip      text := nullif(trim(p_zip), '');
  v_recent   int;
begin
  select id into v_campaign from public.campaigns
  where slug = p_slug and is_active and public_signup;
  if v_campaign is null then
    raise exception 'This sign-up form is not open.';
  end if;

  -- Basic validation (the page checks these too; this is the real guard).
  if v_first is null or v_last is null or length(v_first) > 60 or length(v_last) > 60 then
    raise exception 'Please enter your first and last name.';
  end if;
  if v_email is null or length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;
  if length(v_phone) = 11 and left(v_phone, 1) = '1' then v_phone := substr(v_phone, 2); end if;
  if v_phone = '' then v_phone := null; end if;
  if v_phone is not null and length(v_phone) <> 10 then
    raise exception 'Please enter a 10-digit phone number.';
  end if;
  if coalesce(p_sms_opt_in, false) and v_phone is null then
    raise exception 'Add a phone number to get text updates.';
  end if;
  if p_birth_date is not null and (p_birth_date > (current_date - interval '18 years') or p_birth_date < date '1900-01-01') then
    raise exception 'You must be 18 or older to join.';
  end if;
  if v_zip is not null and v_zip !~ '^[0-9]{5}$' then
    raise exception 'Please enter a 5-digit ZIP code.';
  end if;

  -- Crude flood guard: refuse if this form got an unusual burst of sign-ups.
  select count(*) into v_recent from public.members
  where campaign_id = v_campaign and source = 'signup_page' and created_at > now() - interval '1 minute';
  if v_recent >= 20 then
    raise exception 'Too many sign-ups right now. Please try again in a minute.';
  end if;

  insert into public.members (
    campaign_id, first_name, last_name, email, phone, birth_date, zip, interests, how_heard,
    email_opt_in, sms_opt_in, consent_text, consent_at, source
  ) values (
    v_campaign, v_first, v_last, v_email, v_phone, p_birth_date, v_zip,
    coalesce((select array_agg(left(x, 40)) from unnest(p_interests[1:10]) x), '{}'),
    left(nullif(trim(p_how_heard), ''), 200),
    coalesce(p_email_opt_in, false), coalesce(p_sms_opt_in, false),
    left(p_consent_text, 1000), now(), 'signup_page'
  )
  on conflict (campaign_id, email) do update set
    -- Someone signing up again: fill gaps and add opt-ins, never overwrite or remove.
    phone        = coalesce(public.members.phone, excluded.phone),
    birth_date   = coalesce(public.members.birth_date, excluded.birth_date),
    zip          = coalesce(public.members.zip, excluded.zip),
    email_opt_in = public.members.email_opt_in or excluded.email_opt_in,
    sms_opt_in   = public.members.sms_opt_in or excluded.sms_opt_in,
    consent_text = case when excluded.email_opt_in or excluded.sms_opt_in
                        then excluded.consent_text else public.members.consent_text end,
    consent_at   = case when excluded.email_opt_in or excluded.sms_opt_in
                        then now() else public.members.consent_at end;

  return 'ok';
end;
$$;

revoke all on function public_org(text) from public;
revoke all on function public_join(text, text, text, text, text, date, text, text[], text, boolean, boolean, text) from public;
grant execute on function public_org(text) to anon, authenticated;
grant execute on function public_join(text, text, text, text, text, date, text, text[], text, boolean, boolean, text) to anon, authenticated;
