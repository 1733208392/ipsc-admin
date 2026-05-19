import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PlusCircle, Pencil, Trash2 } from 'lucide-react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Shooter, Division, Squad, Match, GlobalShooter } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const shooterCategoryOptions = [
  { value: 'J', label: 'J - Junior' },
  { value: 'S', label: 'S - Senior' },
  { value: 'SJ', label: 'SJ - Super Junior' },
  { value: 'L', label: 'L - Lady' },
] as const

function shooterCategoryLabel(value: Shooter['category_code']): string {
  if (!value) return '-'
  const found = shooterCategoryOptions.find((item) => item.value === value)
  return found ? found.label : value
}

const schema = z.object({
  bib_number: z.string().min(1, '必填'),
  shooter_uid: z.string().optional(),
  name: z.string().min(1, '必填'),
  division_id: z.coerce.number().int().positive('请选择组别'),
  squad_id: z.coerce.number().int().positive().optional(),
  category_code: z.enum(['J', 'S', 'SJ', 'L']).optional(),
  age: z.coerce.number().int().min(0).max(120).optional(),
  gender: z.enum(['male', 'female']).optional(),
  region: z.string().max(50).optional(),
  club: z.string().max(100).optional(),
})
type FormData = z.infer<typeof schema>

export function ShootersPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [shooters, setShooters] = useState<Shooter[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [squads, setSquads] = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Shooter | null>(null)
  const [filterSquad, setFilterSquad] = useState<string>('all')
  const [searchingGlobal, setSearchingGlobal] = useState(false)
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
  })

  async function load() {
    setLoading(true)
    try {
      const url = filterSquad !== 'all'
        ? `/matches/${matchId}/shooters?squad_id=${filterSquad}`
        : `/matches/${matchId}/shooters`
      const [shootersData, divsData, squadsData, match] = await Promise.all([
        api.get<Shooter[]>(url),
        api.get<Division[]>(`/matches/${matchId}/divisions`),
        api.get<Squad[]>(`/matches/${matchId}/squads`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setShooters(shootersData)
      setDivisions(divsData)
      setSquads(squadsData)
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [matchId, filterSquad])

  function openCreate() {
    setEditing(null)
    reset({ shooter_uid: '', bib_number: '', name: '', division_id: 0, squad_id: undefined, category_code: undefined, age: undefined, gender: undefined, region: '', club: '' })
    setOpen(true)
  }

  function openEdit(s: Shooter) {
    setEditing(s)
    reset({ 
      shooter_uid: s.shooter_uid ?? '',
      bib_number: s.bib_number, 
      name: s.name, 
      division_id: s.division_id, 
      squad_id: s.squad_id ?? undefined,
      category_code: s.category_code ?? undefined,
      age: s.age ?? undefined,
      gender: s.gender ?? undefined,
      region: s.region ?? '',
      club: s.club ?? '',
    })
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    try {
      if (editing) {
        await api.put(`/shooters/${editing.id}`, data)
        toast({ title: '更新成功' })
      } else {
        await api.post(`/matches/${matchId}/shooters`, data)
        toast({ title: '创建成功' })
      }
      setOpen(false)
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function handleGlobalLookup() {
    const uid = (watch('shooter_uid') || '').trim()
    if (!uid) {
      toast({ title: '请输入 UID', variant: 'destructive' })
      return
    }

    setSearchingGlobal(true)
    try {
      const rows = await api.get<GlobalShooter[]>(`/shooters/global/search?q=${encodeURIComponent(uid)}`)
      const shooter = rows.find((item) => item.uid === uid)
      if (!shooter) {
        toast({ title: '未找到该 UID', variant: 'destructive' })
        return
      }

      setValue('name', shooter.name)
      setValue('age', shooter.age ?? undefined)
      setValue('gender', shooter.gender)
      setValue('region', shooter.region ?? '')
      setValue('club', shooter.default_club_short_name ?? shooter.default_club_name ?? '')
      toast({ title: '已自动填充射手信息' })
    } catch (e) {
      toast({ title: '查询失败', description: String(e), variant: 'destructive' })
    } finally {
      setSearchingGlobal(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/shooters/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">射手管理</h1>
        <Button onClick={openCreate}>
          <PlusCircle className="h-4 w-4 mr-2" />
          添加射手
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
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : shooters.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">暂无射手</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bib</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>组别</TableHead>
              <TableHead>类别</TableHead>
              <TableHead>年龄</TableHead>
              <TableHead>性别</TableHead>
              <TableHead>区域</TableHead>
              <TableHead>俱乐部</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shooters.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-mono font-medium">{s.bib_number}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.division_name}</TableCell>
                <TableCell>{shooterCategoryLabel(s.category_code)}</TableCell>
                <TableCell>{s.age ?? '-'}</TableCell>
                <TableCell>{s.gender === 'male' ? '男' : s.gender === 'female' ? '女' : '-'}</TableCell>
                <TableCell>{s.region ?? '-'}</TableCell>
                <TableCell>{s.club ?? '-'}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
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
                        <AlertDialogTitle>确认删除射手？</AlertDialogTitle>
                        <AlertDialogDescription>删除射手「{s.name}」（Bib: {s.bib_number}）及其所有成绩。</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleDelete(s.id)} className="bg-destructive text-white hover:bg-destructive/90">删除</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑射手' : '添加射手'}</DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>
          {divisions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">正在加载组别数据...</div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>全局 UID（可选）</Label>
                <div className="flex gap-2">
                  <Input {...register('shooter_uid')} placeholder="SHOOTER-000001" />
                  <Button type="button" variant="outline" onClick={() => void handleGlobalLookup()} disabled={searchingGlobal}>
                    {searchingGlobal ? '查询中...' : '全局查询'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Bib 号</Label>
                  <Input placeholder="e.g. 42" {...register('bib_number')} />
                  {errors.bib_number && <p className="text-xs text-destructive">{errors.bib_number.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label>姓名</Label>
                  <Input placeholder="姓名" {...register('name')} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>组别</Label>
                  <Select
                    value={watch('division_id') ? String(watch('division_id')) : ''}
                    onValueChange={v => setValue('division_id', Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择组别" />
                    </SelectTrigger>
                    <SelectContent>
                      {divisions.map(d => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.division_id && <p className="text-xs text-destructive">{errors.division_id.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Squad（可选）</Label>
                  <Select
                    value={watch('squad_id') ? String(watch('squad_id')) : 'none'}
                    onValueChange={v => setValue('squad_id', v === 'none' ? undefined : Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择 Squad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未编组</SelectItem>
                      {squads.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>类别（可选）</Label>
                <Select
                  value={watch('category_code') ?? 'none'}
                  onValueChange={v => setValue('category_code', v === 'none' ? undefined : v as 'J' | 'S' | 'SJ' | 'L')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择类别" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不选</SelectItem>
                    {shooterCategoryOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>年龄（可选）</Label>
                  <Input type="number" min="0" max="120" placeholder="年龄" {...register('age')} />
                </div>
                <div className="space-y-1">
                  <Label>性别（可选）</Label>
                  <Select
                    value={watch('gender') ?? 'null'}
                    onValueChange={v => setValue('gender', v === 'null' ? undefined : v as 'male' | 'female')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择性别" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">不选</SelectItem>
                      <SelectItem value="male">男</SelectItem>
                      <SelectItem value="female">女</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>区域（可选）</Label>
                  <Input placeholder="e.g. 上海" {...register('region')} />
                </div>
                <div className="space-y-1">
                  <Label>俱乐部（可选）</Label>
                  <Input placeholder="e.g. 铳义堂" {...register('club')} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
                <Button type="submit" disabled={isSubmitting}>保存</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
