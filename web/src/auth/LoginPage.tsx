import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { useAuth } from './AuthProvider'

export default function LoginPage() {
  const { session } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (session) return <Navigate to="/app" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/app` },
      })
      if (error) setError(error.message)
      else if (!data.session) setNotice('Account created. Check your email to confirm it, then sign in.')
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/app/account` })
      if (error) setError(error.message)
      else setNotice('If that email has an account, a reset link is on its way.')
    }
    setBusy(false)
  }

  const switchTo = (m: typeof mode) => {
    setMode(m)
    setError(null)
    setNotice(null)
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <img src="/gcyr-icon.svg" alt="" className="w-12 h-12 mb-3" />
        <h1 className="text-xl font-bold text-blue-700">{BRAND.short}</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          {mode === 'signin' ? 'Member sign in' : mode === 'signup' ? 'Create your member account' : 'Reset your password'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
              <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </div>
          {mode !== 'reset' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={mode === 'signup' ? 8 : 6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
            </div>
          )}

          {mode === 'signup' && (
            <p className="text-xs text-slate-500">
              Use the same email you signed up to the club with, so we can link your account. A board member approves
              new accounts.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-sm">
          {mode === 'signin' ? (
            <>
              <button onClick={() => switchTo('signup')} className="text-blue-600 hover:underline text-left">
                New here? Create a member account
              </button>
              <button onClick={() => switchTo('reset')} className="text-slate-500 hover:underline text-left">
                Forgot your password?
              </button>
            </>
          ) : (
            <button onClick={() => switchTo('signin')} className="text-blue-600 hover:underline text-left">
              Have an account? Sign in
            </button>
          )}
        </div>
      </div>
      <Link to="/" className="mt-4 text-sm text-slate-500 hover:underline">
        ← Back to {BRAND.short}
      </Link>
    </div>
  )
}

const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
