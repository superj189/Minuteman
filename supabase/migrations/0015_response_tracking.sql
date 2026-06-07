-- ════════════════════════════════════════════════════════════════════════
-- 0015_response_tracking.sql
-- Surface & analyze canvass responses.
--   (a) Denormalized per-voter contact summary (kept fresh by a trigger) so the
--       voter list can be filtered/sorted by response without slow joins.
--   (b) canvass_report() — volunteer hit-rates + response breakdown for managers.
-- The data already exists in contact_logs (outcome, support_score, contacted_by);
-- this just makes it queryable.
-- ════════════════════════════════════════════════════════════════════════

alter table voters
  add column if not exists contact_count       integer not null default 0,
  add column if not exists last_contacted_at    timestamptz,
  add column if not exists last_outcome         contact_outcome,
  add column if not exists last_support_score   smallint,
  add column if not exists last_contacted_by    uuid references profiles(id);

create index if not exists voters_contact_count_idx on voters (campaign_id, contact_count);
create index if not exists voters_support_idx on voters (campaign_id, last_support_score);

-- Recompute one voter's summary from its logs (most-recent log wins for "last_*").
create or replace function refresh_voter_contact_summary(p_voter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update voters v set
    contact_count      = sub.cnt,
    last_contacted_at  = sub.last_at,
    last_outcome       = sub.last_outcome,
    last_support_score = sub.last_support,
    last_contacted_by  = sub.last_by
  from (
    select
      count(*)                                                   as cnt,
      max(occurred_at)                                           as last_at,
      (array_agg(outcome order by occurred_at desc))[1]          as last_outcome,
      (array_agg(support_score order by occurred_at desc))[1]    as last_support,
      (array_agg(contacted_by order by occurred_at desc))[1]     as last_by
    from contact_logs
    where voter_id = p_voter_id
  ) sub
  where v.id = p_voter_id;
end;
$$;

create or replace function contact_logs_summary_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    perform refresh_voter_contact_summary(old.voter_id);
    return old;
  end if;
  perform refresh_voter_contact_summary(new.voter_id);
  if TG_OP = 'UPDATE' and new.voter_id <> old.voter_id then
    perform refresh_voter_contact_summary(old.voter_id);
  end if;
  return new;
end;
$$;

drop trigger if exists contact_logs_summary on contact_logs;
create trigger contact_logs_summary
  after insert or update or delete on contact_logs
  for each row execute function contact_logs_summary_trigger();

-- Backfill from existing logs.
update voters v set
  contact_count      = sub.cnt,
  last_contacted_at  = sub.last_at,
  last_outcome       = sub.last_outcome,
  last_support_score = sub.last_support,
  last_contacted_by  = sub.last_by
from (
  select voter_id,
    count(*) cnt, max(occurred_at) last_at,
    (array_agg(outcome order by occurred_at desc))[1] last_outcome,
    (array_agg(support_score order by occurred_at desc))[1] last_support,
    (array_agg(contacted_by order by occurred_at desc))[1] last_by
  from contact_logs group by voter_id
) sub
where v.id = sub.voter_id;

-- ── Manager report: volunteer hit-rates + response breakdown ────────────
create or replace function canvass_report(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not (is_campaign_member(p_campaign_id) or is_platform_owner()) then
    return null;
  end if;

  select jsonb_build_object(
    'total_contacts', (select count(*) from contact_logs where campaign_id = p_campaign_id),
    'voters_contacted', (select count(*) from voters where campaign_id = p_campaign_id and contact_count > 0),
    'volunteers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', cb, 'name', name,
        'total', total, 'talked', talked, 'not_home', not_home,
        'refused', refused, 'supporters', supporters
      ) order by total desc), '[]'::jsonb)
      from (
        select cl.contacted_by cb,
          coalesce(p.full_name, p.email, 'Unknown') name,
          count(*) total,
          count(*) filter (where cl.outcome = 'talked') talked,
          count(*) filter (where cl.outcome = 'not_home') not_home,
          count(*) filter (where cl.outcome = 'refused') refused,
          count(*) filter (where cl.support_score >= 4) supporters
        from contact_logs cl
        left join profiles p on p.id = cl.contacted_by
        where cl.campaign_id = p_campaign_id
        group by cl.contacted_by, p.full_name, p.email
      ) s
    ),
    'outcomes', (
      select coalesce(jsonb_object_agg(outcome, c), '{}'::jsonb)
      from (select outcome, count(*) c from contact_logs where campaign_id = p_campaign_id group by outcome) o
    ),
    'support', (
      select coalesce(jsonb_object_agg(coalesce(support_score, 0)::text, c), '{}'::jsonb)
      from (select support_score, count(*) c from contact_logs where campaign_id = p_campaign_id group by support_score) s
    )
  ) into result;

  return result;
end;
$$;

grant execute on function canvass_report(uuid) to authenticated;
