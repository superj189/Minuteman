-- ════════════════════════════════════════════════════════════════════════
-- 0010_turf_functions.sql
-- Helpers for turf cutting. The turfs / turf_assignments tables already exist
-- (migration 0005); these just bridge between map shapes (GeoJSON) and the
-- PostGIS geography column, since the REST API can't write geography directly.
-- ════════════════════════════════════════════════════════════════════════

-- Create a turf from a drawn GeoJSON polygon. Returns the new turf id.
-- SECURITY INVOKER: the INSERT goes through RLS, so only campaign admins succeed.
create or replace function create_turf(
  p_campaign_id uuid,
  p_name text,
  p_color text,
  p_geojson jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  new_id uuid;
begin
  insert into turfs (campaign_id, name, color, area, created_by)
  values (
    p_campaign_id,
    p_name,
    coalesce(p_color, '#1E88E5'),
    ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326)::geography,
    auth.uid()
  )
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function create_turf(uuid, text, text, jsonb) to authenticated;

-- Read turfs with their polygon as GeoJSON (so the map can draw them).
create or replace view turfs_geojson with (security_invoker = on) as
select
  id,
  campaign_id,
  name,
  color,
  ST_AsGeoJSON(area)::jsonb as geojson,
  created_by,
  created_at
from turfs;

grant select on turfs_geojson to authenticated;

-- How many voters fall inside a turf (for balancing assignments).
create or replace function turf_voter_count(p_turf_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select count(*)::int
  from voters v
  join turfs t on t.id = p_turf_id
  where v.campaign_id = t.campaign_id
    and v.geom is not null
    and t.area is not null
    and ST_Covers(t.area, v.geom);
$$;

grant execute on function turf_voter_count(uuid) to authenticated;
