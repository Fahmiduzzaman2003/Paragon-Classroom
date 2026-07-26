import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { env } from '@/lib/env'
import { firebaseEnabled, getFreshIdToken } from '@/lib/firebase'

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

/** Wake the Render dyno and RESOLVE ONLY when it's actually healthy.
 *
 * Single-flighted: many failing requests share ONE wake-up instead of each
 * hammering /healthz (a thundering herd that slows a cold/struggling free-tier
 * instance). Polls /healthz until it returns 200 (or a deadline), so callers can
 * retry immediately after and succeed on the first try. */
let _warming: Promise<void> | null = null

export async function warmUpBackend(): Promise<void> {
  if (_warming) return _warming
  _warming = (async () => {
    setWaking(true)
    const deadline = Date.now() + 75_000
    try {
      while (Date.now() < deadline) {
        try {
          await axios.get(`${API_URL}/healthz`, { timeout: 8_000 })
          return // backend is up
        } catch {
          await new Promise((r) => setTimeout(r, 2500))
        }
      }
    } finally {
      setWaking(false)
      _warming = null
    }
  })()
  return _warming
}

function isTransient(err: AxiosError): boolean {
  return (
    err.code === 'ECONNABORTED' || // timeout
    err.code === 'ERR_NETWORK' ||
    !err.response // no response at all (server asleep / network blip)
  )
}

// Attach access token. In Firebase mode we fetch a fresh ID token (the SDK
// caches + auto-refreshes it); in legacy mode we use the stored access token.
api.interceptors.request.use(async (config) => {
  const token = firebaseEnabled
    ? await getFreshIdToken()
    : useAuthStore.getState().accessToken
  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
  }
  return config
})

// On 401, attempt a single refresh + retry.
let refreshing: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  // Firebase: force a token refresh; the SDK re-mints from its refresh token.
  if (firebaseEnabled) {
    const token = await getFreshIdToken(true)
    if (!token) useAuthStore.getState().logout()
    return token
  }
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

    // Cold start / dropped connection: wait for the shared wake-up to confirm the
    // backend is healthy, then retry ONCE. Single-flighted warmUpBackend() means
    // N simultaneous failures share one /healthz poll instead of stampeding it.
    if (original && !original._wokeRetry && isTransient(err)) {
      original._wokeRetry = true
      await warmUpBackend()
      return await api.request(original)
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
