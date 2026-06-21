import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// 自动识别渠道：含 @ 视为邮箱，11 位数字 1[3-9]xxx 视为手机号
function detectChannel(value: string): 'email' | 'phone' | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  if (v.includes('@')) return 'email'
  if (/^1[3-9]\d{0,9}$/.test(v)) return 'phone'
  return null
}

const accountSchema = z.object({
  account: z
    .string()
    .min(1, '请输入邮箱或手机号')
    .refine((v) => detectChannel(v) !== null, '格式不正确（邮箱或 11 位手机号）'),
})

const resetSchema = z.object({
  account: z.string().min(1),
  code: z.string().length(6, '验证码为 6 位数字'),
  new_password: z
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
  confirm_password: z.string().min(1, '请再次输入密码'),
}).refine((d) => d.new_password === d.confirm_password, {
  path: ['confirm_password'],
  message: '两次密码不一致',
})

type AccountData = z.infer<typeof accountSchema>
type ResetData = z.infer<typeof resetSchema>

type Step = 'request' | 'reset' | 'done'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [step, setStep] = useState<Step>('request')
  const [account, setAccount] = useState('')
  const [channel, setChannel] = useState<'email' | 'phone' | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const accountForm = useForm<AccountData>({ resolver: zodResolver(accountSchema) })
  const resetForm = useForm<ResetData>({ resolver: zodResolver(resetSchema) })

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function sendCode(target: string, ch: 'email' | 'phone') {
    try {
      const resp = await fetch('/api/v1/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: ch, target, purpose: 'reset_password' }),
      })
      const json = await resp.json()
      if (!json.success) {
        toast({ title: '发送失败', description: json.error, variant: 'destructive' })
        return false
      }
      return true
    } catch (error) {
      toast({ title: '发送失败', description: String(error), variant: 'destructive' })
      return false
    }
  }

  async function onRequestCode(data: AccountData) {
    const ch = detectChannel(data.account)!
    const target = ch === 'email' ? data.account.trim().toLowerCase() : data.account.trim()
    setSubmitting(true)
    const ok = await sendCode(target, ch)
    setSubmitting(false)
    if (ok) {
      setAccount(target)
      setChannel(ch)
      setStep('reset')
      setCooldown(60)
      resetForm.setValue('account', target)
      toast({
        title: '验证码已发送',
        description: ch === 'email'
          ? `请查收 ${target} 的邮件`
          : `验证码已发送至 ${target}`,
      })
    }
  }

  async function onReset(data: ResetData) {
    if (!channel) return
    setSubmitting(true)
    try {
      // 根据渠道调用不同端点
      const url = channel === 'email'
        ? '/api/v1/auth/reset-password'
        : '/api/v1/auth/reset-password/phone'
      const payload = channel === 'email'
        ? { email: data.account, code: data.code, new_password: data.new_password }
        : { phone: data.account, code: data.code, new_password: data.new_password }

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await resp.json()
      if (!json.success) {
        toast({ title: '重置失败', description: json.error, variant: 'destructive' })
        return
      }
      setStep('done')
      toast({ title: '密码已重置', description: '请使用新密码登录' })
    } catch (error) {
      toast({ title: '重置失败', description: String(error), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function onResend() {
    if (cooldown > 0 || !channel) return
    const ok = await sendCode(account, channel)
    if (ok) {
      setCooldown(60)
      toast({ title: '验证码已重新发送' })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {step === 'request' && '找回密码'}
            {step === 'reset' && '设置新密码'}
            {step === 'done' && '密码已重置'}
          </CardTitle>
          <CardDescription>
            {step === 'request' && '输入注册时的邮箱或手机号'}
            {step === 'reset' && (
              channel === 'email'
                ? `验证码已发送至邮箱 ${account}`
                : `验证码已发送至 ${account}`
            )}
            {step === 'done' && '请使用新密码登录'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'request' && (
            <form className="space-y-4" onSubmit={accountForm.handleSubmit(onRequestCode)}>
              <div className="space-y-2">
                <Label htmlFor="account">邮箱或手机号</Label>
                <Input
                  id="account"
                  type="text"
                  autoComplete="username"
                  placeholder="邮箱 或 11 位手机号"
                  {...accountForm.register('account')}
                />
                {accountForm.formState.errors.account ? (
                  <p className="text-sm text-red-600">{accountForm.formState.errors.account.message}</p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? '发送中...' : '发送验证码'}
              </Button>
            </form>
          )}

          {step === 'reset' && (
            <form className="space-y-4" onSubmit={resetForm.handleSubmit(onReset)}>
              <div className="space-y-2">
                <Label htmlFor="code">验证码</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 位数字"
                  className="text-center text-2xl tracking-widest"
                  {...resetForm.register('code')}
                />
                {resetForm.formState.errors.code ? (
                  <p className="text-sm text-red-600">{resetForm.formState.errors.code.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_password">新密码</Label>
                <Input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  {...resetForm.register('new_password')}
                />
                {resetForm.formState.errors.new_password ? (
                  <p className="text-sm text-red-600">{resetForm.formState.errors.new_password.message}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">至少 8 位，包含字母/数字/符号中的两种</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">确认新密码</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  {...resetForm.register('confirm_password')}
                />
                {resetForm.formState.errors.confirm_password ? (
                  <p className="text-sm text-red-600">{resetForm.formState.errors.confirm_password.message}</p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? '重置中...' : '重置密码'}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                {cooldown > 0 ? (
                  <span>{cooldown}s 后可重新发送</span>
                ) : (
                  <button type="button" onClick={onResend} className="text-primary hover:underline">
                    重新发送验证码
                  </button>
                )}
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">密码修改成功，请使用新密码登录</p>
              <Button className="w-full" onClick={() => navigate('/login')}>
                去登录
              </Button>
            </div>
          )}

          {step !== 'done' && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              想起密码了？<Link to="/login" className="text-primary hover:underline">返回登录</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
