import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Pencil, PlusCircle, Trash2, Download } from 'lucide-react'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { PersonalDrillTemplate, PersonalDrillTemplateDetail } from '@/types/my'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { DrillExportDialog } from '@/components/my/DrillExportDialog'

export function MyDrillListPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<PersonalDrillTemplate[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [copyingId, setCopyingId] = useState<number | null>(null)
  const [exportTemplate, setExportTemplate] = useState<PersonalDrillTemplateDetail | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<PersonalDrillTemplate[]>('/my/drills')
      setTemplates(data)
    } catch (error) {
      toast({ title: '加载失败', description: String(error), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await api.delete(`/my/drills/${id}`)
      toast({ title: '删除成功' })
      await load()
    } catch (error) {
      toast({ title: '删除失败', description: String(error), variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  async function handleCopy(id: number) {
    setCopyingId(id)
    try {
      const detail = await api.get<PersonalDrillTemplateDetail>(`/my/drills/${id}`)
      await api.post('/my/drills', {
        name: `${detail.name}（副本）`,
        timeout: detail.timeout,
        sort_order: detail.sort_order,
        targets: detail.targets.map((target) => ({
          seq_no: target.seq_no,
          target_name: target.target_name,
          target_type: target.target_type,
          timeout: target.timeout,
          counted_shots: target.counted_shots,
          target_variant: target.target_variant,
          has_physical_popper: Boolean(target.has_physical_popper),
          sort_order: target.sort_order,
        })),
      })
      toast({ title: '复制成功' })
      await load()
    } catch (error) {
      toast({ title: '复制失败', description: String(error), variant: 'destructive' })
    } finally {
      setCopyingId(null)
    }
  }

  async function openExport(id: number) {
    try {
      const detail = await api.get<PersonalDrillTemplateDetail>(`/my/drills/${id}`)
      setExportTemplate(detail)
      setExportOpen(true)
    } catch (error) {
      toast({ title: '导出失败', description: String(error), variant: 'destructive' })
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">我的训练模板</h1>
          <p className="text-sm text-muted-foreground">脱离赛事上下文，独立配置 Drill 并同步到 iOS。</p>
        </div>
        <Button onClick={() => navigate('/my/drills/new')}>
          <PlusCircle className="h-4 w-4 mr-2" />
          新建模板
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 bg-muted rounded animate-pulse" />)}</div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-4">
            <div>
              <h2 className="text-lg font-semibold">还没有训练模板</h2>
              <p className="text-sm text-muted-foreground">点击新建开始配置你的第一个 Drill。</p>
            </div>
            <Button onClick={() => navigate('/my/drills/new')}>
              <PlusCircle className="h-4 w-4 mr-2" />
              新建模板
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="h-full cursor-pointer hover:shadow-sm" onClick={() => navigate(`/my/drills/${template.id}`)}>
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="mt-1">创建于 {template.created_at}</CardDescription>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{template.targets_count ?? 0} 个靶位</span>
                </div>
                <p className="text-sm text-muted-foreground">超时时间 {template.timeout} 秒 · 排序 {template.sort_order}</p>
                <p className="text-xs text-muted-foreground">训练次数 {template.replay_count ?? 0} · 最近训练 {template.last_replay_at ?? '暂无'}</p>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); navigate(`/my/drills/${template.id}`) }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    编辑
                  </Button>
                  <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); void handleCopy(template.id) }} disabled={copyingId === template.id}>
                    <Copy className="h-4 w-4 mr-2" />
                    复制
                  </Button>
                  <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); void openExport(template.id) }}>
                    <Download className="h-4 w-4 mr-2" />
                    导出
                  </Button>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(event) => event.stopPropagation()}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除</AlertDialogTitle>
                      <AlertDialogDescription>
                        将删除模板及其所有靶位配置，此操作不可恢复。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void handleDelete(template.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deletingId === template.id}
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DrillExportDialog open={exportOpen} onOpenChange={setExportOpen} template={exportTemplate} />
    </div>
  )
}