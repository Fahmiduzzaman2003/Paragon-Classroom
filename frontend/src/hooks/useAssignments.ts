import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  mapAssignment,
  mapSubmission,
  type ApiAssignment,
  type ApiSubmission,
} from '@/lib/mappers'
import type { Assignment, Submission } from '@/types'

export function useAssignments(courseId: string | undefined) {
  return useQuery<Assignment[]>({
    queryKey: ['assignments', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiAssignment[]>(`/courses/${courseId}/assignments`)
      return data.map(mapAssignment)
    },
  })
}

export function useAssignment(assignmentId: string | undefined) {
  return useQuery<Assignment>({
    queryKey: ['assignment', assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data } = await api.get<ApiAssignment>(`/assignments/${assignmentId}`)
      return mapAssignment(data)
    },
  })
}

export function useSubmissions(assignmentId: string | undefined) {
  return useQuery<Submission[]>({
    queryKey: ['submissions', assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data } = await api.get<ApiSubmission[]>(
        `/assignments/${assignmentId}/submissions`,
      )
      return data.map(mapSubmission)
    },
  })
}

export function useCreateAssignment(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      title: string
      description: string
      deadline: string
      max_points: number
      rubric: { name: string; max_points: number; description?: string }[]
    }) => {
      const { data } = await api.post<ApiAssignment>(
        `/courses/${courseId}/assignments`,
        payload,
      )
      return mapAssignment(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', courseId] }),
  })
}

export function useSubmitAssignment(assignmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      text,
      files,
    }: {
      text: string
      files: File[]
    }) => {
      const fd = new FormData()
      fd.append('text', text)
      for (const f of files) fd.append('files', f)
      const { data } = await api.post<ApiSubmission>(
        `/assignments/${assignmentId}/submissions`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return mapSubmission(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] })
      qc.invalidateQueries({ queryKey: ['assignment', assignmentId] })
    },
  })
}

export function useGradeSubmission(assignmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      submissionId,
      grade,
      feedback,
      rubric_scores,
    }: {
      submissionId: string
      grade: number
      feedback: string
      rubric_scores: { name: string; points: number }[]
    }) => {
      const { data } = await api.post<ApiSubmission>(
        `/submissions/${submissionId}/grade`,
        { grade, feedback, rubric_scores },
      )
      return mapSubmission(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] })
      qc.invalidateQueries({ queryKey: ['assignment', assignmentId] })
    },
  })
}
