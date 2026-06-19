import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const schema = z.object({
  username: z.string().min(3, '用户名至少 3 位').max(30, '用户名最多 30 位'),
  password: z.string().min(6, '密码至少 6 位'),
  name: z.string().min(1, '请输入姓名'),
  phone: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setSubmitting(true)
    try {
      await register({
        username: data.username.trim(),
        password: data.password,
        name: data.name.trim(),
        phone: data.phone?.trim() || undefined,
      })
      navigate('/')
    } catch (error) {
      toast({ title: '注册失败', description: String(error), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>创建个人账号</CardTitle>
          <CardDescription>注册后会自动创建一个个人俱乐部并赋予 club_admin 权限</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input id="username" autoComplete="username" {...registerField('username')} />
              {errors.username ? <p className="text-sm text-red-600">{errors.username.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" autoComplete="new-password" {...registerField('password')} />
              {errors.password ? <p className="text-sm text-red-600">{errors.password.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input id="name" {...registerField('name')} />
              {errors.name ? <p className="text-sm text-red-600">{errors.name.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">手机号</Label>
              <Input id="phone" {...registerField('phone')} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? '注册中...' : '注册'}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              已有账号？<Link to="/login" className="text-primary hover:underline">去登录</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}