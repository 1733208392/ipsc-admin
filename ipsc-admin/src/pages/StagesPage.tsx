import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PlusCircle, Pencil, Trash2 } from 'lucide-react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Stage, Match } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

const schema = z.object({
  name: z.string().min(1, '必填'),
  min_rounds: z.coerce.number().int().min(0).default(0),
  max_points: z.coerce.number().int().min(0).default(0),
  sort_order: z.coerce.number().int().default(0),
})
type FormData = z.infer<typeof schema>

export function StagesPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Stage | null>(null)
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { min_rounds: 0, max_points: 0, sort_order: 0 },
  })

  async function load() {
    setLoading(true)
    try {
      const [stagesData, match] = await Promise.all([
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setStages(stagesData)
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [matchId])

  function openCreate() {
    setEditing(null)
    reset({ name: '', min_rounds: 0, max_points: 0, sort_order: 0 })
    setOpen(true)
  }

  function openEdit(s: Stage) {
    setEditing(s)
    reset({ name: s.name, min_rounds: s.min_rounds, max_points: s.max_points, sort_order: s.sort_order })
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    try {
      if (editing) {
        await api.put(`/stages/${editing.id}`, data)
        toast({ title: '更新成功' })
      } else {
        await api.post(`/matches/${matchId}/stages`, data)
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
      await api.delete(`/stages/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Stage 管理</h1>
        <Button onClick={openCreate}>
          <PlusCircle className="h-4 w-4 mr-2" />
          添加 Stage
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : stages.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">暂无 Stage</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage 名称</TableHead>
              <TableHead>Min Rounds</TableHead>
              <TableHead>Max Points</TableHead>
              <TableHead>排序</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.min_rounds}</TableCell>
                <TableCell>{s.max_points}</TableCell>
                <TableCell>{s.sort_order}</TableCell>
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
                        <AlertDialogTitle>确认删除？</AlertDialogTitle>
                        <AlertDialogDescription>删除 Stage「{s.name}」，相关成绩将一并删除。</AlertDialogDescription>
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
            <DialogTitle>{editing ? '编辑 Stage' : '添加 Stage'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Stage 名称</Label>
              <Input placeholder="e.g. Stage 1" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Min Rounds</Label>
                <Input type="number" {...register('min_rounds')} />
              </div>
              <div className="space-y-1">
                <Label>Max Points</Label>
                <Input type="number" {...register('max_points')} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>排序</Label>
              <Input type="number" {...register('sort_order')} />
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
