import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { TrainingStats } from '@/types/my'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const RANGE_OPTIONS = [
  { label: '7天', value: '7' },
  { label: '30天', value: '30', recommended: true },
  { label: '90天', value: '90' },
  { label: '全部', value: '3650' },
]

export function MyTrainingStatsPage() {
  const { toast } = useToast()
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<TrainingStats | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<TrainingStats>(`/my/replays/stats?days=${days}`)
      setStats(data)
    } catch (error) {
      toast({ title: '加载失败', description: String(error), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [days])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">训练统计</h1>
          <p className="text-sm text-muted-foreground">查看最近训练趋势和模板分布。</p>
        </div>
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${days === option.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
              onClick={() => setDays(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">总次数</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.total_replays ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">总弹数</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.total_shots ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">平均用时</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.avg_time?.toFixed(2) ?? '0.00'}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">最佳用时</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.best_time?.toFixed(2) ?? '0.00'}</CardContent></Card>
      </div>

      {loading ? (
        <div className="h-48 rounded-md bg-muted animate-pulse" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader><CardTitle>模板分布</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {stats?.by_drill.length ? stats.by_drill.map((item) => (
                <div key={`${item.drill_template_id}-${item.drill_name}`} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.drill_name}</p>
                      <p className="text-xs text-muted-foreground">{item.replay_count} 次 · 平均 {item.avg_time.toFixed(2)} s · 最佳 {item.best_time.toFixed(2)} s</p>
                    </div>
                    <span className="text-sm font-semibold">{item.avg_score.toFixed(1)}</span>
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">暂无数据。</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>按日期</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {stats?.by_day.length ? stats.by_day.map((item) => (
                <div key={item.date} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.date}</span>
                    <span>{item.count} 次 · {item.avg_time.toFixed(2)} s</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, item.count * 12)}%` }} />
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">暂无数据。</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}