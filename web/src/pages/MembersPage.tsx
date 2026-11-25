import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { joinUrl } from '../lib/brand'
import { STATUSES, ageFrom, downloadCsv, formatPhone, statusInfo, type ClubMember, type MemberStatus } from '../lib/members'
import MemberDrawer from '../components/MemberDrawer'

const COLUMNS =
  'id,campaign_id,first_name,last_name,email,phone,birth_date,zip,interests,how_heard,email_opt_in,sms_opt_in,consent_text,consent_at,status,source,notes,created_at'

type Reach = 'all' | 'email' | 'sms'

export default function MembersPage() {
  const { activeCampaign } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const canSee = activeCampaign?.role !== 'viewer'

  const [members, setMembers] = useState<ClubMember[]>([])
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<MemberStatus | 'all'>('all')
  const [reach, setReach] = useState<Reach>('all')
  const [open, setOpen] = useState<ClubMember | null | 'new'>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!campaignId) return
    const { data, error } = await supabase
      .from('members')
      .select(COLUMNS)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) setError(error.message)
    else setMembers((data as ClubMember[]) ?? [])
    const { data: att } = await supabase.from('event_attendance').select('member_id').eq('campaign_id', campaignId)
    const counts: Record<string, number> = {}
    for (const a of (att as { member_id: string }[]) ?? []) counts[a.member_id] = (counts[a.member_id] ?? 0) + 1
    setEventCounts(counts)
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    return members.filter((m) => {
      if (status !== 'all' && m.status !== status) return false
      if (reach === 'email' && !(m.email_opt_in && m.email)) return false
      if (reach === 'sms' && !(m.sms_opt_in && m.phone)) return false
      if (!q) return true
      return (
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q) ||
        (qDigits.length >= 3 && (m.phone ?? '').includes(qDigits)) ||
        (m.zip ?? '').startsWith(q)
      )
    })
  }, [members, search, status, reach])

  const weekAgo = Date.now() - 7 * 86400000
  const stats = {
    total: members.length,
    newThisWeek: members.filter((m) => new Date(m.created_at).getTime() > weekAgo).length,
    active: members.filter((m) => m.status === 'active' || m.status === 'dues_paid').length,
    emailable: members.filter((m) => m.email_opt_in && m.email).length,
    textable: members.filter((m) => m.sms_opt_in && m.phone).length,
  }

  const link = joinUrl(activeCampaign?.campaigns.slug)
  const copyLink = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!canSee) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center text-slate-600">
        <h1 className="text-lg font-semibold text-slate-900 mb-2">Officers only</h1>
        <p className="text-sm">The member list is only visible to officers.</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-xl font-bold text-slate-900 flex-1">Members</h1>
        <button
          onClick={() => downloadCsv(`gcyr-members-${new Date().toISOString().slice(0, 10)}.csv`, filtered)}
          disabled={filtered.length === 0}
          className="rounded-lg border border-slate-300 bg-white text-slate-700 text-sm px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
        >
          Download list
        </button>
        <button onClick={() => setOpen('new')} className="rounded-lg bg-blue-600 text-white text-sm px-3 py-2 hover:bg-blue-700">
          + Add member
        </button>
      </div>

      {/* Share link */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">Your sign-up link</div>
          <div className="text-xs text-slate-500">
            Share it on social media, in texts, or on a flyer. Anyone who fills it out shows up here.
          </div>
        </div>
        <code className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 truncate">{link}</code>
        <div className="flex gap-2">
          <button onClick={copyLink} className="rounded-lg bg-blue-600 text-white text-sm px-3 py-1.5 hover:bg-blue-700">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <a href={link} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 text-slate-700 text-sm px-3 py-1.5 hover:bg-slate-50">
            Open
          </a>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <Stat label="Total" value={stats.total} />
        <Stat label="New this week" value={stats.newThisWeek} />
        <Stat label="Active or paid" value={stats.active} />
        <Stat label="OK to email" value={stats.emailable} onClick={() => setReach('email')} />
        <Stat label="OK to text" value={stats.textable} onClick={() => setReach('sms')} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone or ZIP"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as MemberStatus | 'all')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="all">Any status</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={reach} onChange={(e) => setReach(e.target.value as Reach)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="all">Everyone</option>
          <option value="email">OK to email</option>
          <option value="sms">OK to text</option>
        </select>
      </div>

      {error && <div className="mb-3 text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}

      {loading ? (
        <div className="text-center text-slate-400 py-10">Loading…</div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
          <div className="font-medium text-slate-700 mb-1">No members yet</div>
          <div className="text-sm">Share your sign-up link above, or add someone by hand.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-400 py-10 text-sm">Nobody matches these filters.</div>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="sm:hidden space-y-2">
            {filtered.map((m) => (
              <li key={m.id}>
                <button onClick={() => setOpen(m)} className="w-full text-left bg-white rounded-lg border border-slate-200 p-3 active:bg-blue-50">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 flex-1 truncate">
                      {m.first_name} {m.last_name}
                    </span>
                    <StatusPill status={m.status} />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {[m.email, formatPhone(m.phone)].filter(Boolean).join(' · ')}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex gap-2">
                    {ageFrom(m.birth_date) != null && <span>Age {ageFrom(m.birth_date)}</span>}
                    {m.zip && <span>{m.zip}</span>}
                    {(eventCounts[m.id] ?? 0) > 0 && <span>{eventCounts[m.id]} events</span>}
                    <OptIns m={m} />
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden sm:block bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Age</th>
                  <th className="px-3 py-2 font-medium">ZIP</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Can contact</th>
                  <th className="px-3 py-2 font-medium">Events</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => (
                  <tr key={m.id} onClick={() => setOpen(m)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {m.first_name} {m.last_name}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{m.email}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatPhone(m.phone)}</td>
                    <td className="px-3 py-2 text-slate-600">{ageFrom(m.birth_date) ?? ''}</td>
                    <td className="px-3 py-2 text-slate-600">{m.zip}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={m.status} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <OptIns m={m} />
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{eventCounts[m.id] ?? 0}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(m.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Showing {filtered.length} of {members.length}
          </div>
        </>
      )}

      {open && (
        <MemberDrawer
          key={open === 'new' ? 'new' : open.id}
          member={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="bg-white rounded-lg border border-slate-200 p-3 text-left enabled:hover:bg-slate-50 disabled:cursor-default"
    >
      <div className="text-xl font-bold text-slate-900 tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </button>
  )
}

function StatusPill({ status }: { status: MemberStatus }) {
  const s = statusInfo(status)
  return (
    <span className="inline-block text-[11px] font-medium rounded-full px-2 py-0.5 text-white whitespace-nowrap" style={{ background: s.color }}>
      {s.label}
    </span>
  )
}

function OptIns({ m }: { m: ClubMember }) {
  return (
    <span className="inline-flex gap-1.5">
      {m.email_opt_in && m.email && <span className="text-green-700">Email</span>}
      {m.sms_opt_in && m.phone && <span className="text-green-700">Text</span>}
      {!(m.email_opt_in && m.email) && !(m.sms_opt_in && m.phone) && <span className="text-slate-400">None</span>}
    </span>
  )
}
