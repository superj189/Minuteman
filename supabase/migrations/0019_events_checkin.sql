-- ════════════════════════════════════════════════════════════════════════
-- 0019_events_checkin.sql
-- Club events and who attended.
--
--   • `events`: meetings, happy hours, speakers, volunteer days.
--   • `event_attendance`: one row per member per event.
--   • Public check-in (a phone or tablet at the door, or a QR code):
--       public_event(id)    → event name/time, and whether check-in is open
--       public_checkin(...) → finds or creates the member, records attendance
--     Only works while an officer has check-in switched ON for that event.
--     Event ids are random UUIDs, so the link can't be guessed.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  name         text not null,
  starts_at    timestamptz not null,
  location     text,
  description  text,
  checkin_open boolean not null default false,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists events_campaign_idx on events (campaign_id, starts_at desc);

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

create table if not exists event_attendance (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  event_id      uuid not null references events(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  source        text not null default 'officer' check (source in ('self_checkin', 'officer')),
  was_new       boolean not null default false,   -- first time we'd seen this person
  checked_in_at timestamptz not null default now(),
  recorded_by   uuid references profiles(id) on delete set null,
  unique (event_id, member_id)
);

create index if not exists event_attendance_member_idx on event_attendance (member_id);

-- ── Row Level Security (same rules as members) ──────────────────────────
alter table events enable row level security;
alter table event_attendance enable row level security;

drop policy if exists events_select on events;
drop policy if exists events_insert on events;
drop policy if exists events_update on events;
drop policy if exists events_delete on events;
create policy events_select on events for select using (is_field_member(campaign_id));
create policy events_insert on events for insert with check (is_field_member(campaign_id));
create policy events_update on events for update
  using (is_field_member(campaign_id)) with check (is_field_member(campaign_id));
create policy events_delete on events for delete using (is_campaign_admin(campaign_id));

drop policy if exists attendance_select on event_attendance;
drop policy if exists attendance_insert on event_attendance;
drop policy if exists attendance_delete on event_attendance;
create policy attendance_select on event_attendance for select using (is_field_member(campaign_id));
-- Attendance must point at an event and member of the same club.
create policy attendance_insert on event_attendance for insert with check (
  is_field_member(campaign_id)
  and exists (select 1 from events e where e.id = event_id and e.campaign_id = event_attendance.campaign_id)
  and exists (select 1 from members m where m.id = member_id and m.campaign_id = event_attendance.campaign_id)
);
create policy attendance_delete on event_attendance for delete using (is_field_member(campaign_id));

revoke all on events, event_attendance from anon;
grant select, insert, update, delete on events to authenticated;
grant select, insert, delete on event_attendance to authenticated;

-- ── Public functions for the check-in page ──────────────────────────────
create or replace function public_event(p_event_id uuid)
returns table (name text, starts_at timestamptz, location text, org_name text, checkin_open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select e.name, e.starts_at, e.location, c.name, e.checkin_open
  from public.events e
  join public.campaigns c on c.id = e.campaign_id
  where e.id = p_event_id and c.is_active;
$$;

create or replace function public_checkin(
  p_event_id     uuid,
  p_first_name   text,
  p_last_name    text,
  p_email        text,
  p_phone        text,
  p_email_opt_in boolean,
  p_sms_opt_in   boolean,
  p_consent_text text
)
returns text   -- 'new' (first time), 'welcome_back', or 'already' (checked in already)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_member   uuid;
  v_existed  boolean;
  v_rows     int;
  v_recent   int;
  v_email    text := lower(nullif(trim(p_email), ''));
  v_phone    text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_first    text := nullif(trim(p_first_name), '');
  v_last     text := nullif(trim(p_last_name), '');
begin
  select e.campaign_id into v_campaign
  from public.events e join public.campaigns c on c.id = e.campaign_id
  where e.id = p_event_id and e.checkin_open and c.is_active;
  if v_campaign is null then
    raise exception 'Check-in for this event is closed.';
  end if;

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

  -- Flood guard: an event door rarely sees more than a few check-ins a minute.
  select count(*) into v_recent from public.event_attendance
  where event_id = p_event_id and checked_in_at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception 'Too many check-ins right now. Please try again in a minute.';
  end if;

  select id into v_member from public.members where campaign_id = v_campaign and email = v_email;
  v_existed := v_member is not null;

  if v_existed then
    -- Known person: fill gaps and add opt-ins, never overwrite or remove.
    update public.members set
      phone        = coalesce(phone, v_phone),
      email_opt_in = email_opt_in or coalesce(p_email_opt_in, false),
      sms_opt_in   = sms_opt_in or coalesce(p_sms_opt_in, false),
      consent_text = case when coalesce(p_email_opt_in, false) or coalesce(p_sms_opt_in, false)
                          then left(p_consent_text, 1000) else consent_text end,
      consent_at   = case when coalesce(p_email_opt_in, false) or coalesce(p_sms_opt_in, false)
                          then now() else consent_at end
    where id = v_member;
  else
    insert into public.members (
      campaign_id, first_name, last_name, email, phone,
      email_opt_in, sms_opt_in, consent_text, consent_at, source
    ) values (
      v_campaign, v_first, v_last, v_email, v_phone,
      coalesce(p_email_opt_in, false), coalesce(p_sms_opt_in, false),
      left(p_consent_text, 1000), now(), 'event'
    )
    returning id into v_member;
  end if;

  insert into public.event_attendance (campaign_id, event_id, member_id, source, was_new)
  values (v_campaign, p_event_id, v_member, 'self_checkin', not v_existed)
  on conflict (event_id, member_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then return 'already'; end if;
  return case when v_existed then 'welcome_back' else 'new' end;
end;
$$;

revoke all on function public_event(uuid) from public;
revoke all on function public_checkin(uuid, text, text, text, text, boolean, boolean, text) from public;
grant execute on function public_event(uuid) to anon, authenticated;
grant execute on function public_checkin(uuid, text, text, text, text, boolean, boolean, text) to anon, authenticated;
