import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PlusCircle, Pencil, Trash2 } from 'lucide-react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Squad, Shooter, Match, Division } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const squadSchema = z.object({
  name: z.string().min(1, '必填'),
  sort_order: z.coerce.number().int().default(0),
})
type SquadFormData = z.infer<typeof squadSchema>

const autoAssignSchema = z.object({
  sort_by: z.enum(['registration', 'bib', 'division', 'random', 'region', 'club']),
  group_size: z.coerce.number().int().min(1).max(100),
  strategy: z.enum(['sequential', 'snake', 'division_balanced']),
  clear_existing: z.boolean().default(false),
})
type AutoAssignFormData = z.infer<typeof autoAssignSchema>

const addShooterSchema = z.object({
  shooter_id: z.coerce.number().int().positive('请选择射手'),
})
type AddShooterFormData = z.infer<typeof addShooterSchema>

export function SquadsPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [squads, setSquads] = useState<Squad[]>([])
  const [shooters, setShooters] = useState<Shooter[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [squadDialogOpen, setSquadDialogOpen] = useState(false)
  const [autoAssignDialogOpen, setAutoAssignDialogOpen] = useState(false)
  const [addShooterDialogOpen, setAddShooterDialogOpen] = useState(false)
  const [selectedSquadForAdd, setSelectedSquadForAdd] = useState<Squad | null>(null)
  const [editing, setEditing] = useState<Squad | null>(null)
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const squadForm = useForm<SquadFormData>({
    resolver: zodResolver(squadSchema) as Resolver<SquadFormData>,
    defaultValues: { sort_order: 0 },
  })

  const autoAssignForm = useForm<AutoAssignFormData>({
    resolver: zodResolver(autoAssignSchema) as Resolver<AutoAssignFormData>,
    defaultValues: { sort_by: 'registration', group_size: 10, strategy: 'sequential', clear_existing: false },
  })

  const addShooterForm = useForm<AddShooterFormData>({
    resolver: zodResolver(addShooterSchema) as Resolver<AddShooterFormData>,
  })

  async function load() {
    setLoading(true)
    try {
      const [squadsData, shootersData, divsData, match] = await Promise.all([
        api.get<Squad[]>(`/matches/${matchId}/squads`),
        api.get<Shooter[]>(`/matches/${matchId}/shooters`),
        api.get<Division[]>(`/matches/${matchId}/divisions`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setSquads(squadsData.sort((a, b) => a.sort_order - b.sort_order))
      setShooters(shootersData)
      setDivisions(divsData)
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [matchId])

  function openCreateSquad() {
    setEditing(null)
    squadForm.reset({ name: '', sort_order: 0 })
    setSquadDialogOpen(true)
  }

  function openEditSquad(s: Squad) {
    setEditing(s)
    squadForm.reset({ name: s.name, sort_order: s.sort_order })
    setSquadDialogOpen(true)
  }

  async function onSubmitSquad(data: SquadFormData) {
    try {
      if (editing) {
        await api.put(`/squads/${editing.id}`, data)
        toast({ title: '更新成功' })
      } else {
        await api.post(`/matches/${matchId}/squads`, data)
        toast({ title: '创建成功' })
      }
      setSquadDialogOpen(false)
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function handleDeleteSquad(id: number) {
    try {
      await api.delete(`/squads/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  async function onSubmitAutoAssign(data: AutoAssignFormData) {
    try {
      await api.post(`/matches/${matchId}/squads/auto-assign`, data)
      toast({ title: '自动编组成功' })
      setAutoAssignDialogOpen(false)
      void load()
    } catch (e) {
      toast({ title: '自动编组失败', description: String(e), variant: 'destructive' })
    }
  }

  async function handleRemoveShooter(squadId: number, shooterId: number) {
    try {
      await api.delete(`/squads/${squadId}/shooters/${shooterId}`)
      toast({ title: '移出成功' })
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function onSubmitAddShooter(data: AddShooterFormData) {
    try {
      if (!selectedSquadForAdd) return
      await api.post(`/squads/${selectedSquadForAdd.id}/shooters`, { shooter_id: data.shooter_id })
      toast({ title: '添加成功' })
      setAddShooterDialogOpen(false)
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  const unassignedShooters = shooters.filter(s => !s.squad_id)
  const getDivisionName = (divId: number) => divisions.find(d => d.id === divId)?.name ?? '-'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Squad 管理</h1>
        <div className="flex gap-2">
          <Button onClick={() => setAutoAssignDialogOpen(true)} variant="outline">
            自动编组
          </Button>
          <Button onClick={openCreateSquad}>
            <PlusCircle className="h-4 w-4 mr-2" />
            手动创建 Squad
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <>
          {/* Squads Grid */}
          {squads.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">暂无 Squad</div>
          ) : (
            <div className="grid gap-4 mb-6">
              {squads.map(squad => {
                const squadShooters = shooters.filter(s => s.squad_id === squad.id)
                return (
                  <Card key={squad.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CardTitle>{squad.name}</CardTitle>
                          <Badge variant="secondary">{squadShooters.length} 人</Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEditSquad(squad)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确认删除？</AlertDialogTitle>
                                <AlertDialogDescription>删除 Squad「{squad.name}」。</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void handleDeleteSquad(squad.id)} className="bg-destructive text-white hover:bg-destructive/90">删除</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {squadShooters.length === 0 ? (
                        <p className="text-sm text-muted-foreground">本组无射手</p>
                      ) : (
                        <>
                          {squadShooters.map((shooter, idx) => (
                            <div key={shooter.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                              <span>#{idx + 1} {shooter.bib_number} {shooter.name} {getDivisionName(shooter.division_id)}</span>
                              <Button variant="ghost" size="sm" onClick={() => void handleRemoveShooter(squad.id, shooter.id)}>
                                移出
                              </Button>
                            </div>
                          ))}
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSelectedSquadForAdd(squad)
                          addShooterForm.reset()
                          setAddShooterDialogOpen(true)
                        }}
                      >
                        + 添加射手到本组
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Unassigned Shooters */}
          {unassignedShooters.length > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">未编组射手 ({unassignedShooters.length} 人)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {unassignedShooters.map(shooter => (
                    <div key={shooter.id} className="flex items-center justify-between text-sm p-2 bg-white rounded border">
                      <span>{shooter.bib_number} {shooter.name} {getDivisionName(shooter.division_id)}</span>
                      <div>
                        <select
                          className="h-8 px-2 rounded text-sm border"
                          onChange={(e) => {
                            const squadId = Number(e.target.value)
                            if (squadId) {
                              void api.post(`/squads/${squadId}/shooters`, { shooter_id: shooter.id })
                                .then(() => {
                                  toast({ title: '添加成功' })
                                  void load()
                                })
                                .catch(err => toast({ title: '操作失败', description: String(err), variant: 'destructive' }))
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="">编入 ▼</option>
                          {squads.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Create/Edit Squad Dialog */}
      <Dialog open={squadDialogOpen} onOpenChange={setSquadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑 Squad' : '创建 Squad'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={squadForm.handleSubmit(onSubmitSquad)} className="space-y-4">
            <div className="space-y-1">
              <Label>Squad 名称</Label>
              <Input placeholder="e.g. Squad A" {...squadForm.register('name')} />
              {squadForm.formState.errors.name && <p className="text-xs text-destructive">{squadForm.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>排序</Label>
              <Input type="number" {...squadForm.register('sort_order')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSquadDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={squadForm.formState.isSubmitting}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Auto Assign Dialog */}
      <Dialog open={autoAssignDialogOpen} onOpenChange={setAutoAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>自动编组</DialogTitle>
          </DialogHeader>
          <form onSubmit={autoAssignForm.handleSubmit(onSubmitAutoAssign)} className="space-y-4">
            <div className="space-y-1">
              <Label>排序依据</Label>
              <Select
                value={autoAssignForm.watch('sort_by')}
                onValueChange={v => autoAssignForm.setValue('sort_by', v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="registration">报名顺序</SelectItem>
                  <SelectItem value="bib">BIB 号</SelectItem>
                  <SelectItem value="division">组别</SelectItem>
                  <SelectItem value="random">随机</SelectItem>
                  <SelectItem value="region">区域</SelectItem>
                  <SelectItem value="club">俱乐部</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>每组人数</Label>
              <Input type="number" min="1" max="100" {...autoAssignForm.register('group_size')} />
            </div>
            <div className="space-y-1">
              <Label>编组策略</Label>
              <Select
                value={autoAssignForm.watch('strategy')}
                onValueChange={v => autoAssignForm.setValue('strategy', v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">顺序切片</SelectItem>
                  <SelectItem value="snake">蛇形均衡</SelectItem>
                  <SelectItem value="division_balanced">组别均衡</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="clear_existing" {...autoAssignForm.register('clear_existing')} />
              <Label htmlFor="clear_existing" className="font-normal">清除已有编组重新分配</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAutoAssignDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={autoAssignForm.formState.isSubmitting}>开始编组</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Shooter Dialog */}
      <Dialog open={addShooterDialogOpen} onOpenChange={setAddShooterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加射手到 {selectedSquadForAdd?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={addShooterForm.handleSubmit(onSubmitAddShooter)} className="space-y-4">
            <div className="space-y-1">
              <Label>选择射手</Label>
              <Select
                value={addShooterForm.watch('shooter_id') ? String(addShooterForm.watch('shooter_id')) : ''}
                onValueChange={v => addShooterForm.setValue('shooter_id', Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择射手" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedShooters.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.bib_number} {s.name} {getDivisionName(s.division_id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addShooterForm.formState.errors.shooter_id && <p className="text-xs text-destructive">{addShooterForm.formState.errors.shooter_id.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddShooterDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={addShooterForm.formState.isSubmitting}>添加</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
