import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'

export default function AppShell({ children }: { children: ReactNode }) {
  const { session, activeCampaign, signOut } = useAuth()

  return (
    <div className="min-h-full bg-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-900">
              {activeCampaign?.campaigns.name ?? 'HD-100 Voter Platform'}
            </span>
            {activeCampaign && (
              <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 capitalize">
                {activeCampaign.role}
              </span>
            )}
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
