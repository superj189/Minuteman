-- ════════════════════════════════════════════════════════════════════════
-- 0016_canvass_report_dates.sql
-- Add an optional date range to canvass_report (for "this week's hit rates").
-- Replaces the single-arg version from 0015.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists canvass_report(uuid);

create or replace function canvass_report(
  p_campaign_id uuid,
  p_since timestamptz default null,
  p_until timestamptz default null
)
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

  with cl as (
    select * from contact_logs
    where campaign_id = p_campaign_id
      and (p_since is null or occurred_at >= p_since)
      and (p_until is null or occurred_at <  p_until)
  )
  select jsonb_build_object(
    'total_contacts', (select count(*) from cl),
    'voters_contacted', (select count(distinct voter_id) from cl),
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
        from cl
        left join profiles p on p.id = cl.contacted_by
        group by cl.contacted_by, p.full_name, p.email
      ) s
    ),
    'outcomes', (
      select coalesce(jsonb_object_agg(outcome, c), '{}'::jsonb)
      from (select outcome, count(*) c from cl group by outcome) o
    ),
    'support', (
      select coalesce(jsonb_object_agg(coalesce(support_score, 0)::text, c), '{}'::jsonb)
      from (select support_score, count(*) c from cl group by support_score) s
    )
  ) into result;

  return result;
end;
$$;

grant execute on function canvass_report(uuid, timestamptz, timestamptz) to authenticated;
