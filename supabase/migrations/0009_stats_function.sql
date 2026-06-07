-- ════════════════════════════════════════════════════════════════════════
-- 0009_stats_function.sql
-- A single read-only function that returns all the numbers the Stats page needs,
-- computed in the database. The app calls this once instead of downloading 44k
-- rows to count them in the browser.
--
-- SECURITY INVOKER (the default): it runs as the calling user, so RLS still
-- applies — a user only gets stats for a campaign they belong to. Passing a
-- campaign they don't belong to simply returns zeros.
-- ════════════════════════════════════════════════════════════════════════

create or replace function campaign_stats(p_campaign_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with v as (
    select * from voters where campaign_id = p_campaign_id
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

    'tiers', (
      select jsonb_agg(jsonb_build_object('label', tier, 'count', c) order by tier)
      from (select tier, count(*) c from v group by tier) t
    ),

    'gender', (
      select jsonb_agg(jsonb_build_object('label', coalesce(gender, 'Unknown'), 'count', c) order by c desc)
      from (select gender, count(*) c from v group by gender) t
    ),

    'race', (
      select jsonb_agg(jsonb_build_object('label', coalesce(race, 'Unknown'), 'count', c) order by c desc)
      from (select race, count(*) c from v group by race) t
    ),

    'age', (
      select jsonb_agg(jsonb_build_object('label', age_group, 'count', c) order by age_group)
      from (select age_group, count(*) c from vb group by age_group) t
    ),

    'turnout_by_race', (
      select jsonb_agg(jsonb_build_object(
        'label', coalesce(race, 'Unknown'), 'total', c,
        'v2024g', g, 'v2026r', r26, 'v2024r', r24, 'vd', d
      ) order by c desc)
      from (
        select race, count(*) c,
          count(*) filter (where voted_2024_general)   g,
          count(*) filter (where voted_2026_r_primary) r26,
          count(*) filter (where voted_2024_r_primary) r24,
          count(*) filter (where voted_any_d_primary)  d
        from v group by race
      ) t
    ),

    'turnout_by_age', (
      select jsonb_agg(jsonb_build_object(
        'label', age_group, 'total', c,
        'v2024g', g, 'v2026r', r26, 'v2024r', r24, 'vd', d
      ) order by age_group)
      from (
        select age_group, count(*) c,
          count(*) filter (where voted_2024_general)   g,
          count(*) filter (where voted_2026_r_primary) r26,
          count(*) filter (where voted_2024_r_primary) r24,
          count(*) filter (where voted_any_d_primary)  d
        from vb group by age_group
      ) t
    )
  );
$$;

grant execute on function campaign_stats(uuid) to authenticated;
