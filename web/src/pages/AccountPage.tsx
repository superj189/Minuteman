import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export default function AccountPage() {
  const { session, activeCampaign, signOut } = useAuth()
  const userId = session?.user.id
  const email = session?.user.email

  const [name, setName] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
      .then(({ data }) => setName(data?.full_name ?? ''))
  }, [userId])

  const flash = (ok: string | null, bad: string | null) => {
    setMsg(ok)
    setErr(bad)
  }

  const saveName = async () => {
    if (!userId) return
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null }).eq('id', userId)
    flash(error ? null : 'Name saved.', error ? error.message : null)
    setBusy(false)
  }

  const savePassword = async () => {
    if (pw1.length < 8) return flash(null, 'Password must be at least 8 characters.')
    if (pw1 !== pw2) return flash(null, 'Passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    if (error) flash(null, error.message)
    else {
      flash('Password changed.', null)
      setPw1('')
      setPw2('')
    }
    setBusy(false)
  }

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-4">Account</h1>

      {msg && <div className="mb-3 text-sm text-green-700 bg-green-50 rounded p-2">{msg}</div>}
      {err && <div className="mb-3 text-sm text-red-600 bg-red-50 rounded p-2">{err}</div>}

      <Section title="Profile">
        <Field label="Email">
          <input value={email ?? ''} disabled className={input + ' bg-slate-100 text-slate-500'} />
        </Field>
        <Field label="Display name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Your name" />
        </Field>
        <button onClick={saveName} disabled={busy} className={btn}>
          Save name
        </button>
      </Section>

      <Section title="Change password">
        <Field label="New password">
          <input
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            className={input}
            placeholder="At least 8 characters"
          />
        </Field>
        <Field label="Confirm new password">
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
        </Field>
        <button onClick={savePassword} disabled={busy} className={btn}>
          Change password
        </button>
      </Section>

      <Section title="Session">
        {activeCampaign && (
          <p className="text-xs text-slate-500 mb-3">
            Signed in to <span className="font-medium">{activeCampaign.campaigns.name}</span> as{' '}
            <span className="capitalize">{activeCampaign.role}</span>.
          </p>
        )}
        <button
          onClick={signOut}
          className="rounded-lg border border-slate-300 text-slate-700 text-sm px-4 py-2 hover:bg-slate-50"
        >
          Sign out
        </button>
      </Section>
    </div>
  )
}

const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const btn = 'rounded-lg bg-blue-600 text-white text-sm px-4 py-2 hover:bg-blue-700 disabled:opacity-50'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
