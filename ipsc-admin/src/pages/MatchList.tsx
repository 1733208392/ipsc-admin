import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, Calendar, Layers, Users, ClipboardList } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Match } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

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
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Match | null>(null)
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
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function openCreate() {
    setEditing(null)
    reset({ name: '', date: '' })
    setOpen(true)
  }

  function openEdit(m: Match) {
    setEditing(m)
    reset({ name: m.name, date: m.date })
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    try {
      if (editing) {
        await api.put(`/matches/${editing.id}`, data)
        toast({ title: '更新成功' })
      } else {
        await api.post('/matches', data)
        toast({ title: '创建成功' })
      }
      setOpen(false)
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
