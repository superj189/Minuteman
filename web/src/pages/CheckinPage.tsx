import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { EMAIL_CONSENT, SMS_CONSENT, consentText } from '../lib/consent'

// Public event check-in. Works on each guest's phone (via the QR code) or on
// one tablet at the door: after each check-in it resets for the next person.

interface EventInfo {
  name: string
  starts_at: string
  location: string | null
  org_name: string
  checkin_open: boolean
}

type Result = 'new' | 'welcome_back' | 'already'

export default function CheckinPage() {
  const { eventId = '' } = useParams()
  const [event, setEvent] = useState<EventInfo | null>(null)
  const [missing, setMissing] = useState(false)

  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [emailOk, setEmailOk] = useState(true)
  const [smsOk, setSmsOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ kind: Result; name: string } | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.rpc('public_event', { p_event_id: eventId }).then(({ data, error }) => {
      const row = Array.isArray(data) ? (data[0] as EventInfo | undefined) : undefined
      setMissing(!!error || !row)
      setEvent(row ?? null)
    })
  }, [eventId])

  // After a check-in, clear the form for the next guest (tablet-at-the-door mode).
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => {
      setResult(null)
      setFirst('')
      setLast('')
      setEmail('')
      setPhone('')
      setEmailOk(true)
      setSmsOk(false)
      setTimeout(() => firstRef.current?.focus(), 50)
    }, 6000)
    return () => clearTimeout(t)
  }, [result])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const digits = phone.replace(/\D/g, '')
    if (smsOk && !digits) return setError('Add a phone number to get text updates.')
    setBusy(true)
    const { data, error } = await supabase.rpc('public_checkin', {
      p_event_id: eventId,
      p_first_name: first,
      p_last_name: last,
      p_email: email,
      p_phone: digits || null,
      p_email_opt_in: emailOk,
      p_sms_opt_in: smsOk,
      p_consent_text: consentText(emailOk, smsOk),
    })
    setBusy(false)
    if (error) setError(error.message)
    else setResult({ kind: data as Result, name: first.trim() })
  }

  const when = event
    ? new Date(event.starts_at).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <div className="min-h-full bg-slate-100">
      <div style={{ background: BRAND.navy }} className="text-white">
        <div className="max-w-xl mx-auto px-5 pt-8 pb-14 text-center">
          <img src="/gcyr-icon.svg" alt="" className="w-14 h-14 mx-auto mb-3 rounded-2xl ring-2 ring-white/20" />
          <div className="text-xs uppercase tracking-widest text-white/60">{event?.org_name ?? BRAND.name}</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{event?.name ?? 'Event check-in'}</h1>
          {event && (
            <p className="mt-1 text-white/80 text-sm">
              {when}
              {event.location && ` · ${event.location}`}
            </p>
          )}
          <div className="mx-auto mt-4 h-1.5 w-24 rounded-full" style={{ background: BRAND.red }} />
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 -mt-8 pb-12">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-8">
          {missing ? (
            <p className="text-center text-slate-600 py-6">We couldn't find this event.</p>
          ) : !event ? (
            <p className="text-center text-slate-400 py-6">Loading…</p>
          ) : !event.checkin_open ? (
            <p className="text-center text-slate-600 py-6">Check-in for this event isn't open right now.</p>
          ) : result ? (
            <div className="text-center py-8">
              <div
                className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center text-white text-3xl font-bold"
                style={{ background: BRAND.red }}
              >
                ✓
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                {result.kind === 'new' ? `Welcome, ${result.name}!` : `Welcome back, ${result.name}!`}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                {result.kind === 'new'
                  ? "You're checked in and on our list. Glad you came!"
                  : result.kind === 'already'
                    ? "You're already checked in. Enjoy the event!"
                    : "You're checked in. Great to see you again!"}
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Check in</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name">
                  <input ref={firstRef} required autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} className={input} />
                </Field>
                <Field label="Last name">
                  <input required autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} className={input} />
                </Field>
              </div>
              <Field label="Email">
                <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
              </Field>
              <Field label="Mobile phone (optional)">
                <input type="tel" inputMode="tel" autoComplete="tel" placeholder="(770) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
              </Field>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <Check checked={emailOk} onChange={setEmailOk}>
                  {EMAIL_CONSENT}
                </Check>
                <Check checked={smsOk} onChange={setSmsOk}>
                  {SMS_CONSENT}
                </Check>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg text-white text-base font-semibold py-3 disabled:opacity-50 hover:opacity-90"
                style={{ background: BRAND.red }}
              >
                {busy ? 'Checking you in…' : 'Check me in'}
              </button>
              <p className="text-[11px] text-slate-400 text-center">We never sell or share your information.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
      <span>{children}</span>
    </label>
  )
}
