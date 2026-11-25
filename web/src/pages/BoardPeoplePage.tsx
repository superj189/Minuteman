import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { FEATURES, ROLE_LABELS, isBoardRole, type Feature } from '../lib/access'
import type { MemberRole } from '../lib/types'
import NoAccess from '../components/NoAccess'

interface Person {
  user_id: string
  role: MemberRole
  full_name: string | null
  email: string | null
}
interface Request {
  id: string
  full_name: string
  email: string
  created_at: string
}
interface Grant {
  id: string
  user_id: string
  feature: Feature
}
interface Invite {
  id: string
  email: string
  role: MemberRole
}

// Board tool: approve new accounts, decide who sees which pages, and (chairman
// only) who is on the board. The database enforces all of these rules too.
export default function BoardPeoplePage() {
  const { activeCampaign, isBoard, isChairman, session, refresh } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const myId = session?.user.id

  const [people, setPeople] = useState<Person[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [onList, setOnList] = useState<Set<string>>(new Set())
  const [grants, setGrants] = useState<Grant[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('member')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    const [cm, rq, gr, inv, mem] = await Promise.all([
      supabase.from('campaign_members').select('user_id,role,profiles(full_name,email)').eq('campaign_id', campaignId),
      supabase.from('membership_requests').select('id,full_name,email,created_at').eq('campaign_id', campaignId).eq('status', 'pending').order('created_at'),
      supabase.from('access_grants').select('id,user_id,feature').eq('campaign_id', campaignId),
      supabase.from('invitations').select('id,email,role').eq('campaign_id', campaignId).is('accepted_at', null),
      supabase.from('members').select('email').eq('campaign_id', campaignId).not('email', 'is', null).limit(10000),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((cm.data as any[]) ?? []).map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return { user_id: r.user_id, role: r.role, full_name: p?.full_name ?? null, email: p?.email ?? null }
    })
    const rank = (r: MemberRole) => (r === 'manager' ? 0 : r === 'deputy' ? 1 : 2)
    list.sort((a, b) => rank(a.role) - rank(b.role) || (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? ''))
    setPeople(list)
    setRequests((rq.data as Request[]) ?? [])
    setGrants((gr.data as Grant[]) ?? [])
    setInvites((inv.data as Invite[]) ?? [])
    setOnList(new Set(((mem.data as { email: string }[]) ?? []).map((m) => m.email.toLowerCase())))
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? people.filter((p) => `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q)) : people
  }, [people, search])

  if (!isBoard) return <NoAccess what="board tools" />

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => {
    setBusy(true)
    setMsg(null)
    setErr(null)
    const { error } = await fn()
    if (error) setErr(error.message)
    else if (ok) setMsg(ok)
    await load()
    setBusy(false)
  }

  const approve = (r: Request) => run(() => supabase.rpc('approve_membership', { p_request_id: r.id }), `${r.full_name} is now a member.`)
  const deny = (r: Request) => {
    if (!window.confirm(`Deny ${r.full_name}'s request?`)) return
    run(() => supabase.rpc('deny_membership', { p_request_id: r.id }))
  }

  const setRole = async (p: Person, role: MemberRole) => {
    await run(() => supabase.from('campaign_members').update({ role }).eq('campaign_id', campaignId).eq('user_id', p.user_id))
    if (p.user_id === myId) refresh()
  }
  const removePerson = (p: Person) => {
    if (!window.confirm(`Remove ${p.full_name || p.email}'s login access? Their member record stays on the list.`)) return
    run(async () => {
      await supabase.from('access_grants').delete().eq('campaign_id', campaignId).eq('user_id', p.user_id)
      return supabase.from('campaign_members').delete().eq('campaign_id', campaignId).eq('user_id', p.user_id)
    })
  }

  const toggleGrant = (p: Person, f: Feature, on: boolean) =>
    run(() =>
      on
        ? supabase.from('access_grants').insert({ campaign_id: campaignId, user_id: p.user_id, feature: f, granted_by: myId })
        : supabase.from('access_grants').delete().eq('campaign_id', campaignId).eq('user_id', p.user_id).eq('feature', f),
    )

  const invite = () => {
    const email = inviteEmail.trim()
    if (!email) return
    run(async () => {
      const res = await supabase.rpc('invite_member', { p_campaign_id: campaignId, p_email: email, p_role: inviteRole })
      if (!res.error) {
        setInviteEmail('')
        setMsg(
          res.data === 'added'
            ? `${email} already had an account and now has access.`
            : `Invite saved. When ${email} creates an account at ${window.location.host}, they'll get in right away (no approval needed).`,
        )
      }
      return res
    })
  }

  const roleChoices: MemberRole[] = isChairman ? ['member', 'deputy', 'manager'] : ['member']

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900">People &amp; access</h1>
      <p className="text-sm text-slate-500 mb-4">
        Approve new member accounts and choose which extra pages each member can use. Board members can use everything.
        {isChairman ? ' As chairman, you also decide who is on the board.' : ' Only the chairman can change the board.'}
      </p>

      {msg && <div className="mb-3 text-sm text-green-700 bg-green-50 rounded p-2">{msg}</div>}
      {err && <div className="mb-3 text-sm text-red-600 bg-red-50 rounded p-2">{err}</div>}

      {/* Pending requests */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">
          Waiting for approval {requests.length > 0 && <span className="ml-1 rounded-full bg-amber-500 text-white text-xs px-2 py-0.5">{requests.length}</span>}
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-400">Nobody is waiting.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium text-slate-900">{r.full_name}</div>
                  <div className="text-xs text-slate-500">
                    {r.email} · asked {new Date(r.created_at).toLocaleDateString()}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${onList.has(r.email.toLowerCase()) ? 'text-green-700' : 'text-amber-700'}`}>
                    {onList.has(r.email.toLowerCase()) ? '✓ Already on your member list' : 'Not on your member list yet (a record will be created)'}
                  </div>
                </div>
                <button onClick={() => approve(r)} disabled={busy} className="rounded-lg bg-green-600 text-white text-sm px-3 py-1.5 hover:bg-green-700 disabled:opacity-50">
                  Approve
                </button>
                <button onClick={() => deny(r)} disabled={busy} className="rounded-lg border border-slate-300 text-slate-700 text-sm px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
                  Deny
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Invite */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Invite someone</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as MemberRole)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            {roleChoices.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button onClick={invite} disabled={busy} className="rounded-lg bg-blue-600 text-white text-sm px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
            Invite
          </button>
        </div>
        {invites.length > 0 && (
          <ul className="mt-3 border-t border-slate-100 pt-2 space-y-1 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center">
                <span className="flex-1 text-slate-700">
                  {i.email} <span className="text-xs text-slate-400">· {ROLE_LABELS[i.role]} · waiting for them to sign up</span>
                </span>
                <button onClick={() => run(() => supabase.from('invitations').delete().eq('id', i.id))} className="text-xs text-red-600 hover:underline">
                  cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Everyone with a login */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-900 flex-1">People with a login ({people.length})</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-40 sm:w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
          />
        </div>
        <ul className="space-y-2">
          {filtered.map((p) => {
            const board = isBoardRole(p.role)
            const canEditRole = isChairman ? p.user_id !== myId || people.filter((x) => x.role === 'manager').length > 1 : false
            const canRemove = p.user_id !== myId && (isChairman || !board)
            const mine = new Set(grants.filter((g) => g.user_id === p.user_id).map((g) => g.feature))
            return (
              <li key={p.user_id} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[160px]">
                    <div className="font-medium text-slate-900">
                      {p.full_name || p.email} {p.user_id === myId && <span className="text-xs text-slate-400">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-500">{p.email}</div>
                  </div>
                  {canEditRole ? (
                    <select
                      value={p.role}
                      onChange={(e) => setRole(p, e.target.value as MemberRole)}
                      disabled={busy}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white"
                    >
                      {(['member', 'deputy', 'manager'] as MemberRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs rounded-full px-2 py-0.5 ${board ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {ROLE_LABELS[p.role]}
                    </span>
                  )}
                  {canRemove && (
                    <button onClick={() => removePerson(p)} disabled={busy} className="text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
                {board ? (
                  <p className="text-xs text-slate-400 mt-2">Board members can use every page.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {FEATURES.map((f) => {
                      const on = mine.has(f.key)
                      return (
                        <button
                          key={f.key}
                          onClick={() => toggleGrant(p, f.key, !on)}
                          disabled={busy}
                          title={f.blurb}
                          aria-pressed={on}
                          className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                            on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {on ? '✓ ' : '+ '}
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
