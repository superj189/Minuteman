import { supabase } from './supabase'
import { HOUSEHOLD_COLUMNS, type Household } from './types'

// Pull every geocoded household for a campaign, 1,000 rows at a time
// (Supabase caps a single response at 1,000 rows).
export async function fetchAllHouseholds(campaignId: string): Promise<Household[]> {
  const pageSize = 1000
  let from = 0
  const all: Household[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('households')
      .select(HOUSEHOLD_COLUMNS)
      .eq('campaign_id', campaignId)
      .not('lat', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data as unknown as Household[]) ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}
