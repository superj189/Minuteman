-- ════════════════════════════════════════════════════════════════════════
-- 0001_extensions_and_enums.sql
-- HD-100 Voter Platform — Schema v1
--
-- Foundational extensions, shared enum types, and small utility functions.
-- Everything downstream (tenancy, voters, consent, turf) builds on this file.
-- Run migrations in numeric order.
-- ════════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists postgis;    -- spatial: voter points + turf polygons
create extension if not exists citext;     -- case-insensitive email comparison

-- ── Enums ───────────────────────────────────────────────────────────────

-- Role a user holds *within a single campaign*. A user can hold different
-- roles in different campaigns. Enforced in the database via RLS (migration 0006).
create type member_role as enum ('manager', 'deputy', 'volunteer', 'viewer');

-- A piece of contact info is either a phone number or an email address.
create type contact_kind as enum ('phone', 'email');

-- Where a phone/email came from. Provenance drives what we may legally do with it
-- (e.g. purchased data carries weaker consent than door-collected — see README §legal).
create type contact_source as enum (
  'purchased',      -- vendor append (L2, TargetSmart, DataTrust)
  'door',           -- collected face-to-face by a volunteer
  'event',          -- tablet sign-in / petition at an event
  'self_reported',  -- voter entered it themselves (web form)
  'party',          -- supplied by GA GOP / coordinated committee
  'other'
);

-- Outcome of a single canvass interaction.
create type contact_outcome as enum (
  'not_home', 'talked', 'refused', 'moved', 'deceased',
  'not_interested', 'wrong_address', 'other'
);

-- How a contact was made.
create type contact_channel as enum ('door', 'phone', 'sms', 'email', 'event');

-- The kinds of permission a voter can grant. Each is independently grantable
-- and revocable. Channel-specific by design for TCPA defensibility; adding a new
-- type later is a one-line ALTER TYPE.
create type consent_kind as enum (
  'contact_general',
  'contact_email',
  'contact_phone',
  'contact_sms',
  'donation_solicitation',  -- "OK to ask for money" — NOT money processing (see README)
  'yard_sign'
);

-- How a consent was captured (provenance for the consent record).
create type consent_method as enum ('in_person', 'phone', 'sms', 'web', 'event', 'paper');

-- Yard-sign fulfillment lifecycle: consented -> delivered.
create type yard_sign_status as enum (
  'consented',  -- voter agreed to a sign; not yet placed
  'scheduled',  -- assigned to a volunteer for delivery
  'delivered',  -- sign placed
  'removed',    -- sign taken down (post-election or by request)
  'declined'    -- consent withdrawn before delivery
);

-- State of a turf assignment as a volunteer works it.
create type assignment_status as enum ('assigned', 'in_progress', 'complete');

-- Result of an SOS early-vote file pull.
create type sos_import_status as enum ('pending', 'success', 'partial', 'failed');

-- ── Utility: keep an updated_at column fresh ────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
