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
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [isFullscreen, setIsFullscreen] = useState(false)
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
      const effectiveStage = sortedStages[0] ? String(sortedStages[0].id) : ''

      if (effectiveDivision !== selectedDivision) {
        setSelectedDivision(effectiveDivision)
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
  }, [matchId, selectedDivision, selectedCategory])

  // 10s 自动刷新数据
  useEffect(() => {
    if (!matchId) return
    const refreshTimer = setInterval(() => {
      void load()
    }, 10000)
    return () => clearInterval(refreshTimer)
  }, [matchId, selectedDivision, selectedCategory])

  useEffect(() => {
    if (switchIntervalRef.current) {
      clearInterval(switchIntervalRef.current)
    }

    if (divisions.length <= 1) {
      return
    }

    switchIntervalRef.current = setInterval(() => {
      setSelectedDivision((current) => {
        const currentIndex = divisions.findIndex((d) => String(d.id) === current)
        if (currentIndex < 0) {
          return String(divisions[0].id)
        }

        const nextIndex = (currentIndex + 1) % divisions.length
        return String(divisions[nextIndex].id)
      })
    }, 10000)

    return () => {
      if (switchIntervalRef.current) {
        clearInterval(switchIntervalRef.current)
      }
    }
  }, [divisions])

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
      className={`${isFullscreen ? 'min-h-screen' : 'min-h-[calc(100vh-3rem)]'} px-2 py-2 text-white sm:px-4 sm:py-3 lg:px-8 lg:py-6 xl:px-8 xl:py-8`}
      style={{
        backgroundColor: '#000',
        backgroundImage: `linear-gradient(160deg, rgba(3, 5, 8, 0.62) 0%, rgba(4, 7, 12, 0.56) 45%, rgba(6, 8, 12, 0.62) 100%), url(${backgroundImage})`,
        backgroundSize: 'cover, contain',
        backgroundPosition: 'center, center',
        backgroundRepeat: 'no-repeat, no-repeat',
      }}
    >
      <div className="mx-auto max-w-[1600px] rounded-2xl p-2 sm:p-3 lg:p-5 xl:p-6">
        <div className="relative overflow-hidden rounded-xl px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3 lg:px-8 lg:pb-6 lg:pt-4 xl:px-10 xl:pb-8 xl:pt-5">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />

          <div className="relative mb-3 flex justify-end sm:mb-4">
            <Button
              size="sm"
              variant="outline"
              className="ls-ui-font h-7 rounded-md border-zinc-500/60 bg-black/30 px-2 text-[10px] uppercase tracking-[0.18em] text-zinc-100 hover:bg-black/45 sm:h-8 sm:px-3 sm:text-[11px]"
              onClick={() => void handleToggleFullscreen()}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
          </div>

          <div className="relative text-center">
            <h1 className="ls-title-font text-[16px] font-black italic uppercase leading-none tracking-[0.03em] text-zinc-100 sm:text-[20px] lg:text-[32px] xl:text-[44px]">
              <span className="bg-gradient-to-b from-zinc-100 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                {activeDivisionName}
              </span>
              <span className="mx-1 text-red-600 sm:mx-2 lg:mx-3 xl:mx-4">/</span>
              <span className="text-red-500">{activeCategoryLabel.toUpperCase()}</span>
            </h1>
            <p className="ls-ui-font mt-1 text-[8px] font-semibold uppercase tracking-[0.34em] text-zinc-500 sm:text-[9px] lg:text-[11px]">
              IPSC Shooting Game
            </p>
          </div>

          <div className="relative mt-6 flex flex-wrap justify-center gap-1.5 sm:mt-8 sm:gap-2 lg:mt-10 lg:gap-3 xl:mt-12">
            {categories.map((c) => (
              <Button
                key={c.value || 'all-category'}
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategory(c.value)}
                className={`ls-ui-font h-7 min-w-16 rounded-none border px-2 text-[9px] font-bold uppercase tracking-[0.08em] [clip-path:polygon(7%_0,93%_0,100%_50%,93%_100%,7%_100%,0_50%)] sm:h-8 sm:min-w-20 sm:px-3 sm:text-[10px] lg:h-10 lg:min-w-32 lg:px-5 lg:text-sm xl:min-w-36 xl:text-lg ${
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
          <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-black/35 sm:h-16 lg:h-20" />
            ))}
          </div>
        ) : divisions.length === 0 ? (
          <div className="mt-4 rounded-xl bg-black/35 p-6 text-center text-zinc-300 sm:p-8 lg:p-10">
            No eligible divisions to display. Livestream supports Production, Production Optics, and Standard only.
          </div>
        ) : stages.length === 0 ? (
          <div className="mt-4 rounded-xl bg-black/35 p-6 text-center text-zinc-300 sm:p-8 lg:p-10">
            No stage is available, so livestream leaderboard cannot be calculated.
          </div>
        ) : rankings.length === 0 ? (
          <div className="mt-4 rounded-xl bg-black/35 p-6 text-center text-zinc-300 sm:p-8 lg:p-10">
            No rankings found for this division and category.
          </div>
        ) : (
          <div className="mt-3 sm:mt-4">
            <div className="ls-ui-font grid grid-cols-[40px_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr] items-center rounded-t-lg bg-black/35 px-2 py-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-300 sm:grid-cols-[60px_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr] sm:px-3 sm:py-2 sm:text-[9px] lg:grid-cols-[100px_1.4fr_1fr_1fr_1fr_1fr] lg:px-5 lg:py-3 lg:text-[14px] lg:tracking-[0.08em] xl:grid-cols-[110px_1.4fr_1fr_1fr_1fr_1fr] xl:px-6 xl:py-3 xl:text-[16px]">
              <span>Rank</span>
              <span>Name</span>
              <span className="text-right">HF</span>
              <span className="text-right">%</span>
              <span className="text-right">得分</span>
              <span className="text-right">用时</span>
            </div>

            <div className="space-y-1 p-1 sm:space-y-1.5 sm:p-1.5 lg:space-y-2.5 lg:p-3">
              {rankings.map((entry, idx) => {
                const rank = entry.rank_in_stage ?? idx + 1
                const rowBackground = getAlternatingRowBackground(idx)
                return (
                  <div
                    key={entry.id}
                    className="relative flex flex-wrap items-center gap-1 bg-center bg-no-repeat px-2 py-1.5 text-white sm:gap-1.5 sm:px-3 sm:py-2 lg:grid lg:grid-cols-[100px_1.4fr_1fr_1fr_1fr_1fr] lg:gap-0 lg:px-5 lg:py-3 xl:grid-cols-[110px_1.4fr_1fr_1fr_1fr_1fr] xl:px-6 xl:py-4"
                    style={{
                      backgroundImage: `url(${rowBackground})`,
                      backgroundSize: '100% 100%',
                    }}
                  >
                    <div className="relative flex items-center gap-1 sm:gap-2 lg:block w-10 sm:w-16">
                      <div className="ls-number-font text-lg font-black leading-none text-zinc-100 sm:text-2xl lg:text-[36px] xl:text-[44px]">{rank}</div>
                    </div>
                    <div className="relative flex-1 min-w-0 pr-1 sm:pr-2">
                      <div className="ls-title-font truncate text-sm font-black text-zinc-100 sm:text-base lg:text-[22px] xl:text-[28px]">{entry.name}</div>
                      <div className="ls-ui-font text-[8px] font-semibold tracking-[0.2em] text-zinc-400 sm:text-[9px] lg:text-[12px] xl:text-[13px]">
                        #{String(entry.bib_number ?? '').padStart(4, '0')}
                      </div>
                    </div>
                    <div className="ls-number-font relative flex-1 text-right text-base font-black text-zinc-100 sm:text-lg lg:text-[26px] xl:text-[32px]">
                      {formatNumeric(entry.hit_factor, 4)}
                    </div>
                    <div className="ls-number-font relative flex-1 text-right text-base font-black text-zinc-100 sm:text-lg lg:text-[26px] xl:text-[32px]">
                      {formatNumeric(entry.percentage, 1)}%
                    </div>
                    <div className="ls-number-font relative flex-1 text-right text-base font-black text-zinc-100 sm:text-lg lg:text-[26px] xl:text-[32px]">
                      {formatNumeric(entry.total_points, 2)}
                    </div>
                    <div className="ls-number-font relative flex-1 text-right text-base font-black text-zinc-300 sm:text-lg lg:text-[26px] xl:text-[32px]">
                      {formatNumeric(entry.total_time, 2)}
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
