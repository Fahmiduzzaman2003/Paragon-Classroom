import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import type { User } from '@/types'
import { API_URL, apiError } from '@/lib/api'
import { auth, firebaseEnabled, getFreshIdToken, googleProvider } from '@/lib/firebase'

interface RegisterPayload {
  email: string
  password: string
  name: string
  role: 'teacher' | 'student'
  institution?: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  hydrated: boolean

  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  /** Firebase Google popup sign-in (used when Firebase is configured). */
  signInWithGoogle: () => Promise<void>
  /** Legacy OIDC code-flow (used only when Firebase is off). */
  loginWithGoogle: (code: string, state: string) => Promise<void>
  /** Legacy dev-Google shim (used only when Firebase is off). */
  loginWithGoogleDev: (email: string, name?: string) => Promise<void>
  /** Send a password-reset email (Firebase or legacy). */
  sendPasswordReset: (email: string) => Promise<void>
  logout: () => void
  setUser: (user: User) => void
  setTokens: (access: string, refresh: string) => void
  refreshMe: () => Promise<void>
}

type TokenPair = { access_token: string; refresh_token: string; expires_in: number }

function mapUser(raw: Record<string, unknown>): User {
  return {
    id: raw.id as string,
    email: raw.email as string,
    name: raw.name as string,
    role: (raw.role as User['role']) ?? 'student',
    avatarUrl: (raw.avatar_url as string | undefined) ?? undefined,
    bio: (raw.bio as string | undefined) ?? undefined,
    institution: (raw.institution as string | undefined) ?? undefined,
  }
}

// ── Firebase helpers ──────────────────────────────────────────────
async function fetchMeFirebase(): Promise<User> {
  const token = await getFreshIdToken()
  const { data } = await axios.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return mapUser(data)
}

async function syncProfile(role?: 'teacher' | 'student', name?: string): Promise<User> {
  const token = await getFreshIdToken(true)
  const { data } = await axios.post(
    `${API_URL}/auth/sync`,
    { role, name },
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return mapUser(data)
}

/** Map a Firebase auth error (or a backend error from /auth/sync) to a clean,
 * user-facing message. Non-Firebase (axios) errors are surfaced via apiError so
 * a CORS / token-verification failure isn't hidden behind a generic message. */
function firebaseError(err: unknown, fallback: string): Error {
  // Backend call failed (e.g. /auth/sync or /auth/me): show the real cause.
  if (axios.isAxiosError(err)) {
    return new Error(apiError(err, `${fallback} (backend rejected the sign-in)`))
  }
  const code = (err as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-not-found': 'Invalid email or password.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/email-already-in-use': 'An account with this email already exists — try signing in instead.',
    'auth/weak-password': 'Password is too weak — use at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and retry.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
    'auth/network-request-failed': 'Network error — check your connection and retry.',
    'auth/unauthorized-domain':
      "This site isn't authorized in Firebase. Add your domain under Firebase → Authentication → Settings → Authorized domains.",
    'auth/operation-not-allowed':
      "This sign-in method isn't enabled in Firebase → Authentication → Sign-in method.",
    'auth/account-exists-with-different-credential':
      'This email is already registered with a different sign-in method.',
  }
  // Include the raw code in the fallback so an unmapped error is still diagnosable.
  return new Error(map[code] || (code ? `Sign-in error (${code}).` : fallback))
}

// Module-local guard so the onIdTokenChanged listener doesn't race /auth/sync
// during registration (which sets the chosen role on first provision).
let provisioning = false

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hydrated: false,

      async login(email, password) {
        if (firebaseEnabled && auth) {
          try {
            await signInWithEmailAndPassword(auth, email, password)
          } catch (e) {
            throw firebaseError(e, 'Could not sign in.')
          }
          set({ user: await fetchMeFirebase() })
          return
        }
        const { data } = await axios.post<TokenPair>(`${API_URL}/auth/login`, { email, password })
        const user = await fetchMeLegacy(data.access_token)
        set({ accessToken: data.access_token, refreshToken: data.refresh_token, user })
      },

      async register(payload) {
        if (firebaseEnabled && auth) {
          provisioning = true
          try {
            const cred = await createUserWithEmailAndPassword(auth, payload.email, payload.password)
            if (payload.name) await updateProfile(cred.user, { displayName: payload.name })
            try {
              await sendEmailVerification(cred.user)
            } catch {
              /* non-fatal — user can resend from the banner */
            }
            const user = await syncProfile(payload.role, payload.name)
            set({ user })
          } catch (e) {
            throw firebaseError(e, 'Could not create your account.')
          } finally {
            provisioning = false
          }
          return
        }
        const { data } = await axios.post<TokenPair>(`${API_URL}/auth/register`, payload)
        const user = await fetchMeLegacy(data.access_token)
        set({ accessToken: data.access_token, refreshToken: data.refresh_token, user })
      },

      async signInWithGoogle() {
        if (!firebaseEnabled || !auth) throw new Error('Google sign-in is not available.')
        provisioning = true
        try {
          await signInWithPopup(auth, googleProvider)
          set({ user: await syncProfile() })
        } catch (e) {
          throw firebaseError(e, 'Google sign-in failed.')
        } finally {
          provisioning = false
        }
      },

      async loginWithGoogle(code, state) {
        const { data } = await axios.post<TokenPair>(`${API_URL}/auth/google/callback`, { code, state })
        const user = await fetchMeLegacy(data.access_token)
        set({ accessToken: data.access_token, refreshToken: data.refresh_token, user })
      },

      async loginWithGoogleDev(email, name) {
        const { data } = await axios.post<TokenPair>(`${API_URL}/auth/google/dev`, { email, name })
        const user = await fetchMeLegacy(data.access_token)
        set({ accessToken: data.access_token, refreshToken: data.refresh_token, user })
      },

      async sendPasswordReset(email) {
        if (firebaseEnabled && auth) {
          try {
            await sendPasswordResetEmail(auth, email)
          } catch (e) {
            throw firebaseError(e, 'Could not send the reset email.')
          }
          return
        }
        await axios.post(`${API_URL}/auth/forgot-password`, { email })
      },

      logout() {
        if (firebaseEnabled && auth) signOut(auth).catch(() => {})
        set({ user: null, accessToken: null, refreshToken: null })
      },

      setUser(user) {
        set({ user })
      },

      setTokens(access, refresh) {
        set({ accessToken: access, refreshToken: refresh })
      },

      async refreshMe() {
        if (firebaseEnabled && auth) {
          if (!auth.currentUser) {
            set({ user: null })
            return
          }
          try {
            set({ user: await fetchMeFirebase() })
          } catch {
            /* keep the cached user on a transient error */
          }
          return
        }
        const { accessToken } = get()
        if (!accessToken) return
        try {
          set({ user: await fetchMeLegacy(accessToken) })
        } catch {
          set({ user: null, accessToken: null, refreshToken: null })
        }
      },
    }),
    {
      name: 'paragon-auth',
      // In Firebase mode the SDK owns the session; we only cache `user` for a
      // fast first paint. In legacy mode we persist the tokens too.
      partialize: (s) =>
        firebaseEnabled
          ? { user: s.user }
          : { user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken },
      onRehydrateStorage: () => (state) => {
        // Legacy mode is hydrated once localStorage is read; Firebase mode is
        // hydrated by the onIdTokenChanged listener below.
        if (state && !firebaseEnabled) state.hydrated = true
      },
    },
  ),
)

async function fetchMeLegacy(accessToken: string): Promise<User> {
  const { data } = await axios.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return mapUser(data)
}

// ── Firebase session bootstrap ────────────────────────────────────
// Keep the access token fresh and restore the session on reload. This is the
// single source of truth for `hydrated` when Firebase is on.
if (firebaseEnabled && auth) {
  onIdTokenChanged(auth, async (fbUser) => {
    if (!fbUser) {
      useAuthStore.setState({ accessToken: null, user: null, hydrated: true })
      return
    }
    try {
      const token = await fbUser.getIdToken()
      useAuthStore.setState({ accessToken: token })
      // Populate our profile on load/restore — but not while register/Google is
      // provisioning (that path calls /auth/sync with the chosen role).
      if (!provisioning && !useAuthStore.getState().user) {
        try {
          useAuthStore.setState({ user: await fetchMeFirebase() })
        } catch {
          /* backend may be cold — keep going, refreshMe can retry */
        }
      }
    } finally {
      useAuthStore.setState({ hydrated: true })
    }
  })
}
