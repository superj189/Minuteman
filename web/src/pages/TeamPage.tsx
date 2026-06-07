import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { MemberRole, TeamMember } from '../lib/types'

interface TurfRow {
  id: string
  name: string
  color: string
}
interface AssignmentRow {
  id: string
  turf_id: string
  assigned_to: string
}
interface InviteRow {
  id: string
  email: string
  role: MemberRole
  accepted_at: string | null
}

const ROLES: MemberRole[] = ['manager', 'deputy', 'volunteer', 'viewer']

function memberName(m: TeamMember | undefined): string {
  if (!m) return 'Unknown'
  return m.full_name || m.email || 'User'
}

export default function TeamPage() {
  const { activeCampaign, session } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const myUserId = session?.user.id
  const isAdmin = activeCampaign?.role === 'manager' || activeCampaign?.role === 'deputy'

  const [members, setMembers] = useState<TeamMember[]>([])
  const [turfs, setTurfs] = useState<TurfRow[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('volunteer')

  const loadMembers = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase
      .from('campaign_members')
      .select('user_id,role,profiles(full_name,email)')
      .eq('campaign_id', campaignId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((data as any[]) ?? []).map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return { user_id: r.user_id, role: r.role, full_name: p?.full_name ?? null, email: p?.email ?? null }
    })
    setMembers(list as TeamMember[])
  }, [campaignId])

  const loadTurfs = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase.from('turfs').select('id,name,color').eq('campaign_id', campaignId)
    setTurfs((data as unknown as TurfRow[]) ?? [])
  }, [campaignId])

  const loadAssignments = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase
      .from('turf_assignments')
      .select('id,turf_id,assigned_to')
      .eq('campaign_id', campaignId)
    setAssignments((data as unknown as AssignmentRow[]) ?? [])
  }, [campaignId])

  const loadInvites = useCallback(async () => {
    if (!campaignId) return
    const { data } = await supabase
      .from('invitations')
      .select('id,email,role,accepted_at')
      .eq('campaign_id', campaignId)
      .is('accepted_at', null)
    setInvites((data as unknown as InviteRow[]) ?? [])
  }, [campaignId])

  useEffect(() => {
    loadMembers()
    loadTurfs()
    loadAssignments()
    loadInvites()
  }, [loadMembers, loadTurfs, loadAssignments, loadInvites])

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center text-slate-600">
        <h1 className="text-lg font-semibold text-slate-900 mb-2">Managers only</h1>
        <p className="text-sm">Team management is available to campaign managers and deputies.</p>
      </div>
    )
  }

  const invite = async () => {
    if (!inviteEmail.trim()) return
    setBusy(true)
    setMsg(null)
    setErr(null)
    const { data, error } = await supabase.rpc('invite_member', {
      p_campaign_id: campaignId,
      p_email: inviteEmail.trim(),
      p_role: inviteRole,
    })
    if (error) setErr(error.message)
    else {
      setMsg(
        data === 'added'
          ? `${inviteEmail.trim()} was added to the campaign.`
          : `Invite created. ${inviteEmail.trim()} will join automatically when they sign up with that email at minuteman.vote.`,
      )
      setInviteEmail('')
      await Promise.all([loadMembers(), loadInvites()])
    }
    setBusy(false)
  }

  const changeRole = async (uid: string, role: MemberRole) => {
    setBusy(true)
    await supabase.from('campaign_members').update({ role }).eq('campaign_id', campaignId).eq('user_id', uid)
    await loadMembers()
    setBusy(false)
  }

  const removeMember = async (uid: string) => {
    if (!window.confirm('Remove this person from the campaign?')) return
    setBusy(true)
    await supabase.from('campaign_members').delete().eq('campaign_id', campaignId).eq('user_id', uid)
    await Promise.all([loadMembers(), loadAssignments()])
    setBusy(false)
  }

  // One owner per zone: reassigning replaces any existing owner.
  const assignZone = async (turfId: string, uid: string) => {
    setBusy(true)
    await supabase.from('turf_assignments').delete().eq('turf_id', turfId)
    await supabase
      .from('turf_assignments')
      .insert({ campaign_id: campaignId, turf_id: turfId, assigned_to: uid, assigned_by: myUserId, status: 'assigned' })
    await loadAssignments()
    setBusy(false)
  }

  const unassignZone = async (turfId: string) => {
    setBusy(true)
    await supabase.from('turf_assignments').delete().eq('turf_id', turfId)
    await loadAssignments()
    setBusy(false)
  }

  const cancelInvite = async (id: string) => {
    setBusy(true)
    await supabase.from('invitations').delete().eq('id', id)
    await loadInvites()
    setBusy(false)
  }

  const ownerOf = (turfId: string) => {
    const a = assignments.find((x) => x.turf_id === turfId)
    return a ? members.find((m) => m.user_id === a.assigned_to) : undefined
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-4">Team</h1>

      {msg && <div className="mb-3 text-sm text-green-700 bg-green-50 rounded p-2">{msg}</div>}
      {err && <div className="mb-3 text-sm text-red-600 bg-red-50 rounded p-2">{err}</div>}

      {/* Invite */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Invite someone</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as MemberRole)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white capitalize"
          >
            {ROLES.map((r) => (
              <option key={r} value={r} className="capitalize">
                {r}
              </option>
            ))}
          </select>
          <button onClick={invite} disabled={busy} className="rounded-lg bg-blue-600 text-white text-sm px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
            Invite
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          If they already have an account they're added now. Otherwise they join automatically when they sign up
          with that email.
        </p>

        {invites.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <div className="text-xs font-medium text-slate-500 mb-1">Pending invites</div>
            <ul className="space-y-1 text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between">
                  <span className="text-slate-700">
                    {i.email} <span className="text-slate-400 text-xs capitalize">· {i.role}</span>
                  </span>
                  <button onClick={() => cancelInvite(i.id)} className="text-xs text-red-600 hover:underline">
                    cancel
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="space-y-3">
        {members.map((m) => {
          const myZones = assignments.filter((a) => a.assigned_to === m.user_id)
          const isSelf = m.user_id === myUserId
          return (
            <div key={m.user_id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <div className="font-medium text-slate-900">
                    {memberName(m)} {isSelf && <span className="text-xs text-slate-400">(you)</span>}
                  </div>
                  <div className="text-xs text-slate-500">{m.email}</div>
                </div>
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.user_id, e.target.value as MemberRole)}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white capitalize"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="capitalize">
                      {r}
                    </option>
                  ))}
                </select>
                {!isSelf && (
                  <button onClick={() => removeMember(m.user_id)} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                )}
              </div>

              {/* Zones for this member */}
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-500 mb-1">Zones ({myZones.length})</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {myZones.map((a) => {
                    const t = turfs.find((x) => x.id === a.turf_id)
                    if (!t) return null
                    return (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 text-white"
                        style={{ background: t.color }}
                      >
                        {t.name}
                        <button onClick={() => unassignZone(t.id)} title="Unassign" className="hover:opacity-75">
                          ×
                        </button>
                      </span>
                    )
                  })}
                  {myZones.length === 0 && <span className="text-xs text-slate-400">No zones assigned.</span>}
                </div>
                <select
                  value=""
                  onChange={(e) => e.target.value && assignZone(e.target.value, m.user_id)}
                  disabled={busy || turfs.length === 0}
                  className="w-full sm:w-auto rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white"
                >
                  <option value="">+ Assign a zone…</option>
                  {turfs.map((t) => {
                    const owner = ownerOf(t.id)
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {owner ? ` (currently: ${memberName(owner)})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
