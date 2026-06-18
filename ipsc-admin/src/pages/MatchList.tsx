import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, Calendar, Layers, Users, ClipboardList, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Match, Stage, Squad } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const schema = z.object({
  name: z.string().min(1, '必填'),
  date: z.string().min(1, '必填'),
})
type FormData = z.infer<typeof schema>

function statusBadge(status: Match['status']) {
  if (status === 'active') return <Badge variant="success">进行中</Badge>
  if (status === 'completed') return <Badge variant="info">已结束</Badge>
  return <Badge variant="secondary">草稿</Badge>
}

export function MatchList() {
  const [matches, setMatches] = useState<Match[]>([])
  const [matchStages, setMatchStages] = useState<Stage[]>([])
  const [matchSquads, setMatchSquads] = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Match | null>(null)
  const [deleting, setDeleting] = useState<Match | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [managingResources, setManagingResources] = useState(false)
  const [stageName, setStageName] = useState('')
  const [stageSortOrder, setStageSortOrder] = useState(0)
  const [squadName, setSquadName] = useState('')
  const [squadSortOrder, setSquadSortOrder] = useState(0)
  const [creatingStage, setCreatingStage] = useState(false)
  const [creatingSquad, setCreatingSquad] = useState(false)
  const [removingStageId, setRemovingStageId] = useState<number | null>(null)
  const [removingSquadId, setRemovingSquadId] = useState<number | null>(null)
  const [activeSquadId, setActiveSquadId] = useState<Record<number, number | null>>({})
  const { setCurrentMatch } = useMatch()
  const navigate = useNavigate()
  const { toast } = useToast()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<Match[]>('/matches')
      setMatches(data)
    const squadMap: Record<number, number | null> = {}
    for (const m of data) {
      if (m.active_squad_id !== undefined && m.active_squad_id !== null) {
        squadMap[m.id] = m.active_squad_id
      }
    }
    setActiveSquadId(squadMap)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function loadMatchResources(matchId: number) {
    setManagingResources(true)
    try {
      const [stagesData, squadsData] = await Promise.all([
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Squad[]>(`/matches/${matchId}/squads`),
      ])
      setMatchStages(stagesData.sort((a, b) => a.sort_order - b.sort_order))
      setMatchSquads(squadsData.sort((a, b) => a.sort_order - b.sort_order))
    } catch (e) {
      toast({ title: '加载 Stage/Squad 失败', description: String(e), variant: 'destructive' })
    } finally {
      setManagingResources(false)
    }
  }

  async function refreshMatchSummary(matchId: number) {
    try {
      const updated = await api.get<Match>(`/matches/${matchId}`)
      setMatches((prev) => prev.map((item) => (item.id === matchId ? updated : item)))
      if (editing?.id === matchId) {
        setEditing(updated)
      }
    } catch {
      // Keep UI usable even if summary refresh fails.
    }
  }

  function openCreate() {
    setEditing(null)
    setMatchStages([])
    setMatchSquads([])
    setStageName('')
    setSquadName('')
    setStageSortOrder(0)
    setSquadSortOrder(0)
    reset({ name: '', date: '' })
    setOpen(true)
  }

  function openEdit(m: Match) {
    setEditing(m)
    reset({ name: m.name, date: m.date })
    setOpen(true)
    void loadMatchResources(m.id)
  }

  async function onSubmit(data: FormData) {
    try {
      if (editing) {
        const updated = await api.put<Match>(`/matches/${editing.id}`, data)
        setMatches((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
        setEditing(updated)
        toast({ title: '更新成功' })
      } else {
        await api.post<Match>('/matches', data)
        toast({ title: '创建成功' })
        void load()
      }
      if (!editing) {
        setOpen(false)
      }
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function handleAddStage() {
    if (!editing) return
    const name = stageName.trim()
    if (!name) {
      toast({ title: '请输入 Stage 名称', variant: 'destructive' })
      return
    }

    setCreatingStage(true)
    try {
      await api.post(`/matches/${editing.id}/stages`, {
        name,
        min_rounds: 0,
        stage_points: 0,
        targets_count: 0,
        poppers_plates_count: 0,
        briefing_text: '',
        sort_order: stageSortOrder,
      })
      setStageName('')
      setStageSortOrder(0)
      await loadMatchResources(editing.id)
      await refreshMatchSummary(editing.id)
      toast({ title: 'Stage 已添加' })
    } catch (e) {
      toast({ title: '添加 Stage 失败', description: String(e), variant: 'destructive' })
    } finally {
      setCreatingStage(false)
    }
  }

  async function handleRemoveStage(stageId: number) {
    if (!editing) return
    setRemovingStageId(stageId)
    try {
      await api.delete(`/matches/${editing.id}/stages/${stageId}`)
      await loadMatchResources(editing.id)
      await refreshMatchSummary(editing.id)
      toast({ title: 'Stage 已移除' })
    } catch (e) {
      toast({ title: '移除 Stage 失败', description: String(e), variant: 'destructive' })
    } finally {
      setRemovingStageId(null)
    }
  }

  async function handleAddSquad() {
    if (!editing) return
    const name = squadName.trim()
    if (!name) {
      toast({ title: '请输入 Squad 名称', variant: 'destructive' })
      return
    }

    setCreatingSquad(true)
    try {
      await api.post(`/matches/${editing.id}/squads`, {
        name,
        sort_order: squadSortOrder,
      })
      setSquadName('')
      setSquadSortOrder(0)
      await loadMatchResources(editing.id)
      await refreshMatchSummary(editing.id)
      toast({ title: 'Squad 已添加' })
    } catch (e) {
      toast({ title: '添加 Squad 失败', description: String(e), variant: 'destructive' })
    } finally {
      setCreatingSquad(false)
    }
  }

  async function handleRemoveSquad(squadId: number) {
    if (!editing) return
    setRemovingSquadId(squadId)
    try {
      await api.delete(`/matches/${editing.id}/squads/${squadId}`)
      await loadMatchResources(editing.id)
      await refreshMatchSummary(editing.id)
      toast({ title: 'Squad 已移除' })
    } catch (e) {
      toast({ title: '移除 Squad 失败', description: String(e), variant: 'destructive' })
    } finally {
      setRemovingSquadId(null)
    }
  }

  async function onChangeStatus(match: Match, status: Match['status']) {
    if (match.status === status) return

    setUpdatingId(match.id)
    try {
      await api.patch(`/matches/${match.id}/status`, { status })
      setMatches((prev) =>
        prev.map((item) => (item.id === match.id ? { ...item, status } : item))
      )
      toast({ title: '状态已更新' })
    } catch (e) {
      toast({ title: '更新状态失败', description: String(e), variant: 'destructive' })
    } finally {
      setUpdatingId(null)
    }
  }

  async function onChangeActiveSquad(matchId: number, squadId: string) {
    try {
      const sid = squadId === 'none' ? null : Number(squadId)
      await api.patch(`/matches/${matchId}/active-squad`, { active_squad_id: sid })
      setActiveSquadId((prev) => ({ ...prev, [matchId]: sid }))
      toast({ title: sid ? '活动小组已设置' : '活动小组已清除' })
    } catch (e) {
      toast({ title: '设置失败', description: String(e), variant: 'destructive' })
    }
  }

  async function onDeleteMatch() {
    if (!deleting) return

    setDeletingId(deleting.id)
    try {
      await api.delete(`/matches/${deleting.id}`)
      setMatches((prev) => prev.filter((item) => item.id !== deleting.id))
      toast({ title: '赛事已删除' })
      if (editing?.id === deleting.id) {
        setOpen(false)
        setEditing(null)
      }
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    } finally {
      setDeletingId(null)
      setDeleting(null)
    }
  }

  function handleCardClick(m: Match) {
    setCurrentMatch(m)
    navigate(`/matches/${m.id}/divisions`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">赛事列表</h1>
        <Button onClick={openCreate}>
          <PlusCircle className="h-4 w-4 mr-2" />
          创建赛事
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">暂无赛事，点击右上角创建</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map(m => (
            <Card
              key={m.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleCardClick(m)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{m.name}</CardTitle>
                  {statusBadge(m.status)}
                </div>
                <CardDescription className="flex items-center gap-1 text-xs">
                  <Calendar className="h-3 w-3" />
                  {m.date}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Layers className="h-3 w-3" />{m.divisions_count ?? 0} 组别</span>
                  <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{m.stages_count ?? 0} Stage</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{m.squads_count ?? 0} Squad</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={e => { e.stopPropagation(); openEdit(m) }}
                >
                  编辑
                </Button>
                <div className="mt-2 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
                  <Select
                    value={m.status}
                    onValueChange={(value: Match['status']) => { void onChangeStatus(m, value) }}
                    disabled={updatingId === m.id}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="active">进行中</SelectItem>
                      <SelectItem value="completed">已结束</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    onClick={() => setDeleting(m)}
                    disabled={deletingId === m.id}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑赛事' : '创建赛事'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>赛事名称</Label>
              <Input placeholder="e.g. 2026 全国 IPSC 联赛" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>日期</Label>
              <Input type="date" {...register('date')} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button type="submit" disabled={isSubmitting}>保存</Button>
            </DialogFooter>
          </form>

          {editing ? (
            <div className="space-y-6 pt-2 border-t">
              <div>
                <p className="text-sm font-medium mb-3">Stage 管理</p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2 mb-3">
                  <Input
                    placeholder="新增 Stage 名称"
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="排序"
                    value={String(stageSortOrder)}
                    onChange={(e) => setStageSortOrder(Number(e.target.value) || 0)}
                  />
                  <Button type="button" onClick={() => { void handleAddStage() }} disabled={creatingStage}>
                    添加 Stage
                  </Button>
                </div>

                {managingResources ? (
                  <p className="text-xs text-muted-foreground">加载中...</p>
                ) : matchStages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">当前赛事还没有 Stage</p>
                ) : (
                  <div className="space-y-2">
                    {matchStages.map((stage) => (
                      <div key={stage.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{stage.name}</p>
                          <p className="text-xs text-muted-foreground">排序: {stage.sort_order}</p>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => { void handleRemoveStage(stage.id) }}
                          disabled={removingStageId === stage.id}
                        >
                          移除
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-3">当前活动小组</p>
                <p className="text-xs text-muted-foreground mb-2">iOS 成绩提交时将自动归入此小组</p>
                <Select
                  value={String(activeSquadId[editing.id] ?? 'none')}
                  onValueChange={(v) => { void onChangeActiveSquad(editing.id, v) }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择活动小组" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未设置</SelectItem>
                    {matchSquads.map((sq) => (
                      <SelectItem key={sq.id} value={String(sq.id)}>{sq.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-sm font-medium mb-3">Squad 管理</p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2 mb-3">
                  <Input
                    placeholder="新增 Squad 名称"
                    value={squadName}
                    onChange={(e) => setSquadName(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="排序"
                    value={String(squadSortOrder)}
                    onChange={(e) => setSquadSortOrder(Number(e.target.value) || 0)}
                  />
                  <Button type="button" onClick={() => { void handleAddSquad() }} disabled={creatingSquad}>
                    添加 Squad
                  </Button>
                </div>

                {managingResources ? (
                  <p className="text-xs text-muted-foreground">加载中...</p>
                ) : matchSquads.length === 0 ? (
                  <p className="text-xs text-muted-foreground">当前赛事还没有 Squad</p>
                ) : (
                  <div className="space-y-2">
                    {matchSquads.map((squad) => (
                      <div key={squad.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{squad.name}</p>
                          <p className="text-xs text-muted-foreground">排序: {squad.sort_order}</p>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => { void handleRemoveSquad(squad.id) }}
                          disabled={removingSquadId === squad.id}
                        >
                          移除
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground border-t pt-3">
              创建赛事后，可在此直接管理 Stage 和 Squad。
            </p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(next) => { if (!next) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除赛事？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `将永久删除「${deleting.name}」及其关联数据（组别、Stage、Squad、射手和成绩）。此操作不可撤销。`
                : '此操作不可撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void onDeleteMatch()
              }}
              disabled={deletingId !== null}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
