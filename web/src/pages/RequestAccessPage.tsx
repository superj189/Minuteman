import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { BRAND } from '../lib/brand'

// Shown to a signed-in person who isn't in the club yet: ask to join, then wait.
export default function RequestAccessPage() {
  const { session, refresh, signOut } = useAuth()
  const [status, setStatus] = useState<'none' | 'pending' | 'denied' | 'loading'>('loading')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const uid = session?.user.id
    if (!uid) return
    Promise.all([
      supabase.from('membership_requests').select('status').eq('user_id', uid).maybeSingle(),
      supabase.from('profiles').select('full_name').eq('id', uid).single(),
    ]).then(([req, prof]) => {
      setName(prof.data?.full_name ?? '')
      const s = req.data?.status
      if (s === 'approved') refresh()
      setStatus(s === 'pending' ? 'pending' : s === 'denied' ? 'denied' : 'none')
    })
  }, [session, refresh])

  const ask = async () => {
    setErr(null)
    setBusy(true)
    const { data, error } = await supabase.rpc('request_membership', { p_slug: BRAND.slug, p_full_name: name })
    setBusy(false)
    if (error) return setErr(error.message)
    if (data === 'member') return refresh()
    setStatus('pending')
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <img src="/gcyr-icon.svg" alt="" className="w-12 h-12 mx-auto mb-3" />
        {status === 'loading' ? (
          <p className="text-slate-400">Loading…</p>
        ) : status === 'pending' ? (
          <>
            <h1 className="text-lg font-bold text-slate-900">Waiting for approval</h1>
            <p className="text-sm text-slate-600 mt-2">
              Thanks! A board member will review your request. Once you're approved, come back here and tap "Check
              again" to open the member area.
            </p>
            <button onClick={() => refresh()} className="mt-5 rounded-lg bg-blue-600 text-white text-sm px-4 py-2 hover:bg-blue-700">
              Check again
            </button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-slate-900">Request member access</h1>
            <p className="text-sm text-slate-600 mt-2">
              {status === 'denied'
                ? "Your last request wasn't approved. If you think that was a mistake, you can ask again."
                : `Your account isn't linked to the ${BRAND.short} member area yet. Ask to join and a board member will approve you.`}
            </p>
            <label className="block text-left mt-5">
              <span className="block text-xs text-slate-500 mb-1">Your full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
            <button onClick={ask} disabled={busy || !name.trim()} className="mt-4 w-full rounded-lg bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Sending…' : 'Request access'}
            </button>
          </>
        )}
        <div className="mt-6 flex justify-center gap-4 text-sm">
          <Link to="/" className="text-slate-500 hover:underline">
            Home
          </Link>
          <button onClick={signOut} className="text-slate-500 hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
