// The 6-tier classification — colors and labels match Phase 1 (project doc §4).
// Display order is by priority (T1 best target → T6 do-not-contact).

export interface TierMeta {
  label: string
  color: string
  short: string
}

export const TIERS: Record<number, TierMeta> = {
  1: { label: 'Loyal Republican', color: '#C8102E', short: 'T1' },
  2: { label: 'High Target', color: '#FF6B35', short: 'T2' },
  3: { label: 'Persuasion Target', color: '#F4A300', short: 'T3' },
  4: { label: 'White Non-General', color: '#8BC34A', short: 'T4' },
  5: { label: 'Unlikely Target', color: '#6C9BCF', short: 'T5' },
  6: { label: 'Do Not Contact', color: '#555555', short: 'T6' },
}

// Order tier cards/filters are shown in.
export const TIER_ORDER = [1, 2, 3, 4, 5, 6]

export function tierMeta(tier: number | null | undefined): TierMeta {
  return (tier && TIERS[tier]) || { label: 'Unknown', color: '#9ca3af', short: '—' }
}
