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

const emailSchema = z.object({
  email: z.string().email('请输入有效邮箱'),
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(50)
    .refine((v) => {
      let classes = 0
      if (/[a-zA-Z]/.test(v)) classes++
      if (/[0-9]/.test(v)) classes++
      if (/[^a-zA-Z0-9]/.test(v)) classes++
      return classes >= 2
    }, '需包含字母、数字、符号中的至少两种'),
  name: z.string().min(1, '请输入姓名').max(50),
})

const phoneSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的 11 位手机号'),
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(50)
    .refine((v) => {
      let classes = 0
      if (/[a-zA-Z]/.test(v)) classes++
      if (/[0-9]/.test(v)) classes++
      if (/[^a-zA-Z0-9]/.test(v)) classes++
      return classes >= 2
    }, '需包含字母、数字、符号中的至少两种'),
  name: z.string().min(1, '请输入姓名').max(50),
})

type EmailFormData = z.infer<typeof emailSchema>
type PhoneFormData = z.infer<typeof phoneSchema>

type Channel = 'email' | 'phone'

export function RegisterPage() {
  const navigate = useNavigate()
  const { registerWithEmail } = useAuth()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [channel, setChannel] = useState<Channel>('email')

  const emailForm = useForm<EmailFormData>({ resolver: zodResolver(emailSchema) })
  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) })

  async function onEmailSubmit(data: EmailFormData) {
    setSubmitting(true)
    try {
      const result = await registerWithEmail({
        email: data.email.trim().toLowerCase(),
        password: data.password,
        name: data.name.trim(),
      })
      toast({
        title: '验证码已发送',
        description: `请查收 ${result.email} 的邮件，10 分钟内有效`,
      })
      navigate(`/verify-email?token=${encodeURIComponent(result.verificationToken)}&email=${encodeURIComponent(result.email)}`)
    } catch (error) {
      toast({ title: '注册失败', description: String(error), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function onPhoneSubmit(data: PhoneFormData) {
    setSubmitting(true)
    try {
      // Phase 2: 手机号注册走 /auth/register/phone
      const resp = await fetch('/api/v1/auth/register/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: data.phone,
          password: data.password,
          name: data.name.trim(),
        }),
      })
      const json = await resp.json()
      if (!json.success) {
        toast({ title: '发送失败', description: json.error, variant: 'destructive' })
        return
      }
      toast({
        title: '验证码已发送',
        description: `验证码已发送至 ${data.phone}，10 分钟内有效`,
      })
      // 跳到验证页，带 phone 和 verification_token
      navigate(`/verify-phone?token=${encodeURIComponent(json.data.verification_token)}&phone=${encodeURIComponent(data.phone)}`)
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
          <CardDescription>注册后会自动创建个人俱乐部</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tab 切换 */}
          <div className="flex mb-6 border-b">
            <button
              type="button"
              onClick={() => setChannel('email')}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                channel === 'email'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              邮箱注册
            </button>
            <button
              type="button"
              onClick={() => setChannel('phone')}
              className={`flex-1 pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                channel === 'phone'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              手机号注册
            </button>
          </div>

          {channel === 'email' ? (
            <form className="space-y-4" onSubmit={emailForm.handleSubmit(onEmailSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input id="email" type="email" autoComplete="email" {...emailForm.register('email')} />
                {emailForm.formState.errors.email ? (
                  <p className="text-sm text-red-600">{emailForm.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-password">密码</Label>
                <Input id="email-password" type="password" autoComplete="new-password" {...emailForm.register('password')} />
                {emailForm.formState.errors.password ? (
                  <p className="text-sm text-red-600">{emailForm.formState.errors.password.message}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">至少 8 位，包含字母/数字/符号中的两种</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-name">姓名</Label>
                <Input id="email-name" autoComplete="name" {...emailForm.register('name')} />
                {emailForm.formState.errors.name ? (
                  <p className="text-sm text-red-600">{emailForm.formState.errors.name.message}</p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? '发送验证码中...' : '发送邮箱验证码'}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={phoneForm.handleSubmit(onPhoneSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="phone">手机号</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="11 位手机号"
                  autoComplete="tel"
                  {...phoneForm.register('phone')}
                />
                {phoneForm.formState.errors.phone ? (
                  <p className="text-sm text-red-600">{phoneForm.formState.errors.phone.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-password">密码</Label>
                <Input id="phone-password" type="password" autoComplete="new-password" {...phoneForm.register('password')} />
                {phoneForm.formState.errors.password ? (
                  <p className="text-sm text-red-600">{phoneForm.formState.errors.password.message}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">至少 8 位，包含字母/数字/符号中的两种</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-name">姓名</Label>
                <Input id="phone-name" autoComplete="name" {...phoneForm.register('name')} />
                {phoneForm.formState.errors.name ? (
                  <p className="text-sm text-red-600">{phoneForm.formState.errors.name.message}</p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? '发送验证码中...' : '发送短信验证码'}
              </Button>
            </form>
          )}

          <div className="mt-4 text-center text-sm text-muted-foreground">
            已有账号？<Link to="/login" className="text-primary hover:underline">去登录</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
