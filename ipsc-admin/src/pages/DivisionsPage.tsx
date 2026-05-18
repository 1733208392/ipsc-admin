import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Division, Match } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const schema = z.object({
  name: z.string().min(1, '必填'),
  sort_order: z.coerce.number().int().default(0),
})
type FormData = z.infer<typeof schema>

export function DivisionsPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Division | null>(null)
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { sort_order: 0 },
  })

  async function load() {
    setLoading(true)
    try {
      const [divs, match] = await Promise.all([
        api.get<Division[]>(`/matches/${matchId}/divisions`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setDivisions(divs.sort((a, b) => a.sort_order - b.sort_order))
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [matchId])

  function openEdit(d: Division) {
    setEditing(d)
    reset({ name: d.name, sort_order: d.sort_order })
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    try {
      if (editing) {
        await api.put(`/divisions/${editing.id}`, data)
        toast({ title: '更新成功' })
        setOpen(false)
        void load()
      }
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">组别管理</h1>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : divisions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">暂无组别</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>组别名称</TableHead>
              <TableHead>Power Factor</TableHead>
              <TableHead>排序</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {divisions.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-sm">{d.code}</TableCell>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>
                  <Badge variant={d.power_factor === 'major' ? 'default' : 'secondary'}>
                    {d.power_factor === 'major' ? '🟠 major' : '🔵 minor'}
                  </Badge>
                </TableCell>
                <TableCell>{d.sort_order}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑组别</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>组别代码</Label>
              <div className="text-sm font-mono bg-muted p-2 rounded">{editing?.code}</div>
            </div>
            <div className="space-y-1">
              <Label>Power Factor</Label>
              <div className="text-sm bg-muted p-2 rounded">
                {editing?.power_factor === 'major' ? '🟠 major' : '🔵 minor'}
              </div>
            </div>
            <div className="space-y-1">
              <Label>组别名称</Label>
              <Input placeholder="e.g. Open / Standard / Production" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
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
