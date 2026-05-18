import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Trash2 } from 'lucide-react'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Score, Shooter, Stage, Squad, Match } from '@/types'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ScoreMatrix {
  shooter: Shooter
  stageScores: Record<number, Score | undefined>
  totalPoints: number
}

export function ScoresPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [scores, setScores] = useState<Score[]>([])
  const [shooters, setShooters] = useState<Shooter[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [squads, setSquads] = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSquad, setFilterSquad] = useState<string>('all')
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  async function load() {
    setLoading(true)
    try {
      const url = filterSquad !== 'all'
        ? `/matches/${matchId}/shooters?squad_id=${filterSquad}`
        : `/matches/${matchId}/shooters`
      const [scoresData, shootersData, stagesData, squadsData, match] = await Promise.all([
        api.get<Score[]>(`/matches/${matchId}/scores`),
        api.get<Shooter[]>(url),
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Squad[]>(`/matches/${matchId}/squads`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setScores(scoresData)
      setShooters(shootersData)
      setStages(stagesData)
      setSquads(squadsData)
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [matchId, filterSquad])

  async function handleConfirm(id: number) {
    try {
      await api.put(`/scores/${id}/confirm`, {})
      toast({ title: '成绩已确认' })
      void load()
    } catch (e) {
      toast({ title: '确认失败', description: String(e), variant: 'destructive' })
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/scores/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  function openScoreCard(shooterId: number, stageId: number) {
    navigate(`/matches/${matchId}/score-card?shooter_id=${shooterId}&stage_id=${stageId}`)
  }

  // Build matrix
  const matrix: ScoreMatrix[] = shooters.map(shooter => {
    const stageScores: Record<number, Score | undefined> = {}
    stages.forEach(stage => {
      stageScores[stage.id] = scores.find(sc => sc.shooter_id === shooter.id && sc.stage_id === stage.id)
    })
    const totalPoints = Object.values(stageScores).reduce((sum, sc) => sum + (sc?.total_points ?? 0), 0)
    return { shooter, stageScores, totalPoints }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">成绩查看</h1>
        <Button variant="outline" onClick={() => navigate(`/matches/${matchId}/score-card`)}>
          打开评分卡
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Label className="shrink-0">按 Squad 筛选</Label>
        <Select value={filterSquad} onValueChange={setFilterSquad}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="全部" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {squads.map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : matrix.length === 0 || stages.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">暂无数据</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">Bib</TableHead>
                <TableHead className="sticky left-12 bg-background">姓名</TableHead>
                <TableHead>Squad</TableHead>
                {stages.map(st => (
                  <TableHead key={st.id} className="text-center min-w-[110px]">{st.name}</TableHead>
                ))}
                <TableHead className="text-right font-semibold">总分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map(({ shooter, stageScores, totalPoints }) => (
                <TableRow key={shooter.id}>
                  <TableCell className="sticky left-0 bg-background font-mono">{shooter.bib_number}</TableCell>
                  <TableCell className="sticky left-12 bg-background">{shooter.name}</TableCell>
                  <TableCell>{shooter.squad_name}</TableCell>
                  {stages.map(st => {
                    const sc = stageScores[st.id]
                    return (
                      <TableCell
                        key={st.id}
                        className="text-center cursor-pointer"
                        onClick={() => openScoreCard(shooter.id, st.id)}
                      >
                        {sc ? (
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium">{sc.hit_factor.toFixed(4)}</div>
                            <div className="text-xs text-muted-foreground">{sc.total_time.toFixed(2)}s</div>
                            <div className="flex items-center justify-center gap-1">
                              {sc.confirmed ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    title="确认"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleConfirm(sc.id)
                                    }}
                                  >
                                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-destructive"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>删除成绩？</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {shooter.name} / {st.name}
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>取消</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => void handleDelete(sc.id)} className="bg-destructive text-white hover:bg-destructive/90">删除</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">录入</span>
                        )}
                      </TableCell>
                    )
                  })}
                  <TableCell className="text-right font-bold">{totalPoints.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
