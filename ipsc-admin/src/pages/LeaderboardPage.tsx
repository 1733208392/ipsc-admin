import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { LeaderboardEntry, LeaderboardResponse, Division, Stage, Match } from '@/types'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const medals = ['🥇', '🥈', '🥉']

const CATEGORY_LABELS: Record<string, string> = {
  all: '全部',
  junior: '青少年',
  senior: '老年',
  super_senior: '超级老年',
  lady: '女子',
}

function LeaderboardTable({ entries, selectedStage }: { entries: LeaderboardEntry[]; selectedStage: string }) {
  if (entries.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">暂无数据</div>
  }

  const isStageMode = selectedStage !== 'all'

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">排名</TableHead>
          <TableHead>Bib</TableHead>
          <TableHead>姓名</TableHead>
          <TableHead>组别</TableHead>
          <TableHead>区域</TableHead>
          <TableHead>俱乐部</TableHead>
          {isStageMode ? (
            <>
              <TableHead className="text-right">HF</TableHead>
              <TableHead className="text-right">得分</TableHead>
              <TableHead className="text-right">用时</TableHead>
              <TableHead className="text-center">A</TableHead>
              <TableHead className="text-center">C</TableHead>
              <TableHead className="text-center">D</TableHead>
              <TableHead className="text-center">M</TableHead>
              <TableHead className="text-center">N</TableHead>
              <TableHead className="text-center">PE</TableHead>
            </>
          ) : (
            <>
              <TableHead className="text-center">完成 Stage</TableHead>
              <TableHead className="text-right font-semibold">总积分</TableHead>
              <TableHead className="text-right">平均 HF</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e, idx) => (
          <TableRow key={e.id}>
            <TableCell className="text-center text-lg">
              {idx < 3 ? medals[idx] : <span className="text-muted-foreground text-sm">{idx + 1}</span>}
            </TableCell>
            <TableCell className="font-mono">{e.bib_number}</TableCell>
            <TableCell>{e.name}</TableCell>
            <TableCell>
              <Badge variant="outline">{e.division_name}</Badge>
            </TableCell>
            <TableCell>{e.region ?? '-'}</TableCell>
            <TableCell>{e.club ?? '-'}</TableCell>
            {isStageMode ? (
              <>
                <TableCell className="text-right">{Number(e.stage_hit_factor ?? 0).toFixed(4)}</TableCell>
                <TableCell className="text-right font-bold">{Number(e.stage_points ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{Number(e.stage_time ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-center">{e.a_hits ?? 0}</TableCell>
                <TableCell className="text-center">{e.c_hits ?? 0}</TableCell>
                <TableCell className="text-center">{e.d_hits ?? 0}</TableCell>
                <TableCell className="text-center">{e.m_hits ?? 0}</TableCell>
                <TableCell className="text-center">{e.n_hits ?? 0}</TableCell>
                <TableCell className="text-center">{e.pe ?? 0}</TableCell>
              </>
            ) : (
              <>
                <TableCell className="text-center">{e.stages_shot}</TableCell>
                <TableCell className="text-right font-bold">{Number(e.total_points).toFixed(2)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{Number(e.avg_hit_factor).toFixed(4)}</TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function LeaderboardPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDivision, setSelectedDivision] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStage, setSelectedStage] = useState<string>('all')
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const params = new URLSearchParams()
      if (selectedDivision && selectedDivision !== '') params.set('division_id', selectedDivision)
      if (selectedCategory !== 'all') params.set('category', selectedCategory)
      if (selectedStage !== 'all') params.set('stage_id', selectedStage)
      const qs = params.toString()
      const url = `/matches/${matchId}/leaderboard${qs ? `?${qs}` : ''}`

      const [leaderboardResp, divsData, stagesData, match] = await Promise.all([
        api.get<LeaderboardResponse>(url),
        api.get<Division[]>(`/matches/${matchId}/divisions`),
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Match>(`/matches/${matchId}`),
      ])

      setRankings(leaderboardResp.rankings)
      const sortedDivs = divsData.sort((a, b) => a.sort_order - b.sort_order)
      setDivisions(sortedDivs)
      // Set default to first division if not already set
      if (!selectedDivision && sortedDivs.length > 0) {
        setSelectedDivision(String(sortedDivs[0].id))
      }
      setStages(stagesData.sort((a, b) => a.sort_order - b.sort_order))
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void load()
  }, [selectedDivision, selectedCategory, selectedStage, matchId])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setLoading(true)
      void load()
    }, 10000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [selectedDivision, selectedCategory, selectedStage, matchId])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">积分榜</h1>
        <span className="text-xs text-muted-foreground">每 10 秒自动刷新</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <>
          {/* Division Filter Row */}
          <div className="flex gap-1 flex-wrap mb-4">
            {divisions.map(d => (
              <Button
                key={d.id}
                variant={selectedDivision === String(d.id) ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDivision(String(d.id))}
              >
                {d.name}
              </Button>
            ))}
          </div>

          {/* Category Filter Row */}
          <div className="flex gap-1 flex-wrap mb-4">
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <Button
                key={value}
                variant={selectedCategory === value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedCategory(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Stage Filter Row */}
          <div className="flex gap-1 flex-wrap mb-4">
            <Button
              variant={selectedStage === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedStage('all')}
            >
              总成绩
            </Button>
            {stages.map(s => (
              <Button
                key={s.id}
                variant={selectedStage === String(s.id) ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedStage(String(s.id))}
              >
                {s.name}
              </Button>
            ))}
          </div>

          {/* Leaderboard Table */}
          <LeaderboardTable entries={rankings} selectedStage={selectedStage} />
        </>
      )}
    </div>
  )
}
