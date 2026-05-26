import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pause, Play, RotateCcw } from 'lucide-react'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { DrillReplayDetail, Match, ShotData } from '@/types'

import { Button } from '@/components/ui/button'

// Map IPSC hit area to a bullet color for the viewer.
function hitAreaColor(area: string | undefined): string {
  const a = (area ?? '').toLowerCase()
  if (a === 'a' || a === 'circlearea') return '#22c55e' // green — A / popper hit
  if (a === 'c') return '#3b82f6' // blue
  if (a === 'd') return '#eab308' // yellow
  if (a === 'm' || a === 'miss' || a === 'n' || a === 'ns') return '#ef4444' // red
  return '#9ca3af' // gray fallback
}

// iOS encodes shot.content in three possible naming styles:
//   camelCase  → hitPosition / hitArea / timeDiff / targetType
//   snake_case → hit_position / hit_area / time_diff / target_type
//   abbrev     → hp / ha / td / tt
// These helpers normalize all of them so the viewer works regardless of which
// format the device firmware produced.
function pick<T = unknown>(obj: Record<string, unknown> | undefined | null, ...keys: string[]): T | undefined {
  if (!obj) return undefined
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null) return v as T
  }
  return undefined
}

function getHitPosition(shot: ShotData): { x: number; y: number } | null {
  const c = shot.content as unknown as Record<string, unknown> | undefined
  const pos = pick<{ x?: number; y?: number }>(c, 'hitPosition', 'hit_position', 'hp')
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return null
  return { x: pos.x, y: pos.y }
}

function getHitArea(shot: ShotData): string | undefined {
  return pick<string>(shot.content as unknown as Record<string, unknown>, 'hitArea', 'hit_area', 'ha')
}

function getTimeDiff(shot: ShotData): number {
  const v = pick<number>(shot.content as unknown as Record<string, unknown>, 'timeDiff', 'time_diff', 'td')
  return typeof v === 'number' ? v : 0
}

function getTargetType(shot: ShotData): string | undefined {
  return pick<string>(shot.content as unknown as Record<string, unknown>, 'targetType', 'target_type', 'tt')
}

function getContentDevice(shot: ShotData): string | undefined {
  return pick<string>(shot.content as unknown as Record<string, unknown>, 'device')
}

// Project a shot's normalized hit position (assumed [-1,1] centered) into the
// SVG viewport (100×177.78 — matches the rendered 9:16 portrait box).
function projectHit(shot: ShotData): { x: number; y: number } | null {
  return getHitPosition(shot)
}

interface BulletPoint {
  index: number
  shot: ShotData
  cumulativeTime: number
  cx: number // SVG x
  cy: number // SVG y
  color: string
}

const SVG_W = 100
const SVG_H = (100 * 16) / 9 // 177.78 — portrait 9:16

export function DrillReplayDetailPage() {
  const { id: matchId, replayId } = useParams<{ id: string; replayId: string }>()
  const navigate = useNavigate()
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const [replay, setReplay] = useState<DrillReplayDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [playhead, setPlayhead] = useState(0) // seconds
  const [playing, setPlaying] = useState(false)
  const [selectedShotIndex, setSelectedShotIndex] = useState<number | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const tickRef = useRef<number | null>(null)

  useEffect(() => {
    async function load() {
      if (!matchId || !replayId) return
      setLoading(true)
      try {
        const [data, match] = await Promise.all([
          api.get<DrillReplayDetail>(`/drill-replays/${replayId}`),
          api.get<Match>(`/matches/${matchId}`),
        ])
        setReplay(data)
        setCurrentMatch(match)
      } catch (e) {
        toast({ title: '加载失败', description: String(e), variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, replayId])

  const shots: ShotData[] = useMemo(() => replay?.payload?.shotData ?? [], [replay])

  // Helper: derive a stable target key from a raw shot (used for grouping).
  const shotTargetKey = (shot: ShotData): string =>
    shot.target ?? getTargetType(shot) ?? 'target'

  // Compute bullet projection + per-target cumulative timestamps. Each target's
  // timeline restarts at 0 so switching targets shows a fresh replay scoped to
  // just that device's shots.
  const bullets = useMemo<BulletPoint[]>(() => {
    if (shots.length === 0) return []
    // First pass — detect coordinate convention across the whole drill.
    const rawPositions = shots.map(projectHit).filter((r): r is { x: number; y: number } => r != null)
    const hasLarge = rawPositions.some((r) => Math.abs(r.x) > 1.5 || Math.abs(r.y) > 1.5)
    const hasNeg = !hasLarge && rawPositions.some((r) => r.x < 0 || r.y < 0)

    // Second pass — per-target cumulative time + projection.
    const perTargetTime = new Map<string, number>()
    const out: BulletPoint[] = []
    shots.forEach((shot, idx) => {
      const raw = projectHit(shot)
      if (!raw) return
      const key = shotTargetKey(shot)
      const prev = perTargetTime.get(key) ?? 0
      const next = prev + getTimeDiff(shot)
      perTargetTime.set(key, next)
      let nx: number
      let ny: number
      if (hasLarge) {
        nx = raw.x / 720
        ny = raw.y / 1280
      } else if (hasNeg) {
        nx = (raw.x + 1) / 2
        ny = (raw.y + 1) / 2
      } else {
        nx = raw.x
        ny = raw.y
      }
      nx = Math.max(0, Math.min(1, nx))
      ny = Math.max(0, Math.min(1, ny))
      out.push({
        index: idx,
        shot,
        cumulativeTime: next,
        cx: nx * SVG_W,
        cy: ny * SVG_H,
        color: hitAreaColor(getHitArea(shot)),
      })
    })
    return out
  }, [shots])

  // Playback loop wiring is set up further down, after `totalTime` is derived
  // from the active target group.

  const visibleBullets = bullets.filter((b) => b.cumulativeTime <= playhead + 1e-6)
  const selectedShot = selectedShotIndex != null ? bullets.find((b) => b.index === selectedShotIndex) ?? null : null

  // Group bullets by target. Falls back to targetType or a synthetic label when
  // the firmware omits a target name (e.g. legacy single-target drills).
  const bulletTargetKey = (b: BulletPoint): string => shotTargetKey(b.shot)

  const targetGroups = useMemo(() => {
    const map = new Map<string, BulletPoint[]>()
    for (const b of bullets) {
      const key = bulletTargetKey(b)
      const list = map.get(key)
      if (list) list.push(b)
      else map.set(key, [b])
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      items,
      duration: items.length > 0 ? items[items.length - 1].cumulativeTime : 0,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bullets])

  // Initialize / repair the selected target whenever the groups change.
  useEffect(() => {
    if (targetGroups.length === 0) {
      if (selectedTarget !== null) setSelectedTarget(null)
      return
    }
    if (!selectedTarget || !targetGroups.some((g) => g.key === selectedTarget)) {
      setSelectedTarget(targetGroups[0].key)
    }
  }, [targetGroups, selectedTarget])

  // Each target's timeline is independent — reset the playhead whenever the
  // active target changes so a new device's shots start fresh from t=0.
  useEffect(() => {
    setPlayhead(0)
    setPlaying(false)
    setSelectedShotIndex(null)
  }, [selectedTarget])

  const activeGroup = selectedTarget != null ? targetGroups.find((g) => g.key === selectedTarget) ?? null : null
  const activeTargetBullets = activeGroup?.items ?? bullets
  const totalTime = activeGroup?.duration ?? 0
  const activeVisibleBullets = activeTargetBullets.filter(
    (b) => b.cumulativeTime <= playhead + 1e-6,
  )
  void visibleBullets // (kept for legacy code paths)

  // Playback loop — 30fps stepping along the active target's local timeline.
  useEffect(() => {
    if (!playing) {
      if (tickRef.current) {
        window.clearInterval(tickRef.current)
        tickRef.current = null
      }
      return
    }
    const step = 1 / 30
    tickRef.current = window.setInterval(() => {
      setPlayhead((p) => {
        const next = p + step
        if (next >= totalTime) {
          setPlaying(false)
          return totalTime
        }
        return next
      })
    }, 1000 / 30)
    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [playing, totalTime])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/matches/${matchId}/drill-replays`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> 返回
          </Button>
          <h1 className="text-2xl font-bold">回放</h1>
        </div>
      </div>

      {loading || !replay ? (
        <div className="text-muted-foreground">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,420px)_1fr] gap-6">
          {/* Target canvas */}
          <div>
            {/* Target switcher */}
            {targetGroups.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {targetGroups.map((g) => {
                  const isActive = g.key === selectedTarget
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => {
                        setSelectedTarget(g.key)
                        setSelectedShotIndex(null)
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border hover:bg-accent'
                      }`}
                    >
                      {g.key}
                      <span className={`ml-1.5 tabular-nums ${isActive ? 'opacity-90' : 'text-muted-foreground'}`}>
                        ({g.items.length})
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div
              className="relative w-full aspect-[9/16] bg-zinc-900 border border-zinc-700 rounded-md overflow-hidden"
            >
              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full block"
              >
                {/* Centerline guides — visual placeholder for the target rectangle */}
                <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="none" stroke="#3f3f46" strokeWidth={0.4} />
                <line x1={SVG_W / 2} y1={0} x2={SVG_W / 2} y2={SVG_H} stroke="#3f3f46" strokeWidth={0.2} strokeDasharray="2 2" />
                <line x1={0} y1={SVG_H / 2} x2={SVG_W} y2={SVG_H / 2} stroke="#3f3f46" strokeWidth={0.2} strokeDasharray="2 2" />

                {activeVisibleBullets.map((b) => (
                  <g key={b.index}>
                    <circle
                      cx={b.cx}
                      cy={b.cy}
                      r={2.2}
                      fill={b.color}
                      stroke={selectedShotIndex === b.index ? '#ffffff' : 'rgba(0,0,0,0.6)'}
                      strokeWidth={selectedShotIndex === b.index ? 0.8 : 0.3}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedShotIndex(b.index)}
                    />
                    <text
                      x={b.cx}
                      y={b.cy + 0.9}
                      textAnchor="middle"
                      fontSize={2.4}
                      fill="#000"
                      style={{ pointerEvents: 'none', fontWeight: 700 }}
                    >
                      {b.index + 1}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* Timeline */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (playhead >= totalTime) setPlayhead(0)
                    setPlaying((p) => !p)
                  }}
                >
                  {playing ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  {playing ? '暂停' : '播放'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPlaying(false)
                    setPlayhead(0)
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> 重置
                </Button>
                <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                  {playhead.toFixed(2)}s / {totalTime.toFixed(2)}s
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(totalTime, 0.01)}
                step={0.01}
                value={Math.min(playhead, totalTime)}
                onChange={(e) => {
                  setPlaying(false)
                  setPlayhead(Number(e.target.value))
                }}
                className="w-full accent-primary"
              />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <LegendDot color="#22c55e" label="A / Hit" />
                <LegendDot color="#3b82f6" label="C" />
                <LegendDot color="#eab308" label="D" />
                <LegendDot color="#ef4444" label="M / NS" />
              </div>
            </div>
          </div>

          {/* Info panel */}
          <div className="space-y-4">
            <div className="rounded-md border p-4 bg-card">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="射手" value={replay.shooter_name ?? `#${replay.shooter_id}`} />
                <Field label="Stage" value={replay.stage_name ?? `Stage ${replay.stage_id}`} />
                <Field label="Drill" value={replay.drill_name ?? '-'} />
                <Field label="枪数" value={String(replay.num_shots)} />
                <Field label="总时间" value={`${replay.total_time.toFixed(2)}s`} />
                <Field label="分数" value={replay.score != null ? String(replay.score) : '-'} />
                <Field label="设备" value={replay.device_id ?? '-'} />
                <Field label="上传时间" value={new Date(replay.created_at).toLocaleString()} />
              </div>
            </div>

            <div className="rounded-md border bg-card">
              <div className="px-4 py-2 border-b text-sm font-medium flex items-center justify-between">
                <span>射击序列{selectedTarget ? ` · ${selectedTarget}` : ''} ({activeTargetBullets.length})</span>
                {targetGroups.length > 1 ? (
                  <span className="text-xs text-muted-foreground font-normal">
                    总计 {bullets.length} 发
                  </span>
                ) : null}
              </div>
              <div className="max-h-[420px] overflow-y-auto divide-y">
                {activeTargetBullets.map((b) => {
                  const isActive = selectedShotIndex === b.index
                  const isVisible = b.cumulativeTime <= playhead + 1e-6
                  return (
                    <button
                      key={b.index}
                      type="button"
                      onClick={() => setSelectedShotIndex(b.index)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent ${
                        isActive ? 'bg-accent' : ''
                      } ${isVisible ? '' : 'opacity-40'}`}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                      <span className="font-mono w-6 text-right">{b.index + 1}</span>
                      <span className="flex-1">
                        {b.shot.target ?? getTargetType(b.shot) ?? 'target'}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Δ {getTimeDiff(b.shot).toFixed(2)}s · t {b.cumulativeTime.toFixed(2)}s
                      </span>
                      <span className="text-xs font-semibold uppercase">
                        {getHitArea(b.shot) ?? '?'}
                      </span>
                    </button>
                  )
                })}
                {activeTargetBullets.length === 0 ? (
                  <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                    没有可显示的击发数据
                  </div>
                ) : null}
              </div>
            </div>

            {selectedShot ? (
              <div className="rounded-md border p-4 bg-card text-sm">
                <div className="font-medium mb-2">击发 #{selectedShot.index + 1}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="目标" value={selectedShot.shot.target ?? '-'} />
                  <Field label="类型" value={getTargetType(selectedShot.shot) ?? '-'} />
                  <Field label="命中区" value={getHitArea(selectedShot.shot) ?? '-'} />
                  <Field
                    label="间隔"
                    value={`${getTimeDiff(selectedShot.shot).toFixed(3)}s`}
                  />
                  <Field
                    label="坐标"
                    value={(() => {
                      const p = getHitPosition(selectedShot.shot)
                      return p ? `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})` : '-'
                    })()}
                  />
                  <Field label="设备" value={selectedShot.shot.device ?? getContentDevice(selectedShot.shot) ?? '-'} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-all">{value}</div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
