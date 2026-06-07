-- ════════════════════════════════════════════════════════════════════════
-- 0005_turf_and_sos.sql
-- Turf cutting + assignment, the SOS early-vote import log, and a light
-- audit log for data-governance.
-- ════════════════════════════════════════════════════════════════════════

-- ── turfs: polygons an admin draws on the map ───────────────────────────
create table turfs (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name        text not null,
  color       text default '#1E88E5',
  -- Drawn area. geography(Polygon) — for multi-part turf use a single polygon
  -- per row, or widen to Geometry later if a use case appears.
  area        geography(Polygon, 4326),
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create index turfs_area_idx on turfs using gist (area);

-- ── turf_assignments: which volunteer owns which turf ───────────────────
create table turf_assignments (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  turf_id     uuid not null references turfs(id)    on delete cascade,
  assigned_to uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id),
  status      assignment_status not null default 'assigned',
  assigned_at timestamptz not null default now(),
  unique (turf_id, assigned_to)
);

create index on turf_assignments (campaign_id, assigned_to);

-- Spatial helper: the voters that fall inside a turf polygon. Used to build a
-- turf walk list. ST_Covers handles points exactly on the boundary.
create or replace function voters_in_turf(p_turf_id uuid)
returns setof voters
language sql
stable
as $$
  select v.*
  from voters v
  join turfs t on t.id = p_turf_id
  where v.campaign_id = t.campaign_id
    and v.geom is not null
    and t.area is not null
    and ST_Covers(t.area, v.geom);
$$;

-- ── sos_imports: log of each GA SOS early-vote file pull (objective 7) ───
-- The hourly cron job writes one row per run so we can monitor the (fragile)
-- SOS feed and show what each pull changed.
create table sos_imports (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  source           text not null default 'ga_sos_early_vote',
  file_name        text,
  fetched_at       timestamptz not null default now(),
  rows_total       integer,
  new_early_voters integer,
  status           sos_import_status not null default 'pending',
  message          text,
  meta             jsonb
);

create index on sos_imports (campaign_id, fetched_at desc);

-- ── audit_log: lightweight data-governance trail (§13) ──────────────────
-- A home for access/change logging. v1 leaves it un-triggered; the API layer
-- (or later triggers) writes rows for sensitive reads/writes as policy requires.
create table audit_log (
  id          bigint generated always as identity primary key,
  campaign_id uuid references campaigns(id) on delete cascade,
  actor_id    uuid references profiles(id),
  action      text not null,             -- e.g. 'voter.export', 'consent.revoke'
  entity      text,                      -- table/entity name
  entity_id   uuid,
  detail      jsonb,
  occurred_at timestamptz not null default now()
);

create index on audit_log (campaign_id, occurred_at desc);
