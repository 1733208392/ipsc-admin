import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Maximize2, Minimize2 } from 'lucide-react'
import { toPng } from 'html-to-image'
import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'

/* ---------- constants ---------- */
const REFRESH_INTERVAL = 2_500
const CATEGORY_MAP: Record<string, string> = {
  J: 'Junior', S: 'Senior', SJ: 'Super Junior', L: 'Lady',
}

/* ---------- tiny helpers ---------- */
function fmt(n: number | null | undefined, d: number): string {
  return Number(n ?? 0).toFixed(d)
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 5) return 'JUST NOW'
  if (s < 60) return `${s}s AGO`
  if (s < 3600) return `${Math.floor(s / 60)}m AGO`
  return `${Math.floor(s / 3600)}h AGO`
}

function hitCount(card: ScoreCardPayload | null) {
  return card
    ? card.rows.reduce(
        (a, r) => {
          a.A += r.a_hits; a.C += r.c_hits; a.D += r.d_hits; a.M += r.m_hits; a.NS += r.ns_hits
          return a
        },
        { A: 0, C: 0, D: 0, M: 0, NS: 0 },
      )
    : { A: 0, C: 0, D: 0, M: 0, NS: 0 }
}

const ACCENT: Record<string, string> = {
  green: 'text-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.18)]',
  sky: 'text-sky-300 shadow-[0_0_28px_rgba(56,189,248,0.18)]',
  amber: 'text-amber-300 shadow-[0_0_28px_rgba(251,191,36,0.18)]',
  red: 'text-red-400 shadow-[0_0_28px_rgba(248,113,113,0.18)]',
  orange: 'text-orange-400 shadow-[0_0_28px_rgba(251,146,60,0.18)]',
}

/* ---------- types ---------- */
interface PenaltyReason {
  reason_code: string
  reason_label: string
  count: number
}

interface ScoreRow {
  row_type: string
  row_no: number
  a_hits: number
  c_hits: number
  d_hits: number
  m_hits: number
  ns_hits: number
}

interface ScoreCardPayload {
  score: {
    id: number
    shooter_id: number
    stage_id: number
    total_points: number
    hit_factor: number
    total_time: number
    a_hits: number
    c_hits: number
    d_hits: number
    m_hits: number
    n_hits: number
    pe: number
    status: string
    submitted_at: string
    first_shot: number | null
    fastest_split: number | null
  }
  shooter: {
    id: number
    name: string
    bib_number: number | null
    division_name: string | null
    division_code: string | null
    category_code: string | null
    club: string | null
  }
  stage: { id: number; name: string }
  rows: ScoreRow[]
  penalty_reasons: PenaltyReason[]
}

/* ---------- sub-components ---------- */

function StatCard({ label, value, accent, delay, reveal }: {
  label: string; value: number; accent: string; delay: number; reveal: boolean
}) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center border-2 border-white bg-black/45 px-2 py-3 sm:px-3 sm:py-4 lg:px-4 lg:py-5 backdrop-blur-sm transition-all duration-700 ease-out ${
        ACCENT[accent] ?? ''
      } ${reveal ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className="ls-number-font text-2xl font-black leading-none sm:text-3xl lg:text-4xl xl:text-5xl">{value}</span>
      <span className="ls-ui-font mt-1 text-[8px] font-bold uppercase tracking-[0.28em] text-zinc-400 sm:text-[10px]">
        {label}
      </span>
    </div>
  )
}

function MetricCard({ label, value, delay, reveal, emphasize }: {
  label: string; value: string; delay: number; reveal: boolean; emphasize?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center transition-all duration-700 ease-out ${
        reveal ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="ls-ui-font text-[10px] font-bold uppercase tracking-[0.34em] text-zinc-400 sm:text-[12px] lg:text-[16px] xl:text-[20px]">
        {label}
      </div>
      <div
        className={`ls-number-font mt-2 font-black leading-none ${
          emphasize
            ? 'bg-gradient-to-b from-red-300 via-red-500 to-red-700 bg-clip-text text-transparent text-[28px] sm:text-[40px] lg:text-[82px] xl:text-[130px]'
            : 'text-zinc-100 text-[22px] sm:text-[32px] lg:text-[65px] xl:text-[98px]'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

/* ---------- main component ---------- */

export function LiveScorecardPage() {
  const { id: routeId } = useParams<{ id: string }>()
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const [fallbackId, setFallbackId] = useState<string | undefined>(routeId)
  const activeId = routeId ?? fallbackId

  const [card, setCard] = useState<ScoreCardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pulseKey, setPulseKey] = useState(0)

  const cardRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const erroredRef = useRef(false)
  const lastScoreIdRef = useRef<number | null>(null)

  /* ---- fetch active match ---- */
  const fetchMatch = useCallback(async () => {
    if (activeId) {
      try { setCurrentMatch(await api.get(`/matches/${activeId}`)) } catch { /* noop */ }
    }
  }, [activeId, setCurrentMatch])

  /* ---- fetch latest score card ---- */
  const fetchLatest = useCallback(async () => {
    let matchId = activeId
    if (!routeId) {
      try {
        const m = await api.get<{ id?: number }>('/matches/livestream/active')
        const id = m?.id != null ? String(m.id) : undefined
        if (id && id !== fallbackId) {
          setFallbackId(id)
          lastScoreIdRef.current = null
          setCard(null)
          setRevealed(false)
        }
        matchId = id
      } catch { /* noop */ }
    }
    if (!matchId) { setLoading(false); return }

    try {
      const data = await api.get<ScoreCardPayload | null>(`/matches/${matchId}/scores/livestream/latest`)
      erroredRef.current = false
      setLoading(false)

      if (!data || !data.score) {
        if (lastScoreIdRef.current !== null) {
          lastScoreIdRef.current = null
          setCard(null)
          setRevealed(false)
        }
        return
      }

      const newId = data.score.id
      if (newId === lastScoreIdRef.current) {
        setCard(data)
      } else {
        lastScoreIdRef.current = newId
        setCard(data)
        setRevealed(false)
        setPulseKey(k => k + 1)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setRevealed(true))
        })
      }
    } catch (e) {
      setLoading(false)
      if (!erroredRef.current) {
        erroredRef.current = true
        toast({ title: 'Livestream refresh failed', description: String(e), variant: 'destructive' })
      }
    }
  }, [activeId, routeId, fallbackId, toast])

  /* ---- polling ---- */
  useEffect(() => {
    setLoading(true)
    fetchMatch()
    fetchLatest()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(fetchLatest, REFRESH_INTERVAL)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchMatch, fetchLatest])

  /* ---- fullscreen ---- */
  useEffect(() => {
    function handler() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch (e) {
      toast({ title: 'Fullscreen is not available', description: String(e), variant: 'destructive' })
    }
  }

  /* ---- PNG export ---- */
  async function exportPng() {
    if (!cardRef.current) return
    try {
      setExporting(true)
      const url = await toPng(cardRef.current, {
        backgroundColor: undefined,
        pixelRatio: 2,
        cacheBust: true,
        filter: (el) => !(el instanceof HTMLElement && el.dataset.skipExport === '1'),
      })
      const a = document.createElement('a')
      a.download = `${card?.shooter?.name ?? 'score-card'}-${card?.stage?.name ?? 'stage'}-${Date.now()}.png`.replace(/\s+/g, '_')
      a.href = url
      a.click()
    } catch (e) {
      toast({ title: 'Export failed', description: String(e), variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  /* ---- derived data ---- */
  const hits = useMemo(() => hitCount(card), [card])
  const totalPE = useMemo(() => card?.penalty_reasons.reduce((s, p) => s + p.count, 0) ?? 0, [card])
  const sc = card?.score ?? null
  const shooter = card?.shooter
  const stage = card?.stage
  const statusUpper = (sc?.status ?? 'normal').toUpperCase()
  const isNormal = (sc?.status ?? 'normal') === 'normal'
  const catLabel = shooter?.category_code ? (CATEGORY_MAP[shooter.category_code] ?? shooter.category_code) : null

  /* ---- render ---- */
  return (
    <div
      className={`${isFullscreen ? 'min-h-screen' : 'min-h-[calc(100vh-3rem)]'} relative overflow-hidden px-3 py-2 text-white sm:px-6 sm:py-4 lg:px-14 lg:py-8`}
      style={{
        backgroundColor: '#000',
        backgroundImage: `linear-gradient(160deg, rgba(3, 5, 8, 0.72) 0%, rgba(4, 7, 12, 0.66) 45%, rgba(6, 8, 12, 0.78) 100%), url(/background.png)`,
        backgroundSize: 'cover, contain',
        backgroundPosition: 'center, center',
        backgroundRepeat: 'no-repeat, no-repeat',
      }}
    >
      {/* Pulse overlay */}
      <div
        key={pulseKey}
        className="pointer-events-none absolute inset-0 animate-[scl-pulse_1100ms_ease-out_forwards] bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.28),transparent_60%)] opacity-0"
      />
      <style>{`
        @keyframes scl-pulse {
          0% { opacity: 0; transform: scale(0.96); }
          25% { opacity: 1; }
          100% { opacity: 0; transform: scale(1.04); }
        }
      `}</style>

      <div className="relative mx-auto max-w-[1600px]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between" data-skip-export="1">
          <div className="ls-ui-font flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-zinc-500 sm:text-[12px] lg:text-[14px]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Live Score Card
          </div>
          <div className="flex gap-2">
            <Button
              size="sm" variant="outline" disabled={exporting || !card}
              className="ls-ui-font h-8 rounded-md border-zinc-500/60 bg-black/30 px-3 text-[11px] uppercase tracking-[0.18em] text-zinc-100 hover:bg-black/45"
              onClick={() => void exportPng()}
            >
              <Download className="mr-1 h-3 w-3" />
              {exporting ? 'Exporting…' : 'PNG'}
            </Button>
            <Button
              size="sm" variant="outline"
              className="ls-ui-font h-8 rounded-md border-zinc-500/60 bg-black/30 px-3 text-[11px] uppercase tracking-[0.18em] text-zinc-100 hover:bg-black/45"
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <div className="mt-10 space-y-4">
            <div className="h-32 animate-pulse rounded-2xl bg-black/40" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-black/40" />)}
            </div>
          </div>
        ) : !card || !sc || !shooter || !stage ? (
          <div className="mt-16 rounded-2xl bg-black/45 p-16 text-center">
            <div className="ls-title-font text-xl font-black uppercase tracking-[0.16em] text-zinc-300 sm:text-2xl lg:text-4xl">
              Waiting for Live Result
            </div>
            <p className="ls-ui-font mt-3 text-sm uppercase tracking-[0.24em] text-zinc-500 md:text-base">
              The next submitted score card will appear here automatically.
            </p>
          </div>
        ) : (
          <div ref={cardRef}>
            <div className={`relative transition-all duration-700 ease-out ${revealed ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'}`}>
              {/* Shooter info */}
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="ls-ui-font flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-400 sm:text-[12px] lg:text-[16px] xl:text-[18px]">
                    <span className="rounded-md border border-red-500/60 bg-red-500/15 px-2 py-1 text-red-300">
                      #{String(shooter.bib_number ?? '').padStart(4, '0')}
                    </span>
                    {shooter.division_name && (
                      <span className="rounded-md border border-zinc-600 bg-black/40 px-2 py-1 text-zinc-200">
                        {shooter.division_name}
                      </span>
                    )}
                    {catLabel && (
                      <span className="rounded-md border border-zinc-600 bg-black/40 px-2 py-1 text-zinc-200">
                        {catLabel}
                      </span>
                    )}
                    {shooter.club && (
                      <span className="text-zinc-400">{shooter.club}</span>
                    )}
                  </div>
                  <h1 className="ls-title-font mt-3 text-3xl font-black italic uppercase leading-none tracking-[0.02em] text-zinc-100 sm:text-5xl lg:text-[86px] xl:text-[100px]">
                    {shooter.name}
                  </h1>
                  <div className="ls-ui-font mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400 sm:text-[13px] lg:text-[17px] xl:text-[20px]">
                    <span className="text-red-400">{stage.name}</span>
                    <span>·</span>
                    <span className={isNormal ? 'text-emerald-400' : sc?.status === 'dq' ? 'text-red-400' : 'text-amber-400'}>
                      {statusUpper}
                    </span>
                    <span>·</span>
                    <span className="text-zinc-500">{relativeTime(sc.submitted_at)}</span>
                  </div>
                </div>

                {/* Big metrics */}
                <div className="relative mt-6 grid grid-cols-3 gap-3 pl-0 sm:mt-8 sm:gap-4 sm:pl-4 lg:mt-10 lg:gap-6 lg:pl-16 xl:pl-24" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <div className="min-w-0 text-center">
                    <MetricCard label="Hit Factor" value={fmt(sc.hit_factor, 4)} reveal={revealed} delay={120} emphasize />
                  </div>
                  <div className="min-w-0 text-center">
                    <MetricCard label="Points" value={fmt(sc.total_points, 0)} reveal={revealed} delay={220} />
                  </div>
                  <div className="min-w-0 text-center">
                    <MetricCard label="Time" value={`${fmt(sc.total_time, 2)}s`} reveal={revealed} delay={320} />
                  </div>
                </div>
              </div>

              {/* Hit stats */}
              <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3 lg:grid-cols-6 lg:gap-4">
                <StatCard label="A" value={hits.A} accent="green" reveal={revealed} delay={420} />
                <StatCard label="C" value={hits.C} accent="sky" reveal={revealed} delay={480} />
                <StatCard label="D" value={hits.D} accent="amber" reveal={revealed} delay={540} />
                <StatCard label="M" value={hits.M} accent="red" reveal={revealed} delay={600} />
                <StatCard label="NS" value={hits.NS} accent="orange" reveal={revealed} delay={660} />
                <StatCard label="PE" value={totalPE} accent="red" reveal={revealed} delay={720} />
              </div>

              {/* Timing + Per-Target Breakdown */}
              <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-[1fr_1.4fr]">
                {/* Timing */}
                <div className={`rounded-2xl border border-zinc-700/60 bg-black/45 p-3 sm:p-4 lg:p-5 transition-all duration-700 ease-out ${revealed ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`} style={{ transitionDelay: '840ms' }}>
                  <div className="ls-ui-font text-[9px] font-bold uppercase tracking-[0.32em] text-zinc-400 sm:text-[10px] lg:text-[12px]">Timing</div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="ls-ui-font text-xs uppercase tracking-[0.22em] text-zinc-500">First Shot</span>
                      <span className="ls-number-font text-lg font-black text-zinc-100 sm:text-xl lg:text-2xl">
                        {sc.first_shot == null ? '—' : `${fmt(sc.first_shot, 2)}s`}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="ls-ui-font text-xs uppercase tracking-[0.22em] text-zinc-500">Fastest Split</span>
                      <span className="ls-number-font text-2xl font-black text-zinc-100">
                        {sc.fastest_split == null ? '—' : `${fmt(sc.fastest_split, 2)}s`}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="ls-ui-font text-xs uppercase tracking-[0.22em] text-zinc-500">Total Time</span>
                      <span className="ls-number-font text-2xl font-black text-zinc-100">
                        {fmt(sc.total_time, 2)}s
                      </span>
                    </div>
                  </div>
                  {card.penalty_reasons.length > 0 && (
                    <div className="mt-5 border-t border-zinc-700/60 pt-4">
                      <div className="ls-ui-font text-[10px] font-bold uppercase tracking-[0.32em] text-zinc-400 md:text-[12px]">Procedural</div>
                      <div className="mt-2 space-y-1 text-sm text-zinc-300">
                        {card.penalty_reasons.map(p => (
                          <div key={p.reason_code} className="flex items-center justify-between">
                            <span className="truncate">{p.reason_code} · {p.reason_label}</span>
                            <span className="ls-number-font font-bold text-red-400">×{p.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Per-Target Breakdown */}
                <div className={`rounded-2xl border border-zinc-700/60 bg-black/45 p-5 transition-all duration-700 ease-out ${revealed ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`} style={{ transitionDelay: '900ms' }}>
                  <div className="ls-ui-font text-[10px] font-bold uppercase tracking-[0.32em] text-zinc-400 md:text-[12px]">Per-Target Breakdown</div>
                  {card.rows.length === 0 ? (
                    <div className="mt-4 text-sm text-zinc-500">No per-target rows recorded.</div>
                  ) : (
                    <div className="mt-3 overflow-hidden rounded-lg border border-zinc-700/60">
                      <table className="w-full text-[11px] sm:text-sm">
                        <thead className="bg-black/40 text-zinc-400">
                          <tr className="ls-ui-font uppercase tracking-[0.16em]">
                            <th className="px-1.5 py-1 text-left text-[9px] sm:px-2 sm:py-1.5 sm:text-[10px]">Target</th>
                            <th className="px-1.5 py-1 text-right text-[9px] sm:px-2 sm:py-1.5 sm:text-[10px] text-emerald-400">A</th>
                            <th className="px-1.5 py-1 text-right text-[9px] sm:px-2 sm:py-1.5 sm:text-[10px] text-sky-300">C</th>
                            <th className="px-1.5 py-1 text-right text-[9px] sm:px-2 sm:py-1.5 sm:text-[10px] text-amber-300">D</th>
                            <th className="px-1.5 py-1 text-right text-[9px] sm:px-2 sm:py-1.5 sm:text-[10px] text-red-400">M</th>
                            <th className="px-1.5 py-1 text-right text-[9px] sm:px-2 sm:py-1.5 sm:text-[10px] text-orange-400">NS</th>
                          </tr>
                        </thead>
                        <tbody className="ls-number-font">
                          {card.rows.map((r, i) => (
                            <tr key={`${r.row_type}-${r.row_no}-${i}`} className="border-t border-zinc-800/80 text-zinc-200">
                              <td className="px-1.5 py-1 text-left text-[10px] uppercase tracking-[0.16em] text-zinc-400 sm:px-2 sm:py-1.5 sm:text-xs">
                                {r.row_type === 'steel' ? 'S' : 'P'}{r.row_no}
                              </td>
                              <td className="px-1.5 py-1 text-right sm:px-2 sm:py-1.5">{r.a_hits}</td>
                              <td className="px-1.5 py-1 text-right sm:px-2 sm:py-1.5">{r.c_hits}</td>
                              <td className="px-1.5 py-1 text-right sm:px-2 sm:py-1.5">{r.d_hits}</td>
                              <td className="px-1.5 py-1 text-right sm:px-2 sm:py-1.5">{r.m_hits}</td>
                              <td className="px-1.5 py-1 text-right sm:px-2 sm:py-1.5">{r.ns_hits}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
