-- ════════════════════════════════════════════════════════════════════════
-- 0012_turf_clip_to_district.sql
-- Clip drawn turf to the district boundary, so an admin can draw a rough shape
-- that overshoots the edges and get a zone bounded by the real district line —
-- no need to trace the jagged outline by hand.
--
-- Adds campaigns.boundary (the district polygon) and rewrites create_turf to
-- intersect the drawn shape with it.
-- ════════════════════════════════════════════════════════════════════════

-- The district outline for a campaign (populated by scripts/set_boundary.mjs).
alter table campaigns add column if not exists boundary geography(Geometry, 4326);

-- Clipping can produce multiple pieces, so widen area to accept any polygonal
-- shape. The turfs_geojson view depends on this column, so drop + recreate it.
drop view if exists turfs_geojson;
alter table turfs alter column area type geography(Geometry, 4326);
create view turfs_geojson with (security_invoker = on) as
select id, campaign_id, name, color, ST_AsGeoJSON(area)::jsonb as geojson, created_by, created_at
from turfs;
grant select on turfs_geojson to authenticated;

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
  new_id  uuid;
  drawn   geometry;
  bnd     geometry;
  clipped geometry;
begin
  drawn := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);

  select boundary::geometry into bnd from campaigns where id = p_campaign_id;

  if bnd is not null then
    -- Keep only the polygonal part of the overlap (drops stray points/lines).
    clipped := ST_CollectionExtract(ST_Intersection(drawn, bnd), 3);
    if clipped is null or ST_IsEmpty(clipped) then
      clipped := ST_Multi(drawn); -- drawn entirely outside the district: keep as-is
    end if;
  else
    clipped := ST_Multi(drawn);
  end if;

  insert into turfs (campaign_id, name, color, area, created_by)
  values (p_campaign_id, p_name, coalesce(p_color, '#1E88E5'), clipped::geography, auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function create_turf(uuid, text, text, jsonb) to authenticated;
