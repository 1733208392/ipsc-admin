import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'

export function AppLayout() {
  const location = useLocation()
  const isLivestreamRoute = location.pathname.includes('/leaderboard-live')
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  const shouldHideSidebar = isLivestreamRoute && isFullscreen

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {shouldHideSidebar ? null : <AppSidebar collapsed={isLivestreamRoute} />}
      <main className={isLivestreamRoute ? 'flex-1 overflow-y-auto' : 'flex-1 overflow-y-auto p-6'}>
        <Outlet />
      </main>
    </div>
  )
}
