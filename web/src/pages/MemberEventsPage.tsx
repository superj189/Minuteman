import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { BRAND } from '../lib/brand'

interface ClubEvent {
  id: string
  name: string
  starts_at: string
  location: string | null
  description: string | null
}

// Read-only events list for members (the board gets the full Events manager).
export default function MemberEventsPage() {
  const { activeCampaign } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaignId) return
    supabase
      .from('events')
      .select('id,name,starts_at,location,description')
      .eq('campaign_id', campaignId)
      .order('starts_at')
      .then(({ data }) => {
        setEvents((data as ClubEvent[]) ?? [])
        setLoading(false)
      })
  }, [campaignId])

  const cutoff = Date.now() - 3 * 3600000
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= cutoff)
  const past = events.filter((e) => new Date(e.starts_at).getTime() < cutoff).reverse().slice(0, 10)

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-4">Events</h1>
      {loading ? (
        <div className="text-center text-slate-400 py-10">Loading…</div>
      ) : (
        <>
          <List title="Upcoming" events={upcoming} empty="Nothing scheduled yet. Check back soon!" />
          {past.length > 0 && <List title="Recent" events={past} muted />}
        </>
      )}
    </div>
  )
}

function List({ title, events, empty, muted }: { title: string; events: ClubEvent[]; empty?: string; muted?: boolean }) {
  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h2>
      {events.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const d = new Date(e.starts_at)
            return (
              <li key={e.id} className={`bg-white rounded-lg border border-slate-200 p-4 flex gap-4 ${muted ? 'opacity-70' : ''}`}>
                <div className="shrink-0 w-14 rounded-lg text-center py-1.5 text-white" style={{ background: muted ? '#64748b' : BRAND.red }}>
                  <div className="text-[10px] uppercase">{d.toLocaleDateString([], { month: 'short' })}</div>
                  <div className="text-xl font-bold leading-none">{d.getDate()}</div>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{e.name}</div>
                  <div className="text-sm text-slate-500">
                    {d.toLocaleDateString([], { weekday: 'long' })}, {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {e.location && ` · ${e.location}`}
                  </div>
                  {e.description && <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{e.description}</p>}
                  {e.location && !muted && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(e.location)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs text-blue-600 hover:underline mt-1"
                    >
                      Directions
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
