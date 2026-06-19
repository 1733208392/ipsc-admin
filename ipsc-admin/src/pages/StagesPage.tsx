import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlusCircle, Pencil, Trash2, ClipboardList } from 'lucide-react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useMatch } from '@/hooks/useMatch'
import { useToast } from '@/hooks/use-toast'
import type { Stage, StageAttachment, Match } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

const schema = z.object({
  name: z.string().min(1, '必填'),
  min_rounds: z.coerce.number().int().min(0).default(0),
  stage_points: z.coerce.number().int().min(0).default(0),
  targets_count: z.coerce.number().int().min(0).default(0),
  poppers_plates_count: z.coerce.number().int().min(0).default(0),
  briefing_text: z.string().default(''),
  sort_order: z.coerce.number().int().default(0),
})
type FormData = z.infer<typeof schema>

const BRIEFING_TEMPLATE = `Stage 简报模板

1. 起始姿势
- 射手站立于指定起始框内，自然站姿。
- 双手手腕高于肩线，枪械按赛规装填并入套。

2. 射击流程
- 听到起始信号后，按可见顺序射击所有纸靶与钢靶。
- 强制换弹区：无（除非 RO 现场另行说明）。
- 如有漏靶、程序错误或安全违规，按赛规判罚。

3. 计分方式
- 计分制：Comstock。
- 最低弹数：以该 Stage 公布的最低弹数为准。
- 命中与罚分按现行 IPSC 规则执行。

4. 安全要求
- 全程遵守 180 度安全角规则。
- 移动、换弹、排故时，手指必须离开扳机护圈。
- 枪口不得指向身体或不安全方向。
- 出现不安全动作时，RO 有权立即停止射手并判罚。

5. 其他说明
- 赛前可进行 Walkthrough，但不得进行实弹/空击演练（按场地规则）。
- 对 Stage 程序有疑问请在开赛前向 RO 提问确认。
`

export function StagesPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Stage | null>(null)
  const [attachments, setAttachments] = useState<StageAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const { setCurrentMatch } = useMatch()
  const { toast } = useToast()

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: {
      min_rounds: 0,
      stage_points: 0,
      targets_count: 0,
      poppers_plates_count: 0,
      briefing_text: BRIEFING_TEMPLATE,
      sort_order: 0,
    },
  })

  async function loadStageAttachments(stageId: number) {
    try {
      const data = await api.get<StageAttachment[]>(`/stages/${stageId}/attachments`)
      setAttachments(data)
    } catch (e) {
      setAttachments([])
      toast({ title: '附件加载失败', description: String(e), variant: 'destructive' })
    }
  }

  async function load() {
    setLoading(true)
    try {
      const [stagesData, match] = await Promise.all([
        api.get<Stage[]>(`/matches/${matchId}/stages`),
        api.get<Match>(`/matches/${matchId}`),
      ])
      setStages(stagesData)
      setCurrentMatch(match)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [matchId])

  function openCreate() {
    setEditing(null)
    setAttachments([])
    reset({
      name: '',
      min_rounds: 0,
      stage_points: 0,
      targets_count: 0,
      poppers_plates_count: 0,
      briefing_text: BRIEFING_TEMPLATE,
      sort_order: 0,
    })
    setOpen(true)
  }

  async function openEdit(s: Stage) {
    setEditing(s)
    reset({
      name: s.name,
      min_rounds: s.min_rounds,
      stage_points: s.stage_points ?? s.max_points ?? 0,
      targets_count: s.targets_count ?? 0,
      poppers_plates_count: s.poppers_plates_count ?? 0,
      briefing_text: s.briefing_text ?? BRIEFING_TEMPLATE,
      sort_order: s.sort_order,
    })
    await loadStageAttachments(s.id)
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    try {
      if (editing) {
        await api.put(`/stages/${editing.id}`, data)
        toast({ title: '更新成功' })
      } else {
        await api.post(`/matches/${matchId}/stages`, data)
        toast({ title: '创建成功' })
      }
      setOpen(false)
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/stages/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!editing || !files || files.length === 0) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        await api.postForm(`/stages/${editing.id}/attachments`, form)
      }
      toast({ title: '附件上传成功' })
      await loadStageAttachments(editing.id)
    } catch (e) {
      toast({ title: '附件上传失败', description: String(e), variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteAttachment(attachmentId: number) {
    if (!editing) return
    try {
      await api.delete(`/stages/${editing.id}/attachments/${attachmentId}`)
      toast({ title: '附件删除成功' })
      await loadStageAttachments(editing.id)
    } catch (e) {
      toast({ title: '附件删除失败', description: String(e), variant: 'destructive' })
    }
  }

  function formatFileSize(size: number): string {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Stage 管理</h1>
        <Button onClick={openCreate}>
          <PlusCircle className="h-4 w-4 mr-2" />
          添加 Stage
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : stages.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">暂无 Stage</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>排序</TableHead>
              <TableHead>Stage 名称</TableHead>
              <TableHead>Min Rounds</TableHead>
              <TableHead>场景总分</TableHead>
              <TableHead>Targets</TableHead>
              <TableHead>Popers/Plates</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map(s => (
              <TableRow key={s.id}>
                <TableCell>{s.sort_order}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.min_rounds}</TableCell>
                <TableCell>{s.stage_points ?? s.max_points ?? 0}</TableCell>
                <TableCell>{s.targets_count ?? 0}</TableCell>
                <TableCell>{s.poppers_plates_count ?? 0}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/matches/${matchId}/stages/${s.id}/drills`)}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Drill 配置
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认删除？</AlertDialogTitle>
                        <AlertDialogDescription>删除 Stage「{s.name}」，相关成绩将一并删除。</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleDelete(s.id)} className="bg-destructive text-white hover:bg-destructive/90">删除</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑 Stage' : '添加 Stage'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Stage 名称</Label>
              <Input placeholder="e.g. Stage 1" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Min Rounds</Label>
                <Input type="number" {...register('min_rounds')} />
              </div>
              <div className="space-y-1">
                <Label>场景总分</Label>
                <Input type="number" {...register('stage_points')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>number of Targets</Label>
                <Input type="number" {...register('targets_count')} />
              </div>
              <div className="space-y-1">
                <Label>number of Popers/Plates</Label>
                <Input type="number" {...register('poppers_plates_count')} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Stage Briefing</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue('briefing_text', BRIEFING_TEMPLATE)}
                >
                  载入模板
                </Button>
              </div>
              <textarea
                className="flex min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="输入 Stage Briefing..."
                {...register('briefing_text')}
              />
            </div>
            <div className="space-y-1">
              <Label>排序</Label>
              <Input type="number" {...register('sort_order')} />
            </div>
            <div className="space-y-2 border rounded-md p-3">
              <Label>附件（图片/PDF）</Label>
              {editing ? (
                <>
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    disabled={uploading}
                    onChange={(e) => void handleUploadFiles(e.target.files)}
                  />
                  {attachments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无附件</p>
                  ) : (
                    <div className="space-y-2">
                      {attachments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                          <a href={a.url} target="_blank" rel="noreferrer" className="underline break-all">
                            {a.original_name}
                          </a>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-muted-foreground">{formatFileSize(a.size_bytes)}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => void handleDeleteAttachment(a.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">请先保存 Stage，再上传附件。</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button type="submit" disabled={isSubmitting}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
