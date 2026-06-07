import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export default function AppShell({ children }: { children: ReactNode }) {
  const { activeCampaign } = useAuth()
  const isAdmin = activeCampaign?.role === 'manager' || activeCampaign?.role === 'deputy'

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
          <span className="font-bold text-blue-700 tracking-tight shrink-0 text-[15px] sm:text-base">Minuteman</span>
          {/* Campaign name + role: only on wider screens to save phone space */}
          <span className="hidden md:inline text-slate-300">/</span>
          <span className="hidden md:inline font-semibold text-slate-900 truncate max-w-[160px]">
            {activeCampaign?.campaigns.name ?? 'HD-100'}
          </span>
          {activeCampaign && (
            <span className="hidden lg:inline text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 capitalize">
              {activeCampaign.role}
            </span>
          )}

          {/* Page navigation */}
          <nav className="flex items-center gap-1 ml-1 overflow-x-auto">
            <NavLink to="/" end className={linkClass}>
              Voters
            </NavLink>
            <NavLink to="/map" className={linkClass}>
              Map
            </NavLink>
            <NavLink to="/stats" className={linkClass}>
              Stats
            </NavLink>
            {isAdmin && (
              <NavLink to="/team" className={linkClass}>
                Team
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
