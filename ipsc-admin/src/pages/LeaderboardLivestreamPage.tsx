import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Division, LeaderboardEntry, LeaderboardResponse, Match, Stage } from '@/types'

import { Button } from '@/components/ui/button'

const excludedDivisionCodes = new Set<Division['code']>(['standard', 'classic'])

const categories = [
  { value: '', label: 'All' },
  { value: 'junior', label: 'Junior' },
  { value: 'senior', label: 'Senior' },
  { value: 'super_junior', label: 'Super Junior' },
  { value: 'lady', label: 'Lady' },
] as const

const rowThemes = [
  'from-rose-500 to-rose-400',
  'from-blue-500 to-indigo-400',
  'from-emerald-500 to-lime-400',
  'from-amber-500 to-orange-400',
  'from-fuchsia-400 to-pink-400',
] as const

function formatNumeric(value: number | undefined, digits: number): string {
  return Number(value ?? 0).toFixed(digits)
}

function getThemeClassByRank(index: number): string {
  if (index < rowThemes.length) {
    return rowThemes[index]
  }
  return 'from-slate-700 to-slate-600'
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
        .filter((d) => !excludedDivisionCodes.has(d.code))
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
    <div className="min-h-[calc(100vh-3rem)] rounded-2xl bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-4 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            <span>Livestream Leaderboard</span>
            <div className="flex items-center gap-2">
              <span>Auto Switch: 10s</span>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => void handleToggleFullscreen()}>
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </Button>
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-4xl">
              {activeDivisionName} | {activeCategoryLabel}
            </h1>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <Button
                key={c.value || 'all-category'}
                variant={selectedCategory === c.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(c.value)}
                className="rounded-full"
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        ) : divisions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-600">
            No eligible divisions to display. Standard and Classic are hidden for livestream mode.
          </div>
        ) : stages.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-600">
            No stage is available, so livestream leaderboard cannot be calculated.
          </div>
        ) : rankings.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-600">
            No rankings found for this division and category.
          </div>
        ) : (
          <div>
            <div className="mb-2 grid grid-cols-[88px_1.3fr_1fr_1fr_1fr] items-center px-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 md:px-6">
              <span>Rank</span>
              <span>Name</span>
              <span className="text-right">HF</span>
              <span className="text-right">%</span>
              <span className="text-right">Stage Points</span>
            </div>

            <div className="space-y-3">
              {rankings.map((entry, idx) => {
                const rank = entry.rank_in_stage ?? idx + 1
                return (
                  <div
                    key={entry.id}
                    className={`grid grid-cols-[88px_1.3fr_1fr_1fr_1fr] items-center rounded-2xl bg-gradient-to-r px-4 py-4 text-white shadow-md md:px-6 md:py-5 ${getThemeClassByRank(idx)}`}
                  >
                    <div className="text-4xl font-black leading-none drop-shadow-sm">{rank}</div>
                    <div className="pr-2">
                      <div className="truncate text-lg font-extrabold md:text-2xl">{entry.name}</div>
                    </div>
                    <div className="text-right text-xl font-black md:text-3xl">
                      {formatNumeric(entry.hit_factor, 2)}
                    </div>
                    <div className="text-right text-xl font-black md:text-3xl">
                      {formatNumeric(entry.percentage, 1)}%
                    </div>
                    <div className="text-right text-xl font-black md:text-3xl">
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
