import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const location = useLocation()
  const isLivestreamRoute = location.pathname.includes('/leaderboard-live')
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement))
  const [collapsed, setCollapsed] = useState(false)

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
      {shouldHideSidebar ? null : (
        <>
          <AppSidebar collapsed={collapsed} />
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? '展开菜单' : '收起菜单'}
            className={cn(
              'fixed top-3 z-50 flex h-8 w-8 items-center justify-center rounded-full',
              'border border-zinc-300 bg-zinc-50 text-zinc-600 shadow-sm',
              'transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-900',
              collapsed ? 'left-[52px]' : 'left-[210px]'
            )}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </>
      )}
      <main className={isLivestreamRoute ? 'flex-1 overflow-y-auto' : 'flex-1 overflow-y-auto p-6'}>
        <Outlet />
      </main>
    </div>
  )
}
