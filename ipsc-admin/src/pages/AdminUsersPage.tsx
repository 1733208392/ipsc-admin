import { useEffect, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { Club, UserAccount, UserRole } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const createSchema = z.object({
  username: z.string().min(3, '至少3位'),
  password: z.string().min(6, '至少6位'),
  role: z.enum(['super_admin', 'club_admin', 'shooter']),
  club_id: z.string().optional(),
  name: z.string().min(1, '必填'),
  phone: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})

type CreateFormData = z.infer<typeof createSchema>

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserAccount[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema) as Resolver<CreateFormData>,
    defaultValues: { role: 'club_admin', status: 'active' },
  })

  async function load() {
    setLoading(true)
    try {
      const [usersData, clubsData] = await Promise.all([
        api.get<UserAccount[]>('/admin/users'),
        api.get<Club[]>('/admin/clubs'),
      ])
      setUsers(usersData)
      setClubs(clubsData)
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
    reset({ username: '', password: '', role: 'club_admin', club_id: '', name: '', phone: '', status: 'active' })
    setOpen(true)
  }

  async function onSubmit(data: CreateFormData) {
    try {
      await api.post('/admin/users', {
        username: data.username,
        password: data.password,
        role: data.role,
        club_id: data.role === 'super_admin' || !data.club_id ? undefined : Number(data.club_id),
        name: data.name,
        phone: data.phone || undefined,
        status: data.status,
      })
      toast({ title: '用户已创建' })
      setOpen(false)
      void load()
    } catch (e) {
      toast({ title: '创建失败', description: String(e), variant: 'destructive' })
    }
  }

  async function resetPassword(id: number) {
    const password = window.prompt('输入新密码（至少6位）')
    if (!password) return

    try {
      await api.put(`/admin/users/${id}`, { password })
      toast({ title: '密码已重置' })
    } catch (e) {
      toast({ title: '操作失败', description: String(e), variant: 'destructive' })
    }
  }

  async function changeStatus(id: number, status: 'active' | 'inactive') {
    try {
      await api.put(`/admin/users/${id}`, { status })
      toast({ title: '状态已更新' })
      void load()
    } catch (e) {
      toast({ title: '更新失败', description: String(e), variant: 'destructive' })
    }
  }

  async function removeUser(id: number) {
    try {
      await api.delete(`/admin/users/${id}`)
      toast({ title: '已删除' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: String(e), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <Button onClick={openCreate}>新建用户</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>账号列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">加载中...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>俱乐部</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.id}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.club_name ?? '-'}</TableCell>
                    <TableCell>{user.status}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => void resetPassword(user.id)}>
                        重置密码
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void changeStatus(user.id, user.status === 'active' ? 'inactive' : 'active')}
                      >
                        {user.status === 'active' ? '禁用' : '启用'}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => void removeUser(user.id)}>
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
            <DialogTitle>创建用户</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-1">
              <Label>用户名</Label>
              <Input {...register('username')} />
              {errors.username ? <p className="text-xs text-red-600">{errors.username.message}</p> : null}
            </div>
            <div className="space-y-1">
              <Label>密码</Label>
              <Input type="password" {...register('password')} />
              {errors.password ? <p className="text-xs text-red-600">{errors.password.message}</p> : null}
            </div>
            <div className="space-y-1">
              <Label>姓名</Label>
              <Input {...register('name')} />
              {errors.name ? <p className="text-xs text-red-600">{errors.name.message}</p> : null}
            </div>
            <div className="space-y-1">
              <Label>电话</Label>
              <Input {...register('phone')} />
            </div>
            <div className="space-y-1">
              <Label>角色</Label>
              <Select value={watch('role')} onValueChange={(value) => setValue('role', value as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">super_admin</SelectItem>
                  <SelectItem value="club_admin">club_admin</SelectItem>
                  <SelectItem value="shooter">shooter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {watch('role') !== 'super_admin' ? (
              <div className="space-y-1">
                <Label>俱乐部</Label>
                <Select value={watch('club_id') || ''} onValueChange={(value) => setValue('club_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择俱乐部" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubs.map((club) => (
                      <SelectItem key={club.id} value={String(club.id)}>
                        {club.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>状态</Label>
              <Select value={watch('status')} onValueChange={(value) => setValue('status', value as CreateFormData['status'])}>
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
