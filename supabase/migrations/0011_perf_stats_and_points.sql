-- ════════════════════════════════════════════════════════════════════════
-- 0011_perf_stats_and_points.sql
-- Performance fixes for the Stats page (was timing out) and the Map/Turf
-- household load (was 19 sequential requests).
--
-- Both functions become SECURITY DEFINER with a SINGLE membership check at the
-- top, instead of re-running row-level security for every one of 44k voters /
-- 18k households. The guard keeps access safe: a non-member gets nothing.
-- ════════════════════════════════════════════════════════════════════════

-- ── Stats: one membership check, one materialized scan, then aggregate ──
create or replace function campaign_stats(p_campaign_id uuid)
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

  with v as materialized (
    select tier, gender, race, age,
           voted_2024_general, voted_2026_r_primary, voted_2024_r_primary, voted_any_d_primary
    from voters
    where campaign_id = p_campaign_id
  ),
  vb as (
    select *,
      case
        when age between 18 and 29 then '18-29'
        when age between 30 and 39 then '30-39'
        when age between 40 and 49 then '40-49'
        when age between 50 and 59 then '50-59'
        when age between 60 and 69 then '60-69'
        when age >= 70           then '70+'
        else 'Unknown'
      end as age_group
    from v
  )
  select jsonb_build_object(
    'total', (select count(*) from v),
    'tiers', (select jsonb_agg(jsonb_build_object('label', tier, 'count', c) order by tier)
              from (select tier, count(*) c from v group by tier) t),
    'gender', (select jsonb_agg(jsonb_build_object('label', coalesce(gender,'Unknown'), 'count', c) order by c desc)
               from (select gender, count(*) c from v group by gender) t),
    'race', (select jsonb_agg(jsonb_build_object('label', coalesce(race,'Unknown'), 'count', c) order by c desc)
             from (select race, count(*) c from v group by race) t),
    'age', (select jsonb_agg(jsonb_build_object('label', age_group, 'count', c) order by age_group)
            from (select age_group, count(*) c from vb group by age_group) t),
    'turnout_by_race', (
      select jsonb_agg(jsonb_build_object(
        'label', coalesce(race,'Unknown'), 'total', c,
        'v2024g', g, 'v2026r', r26, 'v2024r', r24, 'vd', d) order by c desc)
      from (select race, count(*) c,
              count(*) filter (where voted_2024_general)   g,
              count(*) filter (where voted_2026_r_primary) r26,
              count(*) filter (where voted_2024_r_primary) r24,
              count(*) filter (where voted_any_d_primary)  d
            from v group by race) t),
    'turnout_by_age', (
      select jsonb_agg(jsonb_build_object(
        'label', age_group, 'total', c,
        'v2024g', g, 'v2026r', r26, 'v2024r', r24, 'vd', d) order by age_group)
      from (select age_group, count(*) c,
              count(*) filter (where voted_2024_general)   g,
              count(*) filter (where voted_2026_r_primary) r26,
              count(*) filter (where voted_2024_r_primary) r24,
              count(*) filter (where voted_any_d_primary)  d
            from vb group by age_group) t)
  )
  into result;

  return result;
end;
$$;

grant execute on function campaign_stats(uuid) to authenticated;

-- ── Map points: all households for the campaign in ONE request ──────────
create or replace function campaign_map_points(p_campaign_id uuid)
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
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'hh_key', hh_key, 'full_address', full_address,
    'lat', lat, 'lon', lon, 'best_tier', best_tier,
    'has_dnc', has_dnc, 'voter_count', voter_count
  )), '[]'::jsonb)
  into result
  from households
  where campaign_id = p_campaign_id and lat is not null;

  return result;
end;
$$;

grant execute on function campaign_map_points(uuid) to authenticated;
