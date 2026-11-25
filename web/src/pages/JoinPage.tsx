import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/brand'

// Public sign-up form. No login: it can only call the two public database
// functions (public_org, public_join) and can never read the member list.

const INTERESTS = [
  'Social events & happy hours',
  'Volunteering on campaigns',
  'Networking',
  'Policy discussions & speakers',
  'Running for office someday',
]

const HOW_HEARD = ['A friend', 'Instagram', 'Facebook', 'X / Twitter', 'An event', 'Email or text', 'Other']

// The exact wording people agree to. Saved with each sign-up as proof of consent.
const EMAIL_CONSENT = `Yes, email me news and event invites from the ${BRAND.name}. I can unsubscribe anytime.`
const SMS_CONSENT = `Yes, text me updates and event reminders from the ${BRAND.name} at the number above. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Agreeing is not required to join.`

export default function JoinPage() {
  const { slug = BRAND.slug } = useParams()
  const [orgName, setOrgName] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)

  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [birth, setBirth] = useState('')
  const [zip, setZip] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [howHeard, setHowHeard] = useState('')
  const [emailOk, setEmailOk] = useState(true)
  const [smsOk, setSmsOk] = useState(false)
  const [website, setWebsite] = useState('') // hidden trap field; real people leave it empty

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.rpc('public_org', { p_slug: slug }).then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : null
      setClosed(!!error || !row)
      if (row) setOrgName(row.name)
    })
  }, [slug])

  const toggleInterest = (i: string) =>
    setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (website) {
      setDone(true) // quietly drop bot submissions
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (smsOk && !digits) return setError('Add a phone number to get text updates.')
    if (digits && !(digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))))
      return setError('Please enter a 10-digit phone number.')

    const consentParts = [emailOk ? EMAIL_CONSENT : null, smsOk ? SMS_CONSENT : null].filter(Boolean)

    setBusy(true)
    const { error } = await supabase.rpc('public_join', {
      p_slug: slug,
      p_first_name: first,
      p_last_name: last,
      p_email: email,
      p_phone: digits || null,
      p_birth_date: birth || null,
      p_zip: zip || null,
      p_interests: interests,
      p_how_heard: howHeard || null,
      p_email_opt_in: emailOk,
      p_sms_opt_in: smsOk,
      p_consent_text: consentParts.length ? consentParts.join(' | ') : null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else setDone(true)
  }

  return (
    <div className="min-h-full bg-slate-100">
      {/* Banner */}
      <div style={{ background: BRAND.navy }} className="text-white">
        <div className="max-w-xl mx-auto px-5 pt-10 pb-16 text-center">
          <img src="/gcyr-icon.svg" alt="" className="w-16 h-16 mx-auto mb-4 rounded-2xl ring-2 ring-white/20" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{orgName ?? BRAND.name}</h1>
          <p className="mt-2 text-white/80 text-sm sm:text-base">
            Meet other young conservatives in Gwinnett. Make friends, hear great speakers, and help win elections.
          </p>
          <div className="mx-auto mt-5 h-1.5 w-24 rounded-full" style={{ background: BRAND.red }} />
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 -mt-10 pb-12">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-8">
          {closed ? (
            <p className="text-center text-slate-600 py-6">This sign-up form isn't open right now.</p>
          ) : done ? (
            <div className="text-center py-6">
              <div
                className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                style={{ background: BRAND.red }}
              >
                ✓
              </div>
              <h2 className="text-xl font-bold text-slate-900">You're on the list!</h2>
              <p className="text-sm text-slate-600 mt-2">
                Thanks for signing up, {first || 'friend'}. One of our officers will reach out soon with upcoming events.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Join us</h2>
              <p className="text-xs text-slate-500 -mt-2">For Republicans ages 18 to 40 who live or work in Gwinnett County.</p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="First name">
                  <input required autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} className={input} />
                </Field>
                <Field label="Last name">
                  <input required autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} className={input} />
                </Field>
              </div>

              <Field label="Email">
                <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
              </Field>

              <Field label="Mobile phone (optional)">
                <input type="tel" autoComplete="tel" inputMode="tel" placeholder="(770) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of birth">
                  <input required type="date" autoComplete="bday" value={birth} onChange={(e) => setBirth(e.target.value)} className={input} />
                </Field>
                <Field label="ZIP code">
                  <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" value={zip} onChange={(e) => setZip(e.target.value)} className={input} />
                </Field>
              </div>

              <fieldset>
                <legend className="block text-xs text-slate-500 mb-2">What are you interested in? (pick any)</legend>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((i) => {
                    const on = interests.includes(i)
                    return (
                      <button
                        type="button"
                        key={i}
                        onClick={() => toggleInterest(i)}
                        aria-pressed={on}
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <Field label="How did you hear about us? (optional)">
                <select value={howHeard} onChange={(e) => setHowHeard(e.target.value)} className={input + ' bg-white'}>
                  <option value="">Choose one…</option>
                  {HOW_HEARD.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>

              {/* Trap for spam bots: hidden from people. */}
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                name="website"
                className="absolute -left-[9999px] w-px h-px opacity-0"
              />

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
                className="w-full rounded-lg text-white text-sm font-semibold py-3 disabled:opacity-50 hover:opacity-90"
                style={{ background: BRAND.red }}
              >
                {busy ? 'Signing you up…' : 'Sign me up'}
              </button>

              <p className="text-[11px] text-slate-400 text-center">
                We never sell or share your information.
              </p>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">
          Officer?{' '}
          <a href="/" className="hover:underline">
            Sign in
          </a>
        </p>
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

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
      <span>{children}</span>
    </label>
  )
}
