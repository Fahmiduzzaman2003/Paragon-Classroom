import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, API_URL } from '@/lib/api'
import {
  mapAttachment,
  mapAttemptResult,
  mapAttemptStart,
  mapAttemptSummary,
  mapQuestion,
  mapQuiz,
  type ApiAttachment,
  type ApiAttemptResult,
  type ApiAttemptStart,
  type ApiAttemptSummary,
  type ApiQuestion,
  type ApiQuiz,
} from '@/lib/mappers'
import type {
  AttemptAttachment,
  AttemptResult,
  AttemptStart,
  AttemptSummary,
  Question,
  Quiz,
} from '@/types'

export function useQuizzes(courseId: string | undefined) {
  return useQuery<Quiz[]>({
    queryKey: ['quizzes', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiQuiz[]>(`/courses/${courseId}/quizzes`)
      return data.map(mapQuiz)
    },
  })
}

export function useQuiz(quizId: string | undefined) {
  return useQuery<Quiz>({
    queryKey: ['quiz', quizId],
    enabled: !!quizId,
    queryFn: async () => {
      const { data } = await api.get<ApiQuiz>(`/quizzes/${quizId}`)
      return mapQuiz(data)
    },
  })
}

interface CreateQuizInput {
  title: string
  description?: string
  duration_min?: number
  shuffle_questions?: boolean
  show_results?: boolean
  allow_retake?: boolean
  one_question_at_a_time?: boolean
  exam_mode?: boolean
  proctoring_enabled?: boolean
  status?: Quiz['status']
  start_at?: string | null
  end_at?: string | null
  questions: {
    type: string
    body: string
    options: string[]
    correct: (number | string)[]
    points: number
    explanation?: string
    accepts_attachment?: boolean
  }[]
}

export interface QuizStatusInfo {
  quizId: string
  status: Quiz['status']
  serverNow: string
  startAt: string | null
  endAt: string | null
  startsInSeconds: number | null
  endsInSeconds: number | null
  canStart: boolean
  durationMin: number
  proctoringEnabled: boolean
}

export function useQuizStatus(quizId: string | undefined, pollMs = 0) {
  return useQuery<QuizStatusInfo>({
    queryKey: ['quiz-status', quizId],
    enabled: !!quizId,
    refetchInterval: pollMs > 0 ? pollMs : false,
    queryFn: async () => {
      const { data } = await api.get<{
        quiz_id: string
        status: Quiz['status']
        server_now: string
        start_at: string | null
        end_at: string | null
        starts_in_seconds: number | null
        ends_in_seconds: number | null
        can_start: boolean
        duration_min: number
        proctoring_enabled: boolean
      }>(`/quizzes/${quizId}/status`)
      return {
        quizId: data.quiz_id,
        status: data.status,
        serverNow: data.server_now,
        startAt: data.start_at,
        endAt: data.end_at,
        startsInSeconds: data.starts_in_seconds,
        endsInSeconds: data.ends_in_seconds,
        canStart: data.can_start,
        durationMin: data.duration_min,
        proctoringEnabled: data.proctoring_enabled,
      }
    },
  })
}

export function useReportViolation(attemptId: string | undefined) {
  return useMutation<void, Error, { type: string; extra?: Record<string, unknown> }>({
    mutationFn: async ({ type, extra }) => {
      if (!attemptId) return
      await api.post(`/attempts/${attemptId}/violations`, {
        type,
        extra: extra ?? {},
      })
    },
  })
}

export function useCreateQuiz(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateQuizInput) => {
      const { data } = await api.post<ApiQuiz>(`/courses/${courseId}/quizzes`, payload)
      return mapQuiz(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quizzes', courseId] }),
  })
}

export function useGenerateQuiz(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      title?: string
      num_questions?: number
      types?: string[]
      instructions?: string
    }) => {
      const { data } = await api.post<ApiQuiz>(
        `/courses/${courseId}/quizzes/generate`,
        payload,
      )
      return mapQuiz(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quizzes', courseId] }),
  })
}

export function useDeleteQuiz(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (quizId: string) => {
      await api.delete(`/quizzes/${quizId}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quizzes', courseId] }),
  })
}

export function useStartAttempt() {
  return useMutation({
    mutationFn: async (quizId: string) => {
      const { data } = await api.post<ApiAttemptStart>(`/quizzes/${quizId}/attempts`)
      return mapAttemptStart(data)
    },
  })
}

export function useSubmitAttempt() {
  return useMutation({
    mutationFn: async ({
      attemptId,
      answers,
    }: {
      attemptId: string
      answers: { question_id: string; selected: number[]; text: string }[]
    }) => {
      const { data } = await api.post<ApiAttemptResult>(
        `/attempts/${attemptId}/submit`,
        { answers },
      )
      return mapAttemptResult(data)
    },
  })
}

export function useAttempt(attemptId: string | undefined) {
  return useQuery<AttemptResult>({
    queryKey: ['attempt', attemptId],
    enabled: !!attemptId,
    queryFn: async () => {
      const { data } = await api.get<ApiAttemptResult>(`/attempts/${attemptId}`)
      return mapAttemptResult(data)
    },
  })
}

export interface LeaderboardRow {
  rank: number
  user_id: string
  name: string
  avatar_url: string | null
  points: number
  quizzes_taken: number
  streak: number
}

export function useLeaderboard(courseId: string | undefined) {
  return useQuery<LeaderboardRow[]>({
    queryKey: ['leaderboard', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<LeaderboardRow[]>(
        `/courses/${courseId}/leaderboard`,
      )
      return data
    },
  })
}

// ─────────────────────────────────────────────────────
// Exam-mode hooks
// ─────────────────────────────────────────────────────

export interface JoinExamResult {
  quizId: string
  courseId: string
  title: string
  durationMin: number
  status: Quiz['status']
  examMode: boolean
}

export function useJoinExam() {
  return useMutation<JoinExamResult, Error, string>({
    mutationFn: async (code) => {
      const { data } = await api.post<{
        quiz_id: string
        course_id: string
        title: string
        duration_min: number
        starts_at: string | null
        ends_at: string | null
        status: Quiz['status']
        exam_mode: boolean
      }>('/exam/join', { code: code.trim().toUpperCase() })
      return {
        quizId: data.quiz_id,
        courseId: data.course_id,
        title: data.title,
        durationMin: data.duration_min,
        status: data.status,
        examMode: data.exam_mode,
      }
    },
  })
}

export function useRegenerateExamCode(quizId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiQuiz>(`/quizzes/${quizId}/regenerate-code`)
      return mapQuiz(data)
    },
    onSuccess: (q) => {
      qc.setQueryData(['quiz', quizId], q)
      qc.invalidateQueries({ queryKey: ['quizzes', q.courseId] })
    },
  })
}

export function useUploadAttachment() {
  return useMutation<
    AttemptAttachment,
    Error,
    { attemptId: string; questionId: string; file: File }
  >({
    mutationFn: async ({ attemptId, questionId, file }) => {
      const fd = new FormData()
      fd.append('question_id', questionId)
      fd.append('file', file)
      const { data } = await api.post<ApiAttachment>(
        `/attempts/${attemptId}/attachments`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return mapAttachment(data)
    },
  })
}

export function useDeleteAttachment() {
  return useMutation({
    mutationFn: async ({
      attemptId,
      attachmentId,
    }: {
      attemptId: string
      attachmentId: string
    }) => {
      await api.delete(`/attempts/${attemptId}/attachments/${attachmentId}`)
    },
  })
}

export function useAttemptAttachments(attemptId: string | undefined) {
  return useQuery<AttemptAttachment[]>({
    queryKey: ['attemptAttachments', attemptId],
    enabled: !!attemptId,
    queryFn: async () => {
      const { data } = await api.get<ApiAttachment[]>(
        `/attempts/${attemptId}/attachments`,
      )
      return data.map(mapAttachment)
    },
  })
}

export function useSubmissions(quizId: string | undefined) {
  return useQuery<AttemptSummary[]>({
    queryKey: ['quizSubmissions', quizId],
    enabled: !!quizId,
    queryFn: async () => {
      const { data } = await api.get<ApiAttemptSummary[]>(
        `/quizzes/${quizId}/submissions`,
      )
      return data.map(mapAttemptSummary)
    },
  })
}

export function useGradeQuestion(attemptId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      question_id: string
      points: number
      feedback?: string
      correct?: boolean | null
    }) => {
      const { data } = await api.post<ApiAttemptResult>(
        `/attempts/${attemptId}/grade`,
        payload,
      )
      return mapAttemptResult(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attempt', attemptId] }),
  })
}

export function useReleaseAttempt(attemptId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (teacherFeedback: string) => {
      const { data } = await api.post<ApiAttemptResult>(
        `/attempts/${attemptId}/release`,
        { teacher_feedback: teacherFeedback },
      )
      return mapAttemptResult(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attempt', attemptId] })
      qc.invalidateQueries({ queryKey: ['quizSubmissions'] })
    },
  })
}

// ─────────────────────────────────────────────────────
// Question images — teacher attaches a diagram / photo to a question
// ─────────────────────────────────────────────────────

export function questionImageUrl(questionId: string): string {
  return `${API_URL}/questions/${questionId}/image`
}

export async function fetchQuestionImageBlob(questionId: string): Promise<string> {
  const { data } = await api.get<Blob>(`/questions/${questionId}/image`, {
    responseType: 'blob',
  })
  return URL.createObjectURL(data)
}

export function useUploadQuestionImage(quizId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<Question, Error, { questionId: string; file: File }>({
    mutationFn: async ({ questionId, file }) => {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<ApiQuestion>(
        `/questions/${questionId}/image`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return mapQuestion(data)
    },
    onSuccess: () => {
      if (quizId) qc.invalidateQueries({ queryKey: ['quiz', quizId] })
    },
  })
}

export function useDeleteQuestionImage(quizId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (questionId) => {
      await api.delete(`/questions/${questionId}/image`)
    },
    onSuccess: () => {
      if (quizId) qc.invalidateQueries({ queryKey: ['quiz', quizId] })
    },
  })
}

export function attachmentDownloadUrl(attachmentId: string): string {
  // Direct URL — used by <a download> links and previews. Token isn't sent
  // because anchors don't carry headers, so prefer fetchAttachmentBlob below
  // for protected previews.
  return `${API_URL}/attachments/${attachmentId}/download`
}

export async function fetchAttachmentBlob(attachmentId: string): Promise<string> {
  const { data } = await api.get<Blob>(`/attachments/${attachmentId}/download`, {
    responseType: 'blob',
  })
  return URL.createObjectURL(data)
}

export type { AttemptStart }
