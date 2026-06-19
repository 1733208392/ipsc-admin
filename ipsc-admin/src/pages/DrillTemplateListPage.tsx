import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, PlusCircle, Pencil, Trash2 } from 'lucide-react'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Match, Stage } from '@/types'
import type { DrillTemplateDetail, DrillTemplateSummary } from '@/types/drill'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

export function DrillTemplateListPage() {
  const { id: matchId, stageId } = useParams<{ id: string; stageId: string }>()
  const navigate = useNavigate()
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [match, setMatch] = useState<Match | null>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [templates, setTemplates] = useState<DrillTemplateSummary[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [copyingId, setCopyingId] = useState<number | null>(null)

  async function load() {
    if (!matchId || !stageId) return
    setLoading(true)
    try {
      const [matchData, stagesData, drillsData] = await Promise.all([
        api.get<Match>(`/matches/${matchId}`),
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<DrillTemplateSummary[]>(`/matches/${matchId}/stages/${stageId}/drills`),
      ])
      setCurrentMatch(matchData)
      setMatch(matchData)
      setStage(stagesData.find((item) => String(item.id) === stageId) ?? null)
      setTemplates(drillsData.sort((a, b) => a.sort_order - b.sort_order))
    } catch (error) {
      toast({ title: '加载失败', description: String(error), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [matchId, stageId])

  function openCreate() {
    if (!matchId || !stageId) return
    navigate(`/matches/${matchId}/stages/${stageId}/drills/new`)
  }

  function openEdit(id: number) {
    if (!matchId || !stageId) return
    navigate(`/matches/${matchId}/stages/${stageId}/drills/${id}`)
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await api.delete(`/drills/${id}`)
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
      const detail = await api.get<DrillTemplateDetail>(`/drills/${id}`)
      await api.post(`/matches/${matchId}/stages/${stageId}/drills`, {
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

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Drill 配置</h1>
          <p className="text-sm text-muted-foreground">
            {match?.name ?? `赛事 #${matchId}`} · {stage?.name ?? `Stage #${stageId}`}
          </p>
        </div>
        <Button onClick={openCreate}>
          <PlusCircle className="h-4 w-4 mr-2" />
          新建 Drill
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 bg-muted rounded animate-pulse" />)}</div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-4">
            <div>
              <h2 className="text-lg font-semibold">暂无 Drill 模板</h2>
              <p className="text-sm text-muted-foreground">先创建一个模板，后续 iOS 就可以按 Stage 拉取配置。</p>
            </div>
            <Button onClick={openCreate}>
              <PlusCircle className="h-4 w-4 mr-2" />
              新建 Drill
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="h-full">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="mt-1">创建于 {template.created_at}</CardDescription>
                  </div>
                  <Badge variant="secondary">{template.targets_count} 个靶位</Badge>
                </div>
                <p className="text-sm text-muted-foreground">超时时间 {template.timeout} 秒 · 排序 {template.sort_order}</p>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(template.id)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    编辑
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void handleCopy(template.id)} disabled={copyingId === template.id}>
                    <Copy className="h-4 w-4 mr-2" />
                    复制
                  </Button>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
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
    </div>
  )
}