import { useOutletContext } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Pin,
  CheckCheck,
  ArrowUp,
  MessageCircle,
  Search,
  Plus,
  Loader2,
  Send,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import {
  GlassModal,
  GlassModalContent,
  GlassModalDescription,
  GlassModalFooter,
  GlassModalHeader,
  GlassModalTitle,
} from '@/components/glass/GlassModal'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useAcceptReply,
  useCreateThread,
  useForumThread,
  useForumThreads,
  usePinThread,
  useReplyToThread,
  useUpvoteReply,
  useUpvoteThread,
} from '@/hooks/useForum'
import { useAuthStore } from '@/stores/authStore'
import { apiError } from '@/lib/api'
import { formatRelative, initials } from '@/lib/utils'
import { toast } from 'sonner'
import type { Course, ForumThread } from '@/types'

export function Forum() {
  const { course } = useOutletContext<{ course: Course }>()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.id === course.teacherId || user?.role === 'admin'
  const { data: threads = [], isLoading } = useForumThreads(course.id)
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const filtered = threads.filter((t) => {
    if (!q.trim()) return true
    const qq = q.toLowerCase()
    return (
      t.title.toLowerCase().includes(qq) ||
      t.body.toLowerCase().includes(qq) ||
      t.tags.some((tag) => tag.toLowerCase().includes(qq))
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 max-w-md">
          <GlassInput
            placeholder="Search threads…"
            leadingIcon={<Search className="h-4 w-4" />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <GlassButton onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New thread
        </GlassButton>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : filtered.length === 0 ? (
        <GlassCard padding="lg" className="text-center border-dashed border-white/10">
          <h3 className="font-display font-semibold">Quiet here</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Be the first to start a thread — questions, study groups, or notes.
          </p>
          <GlassButton size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New thread
          </GlassButton>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <ThreadRow thread={t} onOpen={() => setActiveId(t.id)} />
            </motion.div>
          ))}
        </div>
      )}

      <CreateThreadModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        courseId={course.id}
        onCreated={(id) => {
          setCreateOpen(false)
          setActiveId(id)
        }}
      />

      {activeId && (
        <ThreadDetailModal
          threadId={activeId}
          courseId={course.id}
          isTeacher={isTeacher}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  )
}

function ThreadRow({ thread, onOpen }: { thread: ForumThread; onOpen: () => void }) {
  const upvote = useUpvoteThread()
  const t = thread
  return (
    <GlassCard
      padding="md"
      hover
      onClick={onOpen}
      className="flex items-start gap-3 cursor-pointer"
    >
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback>{initials(t.authorName || '?')}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          {t.pinned && (
            <Badge variant="primary">
              <Pin className="h-2.5 w-2.5" /> pinned
            </Badge>
          )}
          {t.answered && (
            <Badge variant="success">
              <CheckCheck className="h-2.5 w-2.5" /> answered
            </Badge>
          )}
          {t.tags.map((tag) => (
            <Badge key={tag} variant="default">
              #{tag}
            </Badge>
          ))}
        </div>
        <h3 className="font-display text-sm font-semibold leading-snug">{t.title}</h3>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
        <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>{t.authorName}</span>
          <span>{formatRelative(t.createdAt)}</span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> {t.replies}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              upvote.mutate(t.id)
            }}
            className="inline-flex items-center gap-1 hover:text-foreground transition"
            aria-label="Upvote"
          >
            <ArrowUp className="h-3 w-3" /> {t.upvotes}
          </button>
        </div>
      </div>
    </GlassCard>
  )
}

function CreateThreadModal({
  open,
  onOpenChange,
  courseId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  courseId: string
  onCreated: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const create = useCreateThread(courseId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const t = await create.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      })
      toast.success('Thread posted')
      setTitle('')
      setBody('')
      setTags('')
      onCreated(t.id)
    } catch (err) {
      toast.error(apiError(err, 'Could not create thread'))
    }
  }

  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="md">
        <GlassModalHeader>
          <GlassModalTitle>New thread</GlassModalTitle>
          <GlassModalDescription>
            Markdown supported. Add tags separated by commas.
          </GlassModalDescription>
        </GlassModalHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Title</Label>
            <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label className="mb-1.5 block">Body</Label>
            <GlassTextarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Tags</Label>
            <GlassInput
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="trees, analysis"
            />
          </div>
          <GlassModalFooter>
            <GlassButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </GlassButton>
            <GlassButton type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Post
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}

function ThreadDetailModal({
  threadId,
  courseId,
  isTeacher,
  onClose,
}: {
  threadId: string
  courseId: string
  isTeacher: boolean
  onClose: () => void
}) {
  const { data: thread, isLoading } = useForumThread(threadId)
  const me = useAuthStore((s) => s.user)
  const reply = useReplyToThread(threadId, courseId)
  const accept = useAcceptReply(threadId, courseId)
  const upvoteReply = useUpvoteReply(threadId)
  const pin = usePinThread(threadId, courseId)
  const [body, setBody] = useState('')

  return (
    <GlassModal open onOpenChange={(v) => !v && onClose()}>
      <GlassModalContent size="xl">
        <GlassModalHeader>
          <GlassModalTitle>{thread?.title ?? 'Thread'}</GlassModalTitle>
          {thread && (
            <GlassModalDescription>
              {thread.authorName} · {formatRelative(thread.createdAt)} · {thread.replies}{' '}
              {thread.replies === 1 ? 'reply' : 'replies'}
            </GlassModalDescription>
          )}
        </GlassModalHeader>

        {isLoading || !thread ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-auto pr-1">
            <div className="prose-chat text-sm rounded-xl glass p-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {thread.body || '_(no body)_'}
              </ReactMarkdown>
            </div>

            <div className="flex items-center gap-2">
              {isTeacher && (
                <GlassButton
                  size="sm"
                  variant="glass"
                  onClick={() => pin.mutate(!thread.pinned)}
                >
                  <Pin className="h-3.5 w-3.5" /> {thread.pinned ? 'Unpin' : 'Pin'}
                </GlassButton>
              )}
            </div>

            <div className="space-y-2">
              {thread.replies_list.map((r) => (
                <GlassCard key={r.id} padding="md" className={r.accepted ? 'border-l-2 border-l-emerald-400' : ''}>
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">
                        {initials(r.authorName || '?')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-semibold">{r.authorName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelative(r.createdAt)}
                    </span>
                    {r.accepted && (
                      <Badge variant="success">
                        <CheckCheck className="h-2.5 w-2.5" /> accepted
                      </Badge>
                    )}
                    <button
                      onClick={() => upvoteReply.mutate(r.id)}
                      className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <ArrowUp className="h-3 w-3" /> {r.upvotes}
                    </button>
                  </div>
                  <div className="prose-chat text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.body}</ReactMarkdown>
                  </div>
                  {!r.accepted &&
                    (thread.authorId === me?.id || isTeacher) && (
                      <div className="mt-2">
                        <GlassButton
                          size="sm"
                          variant="ghost"
                          onClick={() => accept.mutate(r.id)}
                        >
                          <CheckCheck className="h-3.5 w-3.5" /> Mark as answer
                        </GlassButton>
                      </div>
                    )}
                </GlassCard>
              ))}
              {thread.replies_list.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No replies yet — be the first.
                </p>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!body.trim()) return
            try {
              await reply.mutateAsync(body.trim())
              setBody('')
            } catch (err) {
              toast.error(apiError(err, 'Reply failed'))
            }
          }}
          className="mt-3 flex items-end gap-2"
        >
          <GlassTextarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply…"
          />
          <GlassButton type="submit" disabled={reply.isPending || !body.trim()}>
            {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Reply
          </GlassButton>
        </form>

        <GlassModalFooter>
          <GlassButton variant="ghost" onClick={onClose}>
            Close
          </GlassButton>
        </GlassModalFooter>
      </GlassModalContent>
    </GlassModal>
  )
}
