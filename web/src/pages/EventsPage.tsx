import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { BRAND } from '../lib/brand'
import type { ClubMember } from '../lib/members'

interface ClubEvent {
  id: string
  name: string
  starts_at: string
  location: string | null
  description: string | null
  checkin_open: boolean
  is_public: boolean
}

interface Attendance {
  id: string
  event_id: string
  member_id: string
  source: 'self_checkin' | 'officer'
  was_new: boolean
  checked_in_at: string
}

type MemberLite = Pick<ClubMember, 'id' | 'first_name' | 'last_name' | 'email'>

const checkinUrl = (id: string) => `${window.location.origin}/checkin/${id}`

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// "2026-12-04T19:00" for <input type="datetime-local">, in local time.
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function EventsPage() {
  const { activeCampaign, isBoard } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const canSee = isBoard

  const [events, setEvents] = useState<ClubEvent[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [members, setMembers] = useState<MemberLite[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ClubEvent | 'new' | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!campaignId) return
    const [ev, at, mem] = await Promise.all([
      supabase.from('events').select('id,name,starts_at,location,description,checkin_open,is_public').eq('campaign_id', campaignId).order('starts_at', { ascending: false }),
      supabase.from('event_attendance').select('id,event_id,member_id,source,was_new,checked_in_at').eq('campaign_id', campaignId),
      supabase.from('members').select('id,first_name,last_name,email').eq('campaign_id', campaignId).order('last_name').limit(5000),
    ])
    setEvents((ev.data as ClubEvent[]) ?? [])
    setAttendance((at.data as Attendance[]) ?? [])
    setMembers((mem.data as MemberLite[]) ?? [])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => {
    const out: Record<string, { total: number; fresh: number }> = {}
    for (const a of attendance) {
      out[a.event_id] ??= { total: 0, fresh: 0 }
      out[a.event_id].total++
      if (a.was_new) out[a.event_id].fresh++
    }
    return out
  }, [attendance])

  if (!canSee) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center text-slate-600">
        <h1 className="text-lg font-semibold text-slate-900 mb-2">Officers only</h1>
      </div>
    )
  }

  const selected = events.find((e) => e.id === selectedId) ?? null
  const now = Date.now()
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now - 6 * 3600000).reverse()
  const past = events.filter((e) => new Date(e.starts_at).getTime() < now - 6 * 3600000)

  if (selected) {
    return (
      <EventDetail
        event={selected}
        attendance={attendance.filter((a) => a.event_id === selected.id)}
        members={members}
        campaignId={campaignId!}
        onBack={() => setSelectedId(null)}
        onEdit={() => setEditing(selected)}
        onChanged={load}
        editor={
          editing && (
            <EventEditor
              event={editing === 'new' ? null : editing}
              campaignId={campaignId!}
              onClose={() => setEditing(null)}
              onSaved={async (deleted) => {
                setEditing(null)
                if (deleted) setSelectedId(null)
                await load()
              }}
            />
          )
        }
      />
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-xl font-bold text-slate-900 flex-1">Events</h1>
        <button onClick={() => setEditing('new')} className="rounded-lg bg-blue-600 text-white text-sm px-3 py-2 hover:bg-blue-700">
          + New event
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-10">Loading…</div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
          <div className="font-medium text-slate-700 mb-1">No events yet</div>
          <div className="text-sm">Create your first meeting or happy hour, then use its check-in QR code at the door.</div>
        </div>
      ) : (
        <>
          <EventList title="Upcoming" events={upcoming} counts={counts} onOpen={setSelectedId} />
          <EventList title="Past" events={past} counts={counts} onOpen={setSelectedId} />
        </>
      )}

      {editing && (
        <EventEditor
          event={editing === 'new' ? null : editing}
          campaignId={campaignId!}
          onClose={() => setEditing(null)}
          onSaved={async (_deleted, newId) => {
            setEditing(null)
            await load()
            if (newId) setSelectedId(newId)
          }}
        />
      )}
    </div>
  )
}

function EventList({
  title,
  events,
  counts,
  onOpen,
}: {
  title: string
  events: ClubEvent[]
  counts: Record<string, { total: number; fresh: number }>
  onOpen: (id: string) => void
}) {
  if (events.length === 0) return null
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h2>
      <ul className="space-y-2">
        {events.map((e) => {
          const c = counts[e.id] ?? { total: 0, fresh: 0 }
          return (
            <li key={e.id}>
              <button onClick={() => onOpen(e.id)} className="w-full text-left bg-white rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{e.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {fmtWhen(e.starts_at)}
                      {e.location && ` · ${e.location}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-slate-900 tabular-nums leading-none">{c.total}</div>
                    <div className="text-[11px] text-slate-500">attended</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 text-[11px]">
                  {e.is_public && <span className="rounded-full bg-slate-700 text-white px-2 py-0.5">On homepage</span>}
                  {e.checkin_open && <span className="rounded-full bg-green-600 text-white px-2 py-0.5">Check-in open</span>}
                  {c.fresh > 0 && <span className="rounded-full bg-blue-600 text-white px-2 py-0.5">{c.fresh} new</span>}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EventDetail({
  event,
  attendance,
  members,
  campaignId,
  onBack,
  onEdit,
  onChanged,
  editor,
}: {
  event: ClubEvent
  attendance: Attendance[]
  members: MemberLite[]
  campaignId: string
  onBack: () => void
  onEdit: () => void
  onChanged: () => Promise<void>
  editor: ReactNode
}) {
  const { session } = useAuth()
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const link = checkinUrl(event.id)

  useEffect(() => {
    QRCode.toDataURL(link, { width: 600, margin: 2, errorCorrectionLevel: 'H', color: { dark: BRAND.navy, light: '#ffffff' } }).then(setQr)
  }, [link])

  // Refresh the attendee list every 10s while check-in is open, so the door count stays live.
  useEffect(() => {
    if (!event.checkin_open) return
    const t = setInterval(onChanged, 10000)
    return () => clearInterval(t)
  }, [event.checkin_open, onChanged])

  const byId = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const attendeeIds = new Set(attendance.map((a) => a.member_id))
  const sorted = [...attendance].sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))
  const fresh = attendance.filter((a) => a.was_new).length

  const q = search.trim().toLowerCase()
  const matches = q
    ? members
        .filter((m) => !attendeeIds.has(m.id))
        .filter((m) => `${m.first_name} ${m.last_name} ${m.email ?? ''}`.toLowerCase().includes(q))
        .slice(0, 6)
    : []

  const toggleCheckin = async () => {
    setBusy(true)
    await supabase.from('events').update({ checkin_open: !event.checkin_open }).eq('id', event.id)
    await onChanged()
    setBusy(false)
  }

  const addAttendee = async (memberId: string) => {
    setBusy(true)
    await supabase.from('event_attendance').insert({
      campaign_id: campaignId,
      event_id: event.id,
      member_id: memberId,
      source: 'officer',
      recorded_by: session?.user.id,
    })
    setSearch('')
    await onChanged()
    setBusy(false)
  }

  const removeAttendee = async (id: string) => {
    setBusy(true)
    await supabase.from('event_attendance').delete().eq('id', id)
    await onChanged()
    setBusy(false)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-3">
        ← All events
      </button>

      <div className="flex items-start gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{event.name}</h1>
          <div className="text-sm text-slate-500">
            {fmtWhen(event.starts_at)}
            {event.location && ` · ${event.location}`}
          </div>
          {event.description && <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{event.description}</p>}
        </div>
        <button onClick={onEdit} className="rounded-lg border border-slate-300 bg-white text-slate-700 text-sm px-3 py-1.5 hover:bg-slate-50">
          Edit
        </button>
      </div>

      {/* Check-in */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900">Door check-in</div>
            <div className="text-xs text-slate-500">
              {event.checkin_open
                ? 'Open: guests can check themselves in with the QR code or link.'
                : 'Closed: switch it on when the event starts, and off when it ends.'}
            </div>
          </div>
          <button
            onClick={toggleCheckin}
            disabled={busy}
            className={`rounded-lg text-sm font-medium px-4 py-2 disabled:opacity-50 ${
              event.checkin_open ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {event.checkin_open ? 'Close check-in' : 'Open check-in'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          {qr && <img src={qr} alt="Check-in QR code" className={`w-44 h-44 rounded border border-slate-200 ${event.checkin_open ? '' : 'opacity-40'}`} />}
          <div className="flex-1 min-w-0 w-full space-y-2">
            <code className="block text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 truncate">{link}</code>
            <div className="flex flex-wrap gap-2">
              <button onClick={copy} className="rounded-lg bg-blue-600 text-white text-sm px-3 py-1.5 hover:bg-blue-700">
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <a href={link} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 text-slate-700 text-sm px-3 py-1.5 hover:bg-slate-50">
                Open check-in screen
              </a>
              {qr && (
                <a
                  href={qr}
                  download={`checkin-${event.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`}
                  className="rounded-lg border border-slate-300 text-slate-700 text-sm px-3 py-1.5 hover:bg-slate-50"
                >
                  Download QR
                </a>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Tip: print the QR code for the table, or open the check-in screen on a tablet by the door. It resets
              itself after each guest.
            </p>
          </div>
        </div>
      </div>

      {/* Attendees */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-baseline gap-3 mb-3">
          <h2 className="text-sm font-semibold text-slate-900 flex-1">Attendees</h2>
          <span className="text-sm text-slate-600">
            <span className="font-bold text-slate-900">{attendance.length}</span> total
            {fresh > 0 && (
              <>
                {' · '}
                <span className="font-bold text-blue-700">{fresh}</span> first-timers
              </>
            )}
          </span>
        </div>

        <div className="relative mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Add someone from your member list…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
              {matches.map((m) => (
                <li key={m.id}>
                  <button onClick={() => addAttendee(m.id)} disabled={busy} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                    {m.first_name} {m.last_name} <span className="text-slate-400 text-xs">{m.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q && matches.length === 0 && (
            <p className="text-[11px] text-slate-400 mt-1">
              No match. New people can check in with the QR code, or add them on the Members page first.
            </p>
          )}
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Nobody checked in yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((a) => {
              const m = byId[a.member_id]
              return (
                <li key={a.id} className="py-2 flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-slate-900">
                    {m ? `${m.first_name} ${m.last_name}` : 'Member'}
                    {a.was_new && <span className="ml-2 text-[11px] rounded-full bg-blue-600 text-white px-2 py-0.5">New</span>}
                  </span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {new Date(a.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {a.source === 'officer' ? ' · added by officer' : ''}
                  </span>
                  <button onClick={() => removeAttendee(a.id)} disabled={busy} className="text-xs text-red-600 hover:underline" title="Remove from this event">
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {editor}
    </div>
  )
}

function EventEditor({
  event,
  campaignId,
  onClose,
  onSaved,
}: {
  event: ClubEvent | null
  campaignId: string
  onClose: () => void
  onSaved: (deleted: boolean, newId?: string) => void
}) {
  const { session, activeCampaign } = useAuth()
  const isAdmin = activeCampaign?.role === 'manager' || activeCampaign?.role === 'deputy'
  const [name, setName] = useState(event?.name ?? '')
  const [when, setWhen] = useState(event ? toLocalInput(event.starts_at) : '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [isPublic, setIsPublic] = useState(event?.is_public ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim() || !when) return setErr('Add a name and a date and time.')
    setBusy(true)
    const row = {
      name: name.trim(),
      starts_at: new Date(when).toISOString(),
      location: location.trim() || null,
      description: description.trim() || null,
      is_public: isPublic,
    }
    if (event) {
      const { error } = await supabase.from('events').update(row).eq('id', event.id)
      setBusy(false)
      if (error) return setErr(error.message)
      onSaved(false)
    } else {
      const { data, error } = await supabase
        .from('events')
        .insert({ ...row, campaign_id: campaignId, created_by: session?.user.id })
        .select('id')
        .single()
      setBusy(false)
      if (error) return setErr(error.message)
      onSaved(false, data?.id)
    }
  }

  const remove = async () => {
    if (!event || !window.confirm(`Delete "${event.name}" and its attendance list? This can't be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved(true)
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl shadow-xl p-5 space-y-3"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-slate-900">{event ? 'Edit event' : 'New event'}</h2>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="December Happy Hour" className={input} />
        </Field>
        <Field label="Date and time">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={input} />
        </Field>
        <Field label="Location (optional)">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Taproom, Lawrenceville" className={input} />
        </Field>
        <Field label="Notes (optional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={input} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          Show on the public homepage
        </label>
        <p className="text-[11px] text-slate-400 -mt-2">Members always see every event. Untick for board-only or private events.</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={save} disabled={busy} className="rounded-lg bg-blue-600 text-white text-sm px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
            {event ? 'Save' : 'Create event'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-300 text-slate-700 text-sm px-4 py-2 hover:bg-slate-50">
            Cancel
          </button>
          {event && isAdmin && (
            <button onClick={remove} disabled={busy} className="ml-auto text-xs text-red-600 hover:underline">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
