-- ════════════════════════════════════════════════════════════════════════
-- 0013_turf_tier_breakdown.sql
-- Returns how many voters of EACH tier fall inside a turf, e.g. {"1":45,"2":12,...}.
-- The app sums whichever tiers are currently shown in the filter, so a zone can
-- display "45 high-priority (T1-T2) voters" without another database call when
-- the filter changes.
-- ════════════════════════════════════════════════════════════════════════

create or replace function turf_tier_breakdown(p_turf_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select coalesce(jsonb_object_agg(tier_key, c), '{}'::jsonb)
  from (
    select coalesce(v.tier, 0)::text as tier_key, count(*) c
    from voters v
    join turfs t on t.id = p_turf_id
    where v.campaign_id = t.campaign_id
      and v.geom is not null
      and t.area is not null
      and ST_Covers(t.area, v.geom)
    group by coalesce(v.tier, 0)
  ) s;
$$;

grant execute on function turf_tier_breakdown(uuid) to authenticated;
