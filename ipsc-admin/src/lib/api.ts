const API_BASE = '/api/v1'
const TOKEN_STORAGE_KEY = 'ipsc_admin_token'

let accessToken: string | null = typeof window !== 'undefined'
  ? window.localStorage.getItem(TOKEN_STORAGE_KEY)
  : null

export function setToken(token: string | null) {
  accessToken = token
  if (typeof window === 'undefined') return
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const defaultHeaders: HeadersInit | undefined = isFormData ? undefined : { 'Content-Type': 'application/json' }
  const authHeader: HeadersInit | undefined = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : undefined

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(defaultHeaders ?? {}),
      ...(authHeader ?? {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  })
  if (!res.ok) {
    const contentType = res.headers.get('content-type') || ''
    let message = `HTTP ${res.status}`

    if (contentType.includes('application/json')) {
      const err = await res.json().catch(() => ({})) as { error?: string; message?: string }
      message = err.error || err.message || message
    } else {
      const text = await res.text().catch(() => '')
      if (text.trim()) {
        message = `${message}: ${text.slice(0, 200)}`
      }
    }

    throw new Error(message)
  }
  const json = await res.json()

  // Support both API envelope responses ({ data }) and legacy/raw payload responses.
  if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
    return (json as { data: T }).data
  }

  return json as T
}

export const api = {
  get<T>(path: string) {
    return request<T>(path)
  },
  post<T>(path: string, body: unknown) {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  },
  postForm<T>(path: string, body: FormData) {
    return request<T>(path, { method: 'POST', body })
  },
  put<T>(path: string, body: unknown) {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
  },
  patch<T>(path: string, body: unknown) {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  },
  delete<T>(path: string) {
    return request<T>(path, { method: 'DELETE' })
  },
}
