import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import LoginPage from './auth/LoginPage'
import AppShell from './components/AppShell'
import HomePage from './pages/HomePage'
import JoinPage from './pages/JoinPage'
import CheckinPage from './pages/CheckinPage'
import RequestAccessPage from './pages/RequestAccessPage'
import MemberHomePage from './pages/MemberHomePage'
import MemberEventsPage from './pages/MemberEventsPage'
import CheckinDeskPage from './pages/CheckinDeskPage'
import GatedPage from './pages/GatedPage'
import AccountPage from './pages/AccountPage'
import DashboardPage from './pages/DashboardPage'
import MembersPage from './pages/MembersPage'
import EventsPage from './pages/EventsPage'
import BoardPeoplePage from './pages/BoardPeoplePage'
import VoterListPage from './pages/VoterListPage'
import MapPage from './pages/MapPage'
import StatsPage from './pages/StatsPage'
import NoAccess from './components/NoAccess'

const Loading = () => <div className="min-h-full flex items-center justify-center text-slate-400">Loading…</div>

// Everything under /app: signed-in people only.
function MemberArea() {
  const { session, loading, membershipsLoaded, memberships, isBoard } = useAuth()

  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (!membershipsLoaded) return <Loading />
  // Signed in but not in the club yet: ask to join / wait for approval.
  if (memberships.length === 0) return <RequestAccessPage />

  const board = (el: React.ReactElement) => (isBoard ? el : <NoAccess what="board tools" />)

  return (
    <AppShell>
      <Routes>
        <Route index element={<MemberHomePage />} />
        <Route path="events" element={isBoard ? <EventsPage /> : <MemberEventsPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="checkin-desk" element={<CheckinDeskPage />} />
        <Route path="precincts" element={<GatedPage feature="precinct_info" />} />
        <Route path="outreach" element={<GatedPage feature="voter_outreach" />} />
        <Route path="recruiting" element={<GatedPage feature="recruiting" />} />
        <Route path="dashboard" element={board(<DashboardPage />)} />
        <Route path="members" element={board(<MembersPage />)} />
        <Route path="people" element={board(<BoardPeoplePage />)} />
        <Route path="voters" element={board(<VoterListPage />)} />
        <Route path="map" element={board(<MapPage />)} />
        <Route path="stats" element={board(<StatsPage />)} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public pages */}
          <Route path="/" element={<HomePage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/join/:slug" element={<JoinPage />} />
          <Route path="/checkin/:eventId" element={<CheckinPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Signed-in area */}
          <Route path="/app/*" element={<MemberArea />} />

          {/* Old links from before the member area existed */}
          <Route path="/team" element={<Navigate to="/app/people" replace />} />
          <Route path="/events" element={<Navigate to="/app/events" replace />} />
          <Route path="/account" element={<Navigate to="/app/account" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
