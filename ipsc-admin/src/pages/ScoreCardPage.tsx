import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useMatch } from '@/hooks/useMatch'
import { PROCEDURAL_REASONS } from '@/lib/pe-reasons'
import type { Match, Shooter, Stage, ScoreCardDetail, ScoreCardRow } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const rowFields = [
  { key: 'a_hits',  label: 'A',  headerClass: 'bg-green-500/15',  valueClass: 'text-green-600'  },
  { key: 'c_hits',  label: 'C',  headerClass: 'bg-sky-500/15',    valueClass: 'text-sky-600'    },
  { key: 'd_hits',  label: 'D',  headerClass: 'bg-yellow-500/15', valueClass: 'text-yellow-600' },
  { key: 'm_hits',  label: 'M',  headerClass: 'bg-red-500/15',    valueClass: 'text-red-600'    },
  { key: 'ns_hits', label: 'NS', headerClass: 'bg-orange-500/15', valueClass: 'text-orange-600' },
] as const

type RowField = (typeof rowFields)[number]['key']

type ScoreStatus = 'normal' | 'dnf' | 'dq'

function canEditField(rowType: 'paper' | 'steel', field: RowField): boolean {
  if (rowType === 'steel') {
    return field === 'a_hits' || field === 'm_hits' || field === 'ns_hits'
  }
  // Paper: M is auto-derived from scoring hits — not manually editable
  return field !== 'm_hits'
}

export function ScoreCardPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { setCurrentMatch } = useMatch()

  const [shooters, setShooters] = useState<Shooter[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [peOpen, setPeOpen] = useState(false)

  const [selectedShooterId, setSelectedShooterId] = useState<string>(searchParams.get('shooter_id') ?? '')
  const [selectedStageId, setSelectedStageId] = useState<string>(searchParams.get('stage_id') ?? '')

  const [rows, setRows] = useState<ScoreCardRow[]>([])
  const [status, setStatus] = useState<ScoreStatus>('normal')
  const [totalTime, setTotalTime] = useState<string>('')
  const [firstShot, setFirstShot] = useState<string>('')
  const [fastestSplit, setFastestSplit] = useState<string>('')
  const [reasonCounts, setReasonCounts] = useState<Record<string, number>>({})

  const selectedShooter = useMemo(
    () => shooters.find((item) => String(item.id) === selectedShooterId),
    [shooters, selectedShooterId]
  )

  const selectedStage = useMemo(
    () => stages.find((item) => String(item.id) === selectedStageId),
    [stages, selectedStageId]
  )

  const totalPE = useMemo(
    () => Object.values(reasonCounts).reduce((sum, n) => sum + n, 0),
    [reasonCounts]
  )

  // Each paper target with 0 scoring hits (A+C+D=0) auto-generates 1 PE (10.2.7 unengaged target)
  const autoUnengagedPE = useMemo(
    () =>
      rows.filter(
        (row) => row.row_type === 'paper' && row.a_hits + row.c_hits + row.d_hits === 0
      ).length,
    [rows]
  )

  const totalPEDisplay = totalPE + autoUnengagedPE

  async function loadMasterData() {
    if (!matchId) return
    setLoading(true)
    try {
      const [shootersData, stagesData, match] = await Promise.all([
        api.get<Shooter[]>(`/matches/${matchId}/shooters`),
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setShooters(shootersData)
      setStages(stagesData)
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  async function loadScoreCard(shooterId: string, stageId: string) {
    if (!matchId || !shooterId || !stageId) return
    setDetailLoading(true)
    try {
      const detail = await api.get<ScoreCardDetail>(
        `/matches/${matchId}/scores/score-card?shooter_id=${shooterId}&stage_id=${stageId}`
      )
      applyDetail(detail)
    } catch (e) {
      toast({ title: '评分卡加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }

  function applyDetail(detail: ScoreCardDetail) {
    setRows(detail.rows)
    setStatus(detail.score?.status ?? 'normal')
    setTotalTime(detail.score ? String(detail.score.total_time ?? '') : '')
    setFirstShot(detail.score?.first_shot != null ? String(detail.score.first_shot) : '')
    setFastestSplit(detail.score?.fastest_split != null ? String(detail.score.fastest_split) : '')

    const nextCounts: Record<string, number> = {}
    for (const reason of PROCEDURAL_REASONS) {
      nextCounts[reason.reason_code] = 0
    }
    for (const reason of detail.penalty_reasons) {
      nextCounts[reason.reason_code] = reason.count
    }
    setReasonCounts(nextCounts)
  }

  useEffect(() => {
    void loadMasterData()
  }, [matchId])

  useEffect(() => {
    if (!selectedShooterId || !selectedStageId) return
    void loadScoreCard(selectedShooterId, selectedStageId)
  }, [selectedShooterId, selectedStageId, matchId])

  function updateRow(rowIndex: number, field: RowField, delta: 1 | -1) {
    setRows((prev) => {
      const next = [...prev]
      const current = next[rowIndex]
      if (!current) return prev
      if (!canEditField(current.row_type, field)) return prev
      const nextValue = Math.max(0, current[field] + delta)
      let updated = { ...current, [field]: nextValue }
      // Paper target: auto-derive M = max(0, 2 - scoring hits)
      if (
        current.row_type === 'paper' &&
        (field === 'a_hits' || field === 'c_hits' || field === 'd_hits')
      ) {
        const scoring = updated.a_hits + updated.c_hits + updated.d_hits
        updated = { ...updated, m_hits: Math.max(0, 2 - scoring) }
      }
      next[rowIndex] = updated
      return next
    })
  }

  function updateReason(reasonCode: string, delta: 1 | -1) {
    setReasonCounts((prev) => ({
      ...prev,
      [reasonCode]: Math.max(0, (prev[reasonCode] ?? 0) + delta),
    }))
  }

  function buildPenaltyPayload() {
    return PROCEDURAL_REASONS
      .filter((reason) => (reasonCounts[reason.reason_code] ?? 0) > 0)
      .map((reason) => ({
        reason_code: reason.reason_code,
        reason_label: `${reason.en} / ${reason.zh}`,
        count: reasonCounts[reason.reason_code] ?? 0,
        sort_order: reason.sort_order,
      }))
  }

  async function saveDraft(): Promise<boolean> {
    if (!matchId || !selectedShooterId || !selectedStageId) {
      toast({ title: '请选择射手和 Stage', variant: 'destructive' })
      return false
    }

    const parsedTime = totalTime.trim() === '' ? undefined : Number(totalTime)
    if (status === 'normal' && (!parsedTime || parsedTime <= 0)) {
      toast({ title: 'Normal 状态必须填写有效用时', variant: 'destructive' })
      return false
    }
    if (status === 'dnf' && (!parsedTime || parsedTime <= 0)) {
      toast({ title: 'DNF 状态必须填写有效用时', variant: 'destructive' })
      return false
    }
    if (parsedTime !== undefined && parsedTime < 0) {
      toast({ title: '用时不能为负数', variant: 'destructive' })
      return false
    }

    const payload = {
      shooter_id: Number(selectedShooterId),
      stage_id: Number(selectedStageId),
      status,
      total_time: parsedTime,
      first_shot: firstShot.trim() === '' ? undefined : Number(firstShot),
      fastest_split: fastestSplit.trim() === '' ? undefined : Number(fastestSplit),
      rows,
      penalty_reasons: buildPenaltyPayload(),
    }

    setSaving(true)
    try {
      const detail = await api.put<ScoreCardDetail>(`/matches/${matchId}/scores/score-card`, payload)
      applyDetail(detail)
      toast({ title: '评分卡已保存' })
      return true
    } catch (e) {
      toast({ title: '保存失败', description: String(e), variant: 'destructive' })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleReview() {
    const ok = await saveDraft()
    if (!ok || !matchId || !selectedShooterId || !selectedStageId) return
    navigate(`/matches/${matchId}/score-card/summary?shooter_id=${selectedShooterId}&stage_id=${selectedStageId}`)
  }

  function onChangeShooter(value: string) {
    setSelectedShooterId(value)
    const next = new URLSearchParams(searchParams)
    next.set('shooter_id', value)
    if (selectedStageId) next.set('stage_id', selectedStageId)
    setSearchParams(next)
  }

  function onChangeStage(value: string) {
    setSelectedStageId(value)
    const next = new URLSearchParams(searchParams)
    if (selectedShooterId) next.set('shooter_id', selectedShooterId)
    next.set('stage_id', value)
    setSearchParams(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">评分卡录入</h1>
        <Button variant="outline" onClick={() => navigate(`/matches/${matchId}/scores`)}>返回成绩页</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>射手</Label>
          <Select value={selectedShooterId} onValueChange={onChangeShooter}>
            <SelectTrigger>
              <SelectValue placeholder="选择射手" />
            </SelectTrigger>
            <SelectContent>
              {shooters.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.bib_number} - {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Stage</Label>
          <Select value={selectedStageId} onValueChange={onChangeStage}>
            <SelectTrigger>
              <SelectValue placeholder="选择 Stage" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(selectedShooter || selectedStage) && (
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          <div>{selectedShooter ? `${selectedShooter.name} (${selectedShooter.bib_number})` : '未选择射手'}</div>
          <div>{selectedStage ? selectedStage.name : '未选择 Stage'}</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label>总用时 (s)</Label>
          <Input type="number" min="0" step="0.01" value={totalTime} onChange={(e) => setTotalTime(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>First Shot (可选)</Label>
          <Input type="number" min="0" step="0.01" value={firstShot} onChange={(e) => setFirstShot(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Fastest Split (可选)</Label>
          <Input type="number" min="0" step="0.01" value={fastestSplit} onChange={(e) => setFastestSplit(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-2 text-left">T#</th>
              {rowFields.map((field) => (
                <th key={field.key} className={`p-2 text-center font-semibold ${field.headerClass}`}>
                  {field.label}
                  {field.key === 'ns_hits' && (
                    <div className="text-[10px] font-normal text-muted-foreground leading-tight">max 2/tgt</div>
                  )}
                  {field.key === 'm_hits' && (
                    <div className="text-[10px] font-normal text-muted-foreground leading-tight">paper: auto</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${row.row_type}-${row.row_no}`} className={`border-t ${row.row_type === 'steel' ? 'bg-amber-500/5' : ''}`}>
                <td className="p-2 font-medium">
                  {row.row_type === 'steel'
                    ? <span className="text-amber-600">Steel {row.row_no}</span>
                    : row.row_no}
                </td>
                {rowFields.map((field) => (
                  <td key={field.key} className={`p-2 ${field.headerClass}`}>
                    <div className="flex items-center justify-center gap-2">
                      {canEditField(row.row_type, field.key) ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 px-0"
                            onClick={() => updateRow(rowIndex, field.key, -1)}
                          >
                            -
                          </Button>
                          <span className={`w-8 text-center font-semibold ${field.valueClass}`}>{row[field.key]}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 px-0"
                            onClick={() => updateRow(rowIndex, field.key, 1)}
                          >
                            +
                          </Button>
                        </>
                      ) : (
                        <span className="w-24 text-center text-muted-foreground">
                          {row.row_type === 'paper' && field.key === 'm_hits' ? (
                            <span className={`font-semibold ${field.valueClass}`}>{row[field.key]}</span>
                          ) : '-'}
                        </span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <div className="text-sm text-muted-foreground">Penalties (PE)</div>
          <div className="text-xl font-semibold">{totalPEDisplay}</div>
          {autoUnengagedPE > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {autoUnengagedPE} auto (unengaged target{autoUnengagedPE > 1 ? 's' : ''})
              {totalPE > 0 ? ` + ${totalPE} manual` : ''}
            </div>
          )}
        </div>
        <Button type="button" variant="outline" onClick={() => setPeOpen(true)}>
          PE
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={status === 'dq' ? 'destructive' : 'outline'} onClick={() => setStatus(status === 'dq' ? 'normal' : 'dq')}>
          DQ
        </Button>
        <Button type="button" variant={status === 'dnf' ? 'destructive' : 'outline'} onClick={() => setStatus(status === 'dnf' ? 'normal' : 'dnf')}>
          DNF
        </Button>
        <Button type="button" variant="outline" onClick={() => void saveDraft()} disabled={saving || loading || detailLoading}>
          Save Draft
        </Button>
        <Button type="button" className="ml-auto" onClick={() => void handleReview()} disabled={saving || loading || detailLoading}>
          Review
        </Button>
      </div>

      <Dialog open={peOpen} onOpenChange={setPeOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Procedurals</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {PROCEDURAL_REASONS.map((reason) => (
              <div key={reason.reason_code} className="flex items-start justify-between gap-3 border-b pb-2">
                <div className="text-sm">
                  <div className="font-medium">{reason.reason_code} {reason.en}</div>
                  <div className="text-muted-foreground">{reason.zh}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 w-7 px-0" onClick={() => updateReason(reason.reason_code, -1)}>
                    -
                  </Button>
                  <span className="w-8 text-center font-semibold">{reasonCounts[reason.reason_code] ?? 0}</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 w-7 px-0" onClick={() => updateReason(reason.reason_code, 1)}>
                    +
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
