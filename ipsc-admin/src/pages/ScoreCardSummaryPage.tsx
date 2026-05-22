import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { ScoreCardDetail } from '@/types'

import { Button } from '@/components/ui/button'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function ScoreCardSummaryPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const shooterId = searchParams.get('shooter_id')
  const stageId = searchParams.get('stage_id')

  const [detail, setDetail] = useState<ScoreCardDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      if (!matchId || !shooterId || !stageId) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const data = await api.get<ScoreCardDetail>(
          `/matches/${matchId}/scores/score-card?shooter_id=${shooterId}&stage_id=${stageId}`
        )
        setDetail(data)
      } catch (e) {
        toast({ title: 'Summary 加载失败', description: getErrorMessage(e), variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [matchId, shooterId, stageId])

  const rowTotals = useMemo(() => {
    if (!detail) return { A: 0, C: 0, D: 0, M: 0, NS: 0, NPM: 0 }
    return detail.rows.reduce(
      (acc, row) => {
        acc.A += row.a_hits
        acc.C += row.c_hits
        acc.D += row.d_hits
        acc.M += row.m_hits
        acc.NS += row.ns_hits
        acc.NPM += row.npm_hits
        return acc
      },
      { A: 0, C: 0, D: 0, M: 0, NS: 0, NPM: 0 }
    )
  }, [detail])

  const totalPE = useMemo(() => {
    if (!detail) return 0
    return detail.penalty_reasons.reduce((sum, item) => sum + item.count, 0)
  }, [detail])

  async function handleSubmit() {
    if (!matchId || !shooterId || !stageId) return
    setSubmitting(true)
    try {
      await api.post(`/matches/${matchId}/scores/score-card/submit`, {
        shooter_id: Number(shooterId),
        stage_id: Number(stageId),
      })
      toast({ title: '评分卡已提交复核' })
      navigate(`/matches/${matchId}/scores`)
    } catch (e) {
      toast({ title: '提交失败', description: getErrorMessage(e), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Score Review Summary</h1>
        <Button
          variant="outline"
          onClick={() => navigate(`/matches/${matchId}/score-card?shooter_id=${shooterId ?? ''}&stage_id=${stageId ?? ''}`)}
        >
          Back to Edit
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">加载中...</div>
      ) : !detail ? (
        <div className="text-muted-foreground">未找到评分卡数据</div>
      ) : (
        <>
          <div className="grid gap-3 rounded-md border p-4 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Shooter</div>
              <div className="font-semibold">{detail.shooter.bib_number} - {detail.shooter.name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Stage</div>
              <div className="font-semibold">{detail.stage.name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="font-semibold uppercase">{detail.score?.status ?? 'normal'}</div>
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-4 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Total Time</div>
              <div className="font-semibold">{detail.score?.total_time?.toFixed(2) ?? '0.00'}s</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Points</div>
              <div className="font-semibold">{detail.score?.total_points?.toFixed(2) ?? '0.00'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Hit Factor</div>
              <div className="font-semibold">{detail.score?.hit_factor?.toFixed(4) ?? '0.0000'}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-left">Metric</th>
                  <th className="p-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t"><td className="p-2">A</td><td className="p-2 text-right font-medium">{rowTotals.A}</td></tr>
                <tr className="border-t"><td className="p-2">C</td><td className="p-2 text-right font-medium">{rowTotals.C}</td></tr>
                <tr className="border-t"><td className="p-2">D</td><td className="p-2 text-right font-medium">{rowTotals.D}</td></tr>
                <tr className="border-t"><td className="p-2">M</td><td className="p-2 text-right font-medium">{rowTotals.M}</td></tr>
                <tr className="border-t"><td className="p-2">NS</td><td className="p-2 text-right font-medium">{rowTotals.NS}</td></tr>
                <tr className="border-t"><td className="p-2">NPM</td><td className="p-2 text-right font-medium">{rowTotals.NPM}</td></tr>
                <tr className="border-t"><td className="p-2">PE</td><td className="p-2 text-right font-medium">{totalPE}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-md border p-4">
            <div className="mb-2 text-sm font-medium">Procedural Reasons</div>
            {detail.penalty_reasons.length === 0 ? (
              <div className="text-sm text-muted-foreground">无</div>
            ) : (
              <div className="space-y-1 text-sm">
                {detail.penalty_reasons.map((reason) => (
                  <div key={reason.reason_code} className="flex items-center justify-between border-b py-1 last:border-b-0">
                    <span>{reason.reason_code} - {reason.reason_label}</span>
                    <span className="font-semibold">x{reason.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              Submit Review
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
