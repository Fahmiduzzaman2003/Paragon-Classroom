import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, API_URL } from '@/lib/api'
import {
  mapConversation,
  mapMessage,
  type ApiConversation,
  type ApiMessage,
  type ApiCitation,
} from '@/lib/mappers'
import { useAuthStore } from '@/stores/authStore'
import type { Citation, Conversation, ChatMessage } from '@/types'

export function useConversations(courseId: string | undefined) {
  return useQuery<Conversation[]>({
    queryKey: ['conversations', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<ApiConversation[]>(
        `/courses/${courseId}/conversations`,
      )
      return data.map(mapConversation)
    },
  })
}

export function useConversationMessages(courseId: string | undefined, conversationId: string | null) {
  return useQuery<ChatMessage[]>({
    queryKey: ['messages', courseId, conversationId],
    enabled: !!courseId && !!conversationId,
    queryFn: async () => {
      const { data } = await api.get<ApiMessage[]>(
        `/courses/${courseId}/conversations/${conversationId}/messages`,
      )
      return data.map(mapMessage)
    },
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      courseId,
      conversationId,
    }: {
      courseId: string
      conversationId: string
    }) => {
      await api.delete(`/courses/${courseId}/conversations/${conversationId}`)
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['conversations', vars.courseId] })
    },
  })
}

interface StreamArgs {
  courseId: string
  message: string
  conversationId: string | null
  ragMode?: 'strict' | 'balanced' | 'open'
  /** 0–100 grounding level (how much to rely on course materials). Wins over ragMode. */
  grounding?: number
  scopedMaterialId?: string | null
  debug?: boolean
  onStart?: (meta: { conversation_id: string; message_id: string; user_message_id: string; ai_name: string; model: string; cached?: boolean }) => void
  onCitations?: (citations: Citation[]) => void
  onDebug?: (chunks: RagDebugChunk[]) => void
  onDelta?: (text: string) => void
  onError?: (message: string) => void
  onDone?: (payload: { conversation_id: string; message_id: string; citations: Citation[] }) => void
}

export interface RagDebugChunk {
  materialId: string
  filename: string
  page: number
  chunkIndex: number
  score: number
  snippet: string
}

/**
 * Sends a chat message and streams the response as SSE.
 *
 * We can't use the standard EventSource API because we need to POST a body and
 * attach an Authorization header — so we fall back to fetch + ReadableStream
 * and parse SSE frames by hand.
 */
export function useChatStream() {
  const [streaming, setStreaming] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const qc = useQueryClient()

  const stream = useCallback(
    async (args: StreamArgs) => {
      const { accessToken } = useAuthStore.getState()
      if (!accessToken) {
        args.onError?.('Not signed in')
        return
      }
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setStreaming(true)

      try {
        const resp = await fetch(`${API_URL}/courses/${args.courseId}/chat`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            message: args.message,
            conversation_id: args.conversationId ?? null,
            rag_mode: args.ragMode ?? null,
            grounding: args.grounding ?? null,
            scoped_material_id: args.scopedMaterialId ?? null,
            debug: !!args.debug,
          }),
        })

        if (!resp.ok || !resp.body) {
          const detail = await safeReadText(resp)
          throw new Error(detail || `Chat failed (${resp.status})`)
        }

        const reader = resp.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // Parse event frames separated by blank lines
          let idx
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            handleFrame(frame, args)
          }
        }
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        args.onError?.((err as Error).message ?? 'Stream failed')
      } finally {
        setStreaming(false)
        controllerRef.current = null
        qc.invalidateQueries({ queryKey: ['conversations', args.courseId] })
        qc.invalidateQueries({ queryKey: ['messages', args.courseId] })
      }
    },
    [qc],
  )

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setStreaming(false)
  }, [])

  return { stream, cancel, streaming }
}

function handleFrame(frame: string, args: StreamArgs) {
  let event = 'message'
  let dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return
  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n'))
  } catch {
    return
  }
  switch (event) {
    case 'start':
      args.onStart?.(data as Parameters<NonNullable<StreamArgs['onStart']>>[0])
      return
    case 'citations': {
      const raw = (data as { citations: ApiCitation[] }).citations ?? []
      args.onCitations?.(
        raw.map((c) => ({
          id: c.id,
          filename: c.filename,
          page: c.page,
          snippet: c.snippet,
          score: c.score,
        })),
      )
      return
    }
    case 'debug': {
      const chunks = (data as { chunks: Record<string, unknown>[] }).chunks ?? []
      args.onDebug?.(
        chunks.map((c) => ({
          materialId: c.material_id as string,
          filename: c.filename as string,
          page: Number(c.page ?? 0),
          chunkIndex: Number(c.chunk_index ?? 0),
          score: Number(c.score ?? 0),
          snippet: c.snippet as string,
        })),
      )
      return
    }
    case 'delta':
      args.onDelta?.((data as { text: string }).text ?? '')
      return
    case 'error':
      args.onError?.((data as { message: string }).message ?? 'error')
      return
    case 'done': {
      const d = data as { conversation_id: string; message_id: string; citations: ApiCitation[] }
      args.onDone?.({
        conversation_id: d.conversation_id,
        message_id: d.message_id,
        citations: (d.citations ?? []).map((c) => ({
          id: c.id,
          filename: c.filename,
          page: c.page,
          snippet: c.snippet,
          score: c.score,
        })),
      })
      return
    }
  }
}

async function safeReadText(resp: Response): Promise<string> {
  try {
    const txt = await resp.text()
    try {
      const j = JSON.parse(txt)
      return j?.error?.message ?? j?.detail ?? txt
    } catch {
      return txt
    }
  } catch {
    return ''
  }
}
