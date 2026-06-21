import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, setToken } from '@/lib/api'
import type { LoginResult, UserAccount } from '@/types'

interface AuthContextValue {
  user: UserAccount | null
  loading: boolean
  isLoggedIn: boolean
  login: (username: string, password: string) => Promise<void>
  register: (payload: { username: string; password: string; name: string; phone?: string }) => Promise<void>
  loginWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (payload: { email: string; password: string; name: string; locale?: string }) => Promise<{ verificationToken: string; email: string }>
  verifyEmail: (payload: { email: string; code: string; verification_token: string }) => Promise<void>
  sendCode: (payload: { channel: 'email' | 'phone'; target: string; purpose: 'register' | 'login' | 'reset_password' | 'bind' }) => Promise<void>
  resetPassword: (payload: { email: string; code: string; new_password: string }) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isLoggedIn: false,
  login: async () => undefined,
  register: async () => undefined,
  loginWithEmail: async () => undefined,
  registerWithEmail: async () => ({ verificationToken: '', email: '' }),
  verifyEmail: async () => undefined,
  sendCode: async () => undefined,
  resetPassword: async () => undefined,
  logout: async () => undefined,
  refreshMe: async () => undefined,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null)
  const [loading, setLoading] = useState(true)

  async function refreshMe() {
    try {
      const me = await api.get<UserAccount>('/auth/me')
      setUser(me)
    } catch {
      setUser(null)
      setToken(null)
    }
  }

  async function login(username: string, password: string) {
    const result = await api.post<LoginResult>('/auth/login', { username, password })
    setToken(result.token)
    setUser(result.user)
  }

  async function register(payload: { username: string; password: string; name: string; phone?: string }) {
    const result = await api.post<LoginResult>('/auth/register', payload)
    setToken(result.token)
    setUser(result.user)
  }

  async function loginWithEmail(email: string, password: string) {
    const result = await api.post<LoginResult>('/auth/login/email', { email, password })
    setToken(result.token)
    setUser(result.user)
  }

  async function registerWithEmail(payload: { email: string; password: string; name: string; locale?: string }) {
    const result = await api.post<{ verification_token: string; email: string }>('/auth/register/email', payload)
    return { verificationToken: result.verification_token, email: result.email }
  }

  async function verifyEmail(payload: { email: string; code: string; verification_token: string }) {
    const result = await api.post<LoginResult>('/auth/verify-email', {
      email: payload.email,
      code: payload.code,
      verification_token: payload.verification_token,
      purpose: 'register',
    })
    setToken(result.token)
    setUser(result.user)
  }

  async function sendCode(payload: { channel: 'email' | 'phone'; target: string; purpose: 'register' | 'login' | 'reset_password' | 'bind' }) {
    await api.post('/auth/send-code', payload)
  }

  async function resetPassword(payload: { email: string; code: string; new_password: string }) {
    await api.post('/auth/reset-password', payload)
  }

  async function logout() {
    try {
      await api.post('/auth/logout', {})
    } catch {
      // Token can still be removed locally even if network request fails.
    } finally {
      setToken(null)
      setUser(null)
    }
  }

  useEffect(() => {
    void (async () => {
      await refreshMe()
      setLoading(false)
    })()
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isLoggedIn: !!user,
      login,
      register,
      loginWithEmail,
      registerWithEmail,
      verifyEmail,
      sendCode,
      resetPassword,
      logout,
      refreshMe,
    }),
    [user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
