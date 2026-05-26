import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Division, LeaderboardEntry, LeaderboardResponse, Match, Stage } from '@/types'

import { Button } from '@/components/ui/button'
import backgroundImage from '@/assets/background.png'
import rowBackgroundOne from '@/assets/row-1.png'
import rowBackgroundTwo from '@/assets/row-2.png'

const supportedDivisionCodes = new Set<Division['code']>(['production', 'optics', 'standard'])

const categories = [
  { value: '', label: 'All' },
  { value: 'junior', label: 'Junior' },
  { value: 'senior', label: 'Senior' },
  { value: 'super_junior', label: 'Super Junior' },
  { value: 'lady', label: 'Lady' },
] as const

function formatNumeric(value: number | undefined, digits: number): string {
  return Number(value ?? 0).toFixed(digits)
}

function getAlternatingRowBackground(index: number): string {
  return index % 2 === 0 ? rowBackgroundOne : rowBackgroundTwo
}

export function LeaderboardLivestreamPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDivision, setSelectedDivision] = useState<string>('')
  const [selectedStage, setSelectedStage] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const switchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeCategoryLabel = useMemo(
    () => categories.find((c) => c.value === selectedCategory)?.label ?? 'All',
    [selectedCategory]
  )

  const activeDivisionName = useMemo(
    () => divisions.find((d) => String(d.id) === selectedDivision)?.name ?? 'No Division',
    [divisions, selectedDivision]
  )

  const activeStageName = useMemo(
    () => stages.find((s) => String(s.id) === selectedStage)?.name ?? '',
    [stages, selectedStage]
  )

  const gridTemplate = useMemo(() => {
    // Rank | Name | Time | Hit Factor | Percentage | Stage Points
    return '110px 1.6fr 0.9fr 0.9fr 0.9fr 1.0fr'
  }, [])

  async function load() {
    if (!matchId) return

    try {
      const [divsData, stagesData, match] = await Promise.all([
        api.get<Division[]>(`/matches/${matchId}/divisions`),
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Match>(`/matches/${matchId}`),
      ])

      const visibleDivisions = [...divsData]
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((d) => supportedDivisionCodes.has(d.code))
      const sortedStages = [...stagesData].sort((a, b) => a.sort_order - b.sort_order)
      const effectiveDivision = selectedDivision || (visibleDivisions[0] ? String(visibleDivisions[0].id) : '')
      const effectiveStage = selectedStage || (sortedStages[0] ? String(sortedStages[0].id) : '')

      if (effectiveDivision !== selectedDivision) {
        setSelectedDivision(effectiveDivision)
      }
      if (effectiveStage !== selectedStage) {
        setSelectedStage(effectiveStage)
      }

      let nextRankings: LeaderboardEntry[] = []
      if (effectiveDivision && effectiveStage) {
        const params = new URLSearchParams()
        params.set('division_id', effectiveDivision)
        params.set('stage_id', effectiveStage)
        if (selectedCategory) {
          params.set('category', selectedCategory)
        }

        const url = `/matches/${matchId}/leaderboard?${params.toString()}`
        const leaderboardResp = await api.get<LeaderboardResponse>(url)
        nextRankings = leaderboardResp.rankings
      }

      setRankings(nextRankings)
      setDivisions(visibleDivisions)
      setStages(sortedStages)
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: 'Failed to load livestream leaderboard', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void load()
  }, [matchId, selectedDivision, selectedStage, selectedCategory])

  // Auto-rotate: every 10s advance the stage; when the stage list wraps,
  // advance to the next division. This cycles through every (division, stage)
  // combination so the broadcast covers everything.
  useEffect(() => {
    if (switchIntervalRef.current) {
      clearInterval(switchIntervalRef.current)
    }

    if (!autoRotate) {
      return
    }

    if (divisions.length <= 1) {
      return
    }

    switchIntervalRef.current = setInterval(() => {
      const divIdx = divisions.findIndex((d) => String(d.id) === selectedDivision)
      const nextDivIdx = divIdx < 0 ? 0 : (divIdx + 1) % divisions.length
      setSelectedDivision(String(divisions[nextDivIdx].id))
    }, 7000)

    return () => {
      if (switchIntervalRef.current) {
        clearInterval(switchIntervalRef.current)
      }
    }
  }, [divisions, stages, selectedDivision, selectedStage, autoRotate])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
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

  return (
    <div
      className={`${isFullscreen ? 'min-h-screen' : 'min-h-[calc(100vh-3rem)]'} px-3 py-4 text-white md:px-8 md:py-8`}
      style={{
        backgroundColor: '#000',
        backgroundImage: `linear-gradient(160deg, rgba(3, 5, 8, 0.62) 0%, rgba(4, 7, 12, 0.56) 45%, rgba(6, 8, 12, 0.62) 100%), url(${backgroundImage})`,
        backgroundSize: 'cover, contain',
        backgroundPosition: 'center, center',
        backgroundRepeat: 'no-repeat, no-repeat',
      }}
    >
      <div className="mx-auto max-w-[1600px] rounded-2xl p-3 md:p-6">
        <div className="relative overflow-hidden rounded-xl px-4 pb-4 pt-3 md:px-10 md:pb-8 md:pt-5">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />

          <div className="relative mb-4 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="ls-ui-font h-8 rounded-md border-zinc-500/60 bg-black/30 px-3 text-[11px] uppercase tracking-[0.18em] text-zinc-100 hover:bg-black/45"
              onClick={() => void handleToggleFullscreen()}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
          </div>

          <div className="relative text-center">
            <h1 className="ls-title-font text-[22px] font-black italic uppercase leading-none tracking-[0.03em] text-zinc-100 md:text-[44px]">
              <span className="bg-gradient-to-b from-zinc-100 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                {activeDivisionName}
              </span>
              <span className="mx-2 text-red-600 md:mx-4">/</span>
              <span className="text-red-500">{activeCategoryLabel.toUpperCase()}</span>
            </h1>
            <p className="ls-ui-font mt-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-zinc-500 md:text-[14px]">
              {activeStageName ? `Stage · ${activeStageName}` : 'IPSC Shooting Game'}
            </p>
          </div>

          {stages.length > 0 && (
            <div className="relative mt-6 flex flex-wrap justify-center gap-2 md:mt-8 md:gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoRotate(true)}
                className={`ls-ui-font h-9 min-w-20 rounded-none border px-4 text-[11px] font-bold uppercase tracking-[0.08em] [clip-path:polygon(7%_0,93%_0,100%_50%,93%_100%,7%_100%,0_50%)] md:min-w-28 md:text-base ${
                  autoRotate
                    ? 'border-red-500/90 bg-[linear-gradient(110deg,rgba(127,29,29,0.96),rgba(239,68,68,0.72))] text-zinc-100 shadow-[0_0_24px_rgba(239,68,68,0.35)]'
                    : 'border-zinc-600 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                Auto
              </Button>
              {stages.map((s) => {
                const active = !autoRotate && String(s.id) === selectedStage
                return (
                  <Button
                    key={s.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAutoRotate(false)
                      setSelectedStage(String(s.id))
                    }}
                    className={`ls-ui-font h-9 min-w-20 rounded-none border px-4 text-[11px] font-bold uppercase tracking-[0.08em] [clip-path:polygon(7%_0,93%_0,100%_50%,93%_100%,7%_100%,0_50%)] md:min-w-28 md:text-base ${
                      active
                        ? 'border-red-500/90 bg-[linear-gradient(110deg,rgba(127,29,29,0.96),rgba(239,68,68,0.72))] text-zinc-100 shadow-[0_0_24px_rgba(239,68,68,0.35)]'
                        : 'border-zinc-600 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {s.name}
                  </Button>
                )
              })}
            </div>
          )}

          <div className="relative mt-10 flex flex-wrap justify-center gap-2 md:mt-12 md:gap-3">
            {categories.map((c) => (
              <Button
                key={c.value || 'all-category'}
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategory(c.value)}
                className={`ls-ui-font h-10 min-w-24 rounded-none border px-5 text-xs font-bold uppercase tracking-[0.08em] [clip-path:polygon(7%_0,93%_0,100%_50%,93%_100%,7%_100%,0_50%)] md:min-w-36 md:text-lg ${
                  selectedCategory === c.value
                    ? 'border-red-500/90 bg-[linear-gradient(110deg,rgba(127,29,29,0.96),rgba(239,68,68,0.72))] text-zinc-100 shadow-[0_0_24px_rgba(239,68,68,0.35)]'
                    : 'border-zinc-600 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-black/35" />
            ))}
          </div>
        ) : divisions.length === 0 ? (
          <div className="mt-4 rounded-xl bg-black/35 p-10 text-center text-zinc-300">
            No eligible divisions to display. Livestream supports Production, Production Optics, and Standard only.
          </div>
        ) : stages.length === 0 ? (
          <div className="mt-4 rounded-xl bg-black/35 p-10 text-center text-zinc-300">
            No stages configured for this match.
          </div>
        ) : rankings.length === 0 ? (
          <div className="mt-4 rounded-xl bg-black/35 p-10 text-center text-zinc-300">
            No rankings found for this division and category.
          </div>
        ) : (
          <div className="mt-4">
            <div
              className="ls-ui-font grid items-center rounded-t-lg bg-black/35 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-300 md:px-6 md:text-[16px] md:tracking-[0.08em]"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <span>Rank</span>
              <span>Name</span>
              <span className="text-right">Time</span>
              <span className="text-right">Hit Factor</span>
              <span className="text-right">%</span>
              <span className="text-right text-red-400">Stage Pts</span>
            </div>

            <div className="space-y-3 p-2 md:p-4">
              {rankings.map((entry, idx) => {
                const rank = entry.rank_in_stage ?? entry.rank ?? idx + 1
                const rowBackground = getAlternatingRowBackground(idx)
                return (
                  <div
                    key={entry.id}
                    className="relative bg-center bg-no-repeat px-3 py-3 text-white md:grid md:px-6 md:py-4"
                    style={{
                      backgroundImage: `url(${rowBackground})`,
                      backgroundSize: '100% 100%',
                      gridTemplateColumns: gridTemplate,
                    }}
                  >
                    <div className="relative grid grid-cols-[72px_1fr] items-center gap-2 md:block">
                      <div className="ls-number-font text-4xl font-black leading-none text-zinc-100 md:text-[44px]">{rank}</div>
                    </div>
                    <div className="relative pr-2">
                      <div className="ls-title-font truncate text-xl font-black text-zinc-100 md:text-[28px]">{entry.name}</div>
                      <div className="ls-ui-font mt-1 text-[10px] font-semibold tracking-[0.2em] text-zinc-400 md:text-[13px]">
                        #{String(entry.bib_number ?? '').padStart(4, '0')}
                      </div>
                    </div>
                    <div className="ls-number-font relative mt-2 text-right text-2xl font-black text-zinc-100 md:mt-0 md:text-[32px]">
                      {entry.total_time != null ? `${formatNumeric(entry.total_time, 2)}s` : '—'}
                    </div>
                    <div className="ls-number-font relative mt-2 text-right text-2xl font-black text-zinc-100 md:mt-0 md:text-[32px]">
                      {entry.hit_factor != null ? formatNumeric(entry.hit_factor, 4) : '—'}
                    </div>
                    <div className="ls-number-font relative mt-2 text-right text-2xl font-black text-zinc-100 md:mt-0 md:text-[32px]">
                      {entry.percentage != null ? `${formatNumeric(entry.percentage, 2)}%` : '—'}
                    </div>
                    <div className="ls-number-font relative mt-2 text-right text-2xl font-black text-red-400 md:mt-0 md:text-[32px]">
                      {formatNumeric(entry.stage_points_earned, 2)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
