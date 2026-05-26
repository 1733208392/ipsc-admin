import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { Download } from 'lucide-react'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { LivestreamScoreCard, Match } from '@/types'

import { Button } from '@/components/ui/button'
import backgroundImage from '@/assets/background.png'

const POLL_INTERVAL_MS = 2500

const categoryLabel: Record<string, string> = {
  J: 'Junior',
  S: 'Senior',
  SJ: 'Super Junior',
  L: 'Lady',
}

function formatNumber(value: number | null | undefined, digits: number): string {
  return Number(value ?? 0).toFixed(digits)
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 5) return 'JUST NOW'
  if (diffSec < 60) return `${diffSec}s AGO`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m AGO`
  return `${Math.floor(diffSec / 3600)}h AGO`
}

interface RowTotals {
  A: number
  C: number
  D: number
  M: number
  NS: number
}

function calcRowTotals(detail: LivestreamScoreCard | null): RowTotals {
  if (!detail) return { A: 0, C: 0, D: 0, M: 0, NS: 0 }
  return detail.rows.reduce(
    (acc, row) => {
      acc.A += row.a_hits
      acc.C += row.c_hits
      acc.D += row.d_hits
      acc.M += row.m_hits
      acc.NS += row.ns_hits
      return acc
    },
    { A: 0, C: 0, D: 0, M: 0, NS: 0 }
  )
}

function StatTile({
  label,
  value,
  accent,
  delay,
  reveal,
}: {
  label: string
  value: string | number
  accent: 'green' | 'sky' | 'amber' | 'red' | 'orange' | 'slate'
  delay: number
  reveal: boolean
}) {
  const accentMap: Record<string, string> = {
    green: 'text-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.18)]',
    sky: 'text-sky-300 shadow-[0_0_28px_rgba(56,189,248,0.18)]',
    amber: 'text-amber-300 shadow-[0_0_28px_rgba(251,191,36,0.18)]',
    red: 'text-red-400 shadow-[0_0_28px_rgba(248,113,113,0.18)]',
    orange: 'text-orange-400 shadow-[0_0_28px_rgba(251,146,60,0.18)]',
    slate: 'text-zinc-200 shadow-[0_0_28px_rgba(148,163,184,0.12)]',
  }
  return (
    <div
      className={`relative flex flex-col items-center justify-center border-2 border-white bg-black/45 px-4 py-5 backdrop-blur-sm transition-all duration-700 ease-out ${accentMap[accent]} ${
        reveal ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="ls-ui-font text-2xl font-bold uppercase tracking-[0.32em] text-zinc-300 md:text-[31px]">
        {label}
      </div>
      <div className="ls-number-font mt-2 text-[56px] font-black leading-none md:text-[88px]">{value}</div>
    </div>
  )
}

function HeroMetric({
  label,
  value,
  delay,
  reveal,
  emphasize,
}: {
  label: string
  value: string
  delay: number
  reveal: boolean
  emphasize?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center transition-all duration-700 ease-out ${
        reveal ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="ls-ui-font text-[16px] font-bold uppercase tracking-[0.34em] text-zinc-400 md:text-[20px]">
        {label}
      </div>
      <div
        className={`ls-number-font mt-2 font-black leading-none ${
          emphasize
            ? 'bg-gradient-to-b from-red-300 via-red-500 to-red-700 bg-clip-text text-transparent text-[82px] md:text-[130px]'
            : 'text-zinc-100 text-[65px] md:text-[98px]'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

export function ScoreCardLivestreamPage() {
  const { id: paramMatchId } = useParams<{ id: string }>()
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  // When no :id in the URL, follow the currently active match (and switch automatically when it changes).
  const [resolvedMatchId, setResolvedMatchId] = useState<string | undefined>(paramMatchId)
  const matchId = paramMatchId ?? resolvedMatchId

  const [detail, setDetail] = useState<LivestreamScoreCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [pulseKey, setPulseKey] = useState(0)
  const [exporting, setExporting] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastScoreIdRef = useRef<number | null>(null)
  const errorReportedRef = useRef(false)

  async function loadMatchOnce() {
    if (!matchId) return
    try {
      const match = await api.get<Match>(`/matches/${matchId}`)
      setCurrentMatch(match)
    } catch {
      // non-fatal — livestream still works without match context in sidebar
    }
  }

  async function pollLatest() {
    // If no explicit matchId in URL, resolve the currently active match each tick.
    let activeId = matchId
    if (!paramMatchId) {
      try {
        const active = await api.get<Match | null>(`/matches/livestream/active`)
        const nextId = active?.id != null ? String(active.id) : undefined
        if (nextId && nextId !== resolvedMatchId) {
          setResolvedMatchId(nextId)
          // reset spotlight when switching matches
          lastScoreIdRef.current = null
          setDetail(null)
          setReveal(false)
        }
        activeId = nextId
      } catch {
        // ignore — keep using last known id
      }
    }
    if (!activeId) {
      setLoading(false)
      return
    }
    try {
      const next = await api.get<LivestreamScoreCard | null>(
        `/matches/${activeId}/scores/livestream/latest`
      )
      errorReportedRef.current = false
      setLoading(false)

      if (!next || !next.score) {
        if (lastScoreIdRef.current !== null) {
          lastScoreIdRef.current = null
          setDetail(null)
          setReveal(false)
        } else {
          setDetail(null)
        }
        return
      }

      const newId = next.score.id
      if (newId !== lastScoreIdRef.current) {
        lastScoreIdRef.current = newId
        setDetail(next)
        // restart entrance animation + accent pulse
        setReveal(false)
        setPulseKey((k) => k + 1)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setReveal(true))
        })
      } else {
        // same score id — refresh underlying data quietly
        setDetail(next)
      }
    } catch (e) {
      setLoading(false)
      if (!errorReportedRef.current) {
        errorReportedRef.current = true
        toast({
          title: 'Livestream refresh failed',
          description: String(e),
          variant: 'destructive',
        })
      }
    }
  }

  useEffect(() => {
    setLoading(true)
    void loadMatchOnce()
    void pollLatest()

    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      void pollLatest()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  async function handleToggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (e) {
      toast({ title: 'Fullscreen is not available', description: String(e), variant: 'destructive' })
    }
  }

  async function handleDownloadPng() {
    if (!captureRef.current) return
    try {
      setExporting(true)
      const dataUrl = await toPng(captureRef.current, {
        backgroundColor: undefined,
        pixelRatio: 2,
        cacheBust: true,
        filter: (node) =>
          !(node instanceof HTMLElement && node.dataset.skipExport === '1'),
      })
      const a = document.createElement('a')
      const shooterName = detail?.shooter?.name ?? 'score-card'
      const stageName = detail?.stage?.name ?? 'stage'
      a.download = `${shooterName}-${stageName}-${Date.now()}.png`.replace(/\s+/g, '_')
      a.href = dataUrl
      a.click()
    } catch (e) {
      toast({ title: 'Export failed', description: String(e), variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const totals = useMemo(() => calcRowTotals(detail), [detail])
  const totalPE = useMemo(
    () => (detail ? detail.penalty_reasons.reduce((sum, r) => sum + r.count, 0) : 0),
    [detail]
  )
  const score = detail?.score ?? null
  const shooter = detail?.shooter
  const stage = detail?.stage
  const statusLabel = (score?.status ?? 'normal').toUpperCase()
  const isNormal = (score?.status ?? 'normal') === 'normal'
  const categoryText = shooter?.category_code ? categoryLabel[shooter.category_code] ?? shooter.category_code : null

  return (
    <div
      key={pulseKey}
      className={`${isFullscreen ? 'min-h-screen' : 'min-h-[calc(100vh-3rem)]'} relative overflow-hidden px-6 py-4 text-white md:px-14 md:py-8`}
      style={{
        backgroundColor: '#000',
        backgroundImage: `linear-gradient(160deg, rgba(3, 5, 8, 0.72) 0%, rgba(4, 7, 12, 0.66) 45%, rgba(6, 8, 12, 0.78) 100%), url(${backgroundImage})`,
        backgroundSize: 'cover, contain',
        backgroundPosition: 'center, center',
        backgroundRepeat: 'no-repeat, no-repeat',
      }}
    >
      {/* accent pulse when a new submission lands */}
      <div
        key={`pulse-${pulseKey}`}
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
        <div className="mb-4 flex items-center justify-between" data-skip-export="1">
          <div className="ls-ui-font flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.32em] text-zinc-500 md:text-[14px]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Live Score Card
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={exporting || !detail}
              className="ls-ui-font h-8 rounded-md border-zinc-500/60 bg-black/30 px-3 text-[11px] uppercase tracking-[0.18em] text-zinc-100 hover:bg-black/45"
              onClick={() => void handleDownloadPng()}
            >
              <Download className="mr-1 h-3 w-3" />
              {exporting ? 'Exporting…' : 'PNG'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="ls-ui-font h-8 rounded-md border-zinc-500/60 bg-black/30 px-3 text-[11px] uppercase tracking-[0.18em] text-zinc-100 hover:bg-black/45"
              onClick={() => void handleToggleFullscreen()}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="mt-10 space-y-4">
            <div className="h-32 animate-pulse rounded-2xl bg-black/40" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-black/40" />
              ))}
            </div>
          </div>
        ) : !detail || !score || !shooter || !stage ? (
          <div className="mt-16 rounded-2xl bg-black/45 p-16 text-center">
            <div className="ls-title-font text-2xl font-black uppercase tracking-[0.16em] text-zinc-300 md:text-4xl">
              Waiting for Live Result
            </div>
            <p className="ls-ui-font mt-3 text-sm uppercase tracking-[0.24em] text-zinc-500 md:text-base">
              The next submitted score card will appear here automatically.
            </p>
          </div>
        ) : (
          <div ref={captureRef}>
            {/* HERO: shooter identity */}
            <div
              className={`relative transition-all duration-700 ease-out ${
                reveal ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'
              }`}
            >
              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="ls-ui-font flex flex-wrap items-center gap-3 text-[12px] font-bold uppercase tracking-[0.28em] text-zinc-400 md:text-[16px]">
                    <span className="rounded-md border border-red-500/60 bg-red-500/15 px-2 py-1 text-red-300">
                      #{String(shooter.bib_number ?? '').padStart(4, '0')}
                    </span>
                    {shooter.division_name ? (
                      <span className="rounded-md border border-zinc-600 bg-black/40 px-2 py-1 text-zinc-200">
                        {shooter.division_name}
                      </span>
                    ) : null}
                    {categoryText ? (
                      <span className="rounded-md border border-zinc-600 bg-black/40 px-2 py-1 text-zinc-200">
                        {categoryText}
                      </span>
                    ) : null}
                    {shooter.club ? <span className="text-zinc-400">{shooter.club}</span> : null}
                  </div>
                  <h1 className="ls-title-font mt-3 text-5xl font-black italic uppercase leading-none tracking-[0.02em] text-zinc-100 md:text-[86px]">
                    {shooter.name}
                  </h1>
                  <div className="ls-ui-font mt-3 flex flex-wrap items-center gap-3 text-[13px] font-semibold uppercase tracking-[0.24em] text-zinc-400 md:text-[17px]">
                    <span className="text-red-400">{stage.name}</span>
                    <span>·</span>
                    <span
                      className={
                        isNormal
                          ? 'text-emerald-400'
                          : (score.status === 'dq' ? 'text-red-400' : 'text-amber-400')
                      }
                    >
                      {statusLabel}
                    </span>
                    <span>·</span>
                    <span className="text-zinc-500">{formatRelativeTime(score.submitted_at)}</span>
                  </div>
                </div>
              </div>

              {/* HERO metrics */}
              <div className="relative mt-8 grid grid-cols-3 gap-6 pl-8 md:mt-10 md:pl-24">
                <div className="min-w-0 text-center">
                  <HeroMetric label="Hit Factor" value={formatNumber(score.hit_factor, 4)} reveal={reveal} delay={120} emphasize />
                </div>
                <div className="min-w-0 text-center">
                  <HeroMetric label="Points" value={formatNumber(score.total_points, 0)} reveal={reveal} delay={220} />
                </div>
                <div className="min-w-0 text-center">
                  <HeroMetric label="Time" value={`${formatNumber(score.total_time, 2)}s`} reveal={reveal} delay={320} />
                </div>
              </div>
            </div>

            {/* STAT TILES */}
            <div className="mt-6 grid grid-cols-3 gap-3 md:grid-cols-6 md:gap-4">
              <StatTile label="A" value={totals.A} accent="green" reveal={reveal} delay={420} />
              <StatTile label="C" value={totals.C} accent="sky" reveal={reveal} delay={480} />
              <StatTile label="D" value={totals.D} accent="amber" reveal={reveal} delay={540} />
              <StatTile label="M" value={totals.M} accent="red" reveal={reveal} delay={600} />
              <StatTile label="NS" value={totals.NS} accent="orange" reveal={reveal} delay={660} />
              <StatTile label="PE" value={totalPE} accent="red" reveal={reveal} delay={720} />
            </div>

            {/* SECONDARY: timing + score card grid */}
            <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1.4fr]">
              <div
                className={`rounded-2xl border border-zinc-700/60 bg-black/45 p-5 transition-all duration-700 ease-out ${
                  reveal ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                }`}
                style={{ transitionDelay: '840ms' }}
              >
                <div className="ls-ui-font text-[10px] font-bold uppercase tracking-[0.32em] text-zinc-400 md:text-[12px]">
                  Timing
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="ls-ui-font text-xs uppercase tracking-[0.22em] text-zinc-500">First Shot</span>
                    <span className="ls-number-font text-2xl font-black text-zinc-100">
                      {score.first_shot != null ? `${formatNumber(score.first_shot, 2)}s` : '—'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="ls-ui-font text-xs uppercase tracking-[0.22em] text-zinc-500">Fastest Split</span>
                    <span className="ls-number-font text-2xl font-black text-zinc-100">
                      {score.fastest_split != null ? `${formatNumber(score.fastest_split, 2)}s` : '—'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="ls-ui-font text-xs uppercase tracking-[0.22em] text-zinc-500">Total Time</span>
                    <span className="ls-number-font text-2xl font-black text-zinc-100">
                      {formatNumber(score.total_time, 2)}s
                    </span>
                  </div>
                </div>

                {detail.penalty_reasons.length > 0 ? (
                  <div className="mt-5 border-t border-zinc-700/60 pt-4">
                    <div className="ls-ui-font text-[10px] font-bold uppercase tracking-[0.32em] text-zinc-400 md:text-[12px]">
                      Procedural
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-zinc-300">
                      {detail.penalty_reasons.map((r) => (
                        <div key={r.reason_code} className="flex items-center justify-between">
                          <span className="truncate">{r.reason_code} · {r.reason_label}</span>
                          <span className="ls-number-font font-bold text-red-400">×{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div
                className={`rounded-2xl border border-zinc-700/60 bg-black/45 p-5 transition-all duration-700 ease-out ${
                  reveal ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                }`}
                style={{ transitionDelay: '900ms' }}
              >
                <div className="ls-ui-font text-[10px] font-bold uppercase tracking-[0.32em] text-zinc-400 md:text-[12px]">
                  Per-Target Breakdown
                </div>
                {detail.rows.length === 0 ? (
                  <div className="mt-4 text-sm text-zinc-500">No per-target rows recorded.</div>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-lg border border-zinc-700/60">
                    <table className="w-full text-sm">
                      <thead className="bg-black/40 text-zinc-400">
                        <tr className="ls-ui-font uppercase tracking-[0.16em]">
                          <th className="px-2 py-1.5 text-left text-[10px]">Target</th>
                          <th className="px-2 py-1.5 text-right text-[10px] text-emerald-400">A</th>
                          <th className="px-2 py-1.5 text-right text-[10px] text-sky-300">C</th>
                          <th className="px-2 py-1.5 text-right text-[10px] text-amber-300">D</th>
                          <th className="px-2 py-1.5 text-right text-[10px] text-red-400">M</th>
                          <th className="px-2 py-1.5 text-right text-[10px] text-orange-400">NS</th>
                        </tr>
                      </thead>
                      <tbody className="ls-number-font">
                        {detail.rows.map((row, idx) => (
                          <tr key={`${row.row_type}-${row.row_no}-${idx}`} className="border-t border-zinc-800/80 text-zinc-200">
                            <td className="px-2 py-1.5 text-left text-xs uppercase tracking-[0.16em] text-zinc-400">
                              {row.row_type === 'steel' ? 'S' : 'P'}{row.row_no}
                            </td>
                            <td className="px-2 py-1.5 text-right">{row.a_hits}</td>
                            <td className="px-2 py-1.5 text-right">{row.c_hits}</td>
                            <td className="px-2 py-1.5 text-right">{row.d_hits}</td>
                            <td className="px-2 py-1.5 text-right">{row.m_hits}</td>
                            <td className="px-2 py-1.5 text-right">{row.ns_hits}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
