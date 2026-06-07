// Shapes returned from Supabase. Only the columns the app currently reads are
// typed; the voters table has many more (see migration 0003).

export interface Campaign {
  id: string
  name: string
  slug: string
  district_label: string | null
}

export type MemberRole = 'manager' | 'deputy' | 'volunteer' | 'viewer'

export interface Membership {
  campaign_id: string
  role: MemberRole
  campaigns: Campaign
}

export interface Voter {
  id: string
  registration_number: string
  first_name: string | null
  last_name: string | null
  full_address: string | null
  res_city: string | null
  age: number | null
  race: string | null
  gender: string | null
  status: string | null
  tier: number | null
  tier_label: string | null
  last_vote_date: string | null
  voted_2026_r_primary: boolean
  voted_2024_r_primary: boolean
  voted_2024_general: boolean
  voted_any_d_primary: boolean
}

// Columns selected for the voter list (keeps payloads small).
export const VOTER_COLUMNS =
  'id,registration_number,first_name,last_name,full_address,res_city,age,race,gender,status,tier,tier_label,last_vote_date,voted_2026_r_primary,voted_2024_r_primary,voted_2024_general,voted_any_d_primary'

// One row per address (the map markers).
export interface Household {
  id: string
  hh_key: string
  full_address: string | null
  lat: number | null
  lon: number | null
  best_tier: number | null
  has_dnc: boolean
  voter_count: number
}

export const HOUSEHOLD_COLUMNS = 'id,hh_key,full_address,lat,lon,best_tier,has_dnc,voter_count'

// A voter as shown in a household roster card on the map.
export interface RosterVoter {
  id: string
  first_name: string | null
  last_name: string | null
  age: number | null
  race: string | null
  tier: number | null
  status: string | null
}

export const ROSTER_COLUMNS = 'id,first_name,last_name,age,race,tier,status'
