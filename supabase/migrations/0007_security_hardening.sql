-- ════════════════════════════════════════════════════════════════════════
-- 0007_security_hardening.sql
-- Hardening pass over the SECURITY DEFINER functions from 0002 and 0006.
--
-- Why: a SECURITY DEFINER function runs as its owner. If it calls objects by an
-- UNQUALIFIED name with a mutable search_path, a user who can create objects in a
-- searched schema could shadow those names and run code as the owner. Postgres 15
-- already blocks untrusted CREATE in `public`, so the practical risk here is low —
-- but pinning `search_path = ''` and fully-qualifying every reference removes the
-- class of bug entirely and clears the Supabase "function search_path mutable" lint.
--
-- Safe to run on the live DB: CREATE OR REPLACE keeps the same signatures, so the
-- policies that call these functions keep working unchanged.
-- ════════════════════════════════════════════════════════════════════════

-- ── Identity / signup trigger function (from 0002) ──────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── RLS helper functions (from 0006) ────────────────────────────────────
create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.is_platform_owner from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_campaign_member(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_field_member(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign_id and m.user_id = auth.uid()
      and m.role in ('manager','deputy','volunteer')
  );
$$;

create or replace function public.is_campaign_admin(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign_id and m.user_id = auth.uid()
      and m.role in ('manager','deputy')
  );
$$;

create or replace function public.current_campaign_role(p_campaign_id uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select m.role from public.campaign_members m
  where m.campaign_id = p_campaign_id and m.user_id = auth.uid();
$$;

create or replace function public.shares_campaign(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.campaign_members me
    join public.campaign_members them on them.campaign_id = me.campaign_id
    where me.user_id = auth.uid() and them.user_id = p_user_id
  );
$$;

-- ── Tighten audit-log attribution ───────────────────────────────────────
-- Previously any member could insert an audit row with any actor_id. Constrain
-- it so a row is attributed to the inserting user (or left null for system writes).
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert
  with check (
    public.is_campaign_member(campaign_id)
    and (actor_id = auth.uid() or actor_id is null)
  );
