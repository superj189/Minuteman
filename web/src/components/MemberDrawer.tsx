import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { STATUSES, SOURCE_LABELS, ageFrom, formatPhone, type ClubMember, type ConsentEvent, type MemberStatus } from '../lib/members'

interface Props {
  member: ClubMember | null // null = adding a new person
  onClose: () => void
  onSaved: () => void
}

// Side panel for viewing / editing one member, or adding someone by hand.
export default function MemberDrawer({ member, onClose, onSaved }: Props) {
  const { activeCampaign, session } = useAuth()
  const isAdmin = activeCampaign?.role === 'manager' || activeCampaign?.role === 'deputy'
  const isNew = !member

  const [first, setFirst] = useState(member?.first_name ?? '')
  const [last, setLast] = useState(member?.last_name ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [phone, setPhone] = useState(formatPhone(member?.phone ?? null))
  const [birth, setBirth] = useState(member?.birth_date ?? '')
  const [zip, setZip] = useState(member?.zip ?? '')
  const [status, setStatus] = useState<MemberStatus>(member?.status ?? 'new')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const [emailOk, setEmailOk] = useState(member?.email_opt_in ?? false)
  const [smsOk, setSmsOk] = useState(member?.sms_opt_in ?? false)
  const [history, setHistory] = useState<ConsentEvent[]>([])
  const [attended, setAttended] = useState<{ name: string; starts_at: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!member) return
    supabase
      .from('event_attendance')
      .select('id,events(name,starts_at)')
      .eq('member_id', member.id)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = ((data as any[]) ?? []).map((r) => (Array.isArray(r.events) ? r.events[0] : r.events)).filter(Boolean)
        rows.sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        setAttended(rows)
      })
    supabase
      .from('member_consent_events')
      .select('id,channel,granted,source,occurred_at')
      .eq('member_id', member.id)
      .order('occurred_at', { ascending: false })
      .then(({ data }) => setHistory((data as ConsentEvent[]) ?? []))
  }, [member])

  const save = async () => {
    setErr(null)
    const digits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
    if (!first.trim() || !last.trim()) return setErr('First and last name are required.')
    if (!email.trim() && !digits) return setErr('Add an email or a phone number.')
    if (digits && digits.length !== 10) return setErr('Phone number should be 10 digits.')
    if (smsOk && !digits) return setErr('Text updates need a phone number.')

    const row = {
      first_name: first.trim(),
      last_name: last.trim(),
      email: email.trim().toLowerCase() || null,
      phone: digits || null,
      birth_date: birth || null,
      zip: zip.trim() || null,
      status,
      notes: notes.trim() || null,
      email_opt_in: emailOk,
      sms_opt_in: smsOk,
    }
    // Opting someone IN by hand needs a record of how they agreed.
    const optingIn = (emailOk && !member?.email_opt_in) || (smsOk && !member?.sms_opt_in)
    const consent = optingIn
      ? { consent_text: 'Verbal or written consent recorded by an officer.', consent_at: new Date().toISOString() }
      : {}

    setBusy(true)
    const { error } = isNew
      ? await supabase.from('members').insert({
          ...row,
          ...consent,
          campaign_id: activeCampaign?.campaign_id,
          source: 'manual',
          created_by: session?.user.id,
        })
      : await supabase.from('members').update({ ...row, ...consent }).eq('id', member.id)
    setBusy(false)
    if (error) {
      setErr(error.code === '23505' ? 'Someone with that email is already on the list.' : error.message)
      return
    }
    onSaved()
  }

  const remove = async () => {
    if (!member || !window.confirm(`Delete ${member.first_name} ${member.last_name}? This can't be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from('members').delete().eq('id', member.id)
    setBusy(false)
    if (error) setErr(error.message)
    else onSaved()
  }

  const age = ageFrom(birth || null)

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2">
          <h2 className="font-semibold text-slate-900 flex-1 truncate">
            {isNew ? 'Add a member' : `${member.first_name} ${member.last_name}`}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!isNew && (
            <div className="text-xs text-slate-500 space-y-1">
              <div>
                Joined {new Date(member.created_at).toLocaleDateString()} · {SOURCE_LABELS[member.source]}
                {member.how_heard && ` · heard via ${member.how_heard}`}
              </div>
              <div className={member.user_id ? 'text-green-700' : 'text-slate-400'}>
                {member.user_id
                  ? '✓ Has a member login (manage it on People & access)'
                  : 'No member login: on the list only, cannot sign in'}
              </div>
              {member.interests.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {member.interests.map((i) => (
                    <span key={i} className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
                      {i}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input value={first} onChange={(e) => setFirst(e.target.value)} className={input} />
            </Field>
            <Field label="Last name">
              <input value={last} onChange={(e) => setLast(e.target.value)} className={input} />
            </Field>
          </div>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </Field>
          <Field label="Phone">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Date of birth${age != null ? ` (age ${age})` : ''}`}>
              <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className={input} />
            </Field>
            <Field label="ZIP">
              <input value={zip} maxLength={5} onChange={(e) => setZip(e.target.value)} className={input} />
            </Field>
          </div>

          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as MemberStatus)} className={input + ' bg-white'}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={input} />
          </Field>

          {!isNew && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-700 mb-1">Events attended ({attended.length})</div>
              {attended.length === 0 ? (
                <p className="text-[11px] text-slate-400">None yet.</p>
              ) : (
                <ul className="space-y-0.5 text-xs text-slate-600">
                  {attended.map((e, i) => (
                    <li key={i}>
                      {new Date(e.starts_at).toLocaleDateString()} · {e.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="text-xs font-semibold text-slate-700">Permission to contact</div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={emailOk} onChange={(e) => setEmailOk(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              OK to email
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={smsOk} onChange={(e) => setSmsOk(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              OK to text
            </label>
            <p className="text-[11px] text-slate-400">
              Only tick these if the person agreed. If someone asks to stop (or replies STOP), untick it. Every change is
              logged.
            </p>
            {history.length > 0 && (
              <ul className="border-t border-slate-100 pt-2 space-y-0.5 text-[11px] text-slate-500">
                {history.map((h) => (
                  <li key={h.id}>
                    {new Date(h.occurred_at).toLocaleDateString()} · {h.channel === 'sms' ? 'Text' : 'Email'}{' '}
                    <span className={h.granted ? 'text-green-700' : 'text-red-600'}>{h.granted ? 'opted in' : 'opted out'}</span>{' '}
                    ({h.source === 'officer_edit' ? 'officer' : h.source === 'signup_page' ? 'sign-up page' : h.source})
                  </li>
                ))}
              </ul>
            )}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy} className="rounded-lg bg-blue-600 text-white text-sm px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
              {isNew ? 'Add member' : 'Save changes'}
            </button>
            <button onClick={onClose} className="rounded-lg border border-slate-300 text-slate-700 text-sm px-4 py-2 hover:bg-slate-50">
              Cancel
            </button>
            {!isNew && isAdmin && (
              <button onClick={remove} disabled={busy} className="ml-auto text-xs text-red-600 hover:underline">
                Delete
              </button>
            )}
          </div>
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
