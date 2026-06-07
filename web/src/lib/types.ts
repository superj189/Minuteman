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
