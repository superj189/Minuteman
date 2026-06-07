import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export default function AppShell({ children }: { children: ReactNode }) {
  const { session, activeCampaign, signOut } = useAuth()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition ${
      isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-full bg-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-bold text-blue-700 tracking-tight">Minuteman</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900">
              {activeCampaign?.campaigns.name ?? 'HD-100'}
            </span>
            {activeCampaign && (
              <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 capitalize">
                {activeCampaign.role}
              </span>
            )}
            {/* Page navigation */}
            <nav className="flex items-center gap-1 ml-2">
              <NavLink to="/" end className={linkClass}>
                Voter List
              </NavLink>
              <NavLink to="/map" className={linkClass}>
                Map
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">{session?.user.email}</span>
            <button onClick={signOut} className="text-blue-600 hover:underline">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
