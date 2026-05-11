import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { mapNotification, type ApiNotification } from '@/lib/mappers'
import type { Notification } from '@/types'
import { useAuthStore } from '@/stores/authStore'

export function useNotifications(unreadOnly = false) {
  const user = useAuthStore((s) => s.user)
  return useQuery<Notification[]>({
    queryKey: ['notifications', unreadOnly],
    enabled: !!user,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await api.get<ApiNotification[]>('/notifications', {
        params: { unread_only: unreadOnly },
      })
      return data.map(mapNotification)
    },
  })
}

export function useUnreadCount() {
  const user = useAuthStore((s) => s.user)
  return useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    enabled: !!user,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>('/notifications/unread-count')
      return data.count
    },
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.post(`/notifications/${notificationId}/read`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
