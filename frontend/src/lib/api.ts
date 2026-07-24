import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { env } from '@/lib/env'

export const API_URL: string = env.API_URL

// Render Free spins down after ~15 min idle and takes ~30–60s to cold start, so
// the FIRST request after idle can be slow. A generous timeout + one retry keeps
// that from surfacing as a false error.
export const api = axios.create({
  baseURL: API_URL,
  timeout: 60_000,
})

/** Subscribe to backend "waking up" state so the UI can show an honest banner
 * instead of a frozen spinner. */
type WakeListener = (waking: boolean) => void
const wakeListeners = new Set<WakeListener>()
let _waking = false

export function onBackendWaking(fn: WakeListener): () => void {
  wakeListeners.add(fn)
  fn(_waking)
  return () => wakeListeners.delete(fn)
}
function setWaking(v: boolean) {
  if (_waking === v) return
  _waking = v
  wakeListeners.forEach((fn) => fn(v))
}

/** Fire-and-forget prewarm: start the Render dyno waking as soon as the app
 * loads, so it's likely up by the time the user does something. */
export async function warmUpBackend(): Promise<void> {
  try {
    setWaking(true)
    await axios.get(`${API_URL}/healthz`, { timeout: 65_000 })
  } catch {
    /* ignore — this is best-effort */
  } finally {
    setWaking(false)
  }
}

function isTransient(err: AxiosError): boolean {
  return (
    err.code === 'ECONNABORTED' || // timeout
    err.code === 'ERR_NETWORK' ||
    !err.response // no response at all (server asleep / network blip)
  )
}

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
    const original = err.config as
      | (AxiosRequestConfig & { _retry?: boolean; _wokeRetry?: boolean })
      | undefined

    // 401 → single-flight refresh + retry.
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

    // Cold start: a transient timeout/network error gets ONE retry after a short
    // wait, with the UI showing an honest "waking up the server" state.
    if (original && !original._wokeRetry && isTransient(err)) {
      original._wokeRetry = true
      setWaking(true)
      try {
        await warmUpBackend()
        await new Promise((r) => setTimeout(r, 1200))
        return await api.request(original)
      } finally {
        setWaking(false)
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
