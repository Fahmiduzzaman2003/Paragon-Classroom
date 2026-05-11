import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, API_URL } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

export interface ApiFlashcard {
  id: string
  course_id: string
  user_id: string
  front: string
  back: string
  source_filename: string
  source_page: number
  ease: number
  interval_days: number
  review_count: number
  due_at: string
  last_reviewed_at: string | null
  created_at: string
}

export interface Flashcard {
  id: string
  courseId: string
  userId: string
  front: string
  back: string
  sourceFilename: string
  sourcePage: number
  ease: number
  intervalDays: number
  reviewCount: number
  dueAt: string
  lastReviewedAt: string | null
  createdAt: string
}

function mapFlashcard(c: ApiFlashcard): Flashcard {
  return {
    id: c.id,
    courseId: c.course_id,
    userId: c.user_id,
    front: c.front,
    back: c.back,
    sourceFilename: c.source_filename,
    sourcePage: c.source_page,
    ease: c.ease,
    intervalDays: c.interval_days,
    reviewCount: c.review_count,
    dueAt: c.due_at,
    lastReviewedAt: c.last_reviewed_at,
    createdAt: c.created_at,
  }
}

export function useFlashcards(courseId: string | undefined) {
  return useQuery<Flashcard[]>({
    queryKey: ['flashcards', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiFlashcard[]>(`/courses/${courseId}/flashcards`)
      return data.map(mapFlashcard)
    },
  })
}

export function useDueFlashcards(courseId: string | undefined) {
  return useQuery<Flashcard[]>({
    queryKey: ['flashcards-due', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiFlashcard[]>(`/courses/${courseId}/flashcards/due`)
      return data.map(mapFlashcard)
    },
  })
}

export function useGenerateFlashcards(courseId: string) {
  const qc = useQueryClient()
  return useMutation<Flashcard[], Error, { count?: number; instructions?: string }>({
    mutationFn: async ({ count = 10, instructions = '' } = {}) => {
      const { data } = await api.post<ApiFlashcard[]>(
        `/courses/${courseId}/flashcards/generate`,
        { count, instructions },
      )
      return data.map(mapFlashcard)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards', courseId] })
      qc.invalidateQueries({ queryKey: ['flashcards-due', courseId] })
    },
  })
}

export function useCreateFlashcard(courseId: string) {
  const qc = useQueryClient()
  return useMutation<
    Flashcard,
    Error,
    { front: string; back: string; sourceFilename?: string; sourcePage?: number }
  >({
    mutationFn: async ({ front, back, sourceFilename = '', sourcePage = 0 }) => {
      const { data } = await api.post<ApiFlashcard>(`/courses/${courseId}/flashcards`, {
        front,
        back,
        source_filename: sourceFilename,
        source_page: sourcePage,
      })
      return mapFlashcard(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards', courseId] })
      qc.invalidateQueries({ queryKey: ['flashcards-due', courseId] })
    },
  })
}

export function useReviewFlashcard(courseId: string) {
  const qc = useQueryClient()
  return useMutation<Flashcard, Error, { cardId: string; quality: number }>({
    mutationFn: async ({ cardId, quality }) => {
      const { data } = await api.post<ApiFlashcard>(`/flashcards/${cardId}/review`, { quality })
      return mapFlashcard(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards', courseId] })
      qc.invalidateQueries({ queryKey: ['flashcards-due', courseId] })
    },
  })
}

export function useDeleteFlashcard(courseId: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (cardId) => {
      await api.delete(`/flashcards/${cardId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards', courseId] })
      qc.invalidateQueries({ queryKey: ['flashcards-due', courseId] })
    },
  })
}

// ─────────────────────────────────────────────────────
// Practice mode
// ─────────────────────────────────────────────────────

export interface PracticeQuestion {
  type: 'mcq_single' | 'true_false'
  body: string
  options: string[]
  correct: number[]
  explanation: string
}

export function usePracticeNext(courseId: string) {
  return useMutation<PracticeQuestion, Error, { instructions?: string }>({
    mutationFn: async ({ instructions = '' } = {}) => {
      const { data } = await api.post<PracticeQuestion>(
        `/courses/${courseId}/practice/next`,
        { instructions },
      )
      return data
    },
  })
}

// ─────────────────────────────────────────────────────
// "Why is this wrong?" — SSE streaming explanation
// ─────────────────────────────────────────────────────

export async function streamExplainWrong(
  attemptId: string,
  questionId: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = useAuthStore.getState().accessToken
  const res = await fetch(`${API_URL}/attempts/${attemptId}/explain/${questionId}`, {
    method: 'POST',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      Accept: 'text/event-stream',
    },
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Stream failed (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // Each SSE frame is separated by a blank line.
    const frames = buf.split('\n\n')
    buf = frames.pop() ?? ''
    for (const frame of frames) {
      const lines = frame.split('\n')
      let event = 'message'
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      try {
        const parsed = JSON.parse(data) as { text?: string; message?: string }
        if (event === 'delta' && typeof parsed.text === 'string') onDelta(parsed.text)
        if (event === 'error' && parsed.message) throw new Error(parsed.message)
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
