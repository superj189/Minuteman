-- ════════════════════════════════════════════════════════════════════════
-- 0003_voters_and_households.sql
-- The voter roll and its household grouping.
--
-- Column set is modeled directly on the real targeted_voters.csv produced in
-- Phase 1. Heavily-used SOS fields are first-class columns; the long tail of
-- district/precinct fields is preserved losslessly in `raw` jsonb.
-- ════════════════════════════════════════════════════════════════════════

-- ── households: one row per distinct address (Phase 1 hh_key) ───────────
-- 42,564 HD-100 voters live at ~18,002 addresses (2.35/door). Household-first
-- canvassing is the core efficiency win, so it gets its own table. Apartments
-- are separate households (unit is part of hh_key).
create table households (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,

  hh_key       text not null,          -- normalized address key from Phase 1
  full_address text,
  city         text,
  zip          text,
  lat          double precision,
  lon          double precision,

  -- Spatial point, derived from lat/lon. Used for turf containment + map.
  geom geography(Point, 4326) generated always as (
    case when lon is not null and lat is not null
         then ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
    end
  ) stored,

  -- Rollups maintained by the import pipeline (and refreshable later).
  voter_count integer not null default 0,
  best_tier   smallint,                  -- highest-priority non-DNC tier present (lowest #)
  has_target  boolean not null default false,  -- any T1–T3 resident
  has_dnc     boolean not null default false,  -- any T6 resident
  is_mixed    boolean not null default false,  -- both a target and a DNC present

  created_at  timestamptz not null default now(),

  unique (campaign_id, hh_key)
);

create index on households (campaign_id);
create index households_geom_idx on households using gist (geom);

-- ── voters: the roll, per campaign ──────────────────────────────────────
create table voters (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,

  -- Natural key from the SOS file. Stored as TEXT to preserve leading zeros.
  -- (Phase 1 doc says zero-pad to 8 chars; the legacy merge script used 9.
  --  The data on hand is 8. We store the value as-delivered and enforce
  --  uniqueness per campaign rather than imposing a width here.)
  registration_number text not null,

  household_id uuid references households(id) on delete set null,
  hh_key       text,                     -- denormalized for import convenience

  -- ── Identity ──
  county      text,
  status      text,                      -- ACTIVE / INACTIVE
  status_reason text,
  last_name   text,
  first_name  text,
  middle_name text,
  suffix      text,
  birth_year  integer,
  age         integer,                   -- as computed in Phase 1
  race        text,
  gender      text,

  -- ── Residence address (components + assembled) ──
  res_street_number text,
  res_pre_direction text,
  res_street_name   text,
  res_street_type   text,
  res_post_direction text,
  res_apt_unit      text,
  res_city          text,
  res_zip           text,
  full_address      text,

  -- ── Mailing address ──
  mail_street_number text,
  mail_street_name   text,
  mail_apt_unit      text,
  mail_city          text,
  mail_zip           text,
  mail_state         text,
  mail_country       text,

  -- ── Key districts (rest of the SOS district fields live in `raw`) ──
  congressional_district text,
  state_senate_district  text,
  state_house_district   text,            -- authoritative field for tiering geography
  county_precinct        text,
  county_precinct_desc   text,
  municipality           text,

  -- ── Dates / last activity ──
  registration_date date,
  last_party_voted  text,
  last_vote_date    date,

  -- ── Vote-history flags (computed by the import pipeline) ──
  voted_2026_primary   boolean not null default false,
  voted_2024_primary   boolean not null default false,
  voted_2024_general   boolean not null default false,
  voted_2026_r_primary boolean not null default false,
  voted_2024_r_primary boolean not null default false,
  voted_any_d_primary  boolean not null default false,

  -- ── Live early-vote tracking (populated by SOS hourly ingestion — objective 7) ──
  voted_early       boolean not null default false,
  early_vote_date   date,
  early_vote_method text,

  -- ── 6-tier classification (T1 best … T6 do-not-contact; see README) ──
  tier       smallint,
  tier_label text,
  tier_desc  text,

  -- ── Geocode ──
  lat double precision,
  lon double precision,
  geom geography(Point, 4326) generated always as (
    case when lon is not null and lat is not null
         then ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
    end
  ) stored,

  -- ── Lossless original SOS row (long-tail districts, board fields, etc.) ──
  raw jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (campaign_id, registration_number),
  constraint tier_range check (tier is null or tier between 1 and 6)
);

create index on voters (campaign_id);
create index on voters (campaign_id, tier);
create index on voters (household_id);
create index on voters (campaign_id, last_name, first_name);
create index voters_geom_idx on voters using gist (geom);

create trigger voters_set_updated_at
  before update on voters
  for each row execute function set_updated_at();
