import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, Trash2 } from 'lucide-react'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { DrillReplaySummary, Shooter, Stage, Match } from '@/types'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '-'
  return `${seconds.toFixed(2)}s`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function DrillReplaysPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [replays, setReplays] = useState<DrillReplaySummary[]>([])
  const [shooters, setShooters] = useState<Shooter[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [filterShooter, setFilterShooter] = useState<string>('all')
  const [filterStage, setFilterStage] = useState<string>('all')
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  async function load() {
    if (!matchId) return
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filterShooter !== 'all') qs.set('shooter_id', filterShooter)
      if (filterStage !== 'all') qs.set('stage_id', filterStage)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''

      const [replaysData, shootersData, stagesData, match] = await Promise.all([
        api.get<DrillReplaySummary[]>(`/matches/${matchId}/drill-replays${suffix}`),
        api.get<Shooter[]>(`/matches/${matchId}/shooters`),
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setReplays(replaysData)
      setShooters(shootersData)
      setStages(stagesData)
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, filterShooter, filterStage])

  async function handleDelete(id: number) {
    try {
      await api.delete(`/drill-replays/${id}`)
      toast({ title: '已删除' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">回放数据 / Drill Replays</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <Label className="text-xs text-muted-foreground">射手</Label>
          <Select value={filterShooter} onValueChange={setFilterShooter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部射手</SelectItem>
              {shooters.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.bib_number ? `#${s.bib_number} ` : ''}
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Stage</Label>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 Stage</SelectItem>
              {stages.map((st) => (
                <SelectItem key={st.id} value={String(st.id)}>
                  {st.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>射手</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Drill</TableHead>
              <TableHead className="text-right">枪数</TableHead>
              <TableHead className="text-right">总时间</TableHead>
              <TableHead className="text-right">分数</TableHead>
              <TableHead>上传时间</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  加载中...
                </TableCell>
              </TableRow>
            ) : replays.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              replays.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.shooter_name ?? `#${r.shooter_id}`}</TableCell>
                  <TableCell>{r.stage_name ?? `Stage ${r.stage_id}`}</TableCell>
                  <TableCell>{r.drill_name ?? '-'}</TableCell>
                  <TableCell className="text-right">{r.num_shots}</TableCell>
                  <TableCell className="text-right">{formatTime(r.total_time)}</TableCell>
                  <TableCell className="text-right">{r.score ?? '-'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(r.created_at)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/matches/${matchId}/drill-replays/${r.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" /> 查看
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除回放？</AlertDialogTitle>
                          <AlertDialogDescription>
                            此操作不可恢复。射手 {r.shooter_name ?? r.shooter_id} 在{' '}
                            {r.stage_name ?? `Stage ${r.stage_id}`} 的回放将被永久删除。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void handleDelete(r.id)}>
                            删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
