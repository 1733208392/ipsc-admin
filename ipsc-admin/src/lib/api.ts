const API_BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const defaultHeaders: HeadersInit | undefined = isFormData ? undefined : { 'Content-Type': 'application/json' }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: defaultHeaders,
    ...options,
  })
  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')

  if (!res.ok) {
    if (isJson) {
      const err = await res.json().catch(() => ({ error: 'Network error' }))
      throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
    }

    const text = await res.text().catch(() => '')
    throw new Error(text ? `HTTP ${res.status}: ${text.slice(0, 120)}` : `HTTP ${res.status}`)
  }

  if (!isJson) {
    throw new Error(`Unexpected response type: ${contentType || 'unknown'}`)
  }

  const json = await res.json()
  return (json as { data: T }).data
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
