import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { MatchProvider } from '@/hooks/useMatch'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Toaster } from '@/components/ui/toaster'
import { MatchList } from '@/pages/MatchList'
import { DivisionsPage } from '@/pages/DivisionsPage'
import { StagesPage } from '@/pages/StagesPage'
import { DrillTemplateListPage } from '@/pages/DrillTemplateListPage'
import { DrillTemplateEditPage } from '@/pages/DrillTemplateEditPage'
import { SquadsPage } from '@/pages/SquadsPage'
import { ShootersPage } from '@/pages/ShootersPage'
import { ScoresPage } from '@/pages/ScoresPage'
import { ScoreCardPage } from '@/pages/ScoreCardPage'
import { ScoreCardSummaryPage } from '@/pages/ScoreCardSummaryPage'
import { LeaderboardPage } from '@/pages/LeaderboardPage'
import { LiveScorecardPage } from '@/pages/LiveScorecardPage'
import { LeaderboardLivestreamPage } from '@/pages/LeaderboardLivestreamPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { VerifyEmailPage } from '@/pages/VerifyEmailPage'
import { VerifyPhonePage } from '@/pages/VerifyPhonePage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { AdminClubsPage } from '@/pages/AdminClubsPage'
import { AdminUsersPage } from '@/pages/AdminUsersPage'
import { AdminMatchesPage } from '@/pages/AdminMatchesPage'
import { AdminOtaPage } from '@/pages/AdminOtaPage'
import { MyDrillListPage } from '@/pages/my/MyDrillListPage'
import { MyDrillEditPage } from '@/pages/my/MyDrillEditPage'
import { MyReplaysPage } from '@/pages/my/MyReplaysPage'
import { MyReplayDetailPage } from '@/pages/my/MyReplayDetailPage'
import { MyTrainingStatsPage } from '@/pages/my/MyTrainingStatsPage'

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
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/verify-phone" element={<VerifyPhonePage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
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
              <Route path="/matches/:id/stages/:stageId/drills" element={<DrillTemplateListPage />} />
              <Route path="/matches/:id/stages/:stageId/drills/:drillId" element={<DrillTemplateEditPage />} />
              <Route path="/matches/:id/squads" element={<SquadsPage />} />
              <Route path="/matches/:id/shooters" element={<ShootersPage />} />
              <Route path="/matches/:id/scores" element={<ScoresPage />} />
              <Route path="/matches/:id/score-card" element={<ScoreCardPage />} />
              <Route path="/matches/:id/score-card/summary" element={<ScoreCardSummaryPage />} />
              <Route path="/matches/:id/leaderboard" element={<LeaderboardPage />} />
              <Route path="/matches/:id/score-card-live" element={<LiveScorecardPage />} />
              <Route path="/matches/:id/leaderboard-live" element={<LeaderboardLivestreamPage />} />
              <Route path="/my/drills" element={<MyDrillListPage />} />
              <Route path="/my/drills/:drillId" element={<MyDrillEditPage />} />
              <Route path="/my/replays" element={<MyReplaysPage />} />
              <Route path="/my/replays/:id" element={<MyReplayDetailPage />} />
              <Route path="/my/training" element={<MyTrainingStatsPage />} />
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
              <Route
                path="/admin/ota"
                element={
                  <RequireSuperAdmin>
                    <AdminOtaPage />
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
