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
  account: z.string().min(1, '请输入邮箱或用户名'),
  password: z.string().min(1, '请输入密码'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const { login, loginWithEmail } = useAuth()
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
      const account = data.account.trim()
      // 邮箱走 /auth/login/email，用户名走 /auth/login
      if (account.includes('@')) {
        await loginWithEmail(account.toLowerCase(), data.password)
      } else {
        await login(account, data.password)
      }
      navigate('/')
    } catch (e) {
      toast({ title: '登录失败', description: String(e), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>IPSC 赛事管理登录</CardTitle>
          <CardDescription>请输入邮箱或用户名</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="account">邮箱 / 用户名</Label>
              <Input id="account" autoComplete="username" {...registerField('account')} />
              {errors.account ? <p className="text-sm text-red-600">{errors.account.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" autoComplete="current-password" {...registerField('password')} />
              {errors.password ? <p className="text-sm text-red-600">{errors.password.message}</p> : null}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? '登录中...' : '登录'}
            </Button>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <Link to="/register" className="text-primary hover:underline">注册账号</Link>
              <Link to="/reset-password" className="hover:underline">忘记密码？</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
