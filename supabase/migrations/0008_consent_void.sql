-- ════════════════════════════════════════════════════════════════════════
-- 0008_consent_void.sql
-- Let an erroneous consent entry be VOIDED ("entered by mistake") without
-- breaking the append-only audit trail.
--
-- Why not just delete? consent_records is our legal proof of who agreed to what.
-- Hard-deleting would destroy that protection. Instead we mark the bad row as
-- voided — it stops counting toward the voter's current state, but stays in the
-- table with who voided it, when, and why. Revoke (voter changed their mind) and
-- void (we made a data-entry error) stay cleanly distinct.
-- ════════════════════════════════════════════════════════════════════════

-- Void metadata. A non-null voided_at means "struck from the record."
alter table consent_records
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid references profiles(id),
  add column if not exists void_reason text;

-- Rebuild the current-state view to (a) ignore voided rows and (b) expose the
-- row id so the app can target the exact entry to void.
drop view if exists current_consent;
create view current_consent with (security_invoker = on) as
select distinct on (voter_id, consent_type)
  id, campaign_id, voter_id, consent_type, granted, method, attested_by, occurred_at
from consent_records
where voided_at is null
order by voter_id, consent_type, occurred_at desc;

grant select on current_consent to authenticated;

-- Allow setting ONLY the void columns — granted / consent_type / etc. remain
-- immutable, so this can strike an entry but never rewrite consent history.
grant update (voided_at, voided_by, void_reason) on consent_records to authenticated;

-- An admin, or the volunteer who recorded the entry, may void it.
create policy consent_void on consent_records for update
  using ( is_campaign_admin(campaign_id) or attested_by = auth.uid() )
  with check ( is_campaign_admin(campaign_id) or attested_by = auth.uid() );
