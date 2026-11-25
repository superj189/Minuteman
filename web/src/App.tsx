import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import LoginPage from './auth/LoginPage'
import AppShell from './components/AppShell'
import MembersPage from './pages/MembersPage'
import JoinPage from './pages/JoinPage'
import CheckinPage from './pages/CheckinPage'
import EventsPage from './pages/EventsPage'
import VoterListPage from './pages/VoterListPage'
import MapPage from './pages/MapPage'
import StatsPage from './pages/StatsPage'
import TeamPage from './pages/TeamPage'
import AccountPage from './pages/AccountPage'

function Gate() {
  const { session, loading, memberships } = useAuth()

  if (loading) {
    return <div className="min-h-full flex items-center justify-center text-slate-400">Loading…</div>
  }

  if (!session) return <LoginPage />

  // Logged in but not yet attached to any organization — RLS would return no data.
  if (memberships.length === 0) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto p-10 text-center text-slate-600">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No officer access yet</h2>
          <p className="text-sm">
            Your account isn't linked to the club yet. Ask the chairman to add you from the Officers page.
          </p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<MembersPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/voters" element={<VoterListPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<MembersPage />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: anyone can open the sign-up form, no login needed. */}
          <Route path="/join" element={<JoinPage />} />
          <Route path="/join/:slug" element={<JoinPage />} />
          <Route path="/checkin/:eventId" element={<CheckinPage />} />
          <Route path="*" element={<Gate />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
