import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { BRAND } from '../lib/brand'
import NoAccess from '../components/NoAccess'

interface DeskEvent {
  id: string
  name: string
  starts_at: string
  location: string | null
  checkin_open: boolean
}

interface RosterRow {
  first_name: string
  last_name: string
  was_new: boolean
  source: string
  checked_in_at: string
}

// For members the board trusts to run the door: open/close check-in, show the
// QR code, and watch who has arrived. No access to the full member list.
export default function CheckinDeskPage() {
  const { activeCampaign, can } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const [events, setEvents] = useState<DeskEvent[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase
      .from('events')
      .select('id,name,starts_at,location,checkin_open')
      .eq('campaign_id', campaignId)
      .gte('starts_at', new Date(Date.now() - 36 * 3600000).toISOString())
      .order('starts_at')
      .limit(10)
    setEvents((data as DeskEvent[]) ?? [])
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  if (!can('event_checkin')) return <NoAccess />

  const ev = events.find((e) => e.id === selected)
  if (ev) return <Desk event={ev} onBack={() => setSelected(null)} onChanged={load} />

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-1">Check-in desk</h1>
      <p className="text-sm text-slate-500 mb-4">Pick the event you're running.</p>
      {events.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">No upcoming events.</div>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <button onClick={() => setSelected(e.id)} className="w-full text-left bg-white rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
                <div className="font-medium text-slate-900">{e.name}</div>
                <div className="text-xs text-slate-500">
                  {new Date(e.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {e.location && ` · ${e.location}`}
                </div>
                {e.checkin_open && <span className="inline-block mt-2 text-[11px] rounded-full bg-green-600 text-white px-2 py-0.5">Check-in open</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Desk({ event, onBack, onChanged }: { event: DeskEvent; onBack: () => void; onChanged: () => Promise<void> }) {
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const link = `${window.location.origin}/checkin/${event.id}`

  const loadRoster = useCallback(async () => {
    const { data, error } = await supabase.rpc('event_roster', { p_event_id: event.id })
    if (error) setErr(error.message)
    else setRoster((data as RosterRow[]) ?? [])
  }, [event.id])

  useEffect(() => {
    loadRoster()
    QRCode.toDataURL(link, { width: 600, margin: 2, errorCorrectionLevel: 'H', color: { dark: BRAND.navy, light: '#ffffff' } }).then(setQr)
  }, [loadRoster, link])

  useEffect(() => {
    if (!event.checkin_open) return
    const t = setInterval(loadRoster, 10000)
    return () => clearInterval(t)
  }, [event.checkin_open, loadRoster])

  const toggle = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('set_checkin_open', { p_event_id: event.id, p_open: !event.checkin_open })
    if (error) setErr(error.message)
    await onChanged()
    setBusy(false)
  }

  const fresh = roster.filter((r) => r.was_new).length

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-3">
        ← Events
      </button>
      <h1 className="text-xl font-bold text-slate-900">{event.name}</h1>
      <div className="text-sm text-slate-500 mb-4">{new Date(event.starts_at).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm text-slate-600">
            {event.checkin_open ? 'Check-in is open.' : 'Check-in is closed. Open it when the doors open.'}
          </div>
          <button
            onClick={toggle}
            disabled={busy}
            className={`rounded-lg text-sm font-medium px-4 py-2 disabled:opacity-50 ${
              event.checkin_open ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {event.checkin_open ? 'Close check-in' : 'Open check-in'}
          </button>
        </div>
        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
          {qr && <img src={qr} alt="Check-in QR code" className={`w-44 h-44 rounded border border-slate-200 ${event.checkin_open ? '' : 'opacity-40'}`} />}
          <div className="text-sm text-slate-600 space-y-2">
            <p>Guests scan this with their phone camera, or open the check-in screen on a tablet by the door.</p>
            <a href={link} target="_blank" rel="noreferrer" className="inline-block rounded-lg bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700">
              Open check-in screen
            </a>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-baseline mb-2">
          <h2 className="text-sm font-semibold text-slate-900 flex-1">Checked in</h2>
          <span className="text-sm text-slate-600">
            <b className="text-slate-900">{roster.length}</b> total{fresh > 0 && <> · <b className="text-blue-700">{fresh}</b> new</>}
          </span>
        </div>
        {roster.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Nobody yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {roster.map((r, i) => (
              <li key={i} className="py-2 flex items-center text-sm">
                <span className="flex-1 text-slate-900">
                  {r.first_name} {r.last_name}
                  {r.was_new && <span className="ml-2 text-[11px] rounded-full bg-blue-600 text-white px-2 py-0.5">New</span>}
                </span>
                <span className="text-xs text-slate-400">{new Date(r.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
