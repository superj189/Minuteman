import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { BRAND } from '../lib/brand'
import { ageFrom, SOURCE_LABELS, STATUSES, type ClubMember } from '../lib/members'
import NoAccess from '../components/NoAccess'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)
ChartJS.defaults.color = '#94a3b8'

type M = Pick<ClubMember, 'id' | 'status' | 'source' | 'birth_date' | 'zip' | 'email' | 'phone' | 'email_opt_in' | 'sms_opt_in' | 'created_at'>
interface Ev {
  id: string
  name: string
  starts_at: string
}
interface Att {
  event_id: string
  was_new: boolean
}

const WEEK = 7 * 86400000

// Board-only snapshot of how the club is doing.
export default function DashboardPage() {
  const { activeCampaign, isBoard } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const [members, setMembers] = useState<M[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [att, setAtt] = useState<Att[]>([])
  const [logins, setLogins] = useState(0)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaignId || !isBoard) return
    Promise.all([
      supabase.from('members').select('id,status,source,birth_date,zip,email,phone,email_opt_in,sms_opt_in,created_at').eq('campaign_id', campaignId).limit(20000),
      supabase.from('events').select('id,name,starts_at').eq('campaign_id', campaignId).lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }).limit(8),
      supabase.from('event_attendance').select('event_id,was_new').eq('campaign_id', campaignId),
      supabase.from('campaign_members').select('user_id', { count: 'exact', head: true }).eq('campaign_id', campaignId),
      supabase.from('membership_requests').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'pending'),
    ]).then(([m, e, a, l, p]) => {
      setMembers((m.data as M[]) ?? [])
      setEvents(((e.data as Ev[]) ?? []).reverse())
      setAtt((a.data as Att[]) ?? [])
      setLogins(l.count ?? 0)
      setPending(p.count ?? 0)
      setLoading(false)
    })
  }, [campaignId, isBoard])

  const s = useMemo(() => {
    // Sign-ups per week, last 12 weeks (oldest first).
    const now = Date.now()
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const start = now - (12 - i) * WEEK
      const label = new Date(start).toLocaleDateString([], { month: 'short', day: 'numeric' })
      const count = members.filter((m) => {
        const t = new Date(m.created_at).getTime()
        return t >= start && t < start + WEEK
      }).length
      return { label, count }
    })
    const ageBucket = (a: number | null) =>
      a == null ? 'Unknown' : a < 25 ? '18–24' : a < 30 ? '25–29' : a < 35 ? '30–34' : a <= 40 ? '35–40' : 'Over 40'
    const ages = ['18–24', '25–29', '30–34', '35–40', 'Over 40', 'Unknown'].map((b) => ({
      label: b,
      count: members.filter((m) => ageBucket(ageFrom(m.birth_date)) === b).length,
    }))
    const zips = Object.entries(
      members.reduce<Record<string, number>>((acc, m) => {
        if (m.zip) acc[m.zip] = (acc[m.zip] ?? 0) + 1
        return acc
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
    const sources = (Object.keys(SOURCE_LABELS) as M['source'][]).map((k) => ({
      label: SOURCE_LABELS[k],
      count: members.filter((m) => m.source === k).length,
    }))
    const statuses = STATUSES.map((st) => ({ ...st, count: members.filter((m) => m.status === st.value).length }))
    const evStats = events.map((e) => ({
      name: e.name,
      date: new Date(e.starts_at).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      total: att.filter((a) => a.event_id === e.id).length,
      fresh: att.filter((a) => a.event_id === e.id && a.was_new).length,
    }))
    return {
      total: members.length,
      new30: members.filter((m) => now - new Date(m.created_at).getTime() < 30 * 86400000).length,
      active: members.filter((m) => m.status === 'active' || m.status === 'dues_paid').length,
      emailable: members.filter((m) => m.email_opt_in && m.email).length,
      textable: members.filter((m) => m.sms_opt_in && m.phone).length,
      weeks,
      ages,
      zips,
      sources,
      statuses,
      evStats,
    }
  }, [members, events, att])

  if (!isBoard) return <NoAccess what="the dashboard" />
  if (loading) return <div className="text-center text-slate-400 py-10">Loading…</div>

  const bar = (labels: string[], data: number[], color: string = BRAND.navy) => ({
    labels,
    datasets: [{ data, backgroundColor: color, borderRadius: 4 }],
  })
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-4">Dashboard</h1>

      {pending > 0 && (
        <Link to="/app/people" className="block mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 hover:bg-amber-100">
          <b>{pending}</b> waiting for member approval →
        </Link>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
        <Tile label="Members" value={s.total} to="/app/members" />
        <Tile label="New (30 days)" value={s.new30} />
        <Tile label="Active or paid" value={s.active} />
        <Tile label="Member logins" value={logins} to="/app/people" />
        <Tile label="OK to email" value={s.emailable} />
        <Tile label="OK to text" value={s.textable} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="New members per week">
          <div className="h-56">
            <Bar data={bar(s.weeks.map((w) => w.label), s.weeks.map((w) => w.count))} options={opts} />
          </div>
        </Card>

        <Card title="Event turnout">
          {s.evStats.length === 0 ? (
            <Empty text="No past events yet." />
          ) : (
            <div className="h-56">
              <Bar
                data={{
                  labels: s.evStats.map((e) => e.date),
                  datasets: [
                    { label: 'Returning', data: s.evStats.map((e) => e.total - e.fresh), backgroundColor: BRAND.navy, borderRadius: 4 },
                    { label: 'First-timers', data: s.evStats.map((e) => e.fresh), backgroundColor: BRAND.red, borderRadius: 4 },
                  ],
                }}
                options={{
                  ...opts,
                  plugins: {
                    legend: { display: true, position: 'bottom' as const },
                    tooltip: { callbacks: { title: (items) => s.evStats[items[0].dataIndex]?.name ?? '' } },
                  },
                  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
                }}
              />
            </div>
          )}
        </Card>

        <Card title="Ages">
          <div className="h-56">
            <Bar data={bar(s.ages.map((a) => a.label), s.ages.map((a) => a.count))} options={opts} />
          </div>
        </Card>

        <Card title="Member status">
          <ul className="space-y-2">
            {s.statuses.map((st) => (
              <Row key={st.value} label={st.label} value={st.count} total={s.total} color={st.color} />
            ))}
          </ul>
        </Card>

        <Card title="How people joined">
          <ul className="space-y-2">
            {s.sources.map((src) => (
              <Row key={src.label} label={src.label} value={src.count} total={s.total} color={BRAND.navy} />
            ))}
          </ul>
        </Card>

        <Card title="Top ZIP codes">
          {s.zips.length === 0 ? (
            <Empty text="No ZIP codes yet." />
          ) : (
            <ul className="space-y-2">
              {s.zips.map(([zip, n]) => (
                <Row key={zip} label={zip} value={n} total={s.total} color={BRAND.red} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Tile({ label, value, to }: { label: string; value: number; to?: string }) {
  const body = (
    <>
      <div className="text-2xl font-bold text-slate-900 tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </>
  )
  return to ? (
    <Link to={to} className="bg-white rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
      {body}
    </Link>
  ) : (
    <div className="bg-white rounded-lg border border-slate-200 p-3">{body}</div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <li className="text-sm">
      <div className="flex justify-between text-slate-700">
        <span>{label}</span>
        <span className="tabular-nums text-slate-500">
          {value} <span className="text-xs">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </li>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 text-center py-6">{text}</p>
}
