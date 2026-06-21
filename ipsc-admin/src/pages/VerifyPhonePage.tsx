import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const schema = z.object({
  code: z.string().length(6, '验证码为 6 位数字'),
})

type FormData = z.infer<typeof schema>

export function VerifyPhonePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const token = params.get('token') ?? ''
  const phone = params.get('phone') ?? ''

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function onSubmit(data: FormData) {
    if (!token || !phone) {
      toast({ title: '参数无效', description: '请重新注册', variant: 'destructive' })
      navigate('/register')
      return
    }
    setSubmitting(true)
    try {
      const resp = await fetch('/api/v1/auth/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          code: data.code,
          verification_token: token,
          purpose: 'register',
        }),
      })
      const json = await resp.json()
      if (!json.success) {
        toast({ title: '验证失败', description: json.error, variant: 'destructive' })
        return
      }
      // 保存 token，刷新用户状态
      if (json.data?.token) {
        localStorage.setItem('gcs_token', json.data.token)
        if (json.data.refresh_token) {
          localStorage.setItem('gcs_refresh_token', json.data.refresh_token)
        }
      }
      toast({ title: '注册成功', description: '欢迎加入 GCS' })
      // 触发刷新用户
      window.location.href = '/'
    } catch (error) {
      toast({ title: '验证失败', description: String(error), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function onResend() {
    if (resendCooldown > 0) return
    try {
      const resp = await fetch('/api/v1/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'phone', target: phone, purpose: 'register' }),
      })
      const json = await resp.json()
      if (!json.success) {
        toast({ title: '发送失败', description: json.error, variant: 'destructive' })
        return
      }
      setResendCooldown(60)
      toast({ title: '验证码已重新发送' })
    } catch (error) {
      toast({ title: '发送失败', description: String(error), variant: 'destructive' })
    }
  }

  if (!token || !phone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>参数无效</CardTitle>
            <CardDescription>验证链接缺少必要参数，请重新注册</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/register" className="text-primary hover:underline">返回注册</Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>验证手机号</CardTitle>
          <CardDescription>
            验证码已发送至 <span className="font-medium text-foreground">{phone}</span>，10 分钟内有效
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="code">验证码</Label>
              <Input
                id="code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="6 位数字"
                className="text-center text-2xl tracking-widest"
                {...registerField('code')}
              />
              {errors.code ? <p className="text-sm text-red-600">{errors.code.message}</p> : null}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? '验证中...' : '完成注册'}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              没收到？{' '}
              {resendCooldown > 0 ? (
                <span className="text-muted-foreground">{resendCooldown}s 后可重发</span>
              ) : (
                <button type="button" onClick={onResend} className="text-primary hover:underline">
                  重新发送
                </button>
              )}
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <Link to="/register" className="text-muted-foreground hover:underline">换一个手机号</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
