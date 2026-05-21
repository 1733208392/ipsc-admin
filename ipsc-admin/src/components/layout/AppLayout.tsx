import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'

export function AppLayout() {
  const location = useLocation()
  const isLivestreamRoute = location.pathname.includes('/leaderboard-live')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar collapsed={isLivestreamRoute} />
      <main className={isLivestreamRoute ? 'flex-1 overflow-y-auto' : 'flex-1 overflow-y-auto p-6'}>
        <Outlet />
      </main>
    </div>
  )
}
