import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { MatchProvider } from '@/hooks/useMatch'
import { Toaster } from '@/components/ui/toaster'
import { MatchList } from '@/pages/MatchList'
import { DivisionsPage } from '@/pages/DivisionsPage'
import { StagesPage } from '@/pages/StagesPage'
import { SquadsPage } from '@/pages/SquadsPage'
import { ShootersPage } from '@/pages/ShootersPage'
import { ScoresPage } from '@/pages/ScoresPage'
import { LeaderboardPage } from '@/pages/LeaderboardPage'

export default function App() {
  return (
    <MatchProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<MatchList />} />
            <Route path="/matches/:id/divisions" element={<DivisionsPage />} />
            <Route path="/matches/:id/stages" element={<StagesPage />} />
            <Route path="/matches/:id/squads" element={<SquadsPage />} />
            <Route path="/matches/:id/shooters" element={<ShootersPage />} />
            <Route path="/matches/:id/scores" element={<ScoresPage />} />
            <Route path="/matches/:id/leaderboard" element={<LeaderboardPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </MatchProvider>
  )
}
