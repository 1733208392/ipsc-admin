import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { PersonalReplayDetail } from '@/types/my'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{replay.drill_name ?? '未命名模板'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>用时: {replay.total_time.toFixed(2)} s</p>
              <p>弹数: {replay.num_shots}</p>
              <p>得分: {replay.score ?? '-'}</p>
              <p>时间: {replay.created_at}</p>
              <p>设备: {replay.device_id ?? '-'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payload</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[70vh] overflow-auto rounded-md border bg-muted p-4 text-xs leading-5 whitespace-pre-wrap break-words">
                {JSON.stringify(replay.payload, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">未找到记录。</p>
      )}
    </div>
  )
}