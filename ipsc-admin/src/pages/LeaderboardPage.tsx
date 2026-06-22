import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { LeaderboardEntry, LeaderboardResponse, Division, Stage, Match } from '@/types'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const medals = ['🥇', '🥈', '🥉'] as const
const categories = [
  { value: '', label: '全部类别' },
  { value: 'junior', label: 'J - Junior' },
  { value: 'senior', label: 'S - Senior' },
  { value: 'super_junior', label: 'SJ - Super Junior' },
  { value: 'lady', label: 'L - Lady' },
] as const

function LeaderboardTable({
  entries,
  selectedStage,
  stages,
}: {
  entries: LeaderboardEntry[]
  selectedStage: string
  stages: Stage[]
}) {
  if (entries.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">暂无数据</div>
  }

  const isStageMode = selectedStage !== ''
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const stageNameMap = useMemo(() => {
    const map = new Map<number, string>()
    stages.forEach((s) => map.set(s.id, s.name))
    return map
  }, [stages])

  function toggleRow(shooterId: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(shooterId)) {
        next.delete(shooterId)
      } else {
        next.add(shooterId)
      }
      return next
    })
  }

  const totalStages = stages.length

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">排名</TableHead>
          <TableHead>Bib</TableHead>
          <TableHead>姓名</TableHead>
          <TableHead>组别</TableHead>
          {isStageMode ? (
            <>
              <TableHead className="text-right">HF</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">原始得分</TableHead>
              <TableHead className="text-right">用时</TableHead>
            </>
          ) : (
            <>
              <TableHead>区域</TableHead>
              <TableHead>俱乐部</TableHead>
              <TableHead className="text-center">完成 Stage</TableHead>
              <TableHead className="text-right font-semibold">平均%</TableHead>
              <TableHead className="text-right">总用时</TableHead>
              <TableHead className="text-right">总得分</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e, idx) => {
          const rowRank = isStageMode ? (e.rank_in_stage ?? idx + 1) : (e.rank ?? idx + 1)
          const hasDetails = !isStageMode && e.stage_details && Object.keys(e.stage_details).length > 0
          const isExpanded = expandedRows.has(e.id)

          return (
            <>
              <TableRow key={e.id}>
                <TableCell className="text-center text-lg">
                  {!isStageMode && hasDetails ? (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground mr-1"
                      onClick={() => toggleRow(e.id)}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  ) : null}
                  {rowRank <= 3 ? medals[rowRank - 1] : <span className="text-muted-foreground text-sm">{rowRank}</span>}
                </TableCell>
                <TableCell className="font-mono">{e.bib_number}</TableCell>
                <TableCell>{e.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{e.division_name}</Badge>
                </TableCell>
                {isStageMode ? (
                  <>
                    <TableCell className="text-right font-mono">{Number(e.hit_factor ?? 0).toFixed(4)}</TableCell>
                    <TableCell className="text-right">{Number(e.percentage ?? 0).toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{Number(e.total_points ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{Number(e.total_time ?? 0).toFixed(2)}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>{e.region ?? '-'}</TableCell>
                    <TableCell>{e.club ?? '-'}</TableCell>
                    <TableCell className="text-center">{e.stages_shot ?? 0}/{totalStages}</TableCell>
                    <TableCell className="text-right font-semibold">{Number(e.avg_percentage ?? 0).toFixed(2)}%</TableCell>
                    <TableCell className="text-right text-muted-foreground">{Number(e.total_time ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(e.total_points ?? 0).toFixed(2)}</TableCell>
                  </>
                )}
              </TableRow>
              {!isStageMode && isExpanded && hasDetails ? (
                <TableRow>
                  <TableCell colSpan={10} className="bg-muted/40">
                    <div className="space-y-1 text-sm">
                      {Object.entries(e.stage_details ?? {})
                        .sort((a, b) => Number(a[0]) - Number(b[0]))
                        .map(([stageId, detail]) => {
                          const medal = detail.rank_in_stage <= 3 ? medals[detail.rank_in_stage - 1] : ''
                          return (
                            <div key={`${e.id}-${stageId}`} className="flex flex-wrap gap-3 items-center">
                              <span className="font-medium min-w-36">{stageNameMap.get(Number(stageId)) ?? `Stage ${stageId}`}</span>
                              <span>HF={detail.hit_factor.toFixed(4)}</span>
                              <span>{detail.percentage.toFixed(1)}%</span>
                              <span className="text-muted-foreground">{detail.total_points?.toFixed(2) ?? '-'} pts</span>
                              <span className="text-muted-foreground">{detail.total_time?.toFixed(2) ?? '-'}s</span>
                              <span>{medal}</span>
                            </div>
                          )
                        })}
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </>
          )
        })}
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
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedStage, setSelectedStage] = useState<string>('')
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()
  async function load() {
    try {
      const [divsData, stagesData, match] = await Promise.all([
        api.get<Division[]>(`/matches/${matchId}/divisions`),
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Match>(`/matches/${matchId}`),
      ])

      const sortedDivs = divsData.sort((a, b) => a.sort_order - b.sort_order)
      const sortedStages = stagesData.sort((a, b) => a.sort_order - b.sort_order)
      const effectiveDivision = selectedDivision
      const effectiveStage = selectedStage

      if (effectiveDivision && effectiveDivision !== selectedDivision) {
        setSelectedDivision(effectiveDivision)
      }
      if (effectiveStage && effectiveStage !== selectedStage) {
        setSelectedStage(effectiveStage)
      }

      const params = new URLSearchParams()
      if (effectiveDivision) params.set('division_id', effectiveDivision)
      if (selectedCategory) params.set('category', selectedCategory)
      if (effectiveStage) params.set('stage_id', effectiveStage)
      const qs = params.toString()
      const url = `/matches/${matchId}/leaderboard${qs ? `?${qs}` : ''}`

      const leaderboardResp = await api.get<LeaderboardResponse>(url)

      setRankings(leaderboardResp.rankings)
      setDivisions(sortedDivs)
      setStages(sortedStages)
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">积分榜</h1>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <>
          {/* Division Filter Row */}
          <div className="flex gap-1 flex-wrap mb-4">
            <Button
              variant={!selectedDivision ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDivision("")}
            >
              全部
            </Button>
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
            {categories.map(c => (
              <Button
                key={c.value || 'all-category'}
                variant={selectedCategory === c.value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedCategory(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {/* Stage Filter Row */}
          <div className="flex gap-1 flex-wrap mb-4">
            <Button
              variant={!selectedStage ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSelectedStage("")}
            >
              全部
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
          <LeaderboardTable entries={rankings} selectedStage={selectedStage} stages={stages} />
        </>
      )}
    </div>
  )
}
