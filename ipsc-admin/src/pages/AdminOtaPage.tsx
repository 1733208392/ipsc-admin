import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { OtaPackage, OtaPackageListResult, OtaPackageStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const STATUS_OPTIONS: Array<{ value: OtaPackageStatus; label: string }> = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
]

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let current = size
  let idx = 0
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024
    idx += 1
  }
  return `${current.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`
}

function statusBadgeVariant(status: OtaPackageStatus): 'secondary' | 'success' | 'outline' {
  if (status === 'published') return 'success'
  if (status === 'draft') return 'secondary'
  return 'outline'
}

export function AdminOtaPage() {
  const { toast } = useToast()

  const [rows, setRows] = useState<OtaPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)

  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState<'all' | OtaPackageStatus>('all')

  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<OtaPackageStatus>('draft')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit])

  async function load() {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      query.set('page', String(page))
      query.set('limit', String(limit))
      if (statusFilter !== 'all') {
        query.set('status', statusFilter)
      }

      const data = await api.get<OtaPackageListResult>(`/admin/ota/packages?${query.toString()}`)
      setRows(data.rows)
      setTotal(data.total_count)
    } catch (e) {
      toast({ title: '加载 OTA 列表失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [page, limit, statusFilter])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast({ title: '请选择 OTA zip 文件', variant: 'destructive' })
      return
    }

    if (!version.trim()) {
      toast({ title: '请输入版本号', variant: 'destructive' })
      return
    }

    const form = new FormData()
    form.append('file', file)
    form.append('version', version.trim())
    form.append('notes', notes)
    form.append('status', status)

    setUploading(true)
    try {
      await api.postForm('/admin/ota/packages', form)
      toast({ title: 'OTA 包上传成功' })
      setVersion('')
      setNotes('')
      setStatus('draft')
      setFile(null)
      setPage(1)
      void load()
    } catch (err) {
      toast({ title: '上传失败', description: String(err), variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  async function updatePackage(pkg: OtaPackage, patch: Partial<Pick<OtaPackage, 'status'>> & { notes?: string; is_latest?: boolean }) {
    setBusyId(pkg.id)
    try {
      await api.put(`/admin/ota/packages/${pkg.id}`, patch)
      toast({ title: `已更新 ${pkg.version}` })
      void load()
    } catch (e) {
      toast({ title: '更新失败', description: String(e), variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function archivePackage(pkg: OtaPackage) {
    if (!window.confirm(`确认归档版本 ${pkg.version} ?`)) return

    setBusyId(pkg.id)
    try {
      await api.delete(`/admin/ota/packages/${pkg.id}`)
      toast({ title: `已归档 ${pkg.version}` })
      void load()
    } catch (e) {
      toast({ title: '归档失败', description: String(e), variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  function editNotes(pkg: OtaPackage) {
    const next = window.prompt('修改发布说明', pkg.notes ?? '')
    if (next === null) return
    void updatePackage(pkg, { notes: next })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">OTA 管理</h1>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">状态筛选</Label>
          <Select value={statusFilter} onValueChange={(value) => {
            setStatusFilter(value as 'all' | OtaPackageStatus)
            setPage(1)
          }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {STATUS_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>上传 OTA 包</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={handleUpload}>
            <div className="space-y-1">
              <Label>版本号</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如 1.2.3" />
            </div>
            <div className="space-y-1">
              <Label>发布状态</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as OtaPackageStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>发布说明</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="可选" />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>OTA 文件 (zip)</Label>
              <Input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" disabled={uploading}>{uploading ? '上传中...' : '上传'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OTA 包列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">加载中...</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>最新</TableHead>
                    <TableHead>文件</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell>{pkg.id}</TableCell>
                      <TableCell className="font-medium">{pkg.version}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(pkg.status)}>{pkg.status}</Badge>
                      </TableCell>
                      <TableCell>{pkg.is_latest ? <Badge variant="info">latest</Badge> : '-'}</TableCell>
                      <TableCell className="max-w-[240px] truncate" title={pkg.original_filename}>{pkg.original_filename}</TableCell>
                      <TableCell>{formatBytes(pkg.size_bytes)}</TableCell>
                      <TableCell className="max-w-[320px] truncate" title={pkg.notes || '-'}>{pkg.notes || '-'}</TableCell>
                      <TableCell>{pkg.updated_at}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === pkg.id}
                          onClick={() => editNotes(pkg)}
                        >
                          改说明
                        </Button>
                        {pkg.status !== 'published' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === pkg.id}
                            onClick={() => void updatePackage(pkg, { status: 'published' })}
                          >
                            发布
                          </Button>
                        ) : null}
                        {pkg.is_latest !== 1 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === pkg.id}
                            onClick={() => void updatePackage(pkg, { is_latest: true })}
                          >
                            设为最新
                          </Button>
                        ) : null}
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={busyId === pkg.id}
                          onClick={() => void archivePackage(pkg)}
                        >
                          归档
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>共 {total} 条，当前第 {page}/{totalPages} 页</span>
                <div className="space-x-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    上一页
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    下一页
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
