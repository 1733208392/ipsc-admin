import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlusCircle } from 'lucide-react'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Match, Stage } from '@/types'
import type { DrillTemplateDetail, DrillTargetDraft } from '@/types/drill'
import { createEmptyDrillTarget } from '@/types/drill'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TargetEditCard } from '@/components/TargetEditCard'

function renumberTargets(targets: DrillTargetDraft[]) {
  return targets.map((target, index) => ({
    ...target,
    seq_no: index + 1,
    sort_order: index,
  }))
}

function draftFromDetail(detail: DrillTemplateDetail): DrillTargetDraft[] {
  return renumberTargets(
    detail.targets.map((target) => ({
      seq_no: target.seq_no,
      target_name: target.target_name,
      target_type: target.target_type,
      timeout: target.timeout,
      counted_shots: target.counted_shots,
      target_variant:
        target.target_variant && target.target_variant.length === target.target_type.length
          ? target.target_variant
          : Array.from({ length: target.target_type.length }, () => ''),
      has_physical_popper: Boolean(target.has_physical_popper),
      sort_order: target.sort_order,
    }))
  )
}

export function DrillTemplateEditPage() {
  const { id: matchId, stageId, drillId } = useParams<{ id: string; stageId: string; drillId: string }>()
  const navigate = useNavigate()
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const isNew = drillId === 'new'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [match, setMatch] = useState<Match | null>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [targets, setTargets] = useState<DrillTargetDraft[]>([createEmptyDrillTarget(1)])

  const title = useMemo(() => (isNew ? '新建 Drill' : '编辑 Drill'), [isNew])

  async function load() {
    if (!matchId || !stageId) return
    setLoading(true)
    try {
      const [matchData, stagesData, drillData] = await Promise.all([
        api.get<Match>(`/matches/${matchId}`),
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        isNew ? Promise.resolve(null) : api.get<DrillTemplateDetail>(`/drills/${drillId}`),
      ])
      const stageData = stagesData.find((item) => String(item.id) === stageId) ?? null
      setCurrentMatch(matchData)
      setMatch(matchData)
      setStage(stageData)

      if (drillData) {
        setTemplateName(drillData.name)
        setTargets(draftFromDetail(drillData))
      } else {
        setTemplateName('')
        setTargets([createEmptyDrillTarget(1)])
      }
    } catch (error) {
      toast({ title: '加载失败', description: String(error), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [matchId, stageId, drillId])

  function updateTarget(index: number, nextValue: DrillTargetDraft) {
    setTargets((current) => current.map((item, currentIndex) => (currentIndex === index ? nextValue : item)))
  }

  function moveTarget(index: number, direction: -1 | 1) {
    setTargets((current) => {
      const next = [...current]
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= next.length) return current
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return renumberTargets(next)
    })
  }

  function deleteTarget(index: number) {
    setTargets((current) => {
      const next = current.filter((_, currentIndex) => currentIndex !== index)
      return renumberTargets(next.length > 0 ? next : [createEmptyDrillTarget(1)])
    })
  }

  function addTarget() {
    setTargets((current) => [...current, createEmptyDrillTarget(current.length + 1)])
  }

  function validateTargets() {
    if (targets.length === 0) {
      toast({ title: '至少需要 1 个靶位', variant: 'destructive' })
      return false
    }

    for (const target of targets) {
      if (target.target_type.length === 0) {
        toast({ title: `靶位 #${target.seq_no} 未选择目标类型`, variant: 'destructive' })
        return false
      }
      if (!target.target_variant || target.target_variant.length !== target.target_type.length) {
        toast({ title: `靶位 #${target.seq_no} 的停留时间数量不正确`, variant: 'destructive' })
        return false
      }
      if (target.target_variant.some((value) => Number(value) <= 0 || Number.isNaN(Number(value)))) {
        toast({ title: `靶位 #${target.seq_no} 的停留时间必须为正数`, variant: 'destructive' })
        return false
      }
    }

    return true
  }

  async function handleSave() {
    if (!matchId || !stageId) return
    const name = templateName.trim()
    if (!name) {
      toast({ title: '请输入模板名称', variant: 'destructive' })
      return
    }
    if (!validateTargets()) return

    setSaving(true)
    try {
      const payload = {
        name,
        sort_order: 0,
        targets: renumberTargets(targets).map((target) => ({
          seq_no: target.seq_no,
          target_name: target.target_name,
          target_type: target.target_type,
          timeout: target.timeout,
          counted_shots: target.counted_shots,
          target_variant: target.target_variant,
          has_physical_popper: target.has_physical_popper,
          sort_order: target.sort_order,
        })),
      }

      if (isNew) {
        await api.post(`/matches/${matchId}/stages/${stageId}/drills`, payload)
      } else {
        await api.put(`/drills/${drillId}`, {
          name: payload.name,
          sort_order: payload.sort_order,
        })
        await api.put(`/drills/${drillId}/targets`, { targets: payload.targets })
      }

      toast({ title: '保存成功' })
      navigate(`/matches/${matchId}/stages/${stageId}/drills`)
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {match?.name ?? `赛事 #${matchId}`} · {stage?.name ?? `Stage #${stageId}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/matches/${matchId}/stages/${stageId}/drills`)}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            保存
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-24 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>基础信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>模板名称</Label>
                <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如 Stage1-标准IPSC" />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">靶位配置</h2>
                <p className="text-sm text-muted-foreground">
                  同一个物理靶可以按时间切换多个靶面，切换边界由 targetVariant 控制；多个物理靶联动由 TargetLink 处理。
                </p>
                <p className="text-xs text-muted-foreground">拖拽暂未启用，先用上移 / 下移按钮调整顺序。</p>
              </div>
              <Button variant="outline" onClick={addTarget}>
                <PlusCircle className="h-4 w-4 mr-2" />
                添加靶位
              </Button>
            </div>

            <div className="space-y-4">
              {targets.map((target, index) => (
                <TargetEditCard
                  key={`${target.seq_no}-${index}`}
                  value={target}
                  onChange={(nextValue) => updateTarget(index, nextValue)}
                  onDelete={() => deleteTarget(index)}
                  onMoveUp={() => moveTarget(index, -1)}
                  onMoveDown={() => moveTarget(index, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < targets.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}