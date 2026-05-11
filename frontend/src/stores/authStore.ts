import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import type { User } from '@/types'
import { API_URL } from '@/lib/api'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  hydrated: boolean

  login: (email: string, password: string) => Promise<void>
  register: (payload: {
    email: string
    password: string
    name: string
    role: 'teacher' | 'student'
    institution?: string
  }) => Promise<void>
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

async function fetchMe(accessToken: string): Promise<User> {
  const { data } = await axios.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return mapUser(data)
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hydrated: false,

      async login(email, password) {
        const { data } = await axios.post<TokenPair>(`${API_URL}/auth/login`, {
          email,
          password,
        })
        const user = await fetchMe(data.access_token)
        set({ accessToken: data.access_token, refreshToken: data.refresh_token, user })
      },

      async register(payload) {
        const { data } = await axios.post<TokenPair>(`${API_URL}/auth/register`, payload)
        const user = await fetchMe(data.access_token)
        set({ accessToken: data.access_token, refreshToken: data.refresh_token, user })
      },

      logout() {
        set({ user: null, accessToken: null, refreshToken: null })
      },

      setUser(user) {
        set({ user })
      },

      setTokens(access, refresh) {
        set({ accessToken: access, refreshToken: refresh })
      },

      async refreshMe() {
        const { accessToken } = get()
        if (!accessToken) return
        try {
          const user = await fetchMe(accessToken)
          set({ user })
        } catch {
          set({ user: null, accessToken: null, refreshToken: null })
        }
      },
    }),
    {
      name: 'paragon-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    },
  ),
)
