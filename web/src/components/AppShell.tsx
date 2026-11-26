import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { FEATURES, ROLE_LABELS } from '../lib/access'

interface Item {
  to: string
  label: string
  end?: boolean
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { activeCampaign, isBoard, access } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Close the phone menu whenever the page changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMenuOpen(false), [location.pathname])

  // The old voter pages (Voters / Map / Stats) only appear once a voter file is loaded.
  const [hasVoters, setHasVoters] = useState(false)
  useEffect(() => {
    if (!campaignId || !isBoard) return
    supabase
      .from('voters')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .limit(1)
      .then(({ count }) => setHasVoters((count ?? 0) > 0))
  }, [campaignId, isBoard])

  const memberItems: Item[] = [
    { to: '/app', label: 'Home', end: true },
    { to: '/app/events', label: 'Events' },
    ...FEATURES.filter((f) => access.includes(f.key) && !(isBoard && f.key === 'event_checkin')).map((f) => ({
      to: f.path,
      label: f.label,
    })),
  ]
  const boardItems: Item[] = isBoard
    ? [
        { to: '/app/dashboard', label: 'Dashboard' },
        { to: '/app/members', label: 'Member list' },
        { to: '/app/people', label: 'People & access' },
        ...(hasVoters
          ? [
              { to: '/app/voters', label: 'Voters' },
              { to: '/app/map', label: 'Map' },
              { to: '/app/stats', label: 'Voter stats' },
            ]
          : []),
      ]
    : []

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
      isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-full bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-[1500]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-14 flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2 shrink-0" title="Public homepage">
            <img src="/gcyr-icon.svg" alt="" className="w-7 h-7" />
            <span className="font-bold text-blue-700 tracking-tight">{BRAND.short}</span>
          </Link>
          {activeCampaign && (
            <span className="hidden sm:inline text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
              {ROLE_LABELS[activeCampaign.role]}
            </span>
          )}

          {/* Wide screens: everything in one row */}
          <nav className="hidden xl:flex items-center gap-1 ml-3 flex-1">
            {memberItems.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={linkClass}>
                {i.label}
              </NavLink>
            ))}
            {boardItems.length > 0 && <span className="mx-2 h-5 w-px bg-slate-200" />}
            {boardItems.map((i) => (
              <NavLink key={i.to} to={i.to} className={linkClass}>
                {i.label}
              </NavLink>
            ))}
            <div className="flex-1" />
            <NavLink to="/app/account" className={linkClass}>
              Account
            </NavLink>
          </nav>

          {/* Narrow screens: menu button */}
          <div className="flex-1 xl:hidden" />
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="xl:hidden rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            aria-expanded={menuOpen}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>

        {menuOpen && (
          <nav className="xl:hidden border-t border-slate-200 bg-white max-h-[75dvh] overflow-y-auto">
            <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-3 grid gap-4 sm:grid-cols-2">
              <MenuGroup title="Members" items={[...memberItems, { to: '/app/account', label: 'Account' }]} />
              {boardItems.length > 0 && <MenuGroup title="Board" items={boardItems} />}
            </div>
          </nav>
        )}
      </header>
      <main>{children}</main>
    </div>
  )
}

function MenuGroup({ title, items }: { title: string; items: Item[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-2 mb-1">{title}</div>
      <div className="grid gap-0.5">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) =>
              `rounded-md px-2 py-2 text-sm ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`
            }
          >
            {i.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
