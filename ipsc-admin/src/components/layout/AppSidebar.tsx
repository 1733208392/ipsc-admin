import { NavLink, useParams } from 'react-router-dom'
import { Target, List, Users, Layers, Group, Trophy, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMatch } from '@/hooks/useMatch'
import { Separator } from '@/components/ui/separator'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
    isActive && 'bg-accent text-accent-foreground font-medium'
  )

export function AppSidebar() {
  const { id } = useParams<{ id: string }>()
  const { currentMatch } = useMatch()
  const matchId = id ?? currentMatch?.id

  return (
    <aside className="w-56 shrink-0 border-r bg-sidebar h-screen flex flex-col">
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <Target className="h-5 w-5 text-primary" />
        <span className="font-bold text-base">IPSC 管理</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        <NavLink to="/" className={navLinkClass} end>
          <List className="h-4 w-4" />
          赛事列表
        </NavLink>

        {matchId && (
          <>
            <Separator className="my-2" />
            <p className="px-3 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">
              {currentMatch?.name ?? `赛事 #${matchId}`}
            </p>

            <NavLink to={`/matches/${matchId}/divisions`} className={navLinkClass}>
              <Layers className="h-4 w-4" />
              组别
            </NavLink>

            <NavLink to={`/matches/${matchId}/stages`} className={navLinkClass}>
              <ClipboardList className="h-4 w-4" />
              Stage
            </NavLink>

            <NavLink to={`/matches/${matchId}/squads`} className={navLinkClass}>
              <Group className="h-4 w-4" />
              Squad
            </NavLink>

            <NavLink to={`/matches/${matchId}/shooters`} className={navLinkClass}>
              <Users className="h-4 w-4" />
              射手
            </NavLink>

            <NavLink to={`/matches/${matchId}/scores`} className={navLinkClass}>
              <ClipboardList className="h-4 w-4" />
              成绩
            </NavLink>

            <NavLink to={`/matches/${matchId}/leaderboard`} className={navLinkClass}>
              <Trophy className="h-4 w-4" />
              积分榜
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  )
}
