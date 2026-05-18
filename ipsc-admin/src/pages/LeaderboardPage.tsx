import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { LeaderboardEntry, Division, Match } from '@/types'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const medals = ['🥇', '🥈', '🥉']

function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">暂无数据</div>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">排名</TableHead>
          <TableHead>Bib</TableHead>
          <TableHead>姓名</TableHead>
          <TableHead>组别</TableHead>
          <TableHead className="text-center">完成 Stage</TableHead>
          <TableHead className="text-right font-semibold">总积分</TableHead>
          <TableHead className="text-right">平均 HF</TableHead>
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
            <TableCell className="text-center">{e.stages_shot}</TableCell>
            <TableCell className="text-right font-bold">{Number(e.total_points).toFixed(2)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{Number(e.avg_hit_factor).toFixed(4)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function LeaderboardPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [overall, setOverall] = useState<LeaderboardEntry[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [divData, setDivData] = useState<Record<number, LeaderboardEntry[]>>({})
  const [loading, setLoading] = useState(true)
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const [overallData, divsData, match] = await Promise.all([
        api.get<LeaderboardEntry[]>(`/matches/${matchId}/leaderboard`),
        api.get<Division[]>(`/matches/${matchId}/divisions`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setOverall(overallData)
      setDivisions(divsData)
      setCurrentMatch(match)

      // Load per-division data
      const divResults = await Promise.all(
        divsData.map(d => api.get<LeaderboardEntry[]>(`/matches/${matchId}/leaderboard?division_id=${d.id}`))
      )
      const divMap: Record<number, LeaderboardEntry[]> = {}
      divsData.forEach((d, i) => { divMap[d.id] = divResults[i] ?? [] })
      setDivData(divMap)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    intervalRef.current = setInterval(() => void load(), 10000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [matchId])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">积分榜</h1>
        <span className="text-xs text-muted-foreground">每 10 秒自动刷新</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <Tabs defaultValue="overall">
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="overall">Overall</TabsTrigger>
            {divisions.map(d => (
              <TabsTrigger key={d.id} value={String(d.id)}>{d.name}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overall">
            <LeaderboardTable entries={overall} />
          </TabsContent>
          {divisions.map(d => (
            <TabsContent key={d.id} value={String(d.id)}>
              <LeaderboardTable entries={divData[d.id] ?? []} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
