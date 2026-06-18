import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Pencil, Trash2, PlusCircle } from 'lucide-react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Division, SubDivision, Match } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

const divisionSchema = z.object({
  name: z.string().min(1, '必填'),
  sort_order: z.coerce.number().int().default(0),
})
type DivisionFormData = z.infer<typeof divisionSchema>

const subDivisionSchema = z.object({
  name: z.string().min(1, '必填'),
  min_age: z.coerce.number().int().min(0).optional(),
  max_age: z.coerce.number().int().min(0).optional(),
  gender: z.enum(['male', 'female']).optional(),
  sort_order: z.coerce.number().int().default(0),
})
type SubDivisionFormData = z.infer<typeof subDivisionSchema>

export function DivisionsPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [divisions, setDivisions] = useState<Division[]>([])
  const [subDivisions, setSubDivisions] = useState<SubDivision[]>([])
  const [loading, setLoading] = useState(true)
  const [openDivision, setOpenDivision] = useState(false)
  const [openSubDivision, setOpenSubDivision] = useState(false)
  const [editingDivision, setEditingDivision] = useState<Division | null>(null)
  const [editingSubDivision, setEditingSubDivision] = useState<SubDivision | null>(null)
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const { register: registerDivision, handleSubmit: handleDivisionSubmit, reset: resetDivision, setValue: setDivisionValue, watch: watchDivision, formState: { errors: divisionErrors, isSubmitting: divisionSubmitting } } = useForm<DivisionFormData & { code?: string; power_factor?: string }>({
    resolver: zodResolver(divisionSchema) as any,
    defaultValues: { sort_order: 0, code: '', power_factor: 'major' },
  })

  const { register: registerSubDivision, handleSubmit: handleSubDivisionSubmit, reset: resetSubDivision, setValue: setSubDivisionValue, watch: watchSubDivision, formState: { errors: subDivisionErrors, isSubmitting: subDivisionSubmitting } } = useForm<SubDivisionFormData>({
    resolver: zodResolver(subDivisionSchema) as Resolver<SubDivisionFormData>,
    defaultValues: { sort_order: 0 },
  })

  async function load() {
    setLoading(true)
    try {
      const [divs, subDivs, match] = await Promise.all([
        api.get<Division[]>(`/matches/${matchId}/divisions`),
        api.get<SubDivision[]>(`/matches/${matchId}/categories`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setDivisions(divs.sort((a, b) => a.sort_order - b.sort_order))
      setSubDivisions(subDivs.sort((a, b) => a.sort_order - b.sort_order))
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [matchId])

  function openEditDivision(d: Division) {
    setEditingDivision(d)
    resetDivision({ name: d.name, sort_order: d.sort_order })
    setOpenDivision(true)
  }

  function openEditSubDivision(sd: SubDivision) {
    setEditingSubDivision(sd)
    resetSubDivision({
      name: sd.name,
      min_age: sd.min_age ?? undefined,
      max_age: sd.max_age ?? undefined,
      gender: sd.gender ?? undefined,
      sort_order: sd.sort_order,
    })
    setOpenSubDivision(true)
  }

  function openCreateSubDivision() {
    setEditingSubDivision(null)
    resetSubDivision({ name: '', min_age: undefined, max_age: undefined, gender: undefined, sort_order: subDivisions.length })
    setOpenSubDivision(true)
  }

  async function onDivisionSubmit(data: DivisionFormData & { code?: string; power_factor?: string }) {
    try {
      if (editingDivision) {
        await api.put(`/divisions/${editingDivision.id}`, data)
        toast({ title: '更新成功' })
      } else {
        await api.post(`/matches/${matchId}/divisions`, data)
        toast({ title: '添加成功' })
      }
      setOpenDivision(false)
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function onSubDivisionSubmit(data: SubDivisionFormData) {
    try {
      if (editingSubDivision) {
        await api.put(`/categories/${editingSubDivision.id}`, data)
        toast({ title: '更新成功' })
      } else {
        await api.post(`/matches/${matchId}/categories`, data)
        toast({ title: '添加成功' })
      }
      setOpenSubDivision(false)
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function deleteSubDivision(id: number) {
    try {
      await api.delete(`/categories/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  async function deleteDivision(id: number) {
    try {
      await api.delete(`/divisions/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  function openCreateDivision() {
    setEditingDivision(null)
    resetDivision({ name: '', sort_order: divisions.length })
    setOpenDivision(true)
  }

  const genderLabel = (g?: string | null) => g === 'male' ? '男' : g === 'female' ? '女' : '-'
  const ageRange = (sd: SubDivision) => {
    if (sd.min_age !== null && sd.max_age !== null) return `${sd.min_age}-${sd.max_age}`
    if (sd.min_age !== null) return `${sd.min_age}+`
    if (sd.max_age !== null) return `<${sd.max_age}`
    return '-'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">组别管理</h1>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <>
          {/* Divisions Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">主级别 (Divisions)</h2>
              <Button onClick={openCreateDivision} size="sm">
                <PlusCircle className="h-4 w-4 mr-2" />
                添加组别
              </Button>
            </div>
            {divisions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">暂无组别</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>排序</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>组别名称</TableHead>
                    <TableHead>Power Factor</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divisions.map(d => (
                    <TableRow key={d.id}>
                      <TableCell>{d.sort_order}</TableCell>
                      <TableCell className="font-mono text-sm">{d.code}</TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>
                        <Badge variant={d.power_factor === 'major' ? 'default' : 'secondary'}>
                          {d.power_factor === 'major' ? '🟠 major' : '🔵 minor'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDivision(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确认删除</AlertDialogTitle>
                              <AlertDialogDescription>确定要删除组别 "{d.name}" ({d.code}) 吗？有关联射手时无法删除。</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteDivision(d.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <Separator className="my-8" />

          {/* Categories Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">分类 (Category)</h2>
              <Button onClick={openCreateSubDivision} size="sm">
                <PlusCircle className="h-4 w-4 mr-2" />
                添加分类
              </Button>
            </div>
            {subDivisions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">暂无分类</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>排序</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>年龄范围</TableHead>
                    <TableHead>性别</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subDivisions.map(sd => (
                    <TableRow key={sd.id}>
                      <TableCell>{sd.sort_order}</TableCell>
                      <TableCell className="font-medium">{sd.name}</TableCell>
                      <TableCell>{ageRange(sd)}</TableCell>
                      <TableCell>{genderLabel(sd.gender)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditSubDivision(sd)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确认删除</AlertDialogTitle>
                              <AlertDialogDescription>确定要删除"{sd.name}"吗？</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteSubDivision(sd.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      {/* Division Edit Dialog */}
      <Dialog open={openDivision} onOpenChange={setOpenDivision}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDivision ? '编辑组别' : '添加组别'}</DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDivisionSubmit(onDivisionSubmit)} className="space-y-4">
            {editingDivision ? (
              <>
                <div className="space-y-1">
                  <Label>组别代码</Label>
                  <div className="text-sm font-mono bg-muted p-2 rounded">{editingDivision.code}</div>
                </div>
                <div className="space-y-1">
                  <Label>Power Factor</Label>
                  <div className="text-sm bg-muted p-2 rounded">
                    {editingDivision.power_factor === 'major' ? '🟠 major' : '🔵 minor'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>组别代码</Label>
                  <Select
                    value={watchDivision('code') ?? ''}
                    onValueChange={v => setDivisionValue('code', v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择组别" />
                    </SelectTrigger>
                    <SelectContent>
                      {['production', 'open', 'standard', 'classic', 'optics'].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Power Factor</Label>
                  <Select
                    value={watchDivision('power_factor') ?? ''}
                    onValueChange={v => setDivisionValue('power_factor', v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择 Power Factor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="major">🟠 Major</SelectItem>
                      <SelectItem value="minor">🔵 Minor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>组别名称</Label>
              <Input placeholder="e.g. Open / Standard / Production" {...registerDivision('name')} />
              {divisionErrors.name && <p className="text-xs text-destructive">{divisionErrors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>排序</Label>
              <Input type="number" {...registerDivision('sort_order')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDivision(false)}>取消</Button>
              <Button type="submit" disabled={divisionSubmitting}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Category Create/Edit Dialog */}
      <Dialog open={openSubDivision} onOpenChange={setOpenSubDivision}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSubDivision ? '编辑分类' : '添加分类'}</DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubDivisionSubmit(onSubDivisionSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>名称</Label>
              <Input placeholder="e.g. 青少年" {...registerSubDivision('name')} />
              {subDivisionErrors.name && <p className="text-xs text-destructive">{subDivisionErrors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>最小年龄（可选）</Label>
                <Input type="number" min="0" placeholder="e.g. 18" {...registerSubDivision('min_age')} />
              </div>
              <div className="space-y-1">
                <Label>最大年龄（可选）</Label>
                <Input type="number" min="0" placeholder="e.g. 65" {...registerSubDivision('max_age')} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>性别（可选）</Label>
              <Select
                value={watchSubDivision('gender') ?? 'null'}
                onValueChange={v => setSubDivisionValue('gender', v === 'null' ? undefined : v as 'male' | 'female')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择性别" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">不限</SelectItem>
                  <SelectItem value="male">男</SelectItem>
                  <SelectItem value="female">女</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>排序</Label>
              <Input type="number" {...registerSubDivision('sort_order')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenSubDivision(false)}>取消</Button>
              <Button type="submit" disabled={subDivisionSubmitting}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
