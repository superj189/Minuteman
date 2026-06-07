// Shapes returned from Supabase. Only the columns the app currently reads are
// typed; the voters table has many more (see migration 0003).
import type { GeoJsonObject } from 'geojson'

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
  contact_count: number
  last_support_score: number | null
  last_outcome: string | null
  last_contacted_at: string | null
}

// Columns selected for the voter list (keeps payloads small).
export const VOTER_COLUMNS =
  'id,registration_number,first_name,last_name,full_address,res_city,age,race,gender,status,tier,tier_label,last_vote_date,voted_2026_r_primary,voted_2024_r_primary,voted_2024_general,voted_any_d_primary,contact_count,last_support_score,last_outcome,last_contacted_at'

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

// ── Field-collected records shown in the voter detail drawer ──
export interface ContactLogRow {
  id: string
  outcome: string
  support_score: number | null
  channel: string
  occurred_at: string
  contacted_by: string | null
}

export interface ContactInfoRow {
  id: string
  kind: 'phone' | 'email'
  value: string
  source: string
  created_at: string
}

export interface ConsentStateRow {
  id: string
  consent_type: string
  granted: boolean
  occurred_at: string
}

export interface NoteRow {
  id: string
  body: string
  created_at: string
}

// ── Turf cutting ──
export interface Turf {
  id: string
  name: string
  color: string
  geojson: GeoJsonObject
}

export interface TurfAssignmentRow {
  id: string
  turf_id: string
  assigned_to: string
  status: string
}

export interface TeamMember {
  user_id: string
  role: MemberRole
  full_name: string | null
  email: string | null
}
