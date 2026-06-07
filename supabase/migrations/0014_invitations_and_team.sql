-- ════════════════════════════════════════════════════════════════════════
-- 0014_invitations_and_team.sql
-- Team management: invite people to a campaign, and auto-join them when they
-- sign up. No service-role key needed in the browser — an admin-only function
-- handles it safely.
-- ════════════════════════════════════════════════════════════════════════

-- Pending invites. If the person already has an account they're added directly;
-- otherwise a row sits here until they sign up with that email.
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  email       citext not null,
  role        member_role not null default 'volunteer',
  invited_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (campaign_id, email)
);

alter table invitations enable row level security;

create policy invites_select on invitations for select
  using (is_campaign_admin(campaign_id) or is_platform_owner());
create policy invites_write on invitations for all
  using (is_campaign_admin(campaign_id) or is_platform_owner())
  with check (is_campaign_admin(campaign_id) or is_platform_owner());

grant select, insert, update, delete on invitations to authenticated;

-- Invite (or directly add) a member. Admin-only. Returns 'added' if the person
-- already had an account, or 'invited' if a pending invite was created.
create or replace function invite_member(p_campaign_id uuid, p_email text, p_role member_role)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if not (is_campaign_admin(p_campaign_id) or is_platform_owner()) then
    raise exception 'Not authorized to invite members to this campaign';
  end if;

  select id into uid from profiles where email = p_email;

  if uid is not null then
    insert into campaign_members (campaign_id, user_id, role)
    values (p_campaign_id, uid, p_role)
    on conflict (campaign_id, user_id) do update set role = excluded.role;
    return 'added';
  else
    insert into invitations (campaign_id, email, role, invited_by)
    values (p_campaign_id, p_email, p_role, auth.uid())
    on conflict (campaign_id, email) do update set role = excluded.role, accepted_at = null;
    return 'invited';
  end if;
end;
$$;

grant execute on function invite_member(uuid, text, member_role) to authenticated;

-- Extend the signup trigger: when a new user signs up, auto-join any campaigns
-- their email was invited to.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  insert into public.campaign_members (campaign_id, user_id, role)
  select i.campaign_id, new.id, i.role
  from public.invitations i
  where i.email = new.email and i.accepted_at is null
  on conflict (campaign_id, user_id) do nothing;

  update public.invitations
  set accepted_at = now()
  where email = new.email and accepted_at is null;

  return new;
end;
$$;
