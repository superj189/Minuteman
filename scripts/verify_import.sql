-- verify_import.sql
-- Run these in the Supabase SQL Editor after the import to confirm the data
-- loaded correctly. Expected values are from Phase 1 (HD100_PROJECT_DOCUMENTATION.md §4).

-- 1. Row counts
select
  (select count(*) from households where campaign_id = 'e4673209-c3ea-46d0-b3b4-4e1aabd734fa') as households,
  (select count(*) from voters     where campaign_id = 'e4673209-c3ea-46d0-b3b4-4e1aabd734fa') as voters;
-- Expected: ~18,002 households | ~43,944 voters

-- 2. Tier distribution (compare to §4 of the project doc)
select tier, tier_label, count(*) as n,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from voters
where campaign_id = 'e4673209-c3ea-46d0-b3b4-4e1aabd734fa'
group by tier, tier_label
order by tier;
-- Expected:
--   T1 Loyal Republican    6,366  14.5%
--   T2 High Target         1,038   2.4%
--   T3 Persuasion Target  11,916  27.1%
--   T4 White Non-General   5,729  13.0%
--   T5 Unlikely Target    14,469  32.9%
--   T6 Do Not Contact      4,426  10.1%

-- 3. Geocoded voters (should be ~42,564 of 43,944)
select
  count(*) filter (where lat is not null) as geocoded,
  count(*) as total
from voters
where campaign_id = 'e4673209-c3ea-46d0-b3b4-4e1aabd734fa';

-- 4. Household rollup sanity check
select
  count(*) filter (where has_target) as doors_with_target,
  count(*) filter (where has_dnc)    as dnc_doors,
  count(*) filter (where is_mixed)   as mixed_doors
from households
where campaign_id = 'e4673209-c3ea-46d0-b3b4-4e1aabd734fa';
-- Expected: ~10,564 target doors | ~1,042 DNC doors | ~832 mixed doors

-- 5. Voter → household linkage (every geocoded voter should have a household_id)
select count(*) as voters_missing_household
from voters
where campaign_id = 'e4673209-c3ea-46d0-b3b4-4e1aabd734fa'
  and lat is not null
  and household_id is null;
-- Expected: 0
