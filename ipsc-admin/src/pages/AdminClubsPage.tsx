import { useEffect, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { Club } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const schema = z.object({
  name: z.string().min(1, '必填'),
  short_name: z.string().min(1, '必填'),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})

type FormData = z.infer<typeof schema>

export function AdminClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Club | null>(null)
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { status: 'active' },
  })

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<Club[]>('/admin/clubs')
      setClubs(data)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    reset({ name: '', short_name: '', contact_name: '', contact_phone: '', status: 'active' })
    setOpen(true)
  }

  function openEdit(club: Club) {
    setEditing(club)
    reset({
      name: club.name,
      short_name: club.short_name,
      contact_name: club.contact_name ?? '',
      contact_phone: club.contact_phone ?? '',
      status: club.status,
    })
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    try {
      if (editing) {
        await api.put(`/admin/clubs/${editing.id}`, data)
        toast({ title: '俱乐部已更新' })
      } else {
        await api.post('/admin/clubs', data)
        toast({ title: '俱乐部已创建' })
      }
      setOpen(false)
      void load()
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function removeClub(id: number) {
    try {
      await api.delete(`/admin/clubs/${id}`)
      toast({ title: '删除成功' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">俱乐部管理</h1>
        <Button onClick={openCreate}>新建俱乐部</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>俱乐部列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">加载中...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>简称</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead>电话</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clubs.map((club) => (
                  <TableRow key={club.id}>
                    <TableCell>{club.id}</TableCell>
                    <TableCell>{club.name}</TableCell>
                    <TableCell>{club.short_name}</TableCell>
                    <TableCell>{club.contact_name ?? '-'}</TableCell>
                    <TableCell>{club.contact_phone ?? '-'}</TableCell>
                    <TableCell>{club.status}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(club)}>
                        编辑
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => void removeClub(club.id)}>
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑俱乐部' : '新建俱乐部'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-1">
              <Label>名称</Label>
              <Input {...register('name')} />
              {errors.name ? <p className="text-xs text-red-600">{errors.name.message}</p> : null}
            </div>
            <div className="space-y-1">
              <Label>简称</Label>
              <Input {...register('short_name')} />
              {errors.short_name ? <p className="text-xs text-red-600">{errors.short_name.message}</p> : null}
            </div>
            <div className="space-y-1">
              <Label>联系人</Label>
              <Input {...register('contact_name')} />
            </div>
            <div className="space-y-1">
              <Label>联系电话</Label>
              <Input {...register('contact_phone')} />
            </div>
            <div className="space-y-1">
              <Label>状态</Label>
              <Select value={watch('status')} onValueChange={(value) => setValue('status', value as FormData['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="inactive">inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '提交中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
