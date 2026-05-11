import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { mapAnnouncement, type ApiAnnouncement } from '@/lib/mappers'
import type { Announcement } from '@/types'

export function useAnnouncements(courseId: string | undefined) {
  return useQuery<Announcement[]>({
    queryKey: ['announcements', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiAnnouncement[]>(
        `/courses/${courseId}/announcements`,
      )
      return data.map(mapAnnouncement)
    },
  })
}

export function useCreateAnnouncement(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { title: string; body: string; pinned: boolean }) => {
      const { data } = await api.post<ApiAnnouncement>(
        `/courses/${courseId}/announcements`,
        payload,
      )
      return mapAnnouncement(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements', courseId] }),
  })
}
