import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { mapEvent, type ApiEvent } from '@/lib/mappers'
import type { CalendarEvent } from '@/types'

export function useCourseCalendar(courseId: string | undefined) {
  return useQuery<CalendarEvent[]>({
    queryKey: ['calendar', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiEvent[]>(`/courses/${courseId}/calendar`)
      return data.map(mapEvent)
    },
  })
}

export function useGlobalCalendar() {
  return useQuery<CalendarEvent[]>({
    queryKey: ['calendar', 'all'],
    queryFn: async () => {
      const { data } = await api.get<ApiEvent[]>('/calendar')
      return data.map(mapEvent)
    },
  })
}

export function useCreateEvent(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      title: string
      description?: string
      start_at: string
      end_at: string
      type: CalendarEvent['type']
    }) => {
      const { data } = await api.post<ApiEvent>(`/courses/${courseId}/events`, payload)
      return mapEvent(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', courseId] })
      qc.invalidateQueries({ queryKey: ['calendar', 'all'] })
    },
  })
}

export function useDeleteEvent(courseId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (eventId: string) => {
      await api.delete(`/events/${eventId}`)
    },
    onSuccess: () => {
      if (courseId) qc.invalidateQueries({ queryKey: ['calendar', courseId] })
      qc.invalidateQueries({ queryKey: ['calendar', 'all'] })
    },
  })
}
