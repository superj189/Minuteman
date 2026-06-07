import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { tierMeta } from '../lib/tiers'
import type {
  Voter,
  ContactLogRow,
  ContactInfoRow,
  ConsentStateRow,
  NoteRow,
} from '../lib/types'
import {
  CONTACT_OUTCOMES,
  CONTACT_CHANNELS,
  CONTACT_SOURCES,
  SUPPORT_SCORES,
  CONSENT_TYPES,
  labelFor,
} from '../lib/options'

export default function VoterDetail({ voter, onClose }: { voter: Voter; onClose: () => void }) {
  const { session, activeCampaign } = useAuth()
  const userId = session?.user.id
  const campaignId = activeCampaign?.campaign_id

  const [logs, setLogs] = useState<ContactLogRow[]>([])
  const [contacts, setContacts] = useState<ContactInfoRow[]>([])
  const [consent, setConsent] = useState<Record<string, ConsentStateRow>>({})
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [byName, setByName] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [l, c, cons, n] = await Promise.all([
      supabase
        .from('contact_logs')
        .select('id,outcome,support_score,channel,occurred_at,contacted_by')
        .eq('voter_id', voter.id)
        .order('occurred_at', { ascending: false }),
      supabase
        .from('contact_info')
        .select('id,kind,value,source,created_at')
        .eq('voter_id', voter.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('current_consent')
        .select('id,consent_type,granted,occurred_at')
        .eq('voter_id', voter.id),
      supabase
        .from('notes')
        .select('id,body,created_at')
        .eq('voter_id', voter.id)
        .order('created_at', { ascending: false }),
    ])
    setLogs((l.data as unknown as ContactLogRow[]) ?? [])
    setContacts((c.data as unknown as ContactInfoRow[]) ?? [])
    const consMap: Record<string, ConsentStateRow> = {}
    for (const row of (cons.data as unknown as ConsentStateRow[]) ?? []) {
      consMap[row.consent_type] = row
    }
    setConsent(consMap)
    setNotes((n.data as unknown as NoteRow[]) ?? [])
  }, [voter.id])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Map of user_id -> display name, to show who logged each contact.
  useEffect(() => {
    if (!campaignId) return
    supabase
      .from('campaign_members')
      .select('user_id,profiles(full_name,email)')
      .eq('campaign_id', campaignId)
      .then(({ data }) => {
        const m: Record<string, string> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (data as any[]) ?? []) {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
          m[r.user_id] = p?.full_name || p?.email || 'User'
        }
        setByName(m)
      })
  }, [campaignId])

  // ── Form state ──
  const [outcome, setOutcome] = useState('talked')
  const [channel, setChannel] = useState('door')
  const [score, setScore] = useState<number | null>(null)

  const [ciKind, setCiKind] = useState<'phone' | 'email'>('phone')
  const [ciValue, setCiValue] = useState('')
  const [ciSource, setCiSource] = useState('door')

  const [noteText, setNoteText] = useState('')

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!campaignId || !userId) return
    setSaving(true)
    setErr(null)
    const { error } = await fn()
    if (error) setErr(error.message)
    else await loadAll()
    setSaving(false)
  }

  const saveLog = () =>
    run(() =>
      supabase.from('contact_logs').insert({
        campaign_id: campaignId,
        voter_id: voter.id,
        contacted_by: userId,
        channel,
        outcome,
        support_score: score,
      }),
    ).then(() => setScore(null))

  const saveContactInfo = () => {
    if (!ciValue.trim()) return
    run(() =>
      supabase.from('contact_info').insert({
        campaign_id: campaignId,
        voter_id: voter.id,
        kind: ciKind,
        value: ciValue.trim(),
        source: ciSource,
        created_by: userId,
      }),
    ).then(() => setCiValue(''))
  }

  const toggleConsent = (type: string, currentlyGranted: boolean) =>
    run(() =>
      supabase.from('consent_records').insert({
        campaign_id: campaignId,
        voter_id: voter.id,
        consent_type: type,
        granted: !currentlyGranted,
        method: 'in_person',
        attested_by: userId,
      }),
    )

  // Strike the most recent consent entry for a type as "entered by mistake".
  // Unlike a revoke, this removes it from the record entirely (but is itself logged).
  const voidConsent = (state: ConsentStateRow) => {
    if (
      !window.confirm(
        'Mark the last consent change as entered by mistake?\n\n' +
          'It will be struck from the voter\'s record (history is still kept for auditing). ' +
          'Use this only for accidental clicks — not when a voter changes their mind.',
      )
    )
      return
    run(() =>
      supabase
        .from('consent_records')
        .update({ voided_at: new Date().toISOString(), voided_by: userId, void_reason: 'entered in error' })
        .eq('id', state.id),
    )
  }

  const saveNote = () => {
    if (!noteText.trim()) return
    run(() =>
      supabase.from('notes').insert({
        campaign_id: campaignId,
        voter_id: voter.id,
        author_id: userId,
        body: noteText.trim(),
      }),
    ).then(() => setNoteText(''))
  }

  // Delete a contact log / phone-email / note. (Consent is append-only by design —
  // it can't be deleted; toggle the permission off to record a revocation instead.)
  const remove = (table: 'contact_logs' | 'contact_info' | 'notes', id: string) => {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return
    run(() => supabase.from(table).delete().eq('id', id))
  }

  const tm = tierMeta(voter.tier)

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-slate-50 h-full overflow-y-auto shadow-2xl">
        {/* Header */}
        <div
          className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-start justify-between"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        >
          <div>
            <div className="font-semibold text-slate-900">
              {(voter.first_name ?? '').trim()} {(voter.last_name ?? '').trim()}
            </div>
            <div className="text-xs text-slate-500">{voter.full_address}</div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          {err && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{err}</div>}

          {/* Facts */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="rounded-full px-2 py-0.5 font-medium text-white"
              style={{ background: tm.color }}
            >
              {tm.short} {tm.label}
            </span>
            {voter.age != null && <Fact>{voter.age} yrs</Fact>}
            {voter.race && <Fact>{voter.race}</Fact>}
            {voter.gender && <Fact>{voter.gender}</Fact>}
            {voter.status && <Fact>{voter.status}</Fact>}
          </div>

          {/* Log a contact */}
          <Section title="Log a contact">
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Outcome">
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={inputCls}>
                  {CONTACT_OUTCOMES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="How">
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
                  {CONTACT_CHANNELS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Labeled>
            </div>
            <Labeled label="Support level">
              <div className="flex gap-1">
                {SUPPORT_SCORES.map(([v, l]) => (
                  <button
                    key={v}
                    title={l}
                    onClick={() => setScore(score === v ? null : v)}
                    className={`flex-1 rounded py-1 text-xs border ${
                      score === v
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">1 = strong opponent · 5 = strong supporter</div>
            </Labeled>
            <button onClick={saveLog} disabled={saving} className={btnPrimary}>
              Save contact
            </button>

            {logs.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {logs.map((log) => (
                  <li key={log.id} className="flex justify-between items-center border-t border-slate-100 pt-1">
                    <span>
                      {labelFor(CONTACT_OUTCOMES, log.outcome)}
                      {log.support_score != null && ` · support ${log.support_score}`}
                      {` · ${labelFor(CONTACT_CHANNELS, log.channel)}`}
                      {log.contacted_by && byName[log.contacted_by] && (
                        <span className="text-slate-400"> · {byName[log.contacted_by]}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-400">{fmtDate(log.occurred_at)}</span>
                      <DeleteBtn onClick={() => remove('contact_logs', log.id)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Consent */}
          <Section title="Consent">
            <div className="space-y-1.5">
              {CONSENT_TYPES.map(([type, label]) => {
                const state = consent[type]
                const granted = state?.granted ?? false
                return (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{label}</span>
                    <div className="flex items-center gap-2">
                      {state && (
                        <button
                          onClick={() => voidConsent(state)}
                          disabled={saving}
                          title="Strike the last change as a mistake"
                          className="text-[11px] text-slate-400 hover:text-red-600 underline"
                        >
                          mistake?
                        </button>
                      )}
                      <button
                        onClick={() => toggleConsent(type, granted)}
                        disabled={saving}
                        className={`text-xs rounded-full px-3 py-1 border ${
                          granted
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {granted ? '✓ Granted' : 'Not granted'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="text-[11px] text-slate-400 mt-1.5 leading-tight">
              Tap the button to grant or revoke (voter changed their mind — kept in history).
              Use <span className="text-slate-500">mistake?</span> only to strike an accidental click.
            </div>
          </Section>

          {/* Phone / email */}
          <Section title="Phone & email">
            <div className="flex gap-2">
              <select
                value={ciKind}
                onChange={(e) => setCiKind(e.target.value as 'phone' | 'email')}
                className={inputCls + ' w-24'}
              >
                <option value="phone">Phone</option>
                <option value="email">Email</option>
              </select>
              <input
                value={ciValue}
                onChange={(e) => setCiValue(e.target.value)}
                placeholder={ciKind === 'phone' ? '404-555-1234' : 'name@example.com'}
                className={inputCls + ' flex-1'}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <select value={ciSource} onChange={(e) => setCiSource(e.target.value)} className={inputCls + ' flex-1'}>
                {CONTACT_SOURCES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button onClick={saveContactInfo} disabled={saving} className={btnPrimary + ' w-24'}>
                Add
              </button>
            </div>
            {contacts.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {contacts.map((ci) => (
                  <li key={ci.id} className="flex justify-between items-center border-t border-slate-100 pt-1">
                    <span>
                      {ci.kind === 'phone' ? '📞' : '✉️'} {ci.value}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-400">{labelFor(CONTACT_SOURCES, ci.source)}</span>
                      <DeleteBtn onClick={() => remove('contact_info', ci.id)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Anything worth remembering…"
              rows={2}
              className={inputCls + ' w-full resize-none'}
            />
            <button onClick={saveNote} disabled={saving} className={btnPrimary + ' mt-2'}>
              Add note
            </button>
            {notes.length > 0 && (
              <ul className="mt-3 space-y-2 text-xs text-slate-600">
                {notes.map((n) => (
                  <li key={n.id} className="border-t border-slate-100 pt-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-slate-700 flex-1">{n.body}</div>
                      <DeleteBtn onClick={() => remove('notes', n.id)} />
                    </div>
                    <div className="text-slate-400">{fmtDate(n.created_at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

// ── small presentational helpers ──
const inputCls =
  'rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
const btnPrimary =
  'rounded-lg bg-blue-600 text-white text-sm px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2.5">{title}</h3>
      {children}
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Fact({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-slate-100 text-slate-600 px-2 py-0.5">{children}</span>
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Delete"
      className="text-slate-300 hover:text-red-600 leading-none"
      aria-label="Delete entry"
    >
      🗑
    </button>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
