import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { DrillPayload, PersonalReplayDetail, ShotRecord } from '@/types/my'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ====== 工具函数 ======

/** 把 hit_area 归一化为分区类别：A / C / D / M / N / PE */
function normalizeHitArea(hitArea: string): 'A' | 'C' | 'D' | 'M' | 'N' | 'PE' | 'OTHER' {
  if (!hitArea) return 'OTHER'
  const upper = hitArea.toUpperCase()
  if (upper === 'MISS') return 'M'
  if (upper === 'NOSHOOT' || upper === 'NO_SHOOT' || upper === 'NS') return 'N'
  if (upper === 'PE' || upper === 'PROCEDURAL' || upper === 'PROCEDURAL_ERROR') return 'PE'
  if (upper.startsWith('A')) return 'A' // AZone / AZone1 / APopper
  if (upper.startsWith('C')) return 'C'
  if (upper.startsWith('D')) return 'D'
  return 'OTHER'
}

const ZONE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500',
  C: 'bg-amber-500',
  D: 'bg-sky-500',
  M: 'bg-red-500',
  N: 'bg-zinc-700',
  PE: 'bg-orange-500',
  OTHER: 'bg-purple-400',
}

const ZONE_TEXT_COLORS: Record<string, string> = {
  A: 'text-emerald-600',
  C: 'text-amber-600',
  D: 'text-sky-600',
  M: 'text-red-600',
  N: 'text-zinc-600',
  PE: 'text-orange-600',
  OTHER: 'text-purple-500',
}

const ZONE_LABELS: Record<string, string> = {
  A: 'A 区',
  C: 'C 区',
  D: 'D 区',
  M: 'Miss',
  N: 'No-shoot',
  PE: '程序错误',
  OTHER: '其他',
}

function formatSeconds(s: number | undefined | null): string {
  if (s == null || !isFinite(s)) return '-'
  return `${s.toFixed(2)}s`
}

function isDrillPayload(p: unknown): p is DrillPayload {
  if (!p || typeof p !== 'object') return false
  const obj = p as Record<string, unknown>
  return (
    typeof obj.totalTime === 'number' &&
    typeof obj.numShots === 'number' &&
    Array.isArray(obj.shotData) &&
    typeof obj.hitZones === 'object'
  )
}

// ====== 子组件 ======

/** 命中分布水平条形图 */
function HitZoneBar({ zones, totalShots }: { zones: DrillPayload['hitZones']; totalShots: number }) {
  const entries = useMemo(() => {
    const list = [
      { key: 'A', count: zones.A, color: ZONE_COLORS.A, text: ZONE_TEXT_COLORS.A, label: ZONE_LABELS.A },
      { key: 'C', count: zones.C, color: ZONE_COLORS.C, text: ZONE_TEXT_COLORS.C, label: ZONE_LABELS.C },
      { key: 'D', count: zones.D, color: ZONE_COLORS.D, text: ZONE_TEXT_COLORS.D, label: ZONE_LABELS.D },
      { key: 'M', count: zones.M, color: ZONE_COLORS.M, text: ZONE_TEXT_COLORS.M, label: ZONE_LABELS.M },
      { key: 'N', count: zones.N, color: ZONE_COLORS.N, text: ZONE_TEXT_COLORS.N, label: ZONE_LABELS.N },
      { key: 'PE', count: zones.PE, color: ZONE_COLORS.PE, text: ZONE_TEXT_COLORS.PE, label: ZONE_LABELS.PE },
    ]
    return list.filter((e) => e.count > 0)
  }, [zones])

  const validHits = zones.A + zones.C + zones.D
  const hitRate = totalShots > 0 ? (validHits / totalShots) * 100 : 0

  return (
    <div className="space-y-3">
      {/* 堆叠条 */}
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-muted">
        {entries.map((e) => (
          <div
            key={e.key}
            className={`${e.color} flex items-center justify-center text-xs font-medium text-white transition-all`}
            style={{ width: `${(e.count / Math.max(totalShots, 1)) * 100}%` }}
            title={`${e.label}: ${e.count} (${((e.count / Math.max(totalShots, 1)) * 100).toFixed(1)}%)`}
          >
            {e.count > 0 && (e.count / Math.max(totalShots, 1)) > 0.05 ? e.count : ''}
          </div>
        ))}
      </div>

      {/* 图例与数据 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {entries.map((e) => (
          <div key={e.key} className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-sm ${e.color}`} />
            <span className="text-muted-foreground">{e.label}</span>
            <span className={`ml-auto font-medium ${e.text}`}>{e.count}</span>
            <span className="text-xs text-muted-foreground">
              {((e.count / Math.max(totalShots, 1)) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* 有效命中率 */}
      <div className="flex items-center justify-between border-t pt-2 text-sm">
        <span className="text-muted-foreground">有效命中率（A+C+D）</span>
        <span className={`font-semibold ${hitRate >= 80 ? 'text-emerald-600' : hitRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
          {hitRate.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

/** 弹序时间轴 */
function ShotTimeline({ shots, totalTime }: { shots: ShotRecord[]; totalTime: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (shots.length === 0) {
    return <p className="text-sm text-muted-foreground">无弹序数据</p>
  }

  // 计算每发绝对时间（累积 time_diff）
  let acc = 0
  const absoluteTimes = shots.map((s) => {
    acc += s.content.time_diff
    return acc
  })

  return (
    <div className="space-y-3">
      {/* 时间轴主体 */}
      <div className="relative h-20 w-full overflow-x-auto rounded-md border bg-muted/30 p-2">
        <div className="relative h-full" style={{ minWidth: '600px' }}>
          {/* 基线 */}
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
          {/* 时间刻度 */}
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <div
              key={p}
              className="absolute top-0 bottom-0 border-l border-dashed border-border/50"
              style={{ left: `${p * 100}%` }}
            >
              <span className="absolute bottom-0 left-1 text-[10px] text-muted-foreground">
                {(totalTime * p).toFixed(1)}s
              </span>
            </div>
          ))}
          {/* 弹序点 */}
          {shots.map((shot, idx) => {
            const t = absoluteTimes[idx]
            const ratio = totalTime > 0 ? t / totalTime : 0
            const zone = normalizeHitArea(shot.content.hit_area)
            const color = ZONE_COLORS[zone] ?? ZONE_COLORS.OTHER
            const isHovered = hoveredIdx === idx
            return (
              <div
                key={idx}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform"
                style={{ left: `${Math.min(ratio * 100, 100)}%`, zIndex: isHovered ? 10 : 1 }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div
                  className={`${color} rounded-full ring-2 ring-background ${isHovered ? 'h-4 w-4' : 'h-3 w-3'}`}
                />
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                  {idx + 1}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tooltip / 详情 */}
      {hoveredIdx != null && shots[hoveredIdx] && (
        <div className="rounded-md border bg-card p-3 text-xs shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-semibold">第 {hoveredIdx + 1} 发</span>
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${
                ZONE_COLORS[normalizeHitArea(shots[hoveredIdx].content.hit_area)] ?? ZONE_COLORS.OTHER
              }`}
            >
              {shots[hoveredIdx].content.hit_area}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
            <span>间隔: <span className="text-foreground font-medium">{formatSeconds(shots[hoveredIdx].content.time_diff)}</span></span>
            <span>绝对时间: <span className="text-foreground font-medium">{formatSeconds(absoluteTimes[hoveredIdx])}</span></span>
            <span>靶标: <span className="text-foreground font-medium">{shots[hoveredIdx].device}</span></span>
            <span>类型: <span className="text-foreground font-medium">{shots[hoveredIdx].content.target_type}</span></span>
            <span className="col-span-2">
              坐标: <span className="text-foreground font-mono">({shots[hoveredIdx].content.hit_position.x.toFixed(1)}, {shots[hoveredIdx].content.hit_position.y.toFixed(1)})</span>
            </span>
          </div>
        </div>
      )}

      {/* 图例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {[
          { c: ZONE_COLORS.A, l: 'A 区' },
          { c: ZONE_COLORS.C, l: 'C 区' },
          { c: ZONE_COLORS.D, l: 'D 区' },
          { c: ZONE_COLORS.M, l: 'Miss' },
          { c: ZONE_COLORS.N, l: 'No-shoot' },
          { c: ZONE_COLORS.PE, l: 'PE' },
        ].map((item) => (
          <div key={item.l} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.c}`} />
            {item.l}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 时间间隔统计 */
function IntervalStats({ shots }: { shots: ShotRecord[] }) {
  const stats = useMemo(() => {
    if (shots.length === 0) return null
    const diffs = shots.map((s) => s.content.time_diff)
    const sum = diffs.reduce((a, b) => a + b, 0)
    const avg = sum / diffs.length
    const max = Math.max(...diffs)
    const min = Math.min(...diffs)
    return { avg, max, min, count: diffs.length }
  }, [shots])

  if (!stats) return null

  return (
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div className="rounded-md border p-2.5">
        <div className="text-xs text-muted-foreground">弹数</div>
        <div className="mt-0.5 font-semibold">{stats.count}</div>
      </div>
      <div className="rounded-md border p-2.5">
        <div className="text-xs text-muted-foreground">平均间隔</div>
        <div className="mt-0.5 font-semibold">{formatSeconds(stats.avg)}</div>
      </div>
      <div className="rounded-md border p-2.5">
        <div className="text-xs text-muted-foreground">最快</div>
        <div className="mt-0.5 font-semibold text-emerald-600">{formatSeconds(stats.min)}</div>
      </div>
      <div className="rounded-md border p-2.5">
        <div className="text-xs text-muted-foreground">最慢</div>
        <div className="mt-0.5 font-semibold text-red-600">{formatSeconds(stats.max)}</div>
      </div>
    </div>
  )
}

// ====== 主页面 ======

export function MyReplayDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [replay, setReplay] = useState<PersonalReplayDetail | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const data = await api.get<PersonalReplayDetail>(`/my/drill-records/${id}`)
      setReplay(data)
    } catch (error) {
      toast({ title: '加载失败', description: String(error), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  async function handleDelete() {
    if (!id) return
    try {
      await api.delete(`/my/drill-records/${id}`)
      toast({ title: '删除成功' })
      navigate('/my/drill-records')
    } catch (error) {
      toast({ title: '删除失败', description: String(error), variant: 'destructive' })
    }
  }

  const payload = replay?.payload
  const parsed = isDrillPayload(payload) ? payload : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">训练记录详情</h1>
          <p className="text-sm text-muted-foreground">查看个人训练的完整回放数据。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/my/drill-records')}>返回</Button>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={!replay}>删除</Button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 rounded-md bg-muted animate-pulse" />
      ) : replay ? (
        <div className="space-y-6">
          {/* ====== 顶部：摘要 + 命中分布 ====== */}
          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            {/* 左：摘要卡 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-col gap-1">
                  <span>{parsed?.drillName ?? replay.drill_name ?? '未命名训练'}</span>
                  {parsed && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {parsed.athleteName}
                      {parsed.athleteClub ? ` · ${parsed.athleteClub}` : ''}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 主要指标 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-muted/50 p-3">
                    <div className="text-xs text-muted-foreground">得分</div>
                    <div className="mt-0.5 text-2xl font-bold">
                      {parsed?.score ?? replay.score ?? '-'}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <div className="text-xs text-muted-foreground">Hit Factor</div>
                    <div className="mt-0.5 text-2xl font-bold">
                      {parsed && parsed.factor ? parsed.factor.toFixed(3) : '-'}
                    </div>
                  </div>
                </div>

                {/* 详细数据 */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">总用时</span>
                    <span className="font-medium">{formatSeconds(parsed?.totalTime ?? replay.total_time)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">总弹数</span>
                    <span className="font-medium">{parsed?.numShots ?? replay.num_shots}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">首发反应</span>
                    <span className="font-medium">{formatSeconds(parsed?.firstShot)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">最快连发</span>
                    <span className="font-medium text-emerald-600">{formatSeconds(parsed?.fastest)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">上传时间</span>
                    <span className="font-medium">{replay.created_at}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">设备</span>
                    <span className="font-medium">{replay.device_id ?? '-'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 右：命中分布 */}
            <Card>
              <CardHeader>
                <CardTitle>命中分布</CardTitle>
              </CardHeader>
              <CardContent>
                {parsed ? (
                  <HitZoneBar zones={parsed.hitZones} totalShots={parsed.numShots} />
                ) : (
                  <p className="text-sm text-muted-foreground">payload 格式无法解析</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ====== 中部：弹序时间轴 ====== */}
          {parsed && parsed.shotData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>弹序时间轴</CardTitle>
              </CardHeader>
              <CardContent>
                <ShotTimeline shots={parsed.shotData} totalTime={parsed.totalTime} />
              </CardContent>
            </Card>
          )}

          {/* ====== 间隔统计 ====== */}
          {parsed && parsed.shotData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>射击间隔统计</CardTitle>
              </CardHeader>
              <CardContent>
                <IntervalStats shots={parsed.shotData} />
              </CardContent>
            </Card>
          )}

          {/* ====== 原始 JSON（折叠） ====== */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              <span className="inline-block transition-transform group-open:rotate-90">▶</span>{' '}
              查看原始 payload (JSON)
            </summary>
            <pre className="mt-3 max-h-[60vh] overflow-auto rounded-md border bg-muted p-4 text-xs leading-5 whitespace-pre-wrap break-words">
              {JSON.stringify(replay.payload, null, 2)}
            </pre>
          </details>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">未找到记录。</p>
      )}
    </div>
  )
}
