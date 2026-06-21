import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { PersonalDrillTemplate, PersonalReplaySummary, TrainingStats } from '@/types/my'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function MyReplaysPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<PersonalDrillTemplate[]>([])
  const [replays, setReplays] = useState<PersonalReplaySummary[]>([])
  const [stats, setStats] = useState<TrainingStats | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const pageSize = 20

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (selectedTemplateId) params.set('drill_template_id', selectedTemplateId)
    return params.toString()
  }, [page, selectedTemplateId])

  async function load() {
    setLoading(true)
    try {
      const [templateData, replayData, statsData] = await Promise.all([
        api.get<PersonalDrillTemplate[]>('/my/drills'),
        api.get<{ items: PersonalReplaySummary[]; total: number; page: number; pageSize: number }>(`/my/drill-records?${query}`),
        api.get<TrainingStats>('/my/drill-records/stats?days=30'),
      ])
      setTemplates(templateData)
      setReplays(replayData.items)
      setTotal(replayData.total)
      setStats(statsData)
    } catch (error) {
      toast({ title: '加载失败', description: String(error), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [query])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">训练记录</h1>
          <p className="text-sm text-muted-foreground">按模板和日期查看个人训练表现。</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedTemplateId}
            onChange={(event) => {
              setSelectedTemplateId(event.target.value)
              setPage(1)
            }}
          >
            <option value="">全部模板</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => void load()}>刷新</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">总次数</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.total_records ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">总弹数</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.total_shots ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">平均用时</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.avg_time?.toFixed(2) ?? '0.00'}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">最佳用时</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.best_time?.toFixed(2) ?? '0.00'}</CardContent></Card>
      </div>

      {stats ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader><CardTitle>按模板统计</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {stats.by_drill.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无统计数据。</p>
              ) : stats.by_drill.map((item) => (
                <div key={`${item.drill_template_id}-${item.drill_name}`} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.drill_name}</p>
                      <p className="text-xs text-muted-foreground">{item.record_count} 次 · 平均 {item.avg_time.toFixed(2)} s · 最佳 {item.best_time.toFixed(2)} s</p>
                    </div>
                    <span className="text-sm font-semibold">{item.avg_score.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>近 30 天频率</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {stats.by_day.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无训练记录。</p>
              ) : stats.by_day.map((item) => (
                <div key={item.date} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.date}</span>
                    <span>{item.count} 次 · {item.avg_time.toFixed(2)} s</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, item.count * 12)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>训练记录列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-16 bg-muted rounded animate-pulse" />)}</div>
          ) : replays.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无训练记录。</p>
          ) : (
            <div className="space-y-2">
              {replays.map((replay) => (
                <button
                  key={replay.id}
                  type="button"
                  className="w-full rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent"
                  onClick={() => navigate(`/my/drill-records/${replay.id}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{replay.drill_name ?? '未命名模板'}</p>
                      <p className="text-xs text-muted-foreground">{replay.created_at}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{replay.total_time.toFixed(2)} s · {replay.num_shots} 发</p>
                      <p className="text-muted-foreground">得分 {replay.score ?? '-'}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">共 {total} 条记录</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</Button>
              <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => setPage((current) => current + 1)}>下一页</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}