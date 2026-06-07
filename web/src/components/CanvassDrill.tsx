import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { tierMeta } from '../lib/tiers'
import { CONTACT_OUTCOMES, labelFor } from '../lib/options'

export type DrillMetric = 'all' | 'talked' | 'supporters'

interface DrillRow {
  id: string
  outcome: string
  support_score: number | null
  occurred_at: string
  voter_id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  voters: any
}

const TITLES: Record<DrillMetric, string> = {
  all: 'Contacts',
  talked: 'Talked',
  supporters: 'Supporters',
}

// A bottom-sheet list of the contacts behind a stat. Tapping a voter opens them.
export default function CanvassDrill({
  campaignId,
  userId,
  name,
  metric,
  onClose,
  onOpenVoter,
}: {
  campaignId?: string
  userId: string
  name: string
  metric: DrillMetric
  onClose: () => void
  onOpenVoter: (id: string) => void
}) {
  const [rows, setRows] = useState<DrillRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaignId) return
    let q = supabase
      .from('contact_logs')
      .select('id,outcome,support_score,occurred_at,voter_id,voters(first_name,last_name,full_address,tier)')
      .eq('campaign_id', campaignId)
      .eq('contacted_by', userId)
      .order('occurred_at', { ascending: false })
    if (metric === 'talked') q = q.eq('outcome', 'talked')
    else if (metric === 'supporters') q = q.gte('support_score', 4)
    q.then(({ data }) => {
      setRows((data as unknown as DrillRow[]) ?? [])
      setLoading(false)
    })
  }, [campaignId, userId, metric])

  return (
    <div className="fixed inset-0 z-[2100] flex justify-center items-end sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className="relative bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-900">
            {name} — {TITLES[metric]} <span className="text-slate-400">({rows.length})</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {loading && <li className="p-4 text-slate-400 text-sm">Loading…</li>}
          {!loading && rows.length === 0 && <li className="p-4 text-slate-400 text-sm">Nothing here yet.</li>}
          {rows.map((r) => {
            const v = Array.isArray(r.voters) ? r.voters[0] : r.voters
            const tm = tierMeta(v?.tier)
            return (
              <li key={r.id}>
                <button
                  onClick={() => onOpenVoter(r.voter_id)}
                  className="w-full text-left p-3 hover:bg-blue-50 flex items-start gap-2"
                >
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white shrink-0 mt-0.5"
                    style={{ background: tm.color }}
                  >
                    {tm.short}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {(v?.last_name ?? '').trim()}, {(v?.first_name ?? '').trim()}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{v?.full_address}</div>
                    <div className="text-xs text-slate-400">
                      {labelFor(CONTACT_OUTCOMES, r.outcome)}
                      {r.support_score != null ? ` · support ${r.support_score}` : ''}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
