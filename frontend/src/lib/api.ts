import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
})

// Attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
  }
  return config
})

// On 401, attempt a single refresh + retry.
let refreshing: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState()
  if (!refreshToken) return null
  try {
    const res = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
    setTokens(res.data.access_token, res.data.refresh_token)
    return res.data.access_token as string
  } catch {
    logout()
    return null
  }
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined
    if (err.response?.status === 401 && original && !original._retry) {
      original._retry = true
      refreshing = refreshing ?? doRefresh()
      const token = await refreshing
      refreshing = null
      if (token) {
        original.headers = original.headers ?? {}
        ;(original.headers as Record<string, string>).Authorization = `Bearer ${token}`
        return api.request(original)
      }
    }
    return Promise.reject(err)
  },
)

export function apiError(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string }; detail?: string } | undefined
    return (
      data?.error?.message ??
      (typeof data?.detail === 'string' ? data.detail : undefined) ??
      err.message ??
      fallback
    )
  }
  return err instanceof Error ? err.message : fallback
}
