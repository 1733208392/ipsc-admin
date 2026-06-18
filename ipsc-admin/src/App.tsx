import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { MatchProvider } from '@/hooks/useMatch'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Toaster } from '@/components/ui/toaster'
import { MatchList } from '@/pages/MatchList'
import { DivisionsPage } from '@/pages/DivisionsPage'
import { StagesPage } from '@/pages/StagesPage'
import { SquadsPage } from '@/pages/SquadsPage'
import { ShootersPage } from '@/pages/ShootersPage'
import { ScoresPage } from '@/pages/ScoresPage'
import { ScoreCardPage } from '@/pages/ScoreCardPage'
import { ScoreCardSummaryPage } from '@/pages/ScoreCardSummaryPage'
import { LeaderboardPage } from '@/pages/LeaderboardPage'
import { LiveScorecardPage } from '@/pages/LiveScorecardPage'
import { LeaderboardLivestreamPage } from '@/pages/LeaderboardLivestreamPage'
import { LoginPage } from '@/pages/LoginPage'
import { AdminClubsPage } from '@/pages/AdminClubsPage'
import { AdminUsersPage } from '@/pages/AdminUsersPage'
import { AdminMatchesPage } from '@/pages/AdminMatchesPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading } = useAuth()
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">加载中...</div>
  }
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'super_admin') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <MatchProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<MatchList />} />
              <Route path="/matches/:id/divisions" element={<DivisionsPage />} />
              <Route path="/matches/:id/stages" element={<StagesPage />} />
              <Route path="/matches/:id/squads" element={<SquadsPage />} />
              <Route path="/matches/:id/shooters" element={<ShootersPage />} />
              <Route path="/matches/:id/scores" element={<ScoresPage />} />
              <Route path="/matches/:id/score-card" element={<ScoreCardPage />} />
              <Route path="/matches/:id/score-card/summary" element={<ScoreCardSummaryPage />} />
              <Route path="/matches/:id/leaderboard" element={<LeaderboardPage />} />
              <Route path="/matches/:id/score-card-live" element={<LiveScorecardPage />} />
              <Route path="/matches/:id/leaderboard-live" element={<LeaderboardLivestreamPage />} />
              <Route
                path="/admin/clubs"
                element={
                  <RequireSuperAdmin>
                    <AdminClubsPage />
                  </RequireSuperAdmin>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <RequireSuperAdmin>
                    <AdminUsersPage />
                  </RequireSuperAdmin>
                }
              />
              <Route
                path="/admin/matches"
                element={
                  <RequireSuperAdmin>
                    <AdminMatchesPage />
                  </RequireSuperAdmin>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </MatchProvider>
    </AuthProvider>
  )
}
