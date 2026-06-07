import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import LoginPage from './auth/LoginPage'
import AppShell from './components/AppShell'
import VoterListPage from './pages/VoterListPage'
import MapPage from './pages/MapPage'
import StatsPage from './pages/StatsPage'

function Gate() {
  const { session, loading, memberships } = useAuth()

  if (loading) {
    return <div className="min-h-full flex items-center justify-center text-slate-400">Loading…</div>
  }

  if (!session) return <LoginPage />

  // Logged in but not yet attached to any campaign — RLS would return no data.
  if (memberships.length === 0) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto p-10 text-center text-slate-600">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No campaign access yet</h2>
          <p className="text-sm">
            Your account isn't linked to a campaign. An admin needs to add you as a member
            (see the setup step in the project README).
          </p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<VoterListPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="*" element={<VoterListPage />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  )
}
