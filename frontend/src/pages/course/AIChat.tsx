import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  Settings2,
  Info,
  ChevronRight,
  FileText,
  Bug,
  X,
} from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassTextarea } from '@/components/glass/GlassInput'
import { Badge } from '@/components/ui/Badge'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator'
import { useMaterials } from '@/hooks/useMaterials'
import {
  useConversationMessages,
  useConversations,
  useDeleteConversation,
  useChatStream,
  type RagDebugChunk,
} from '@/hooks/useChat'
import { useAuthStore } from '@/stores/authStore'
import { cn, formatRelative } from '@/lib/utils'
import { apiError } from '@/lib/api'
import { toast } from 'sonner'
import type { ChatMessage, Citation, Course } from '@/types'

function groundingLabel(g: number): string {
  // Thresholds mirror the backend's grounding tiers so the label matches behavior.
  if (g >= 75) return 'Strict'
  if (g <= 25) return 'Open'
  return 'Balanced'
}

const suggestedPrompts: Record<string, string[]> = {
  default: [
    'Summarize the uploaded materials in 5 bullets',
    'What are the most important definitions I should know?',
    'Quiz me on the latest lecture',
    'List the open questions the materials leave unanswered',
  ],
}

export function AIChat() {
  const { conversationId: urlConversationId } = useParams()
  const { course } = useOutletContext<{ course: Course }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.id === course.teacherId || user?.role === 'admin'

  // Per-file "Ask AI" deep-link: ?material=<id> pins retrieval to that file only.
  const [searchParams, setSearchParams] = useSearchParams()
  const scopedMaterialId = searchParams.get('material')

  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(urlConversationId ?? null)
  const [draft, setDraft] = useState('')
  // Grounding: 0–100. How much the answer leans on the course materials vs.
  // general knowledge. Seeded from the course's default retrieval mode.
  const [grounding, setGrounding] = useState<number>(() => {
    const m = (course as Course & { ragMode?: 'strict' | 'balanced' | 'open' }).ragMode
    return m === 'strict' ? 95 : m === 'open' ? 20 : 50
  })
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [debugChunks, setDebugChunks] = useState<RagDebugChunk[]>([])
  // Assistant message id → grounding level, for answers served instantly from
  // the semantic cache; lets the "⚡ instant · N%" badge survive the swap to the
  // persisted message and show which grounding the cached answer belongs to.
  const [cachedGrounding, setCachedGrounding] = useState<Map<string, number>>(() => new Map())
  // When we create a NEW conversation mid-send, onStart bumps `activeId`. That
  // must NOT wipe the in-flight optimistic/streaming message — this ref tells the
  // activeId effect to skip its reset exactly once for that programmatic change.
  const skipClearRef = useRef(false)

  const clearScope = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('material')
    setSearchParams(next, { replace: true })
  }

  // Local optimistic user message + in-flight streamed assistant message.
  // These live in component state while the SSE stream runs; on `done` we clear
  // them and let the invalidated query show the persisted versions.
  const [optimisticUser, setOptimisticUser] = useState<ChatMessage | null>(null)
  const [streamingMsg, setStreamingMsg] = useState<ChatMessage | null>(null)

  const { data: conversations = [] } = useConversations(course.id)
  const { data: persistedMessages = [] } = useConversationMessages(course.id, activeId)
  const delConvo = useDeleteConversation()
  const chat = useChatStream()

  // When URL changes, sync
  useEffect(() => {
    if (urlConversationId && urlConversationId !== activeId) setActiveId(urlConversationId)
  }, [urlConversationId, activeId])

  // Clear streaming message when the active conversation changes — but NOT when
  // that change was us persisting a brand-new conversation mid-stream.
  useEffect(() => {
    if (skipClearRef.current) {
      skipClearRef.current = false
      return
    }
    setStreamingMsg(null)
    setOptimisticUser(null)
    setDebugChunks([])
  }, [activeId])

  const messages = useMemo(() => {
    const base = persistedMessages.map((m) =>
      cachedGrounding.has(m.id) ? { ...m, cached: true, grounding: cachedGrounding.get(m.id) } : m,
    )
    if (optimisticUser) base.push(optimisticUser)
    // While the streamed message is still empty, the ThinkingIndicator stands in
    // for it — so only render the assistant bubble once the first token lands.
    if (streamingMsg && streamingMsg.content) base.push(streamingMsg)
    return base
  }, [persistedMessages, streamingMsg, optimisticUser, cachedGrounding])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Instant follow while tokens stream in (smooth-scrolling every frame stutters);
    // smooth only when a whole new message appears.
    el.scrollTo({ top: el.scrollHeight, behavior: chat.streaming ? 'auto' : 'smooth' })
  }, [messages.length, streamingMsg?.content, chat.streaming])

  const { data: materials = [] } = useMaterials(course.id)
  const ready = materials.filter((m) => m.status === 'ready')

  const newConversation = () => {
    setActiveId(null)
    setStreamingMsg(null)
    setDebugChunks([])
    navigate(`/app/courses/${course.id}/chat`)
  }

  const removeConvo = async (id: string) => {
    try {
      await delConvo.mutateAsync({ courseId: course.id, conversationId: id })
      if (activeId === id) setActiveId(null)
    } catch (err) {
      toast.error(apiError(err, 'Delete failed'))
    }
  }

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || chat.streaming) return
    setDraft('')
    setDebugChunks([])

    const localUserId = `local-user-${Date.now()}`
    const localAssistantId = `local-assistant-${Date.now()}`
    const nowIso = new Date().toISOString()
    setOptimisticUser({
      id: localUserId,
      role: 'user',
      content,
      citations: [],
      createdAt: nowIso,
    })
    setStreamingMsg({
      id: localAssistantId,
      role: 'assistant',
      content: '',
      citations: [],
      createdAt: nowIso,
      streaming: true,
    })

    let liveCitations: Citation[] = []
    let liveText = ''
    // Coalesce token updates: many deltas per frame collapse into ONE React
    // state update per animation frame, so markdown re-parses ~60x/s at most
    // instead of once per token. This is the main fix for streaming jank.
    let rafId: number | null = null
    const flush = () => {
      rafId = null
      setStreamingMsg((m) => (m ? { ...m, content: liveText, citations: liveCitations } : m))
    }
    const scheduleFlush = () => {
      if (rafId == null) rafId = requestAnimationFrame(flush)
    }

    await chat.stream({
      courseId: course.id,
      message: content,
      conversationId: activeId,
      grounding,
      scopedMaterialId,
      debug: debugEnabled && isTeacher,
      onStart: (meta) => {
        if (meta.cached) {
          setCachedGrounding((prev) => new Map(prev).set(meta.message_id, meta.grounding ?? 0))
          setStreamingMsg((m) => (m ? { ...m, cached: true, grounding: meta.grounding } : m))
        }
        if (!activeId) {
          skipClearRef.current = true // don't let the activeId effect wipe the in-flight message
          setActiveId(meta.conversation_id)
          // Update the address bar WITHOUT going through the router. A router
          // navigate() here re-matches the route and remounts AIChat mid-stream —
          // which reset the grounding slider and looked like a page refresh.
          // history.replaceState changes the URL silently; the component stays put.
          const search = scopedMaterialId ? `?material=${scopedMaterialId}` : ''
          window.history.replaceState(
            window.history.state,
            '',
            `/app/courses/${course.id}/chat/${meta.conversation_id}${search}`,
          )
        }
      },
      onCitations: (citations) => {
        liveCitations = citations
        scheduleFlush()
      },
      onDebug: (chunks) => setDebugChunks(chunks),
      onDelta: (delta) => {
        liveText += delta
        scheduleFlush()
      },
      onError: (msg) => toast.error(msg),
      onDone: () => {
        if (rafId != null) cancelAnimationFrame(rafId)
        // Clear local optimistic state; the invalidated query will show the
        // persisted assistant + user messages from the backend.
        setStreamingMsg(null)
        setOptimisticUser(null)
      },
    })
  }

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-260px)] min-h-[560px]">
      <GlassCard padding="none" className="overflow-hidden hidden lg:flex flex-col">
        <div className="p-3 border-b border-white/5">
          <GlassButton size="sm" className="w-full" onClick={newConversation}>
            <Plus className="h-3.5 w-3.5" /> New chat
          </GlassButton>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 flex flex-col gap-0.5">
            {conversations.length === 0 && (
              <div className="text-[11px] text-muted-foreground text-center py-6 px-2">
                No conversations yet. Ask {course.aiName} your first question.
              </div>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveId(c.id)
                  navigate(`/app/courses/${course.id}/chat/${c.id}`)
                }}
                className={cn(
                  'group w-full text-left p-2 rounded-xl transition text-xs',
                  activeId === c.id
                    ? 'bg-white/10 text-foreground'
                    : 'hover:bg-white/5 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate font-medium">{c.title}</span>
                  <Trash2
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeConvo(c.id)
                    }}
                    className="h-3 w-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition"
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {formatRelative(c.updatedAt)}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-white/5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Source grounding
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64">
                How much the AI leans on your course materials vs. its general knowledge. Higher =
                stays closer to your sources; lower = reasons more freely. Drag the slider or tap a
                preset.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-gradient">{groundingLabel(grounding)}</span>
            <span className="text-muted-foreground">{grounding}% from materials</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={grounding}
            onChange={(e) => setGrounding(Number(e.target.value))}
            className="paragon-slider w-full"
            style={{ ['--val' as string]: `${grounding}%` }}
            aria-label="Source grounding level"
          />
          <div className="flex gap-1">
            {([
              ['Strict', 95],
              ['Balanced', 50],
              ['Open', 20],
            ] as const).map(([label, val]) => (
              <button
                key={label}
                onClick={() => setGrounding(val)}
                className={cn(
                  'flex-1 text-[10px] py-1 rounded-full transition',
                  Math.abs(grounding - val) <= 7
                    ? 'bg-[linear-gradient(120deg,#815AFF,#FF46BE)] text-white'
                    : 'glass text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {isTeacher && (
            <label className="flex items-center justify-between text-[11px] pt-1">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Bug className="h-3 w-3" /> Retrieval debug
              </span>
              <input
                type="checkbox"
                checked={debugEnabled}
                onChange={(e) => setDebugEnabled(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#815AFF]"
              />
            </label>
          )}
        </div>
      </GlassCard>

      <GlassCard padding="none" className="flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl text-white flex items-center justify-center text-xs font-semibold"
            style={{
              background: `linear-gradient(135deg, ${course.gradient[0]}, ${course.gradient[1]}, ${course.gradient[2]})`,
            }}
          >
            {course.aiName.split(' ')[0]?.[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-semibold text-sm">{course.aiName}</span>
              <Badge variant="success" className="text-[9px]">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                {ready.length} sources
              </Badge>
              {scopedMaterialId &&
                (() => {
                  const m = materials.find((x) => x.id === scopedMaterialId)
                  return (
                    <Badge variant="info" className="text-[9px] gap-1">
                      <Sparkles className="h-2.5 w-2.5" />
                      <span className="max-w-[14rem] truncate">
                        scoped to {m?.filename ?? 'file'}
                      </span>
                      <button
                        type="button"
                        onClick={clearScope}
                        className="ml-1 rounded-full hover:bg-white/10 p-0.5"
                        aria-label="Remove file scope"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  )
                })()}
            </div>
            <div className="text-[10px] text-muted-foreground line-clamp-1">
              {course.aiPersonality || 'Trained on this course\'s materials.'}
            </div>
          </div>
          <GlassButton variant="glass" size="sm" className="ml-auto" asChild>
            <Link to={`/app/courses/${course.id}/materials`}>
              <Settings2 className="h-3.5 w-3.5" /> Materials
            </Link>
          </GlassButton>
        </div>

        <div className="flex-1 min-h-0 relative">
          <ScrollArea className="h-full">
            <div ref={scrollRef} className="px-4 md:px-8 py-6 space-y-5">
              {messages.length === 0 ? (
                <EmptyState
                  aiName={course.aiName}
                  prompts={suggestedPrompts.default ?? []}
                  onPrompt={(p) => send(p)}
                  gradient={course.gradient}
                  hasMaterials={ready.length > 0}
                />
              ) : (
                messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    aiName={course.aiName}
                    gradient={course.gradient}
                  />
                ))
              )}
              {chat.streaming && streamingMsg && streamingMsg.content === '' && (
                <ThinkingIndicator gradient={course.gradient} />
              )}
            </div>
          </ScrollArea>

          {debugChunks.length > 0 && isTeacher && (
            <div className="absolute top-4 right-4 w-80 max-h-[60%] glass-strong rounded-2xl p-3 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                  <Bug className="h-3 w-3" /> Retrieved chunks
                </span>
                <button
                  onClick={() => setDebugChunks([])}
                  className="h-5 w-5 rounded hover:bg-white/10 flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <ul className="space-y-2">
                {debugChunks.map((c, i) => (
                  <li key={i} className="text-[11px] glass rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{c.filename}</span>
                      <span className="text-muted-foreground">p.{c.page}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      score {Math.round(c.score * 100)}% · chunk {c.chunkIndex}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-4 leading-relaxed">
                      {c.snippet}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {messages.length > 0 && (
          <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
              Indexed:
            </span>
            {ready.slice(0, 5).map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] shrink-0"
              >
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="truncate max-w-[10rem]">{m.filename}</span>
              </span>
            ))}
            {ready.length > 5 && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                +{ready.length - 5} more
              </span>
            )}
            <Link
              to={`/app/courses/${course.id}/materials`}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 shrink-0"
            >
              See all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        <div className="p-3 md:p-4 border-t border-white/5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 relative">
              <GlassTextarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(draft)
                  }
                }}
                placeholder={`Ask ${course.aiName} anything about ${course.name}…`}
              />
              <div className="absolute bottom-2 right-3 text-[9px] text-muted-foreground">
                Shift+Enter for newline
              </div>
            </div>
            {chat.streaming ? (
              <GlassButton type="button" variant="destructive" onClick={chat.cancel}>
                <Square className="h-4 w-4" /> Stop
              </GlassButton>
            ) : (
              <GlassButton type="submit" disabled={!draft.trim()}>
                <Send className="h-4 w-4" /> Send
              </GlassButton>
            )}
          </form>
        </div>
      </GlassCard>
    </div>
  )
}

function EmptyState({
  aiName,
  prompts,
  onPrompt,
  gradient,
  hasMaterials,
}: {
  aiName: string
  prompts: string[]
  onPrompt: (p: string) => void
  gradient: [string, string, string]
  hasMaterials: boolean
}) {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center text-white mb-4 shadow-[0_10px_30px_-8px_rgba(129,90,255,0.6)]"
        style={{
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`,
        }}
      >
        <Sparkles className="h-6 w-6" />
      </motion.div>
      <h2 className="font-display text-2xl font-semibold">
        Talk to <span className="text-gradient">{aiName}</span>
      </h2>
      <p className="text-sm text-muted-foreground mt-1.5">
        {hasMaterials
          ? 'Answers are grounded in the course materials and include page-level citations.'
          : 'Upload a material first and this assistant will be able to cite it.'}
      </p>

      <div className="mt-6 grid sm:grid-cols-2 gap-2">
        {prompts.map((p, i) => (
          <motion.button
            key={p}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            onClick={() => onPrompt(p)}
            className="group text-left p-3 rounded-xl glass glass-hover"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
              <Sparkles className="h-3 w-3 text-[#FF46BE]" /> suggested
            </div>
            <div className="text-sm font-medium leading-snug">{p}</div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
