import { supabase } from './supabase'
import { type Household } from './types'

// All geocoded households for a campaign in ONE request. The campaign_map_points
// RPC (migration 0011) returns them as a single JSON array, instead of paging
// through ~19 requests of 1,000 rows each.
export async function fetchAllHouseholds(campaignId: string): Promise<Household[]> {
  const { data, error } = await supabase.rpc('campaign_map_points', { p_campaign_id: campaignId })
  if (error) throw error
  return (data as unknown as Household[]) ?? []
}
