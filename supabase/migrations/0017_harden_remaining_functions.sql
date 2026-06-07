-- ════════════════════════════════════════════════════════════════════════
-- 0017_harden_remaining_functions.sql
-- Pin search_path on the two functions that still had a mutable one
-- (set_updated_at, voters_in_turf) — clears the Supabase advisor's
-- "Function Search Path Mutable" finding for them.
-- ════════════════════════════════════════════════════════════════════════

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function voters_in_turf(p_turf_id uuid)
returns setof voters
language sql
stable
set search_path = public, extensions
as $$
  select v.*
  from voters v
  join turfs t on t.id = p_turf_id
  where v.campaign_id = t.campaign_id
    and v.geom is not null
    and t.area is not null
    and ST_Covers(t.area, v.geom);
$$;
