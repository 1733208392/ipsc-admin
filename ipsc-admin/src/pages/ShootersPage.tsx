import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PlusCircle, Pencil, Trash2 } from 'lucide-react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Shooter, Division, Squad, Match } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const schema = z.object({
  bib_number: z.string().min(1, '必填'),
  name: z.string().min(1, '必填'),
  division_id: z.coerce.number().int().positive('请选择组别'),
  squad_id: z.coerce.number().int().positive('请选择 Squad'),
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
    reset({ bib_number: '', name: '', division_id: 0, squad_id: 0 })
    setOpen(true)
  }

  function openEdit(s: Shooter) {
    setEditing(s)
    reset({ bib_number: s.bib_number, name: s.name, division_id: s.division_id, squad_id: s.squad_id })
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

  async function handleDelete(id: number) {
    try {
      await api.delete(`/shooters/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  async function handleChangeSquad(shooterId: number, squadId: string) {
    try {
      await api.put(`/shooters/${shooterId}/squad`, { squad_id: Number(squadId) })
      toast({ title: '更换成功' })
      void load()
    } catch (e) {
      toast({ title: '更换失败', description: String(e), variant: 'destructive' })
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
              <TableHead>所属 Squad</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shooters.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-mono font-medium">{s.bib_number}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.division_name}</TableCell>
                <TableCell>
                  <Select
                    value={String(s.squad_id)}
                    onValueChange={v => void handleChangeSquad(s.id, v)}
                  >
                    <SelectTrigger className="w-36 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {squads.map(sq => (
                        <SelectItem key={sq.id} value={String(sq.id)}>{sq.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑射手' : '添加射手'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              <Label>Squad</Label>
              <Select
                value={watch('squad_id') ? String(watch('squad_id')) : ''}
                onValueChange={v => setValue('squad_id', Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择 Squad" />
                </SelectTrigger>
                <SelectContent>
                  {squads.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.squad_id && <p className="text-xs text-destructive">{errors.squad_id.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button type="submit" disabled={isSubmitting}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
