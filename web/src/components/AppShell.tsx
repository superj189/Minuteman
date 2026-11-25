import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/brand'

export default function AppShell({ children }: { children: ReactNode }) {
  const { activeCampaign } = useAuth()
  const campaignId = activeCampaign?.campaign_id
  const isAdmin = activeCampaign?.role === 'manager' || activeCampaign?.role === 'deputy'

  // The voter pages (Voters / Map / Stats) only make sense once a voter file
  // has been loaded for this organization, so hide them until then.
  const [hasVoters, setHasVoters] = useState(false)
  useEffect(() => {
    if (!campaignId) return
    supabase
      .from('voters')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .limit(1)
      .then(({ count }) => setHasVoters((count ?? 0) > 0))
  }, [campaignId])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
      isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-full bg-slate-100">
      <header
        className="bg-white border-b border-slate-200 sticky top-0 z-[1500]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-[1400px] mx-auto px-2 sm:px-6 h-14 flex items-center gap-1 sm:gap-4">
          <span className="flex items-center gap-2 shrink-0">
            <img src="/gcyr-icon.svg" alt="" className="w-7 h-7" />
            <span className="hidden sm:inline font-bold text-blue-700 tracking-tight text-base">{BRAND.short}</span>
          </span>
          {activeCampaign && (
            <span className="hidden lg:inline text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 capitalize">
              {activeCampaign.role}
            </span>
          )}

          {/* Page navigation */}
          <nav className="flex items-center gap-1 ml-1 overflow-x-auto">
            <NavLink to="/" end className={linkClass}>
              Members
            </NavLink>
            <NavLink to="/events" className={linkClass}>
              Events
            </NavLink>
            {hasVoters && (
              <>
                <NavLink to="/voters" className={linkClass}>
                  Voters
                </NavLink>
                <NavLink to="/map" className={linkClass}>
                  Map
                </NavLink>
                <NavLink to="/stats" className={linkClass}>
                  Stats
                </NavLink>
              </>
            )}
            {isAdmin && (
              <NavLink to="/team" className={linkClass}>
                Officers
              </NavLink>
            )}
            <NavLink to="/account" className={linkClass}>
              Account
            </NavLink>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
