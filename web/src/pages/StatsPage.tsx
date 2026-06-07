import { useEffect, useState, type ReactNode } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { tierMeta } from '../lib/tiers'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

// ── Types matching campaign_stats() (migration 0009) ──
interface CountRow {
  label: string | number
  count: number
}
interface TurnoutRow {
  label: string
  total: number
  v2024g: number
  v2026r: number
  v2024r: number
  vd: number
}
interface CampaignStats {
  total: number
  tiers: CountRow[]
  gender: CountRow[]
  race: CountRow[]
  age: CountRow[]
  turnout_by_race: TurnoutRow[]
  turnout_by_age: TurnoutRow[]
}

type ElectionKey = 'v2026r' | 'v2024r' | 'v2024g' | 'vd'
const ELECTIONS: [ElectionKey, string][] = [
  ['v2026r', '2026 R Primary'],
  ['v2024r', '2024 R Primary'],
  ['v2024g', '2024 General'],
  ['vd', 'Any D Primary'],
]

const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

export default function StatsPage() {
  const { activeCampaign } = useAuth()
  const campaignId = activeCampaign?.campaign_id

  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [raceElection, setRaceElection] = useState<ElectionKey>('v2026r')
  const [ageElection, setAgeElection] = useState<ElectionKey>('v2026r')

  useEffect(() => {
    if (!campaignId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase.rpc('campaign_stats', { p_campaign_id: campaignId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) setError(error.message)
      else setStats(data as unknown as CampaignStats)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  if (loading) return <div className="p-10 text-center text-slate-400">Loading statistics…</div>
  if (error) return <div className="p-10 text-center text-red-600">Error: {error}</div>
  if (!stats) return null

  const pct = (row: TurnoutRow, key: ElectionKey) =>
    row.total ? Math.round((row[key] / row.total) * 1000) / 10 : 0

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-5">
        <span className="text-2xl font-bold text-slate-900">{stats.total.toLocaleString()}</span>
        <span className="text-slate-500 ml-2">registered voters</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tier distribution */}
        <Card title="Voter Tier Distribution">
          <Doughnut
            data={{
              labels: stats.tiers.map((t) => tierMeta(Number(t.label)).label),
              datasets: [
                {
                  data: stats.tiers.map((t) => t.count),
                  backgroundColor: stats.tiers.map((t) => tierMeta(Number(t.label)).color),
                  borderWidth: 1,
                },
              ],
            }}
            options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }}
          />
        </Card>

        {/* Gender */}
        <Card title="Gender Breakdown">
          <Doughnut
            data={{
              labels: stats.gender.map((g) => String(g.label)),
              datasets: [
                {
                  data: stats.gender.map((g) => g.count),
                  backgroundColor: PALETTE,
                  borderWidth: 1,
                },
              ],
            }}
            options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }}
          />
        </Card>

        {/* Registrations by race */}
        <Card title="Registrations by Race">
          <Bar
            data={{
              labels: stats.race.map((r) => String(r.label)),
              datasets: [{ label: 'Voters', data: stats.race.map((r) => r.count), backgroundColor: '#2563eb' }],
            }}
            options={{
              maintainAspectRatio: false,
              indexAxis: 'y',
              plugins: { legend: { display: false } },
            }}
          />
        </Card>

        {/* Registrations by age */}
        <Card title="Registrations by Age">
          <Bar
            data={{
              labels: stats.age.map((a) => String(a.label)),
              datasets: [{ label: 'Voters', data: stats.age.map((a) => a.count), backgroundColor: '#16a34a' }],
            }}
            options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
          />
        </Card>

        {/* Turnout by race */}
        <Card
          title="Turnout by Race"
          control={<ElectionSelect value={raceElection} onChange={setRaceElection} />}
        >
          <Bar
            data={{
              labels: stats.turnout_by_race.map((r) => r.label),
              datasets: [
                {
                  label: '% who voted',
                  data: stats.turnout_by_race.map((r) => pct(r, raceElection)),
                  backgroundColor: '#7c3aed',
                },
              ],
            }}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
            }}
          />
        </Card>

        {/* Turnout by age */}
        <Card
          title="Turnout by Age"
          control={<ElectionSelect value={ageElection} onChange={setAgeElection} />}
        >
          <Bar
            data={{
              labels: stats.turnout_by_age.map((a) => a.label),
              datasets: [
                {
                  label: '% who voted',
                  data: stats.turnout_by_age.map((a) => pct(a, ageElection)),
                  backgroundColor: '#0891b2',
                },
              ],
            }}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
            }}
          />
        </Card>
      </div>
    </div>
  )
}

function Card({ title, control, children }: { title: string; control?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {control}
      </div>
      <div style={{ height: 280 }}>{children}</div>
    </div>
  )
}

function ElectionSelect({
  value,
  onChange,
}: {
  value: ElectionKey
  onChange: (v: ElectionKey) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ElectionKey)}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white"
    >
      {ELECTIONS.map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  )
}
