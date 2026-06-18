import { NavLink, useParams } from 'react-router-dom'
import { Target, List, Users, Layers, Group, Trophy, ClipboardList, LogOut, Building2, UserCog, Shield, FileText, FileCheck, Activity, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMatch } from '@/hooks/useMatch'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
    isActive && 'bg-accent text-accent-foreground font-medium'
  )

export function AppSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { id } = useParams<{ id: string }>()
  const { currentMatch } = useMatch()
  const { user, logout } = useAuth()
  const matchId = id ?? currentMatch?.id

  return (
    <aside className={cn('shrink-0 border-r bg-sidebar h-screen flex flex-col transition-all duration-200', collapsed ? 'w-16' : 'w-56')}>
      <div className={cn('flex items-center px-4 py-4 border-b', collapsed ? 'justify-center' : 'gap-2')}>
        <Target className="h-5 w-5 text-primary" />
        {!collapsed ? <span className="font-bold text-base">IPSC 管理</span> : null}
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {user?.role === 'super_admin' ? (
          <>
            {!collapsed ? (
              <p className="px-3 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wide">平台管理</p>
            ) : null}
            <NavLink to="/admin/clubs" className={navLinkClass}>
              <Building2 className="h-4 w-4" />
              {!collapsed ? '俱乐部管理' : null}
            </NavLink>
            <NavLink to="/admin/users" className={navLinkClass}>
              <UserCog className="h-4 w-4" />
              {!collapsed ? '用户管理' : null}
            </NavLink>
            <NavLink to="/admin/matches" className={navLinkClass}>
              <Shield className="h-4 w-4" />
              {!collapsed ? '全平台赛事' : null}
            </NavLink>
            <Separator className="my-2" />
          </>
        ) : null}

        <NavLink to="/" className={navLinkClass} end>
          <List className="h-4 w-4" />
          {!collapsed ? '赛事列表' : null}
        </NavLink>

        {matchId && (
          <>
            <Separator className="my-2" />
            {!collapsed ? (
              <p className="px-3 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">
                {currentMatch?.name ?? `赛事 #${matchId}`}
              </p>
            ) : null}

            <NavLink to={`/matches/${matchId}/divisions`} className={navLinkClass}>
              <Layers className="h-4 w-4" />
              {!collapsed ? '组别' : null}
            </NavLink>

            <NavLink to={`/matches/${matchId}/stages`} className={navLinkClass}>
              <Target className="h-4 w-4" />
              {!collapsed ? 'Stage' : null}
            </NavLink>

            <NavLink to={`/matches/${matchId}/squads`} className={navLinkClass}>
              <Group className="h-4 w-4" />
              {!collapsed ? 'Squad' : null}
            </NavLink>

            <NavLink to={`/matches/${matchId}/shooters`} className={navLinkClass}>
              <Users className="h-4 w-4" />
              {!collapsed ? '射手' : null}
            </NavLink>

            <NavLink to={`/matches/${matchId}/scores`} className={navLinkClass}>
              <FileText className="h-4 w-4" />
              {!collapsed ? '成绩' : null}
            </NavLink>

            <NavLink to={`/matches/${matchId}/score-card`} className={navLinkClass}>
              <FileCheck className="h-4 w-4" />
              {!collapsed ? '评分卡' : null}
            </NavLink>

            <NavLink to={`/matches/${matchId}/leaderboard`} className={navLinkClass}>
              <Trophy className="h-4 w-4" />
              {!collapsed ? '积分榜' : null}
            </NavLink>

            <NavLink to={`/matches/${matchId}/score-card-live`} className={navLinkClass}>
              <Activity className='h-4 w-4' />
              {!collapsed ? '实时成绩' : null}
            </NavLink>
            <NavLink to={`/matches/${matchId}/leaderboard-live`} className={navLinkClass}>
              <Radio className="h-4 w-4" />
              {!collapsed ? '直播榜' : null}
            </NavLink>
          </>
        )}
      </nav>

      <div className="p-2 border-t">
        <button
          type="button"
          className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => void logout()}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed ? '退出登录' : null}
        </button>
      </div>
    </aside>
  )
}
