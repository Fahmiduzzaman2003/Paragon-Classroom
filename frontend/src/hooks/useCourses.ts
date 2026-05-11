import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { mapCourse, type ApiCourse } from '@/lib/mappers'
import type { Course } from '@/types'

export function useCourses() {
  return useQuery<Course[]>({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data } = await api.get<ApiCourse[]>('/courses')
      return data.map((c, i) => mapCourse(c, i))
    },
  })
}

export function useCourse(courseId: string | undefined) {
  return useQuery<Course>({
    queryKey: ['course', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiCourse>(`/courses/${courseId}`)
      return mapCourse(data)
    },
  })
}

export function useCreateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name: string
      description?: string
      semester?: string
      ai_name: string
      ai_personality?: string
      rag_mode?: 'strict' | 'balanced' | 'open'
      gradient?: string
    }) => {
      const { data } = await api.post<ApiCourse>('/courses', payload)
      return mapCourse(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  })
}

export function useJoinCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.post<ApiCourse>('/courses/join', { code })
      return mapCourse(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  })
}
