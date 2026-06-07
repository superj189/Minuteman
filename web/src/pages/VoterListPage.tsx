import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { TIER_ORDER, tierMeta } from '../lib/tiers'
import { VOTER_COLUMNS, type Voter } from '../lib/types'

const PAGE_SIZES = [50, 100, 250]

type SortCol = 'last_name' | 'age' | 'tier' | 'last_vote_date'

// Strip characters that would break PostgREST's or() filter syntax.
function sanitize(q: string) {
  return q.replace(/[(),*]/g, ' ').trim()
}

export default function VoterListPage() {
  const { activeCampaign } = useAuth()
  const campaignId = activeCampaign?.campaign_id

  const [counts, setCounts] = useState<Record<number, number>>({})
  const [totalAll, setTotalAll] = useState(0)

  const [tierFilter, setTierFilter] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ col: SortCol; asc: boolean }>({ col: 'last_name', asc: true })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)

  const [rows, setRows] = useState<Voter[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Tier summary counts (one head-count query per tier, in parallel).
  useEffect(() => {
    if (!campaignId) return
    let cancelled = false
    async function loadCounts() {
      const all = await supabase
        .from('voters')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
      const perTier = await Promise.all(
        TIER_ORDER.map((t) =>
          supabase
            .from('voters')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .eq('tier', t)
            .then((r) => [t, r.count ?? 0] as const),
        ),
      )
      if (cancelled) return
      setTotalAll(all.count ?? 0)
      setCounts(Object.fromEntries(perTier))
    }
    loadCounts()
    return () => {
      cancelled = true
    }
  }, [campaignId])

  // Main paged query — re-runs on any filter/sort/page change.
  const loadRows = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError(null)

    let query = supabase
      .from('voters')
      .select(VOTER_COLUMNS, { count: 'exact' })
      .eq('campaign_id', campaignId)

    if (tierFilter) query = query.eq('tier', tierFilter)

    const q = sanitize(search)
    if (q) {
      query = query.or(
        `last_name.ilike.*${q}*,first_name.ilike.*${q}*,full_address.ilike.*${q}*`,
      )
    }

    query = query
      .order(sort.col, { ascending: sort.asc, nullsFirst: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)

    const { data, count, error } = await query
    if (error) {
      setError(error.message)
      setRows([])
      setTotal(0)
    } else {
      setRows((data as unknown as Voter[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [campaignId, tierFilter, search, sort, page, pageSize])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  function toggleSort(col: SortCol) {
    setSort((s) => (s.col === col ? { col, asc: !s.asc } : { col, asc: true }))
    setPage(0)
  }

  const sortArrow = (col: SortCol) => (sort.col === col ? (sort.asc ? ' ▲' : ' ▼') : '')

  const showingFrom = total === 0 ? 0 : page * pageSize + 1
  const showingTo = Math.min(total, (page + 1) * pageSize)

  const tierCards = useMemo(
    () => [
      { key: 'all' as const, label: 'All Voters', count: totalAll, color: '#1e293b', tier: null },
      ...TIER_ORDER.map((t) => ({
        key: t,
        label: tierMeta(t).label,
        count: counts[t] ?? 0,
        color: tierMeta(t).color,
        tier: t,
      })),
    ],
    [counts, totalAll],
  )

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Tier summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        {tierCards.map((c) => {
          const active = tierFilter === c.tier
          return (
            <button
              key={c.key}
              onClick={() => {
                setTierFilter(c.tier)
                setPage(0)
              }}
              className="text-left rounded-lg border p-3 transition hover:bg-slate-50"
              style={{
                borderColor: c.color,
                boxShadow: active ? `0 0 0 2px ${c.color}` : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: c.color }} />
                <span className="text-lg font-semibold text-slate-900">{c.count.toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 leading-tight">{c.label}</div>
            </button>
          )
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          placeholder="Search name or address…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value))
            setPage(0)
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
      </div>

      <div className="text-sm text-slate-500 mb-2">
        {loading ? 'Loading…' : `Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${total.toLocaleString()}`}
        {tierFilter && (
          <button onClick={() => setTierFilter(null)} className="ml-2 text-blue-600 hover:underline">
            clear tier filter
          </button>
        )}
      </div>

      {error && <div className="mb-3 text-sm text-red-600">Error: {error}</div>}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th onClick={() => toggleSort('last_name')}>Name{sortArrow('last_name')}</Th>
              <Th>Address</Th>
              <Th>City</Th>
              <Th onClick={() => toggleSort('age')}>Age{sortArrow('age')}</Th>
              <Th>Race</Th>
              <Th onClick={() => toggleSort('tier')}>Tier{sortArrow('tier')}</Th>
              <Th className="text-center" title="2026 R primary / 2024 R primary / 2024 general / any D primary">
                26P · 24P · 24G · D
              </Th>
              <Th>Status</Th>
              <Th onClick={() => toggleSort('last_vote_date')}>Last Vote{sortArrow('last_vote_date')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((v) => {
              const tm = tierMeta(v.tier)
              return (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-900">
                    {(v.last_name ?? '').trim()}, {(v.first_name ?? '').trim()}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{v.full_address}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{v.res_city}</td>
                  <td className="px-3 py-2 text-slate-600">{v.age ?? ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{v.race}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ background: tm.color }}
                    >
                      {tm.short} {tm.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1.5">
                      <Dot on={v.voted_2026_r_primary} title="2026 R primary" />
                      <Dot on={v.voted_2024_r_primary} title="2024 R primary" />
                      <Dot on={v.voted_2024_general} title="2024 general" />
                      <Dot on={v.voted_any_d_primary} title="Any D primary" danger />
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{v.status}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{v.last_vote_date ?? ''}</td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  No voters match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40 hover:bg-slate-50"
        >
          ← Prev
        </button>
        <span className="text-slate-500">
          Page {page + 1} of {pageCount.toLocaleString()}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={page >= pageCount - 1}
          className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40 hover:bg-slate-50"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

function Th({
  children,
  onClick,
  className = '',
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  title?: string
}) {
  return (
    <th
      onClick={onClick}
      title={title}
      className={`px-3 py-2 text-left font-medium ${onClick ? 'cursor-pointer select-none hover:text-slate-900' : ''} ${className}`}
    >
      {children}
    </th>
  )
}

function Dot({ on, title, danger }: { on: boolean; title: string; danger?: boolean }) {
  return (
    <span
      title={title}
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{ background: on ? (danger ? '#dc2626' : '#16a34a') : '#e2e8f0' }}
    />
  )
}
