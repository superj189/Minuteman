import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { BRAND } from '../lib/brand'
import { FEATURES } from '../lib/access'

interface Announcement {
  id: string
  title: string
  body: string
  pinned: boolean
  created_at: string
}

interface UpcomingEvent {
  id: string
  name: string
  starts_at: string
  location: string | null
}

export default function MemberHomePage() {
  const { activeCampaign, isBoard, access, session } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const [posts, setPosts] = useState<Announcement[]>([])
  const [events, setEvents] = useState<UpcomingEvent[]>([])
  const [pending, setPending] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    const [a, e, p] = await Promise.all([
      supabase.from('announcements').select('id,title,body,pinned,created_at').eq('campaign_id', campaignId)
        .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20),
      supabase.from('events').select('id,name,starts_at,location').eq('campaign_id', campaignId)
        .gte('starts_at', new Date(Date.now() - 3 * 3600000).toISOString()).order('starts_at').limit(5),
      isBoard
        ? supabase.from('membership_requests').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
    ])
    setPosts((a.data as Announcement[]) ?? [])
    setEvents((e.data as UpcomingEvent[]) ?? [])
    setPending(p.count ?? 0)
  }, [campaignId, isBoard])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!campaignId) return
    supabase.rpc('my_profile', { p_campaign_id: campaignId }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : null
      if (row?.first_name) setFirstName(row.first_name)
      else setFirstName((session?.user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? '')
    })
  }, [campaignId, session])

  const granted = FEATURES.filter((f) => access.includes(f.key) && !(isBoard && f.key === 'event_checkin'))

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="rounded-xl p-5 sm:p-6 text-white mb-5" style={{ background: BRAND.navy }}>
        <div className="text-xs uppercase tracking-widest text-white/60">{BRAND.name}</div>
        <h1 className="text-2xl font-bold mt-1">Welcome{firstName ? `, ${firstName}` : ''}!</h1>
        <div className="mt-3 h-1 w-16 rounded-full" style={{ background: BRAND.red }} />
      </div>

      {isBoard && pending > 0 && (
        <Link to="/app/people" className="block mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 hover:bg-amber-100">
          <span className="font-semibold">{pending}</span> {pending === 1 ? 'person is' : 'people are'} waiting for member
          approval →
        </Link>
      )}

      <div className="grid lg:grid-cols-[2fr_1fr] gap-5">
        {/* Announcements */}
        <section>
          <div className="flex items-center mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex-1">Announcements</h2>
            {isBoard && (
              <button onClick={() => setEditing('new')} className="rounded-lg bg-blue-600 text-white text-xs px-3 py-1.5 hover:bg-blue-700">
                + Post
              </button>
            )}
          </div>
          {posts.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">No announcements yet.</div>
          ) : (
            <ul className="space-y-3">
              {posts.map((p) => (
                <li key={p.id} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">
                        {p.pinned && <span className="mr-1.5 text-[11px] rounded-full bg-blue-600 text-white px-2 py-0.5 align-middle">Pinned</span>}
                        {p.title}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{new Date(p.created_at).toLocaleDateString()}</div>
                    </div>
                    {isBoard && (
                      <button onClick={() => setEditing(p)} className="text-xs text-blue-600 hover:underline">
                        Edit
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">{p.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          {/* Upcoming events */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">Coming up</h2>
            <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
              {events.length === 0 ? (
                <div className="p-4 text-sm text-slate-400 text-center">Nothing scheduled yet.</div>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="p-3 flex gap-3">
                    <div className="shrink-0 w-12 rounded-md text-center py-1 text-white" style={{ background: BRAND.red }}>
                      <div className="text-[10px] uppercase">{new Date(e.starts_at).toLocaleDateString([], { month: 'short' })}</div>
                      <div className="text-lg font-bold leading-none">{new Date(e.starts_at).getDate()}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{e.name}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(e.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {e.location && ` · ${e.location}`}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <Link to="/app/events" className="block p-2.5 text-center text-xs text-blue-600 hover:underline">
                All events
              </Link>
            </div>
          </section>

          {/* Extra pages this member has been given */}
          {granted.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">Your tools</h2>
              <div className="grid gap-2">
                {granted.map((f) => (
                  <Link key={f.key} to={f.path} className="bg-white rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                    <div className="text-sm font-medium text-slate-900">{f.label}</div>
                    <div className="text-xs text-slate-500">{f.blurb}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {editing && campaignId && (
        <AnnouncementEditor
          post={editing === 'new' ? null : editing}
          campaignId={campaignId}
          userId={session?.user.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function AnnouncementEditor({
  post,
  campaignId,
  userId,
  onClose,
  onSaved,
}: {
  post: Announcement | null
  campaignId: string
  userId: string | undefined
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [pinned, setPinned] = useState(post?.pinned ?? false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!title.trim() || !body.trim()) return setErr('Add a title and a message.')
    setBusy(true)
    const row = { title: title.trim(), body: body.trim(), pinned }
    const { error } = post
      ? await supabase.from('announcements').update(row).eq('id', post.id)
      : await supabase.from('announcements').insert({ ...row, campaign_id: campaignId, created_by: userId })
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved()
  }

  const remove = async () => {
    if (!post || !window.confirm('Delete this announcement?')) return
    setBusy(true)
    await supabase.from('announcements').delete().eq('id', post.id)
    setBusy(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/30 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-xl sm:rounded-xl shadow-xl p-5 space-y-3"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-slate-900">{post ? 'Edit announcement' : 'New announcement'}</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={input} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Message to all members" className={input} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          Pin to the top
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy} className="rounded-lg bg-blue-600 text-white text-sm px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
            {post ? 'Save' : 'Post'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-300 text-slate-700 text-sm px-4 py-2 hover:bg-slate-50">
            Cancel
          </button>
          {post && (
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
