-- ════════════════════════════════════════════════════════════════════════
-- 0004_contact_consent_logs.sql
-- Field-collected data: contact info, canvass logs, notes, consent, yard signs.
--
-- Consent is the legally load-bearing part of the platform. It is modeled as an
-- append-only event log so we can always prove who consented to what, when, how,
-- and by which volunteer's attestation (TCPA defensibility).
-- ════════════════════════════════════════════════════════════════════════

-- ── contact_info: phone / email with provenance ─────────────────────────
-- Kept separate from voters so source + freshness are first-class. The SOS file
-- has NO phone/email, so every row here is appended later (purchase or field).
create table contact_info (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  voter_id    uuid not null references voters(id)    on delete cascade,

  kind        contact_kind   not null,               -- phone | email
  value       text           not null,
  source      contact_source not null default 'door',
  is_primary  boolean        not null default false,
  verified_at timestamptz,                            -- last time confirmed good
  created_by  uuid references profiles(id),
  created_at  timestamptz    not null default now()
);

create index on contact_info (campaign_id, voter_id);

-- ── contact_logs: one row per canvass interaction ───────────────────────
create table contact_logs (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  voter_id     uuid not null references voters(id)    on delete cascade,

  contacted_by uuid references profiles(id),
  channel      contact_channel not null default 'door',
  outcome      contact_outcome not null,
  support_score smallint check (support_score between 1 and 5),  -- 1=strong opp … 5=strong supporter
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index on contact_logs (campaign_id, voter_id);
create index on contact_logs (campaign_id, occurred_at);

-- ── notes: freeform notes on a voter ────────────────────────────────────
create table notes (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  voter_id    uuid not null references voters(id)    on delete cascade,
  author_id   uuid references profiles(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

create index on notes (campaign_id, voter_id);

-- ── consent_records: append-only permission event log ───────────────────
-- One row per grant OR revoke. The CURRENT state of a (voter, consent_type) is
-- the most recent row by occurred_at. History is never deleted.
create table consent_records (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  voter_id     uuid not null references voters(id)    on delete cascade,

  consent_type consent_kind   not null,
  granted      boolean        not null,               -- true = granted, false = revoked
  method       consent_method,                        -- how it was captured
  attested_by  uuid references profiles(id),          -- which volunteer attested
  occurred_at  timestamptz    not null default now(),
  note         text,
  created_at   timestamptz    not null default now()
);

create index on consent_records (campaign_id, voter_id, consent_type, occurred_at desc);

-- Convenience view: the current consent state for each voter/type.
-- (DISTINCT ON picks the newest row per (voter, type).)
create view current_consent as
select distinct on (voter_id, consent_type)
  campaign_id, voter_id, consent_type, granted, method, attested_by, occurred_at
from consent_records
order by voter_id, consent_type, occurred_at desc;

-- ── yard_signs: consent -> delivered fulfillment workflow (objective 5b) ─
-- A consenting address surfaces on a delivery list/layer; volunteers move it
-- through the status lifecycle. No inventory counting in v1 (parked — §16).
create table yard_signs (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  voter_id          uuid references voters(id)     on delete set null,
  household_id      uuid references households(id) on delete set null,
  consent_record_id uuid references consent_records(id),  -- the grant that authorized it

  status       yard_sign_status not null default 'consented',
  address      text,
  lat          double precision,
  lon          double precision,
  requested_at timestamptz not null default now(),
  delivered_by uuid references profiles(id),
  delivered_at timestamptz,
  removed_at   timestamptz,
  note         text
);

create index on yard_signs (campaign_id, status);
