import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  mapForumReply,
  mapForumThread,
  mapForumThreadDetail,
  type ApiForumReply,
  type ApiForumThread,
  type ApiForumThreadDetail,
} from '@/lib/mappers'
import type { ForumThread, ForumThreadDetail } from '@/types'

export function useForumThreads(courseId: string | undefined) {
  return useQuery<ForumThread[]>({
    queryKey: ['forum', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiForumThread[]>(`/courses/${courseId}/forum`)
      return data.map(mapForumThread)
    },
  })
}

export function useForumThread(threadId: string | undefined) {
  return useQuery<ForumThreadDetail>({
    queryKey: ['thread', threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data } = await api.get<ApiForumThreadDetail>(`/threads/${threadId}`)
      return mapForumThreadDetail(data)
    },
  })
}

export function useCreateThread(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { title: string; body: string; tags: string[] }) => {
      const { data } = await api.post<ApiForumThreadDetail>(
        `/courses/${courseId}/forum`,
        payload,
      )
      return mapForumThreadDetail(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forum', courseId] }),
  })
}

export function useReplyToThread(threadId: string, courseId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const { data } = await api.post<ApiForumReply>(`/threads/${threadId}/replies`, { body })
      return mapForumReply(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread', threadId] })
      if (courseId) qc.invalidateQueries({ queryKey: ['forum', courseId] })
    },
  })
}

export function useUpvoteThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (threadId: string) => {
      await api.post(`/threads/${threadId}/upvote`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum'] })
      qc.invalidateQueries({ queryKey: ['thread'] })
    },
  })
}

export function useUpvoteReply(threadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (replyId: string) => {
      await api.post(`/replies/${replyId}/upvote`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thread', threadId] }),
  })
}

export function useAcceptReply(threadId: string, courseId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (replyId: string) => {
      await api.post(`/replies/${replyId}/accept`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread', threadId] })
      if (courseId) qc.invalidateQueries({ queryKey: ['forum', courseId] })
    },
  })
}

export function usePinThread(threadId: string, courseId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pinned: boolean) => {
      await api.patch(`/threads/${threadId}`, { pinned })
    },
    onSuccess: () => {
      if (courseId) qc.invalidateQueries({ queryKey: ['forum', courseId] })
      qc.invalidateQueries({ queryKey: ['thread', threadId] })
    },
  })
}
