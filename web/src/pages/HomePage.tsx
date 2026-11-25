import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { SITE } from '../lib/site'
import { useAuth } from '../auth/AuthProvider'

// Public homepage. Wording lives in lib/site.ts.

interface PublicEvent {
  name: string
  starts_at: string
  location: string | null
  description: string | null
}

export default function HomePage() {
  const { session } = useAuth()
  const [events, setEvents] = useState<PublicEvent[]>([])

  useEffect(() => {
    supabase.rpc('public_upcoming_events', { p_slug: BRAND.slug }).then(({ data }) => setEvents((data as PublicEvent[]) ?? []))
  }, [])

  const m = SITE.meeting
  const socials = Object.entries(SITE.social).filter(([, url]) => url)

  return (
    <div className="min-h-full bg-white text-slate-900">
      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-white">
            <img src="/gcyr-icon.svg" alt="" className="w-9 h-9 rounded-lg ring-1 ring-white/20" />
            <span className="font-bold tracking-tight hidden sm:inline">{BRAND.short}</span>
          </Link>
          <div className="flex-1" />
          <Link
            to={session ? '/app' : '/login'}
            className="rounded-lg border border-white/40 text-white text-sm font-medium px-3 py-1.5 hover:bg-white/10"
          >
            {session ? 'Member area' : 'Member login'}
          </Link>
          <Link to="/join" className="rounded-lg text-white text-sm font-semibold px-3 py-1.5 hover:opacity-90" style={{ background: BRAND.red }}>
            Join
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: BRAND.navy }}>
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 22px)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-32 pb-20 sm:pt-40 sm:pb-28">
          <div className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-white/70">{BRAND.name}</div>
          <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight max-w-3xl leading-[1.05]">{SITE.heroTitle}</h1>
          <div className="mt-5 h-1.5 w-24 rounded-full" style={{ background: BRAND.red }} />
          <p className="mt-5 text-base sm:text-lg text-white/85 max-w-2xl">{SITE.heroText}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/join" className="rounded-lg text-white font-semibold px-6 py-3 hover:opacity-90" style={{ background: BRAND.red }}>
              Join the club
            </Link>
            {events.length > 0 && (
              <a href="#events" className="rounded-lg border border-white/50 text-white font-semibold px-6 py-3 hover:bg-white/10">
                Upcoming events
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Facts */}
      {SITE.facts.length > 0 && (
        <section className="border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            {SITE.facts.map((f) => (
              <div key={f.label}>
                <div className="text-3xl sm:text-4xl font-extrabold" style={{ color: BRAND.navy }}>
                  {f.value}
                </div>
                <div className="text-sm text-slate-500 mt-1">{f.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* About */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid md:grid-cols-[1fr_2fr] gap-8">
        <div>
          <SectionLabel n="01" text="Who we are" />
          <h2 className="text-3xl font-bold tracking-tight mt-2">Our story</h2>
        </div>
        <div className="space-y-4 text-slate-700 leading-relaxed">
          {SITE.about.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {SITE.affiliations.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 pt-4">
              {SITE.affiliations.map((a) => (
                <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-sm text-slate-500 mt-1">{a.text}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Values */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <SectionLabel n="02" text="What we stand for" />
          <h2 className="text-3xl font-bold tracking-tight mt-2 mb-8">Our values</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SITE.values.map((v, i) => (
              <div key={v.title} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="text-sm font-bold" style={{ color: BRAND.red }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="font-semibold mt-2">{v.title}</div>
                <p className="text-sm text-slate-600 mt-1">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Events + meeting */}
      {(events.length > 0 || m.schedule) && (
        <section id="events" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <SectionLabel n="03" text="Get together" />
          <h2 className="text-3xl font-bold tracking-tight mt-2 mb-8">Come to an event</h2>
          <div className="grid lg:grid-cols-2 gap-6">
            {m.schedule && (
              <div className="rounded-xl p-6 text-white" style={{ background: BRAND.navy }}>
                <div className="text-xs uppercase tracking-widest text-white/60">Regular meeting</div>
                <div className="text-xl font-bold mt-1">{m.schedule}</div>
                {m.place && <div className="mt-3 font-medium">{m.place}</div>}
                {m.address && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(m.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-white/80 underline"
                  >
                    {m.address}
                  </a>
                )}
                {m.note && <p className="text-sm text-white/80 mt-3">{m.note}</p>}
              </div>
            )}
            {events.length > 0 && (
              <ul className="space-y-3">
                {events.map((e, i) => (
                  <li key={i} className="flex gap-4 rounded-xl border border-slate-200 p-4">
                    <DateBadge iso={e.starts_at} />
                    <div className="min-w-0">
                      <div className="font-semibold">{e.name}</div>
                      <div className="text-sm text-slate-500">
                        {new Date(e.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {e.location && ` · ${e.location}`}
                      </div>
                      {e.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{e.description}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Call to action */}
      <section className="text-white" style={{ background: BRAND.navy }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Ready to get involved?</h2>
          <p className="text-white/80 mt-3 max-w-xl mx-auto">Sign up and we'll let you know about the next meeting.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/join" className="rounded-lg text-white font-semibold px-6 py-3 hover:opacity-90" style={{ background: BRAND.red }}>
              Join the club
            </Link>
            {SITE.contactEmail && (
              <a href={`mailto:${SITE.contactEmail}`} className="rounded-lg border border-white/50 font-semibold px-6 py-3 hover:bg-white/10">
                Contact us
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center gap-3 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
          <div className="flex-1" />
          {socials.map(([name, url]) => (
            <a key={name} href={url} target="_blank" rel="noreferrer" className="capitalize hover:underline">
              {name === 'x' ? 'X' : name}
            </a>
          ))}
          <Link to={session ? '/app' : '/login'} className="hover:underline">
            {session ? 'Member area' : 'Member login'}
          </Link>
        </div>
      </footer>
    </div>
  )
}

function SectionLabel({ n, text }: { n: string; text: string }) {
  return (
    <div className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: BRAND.red }}>
      {n} · {text}
    </div>
  )
}

function DateBadge({ iso }: { iso: string }) {
  const d = new Date(iso)
  return (
    <div className="shrink-0 w-14 rounded-lg text-center py-1.5 text-white" style={{ background: BRAND.red }}>
      <div className="text-[10px] uppercase tracking-wide">{d.toLocaleDateString([], { month: 'short' })}</div>
      <div className="text-xl font-bold leading-none">{d.getDate()}</div>
    </div>
  )
}
