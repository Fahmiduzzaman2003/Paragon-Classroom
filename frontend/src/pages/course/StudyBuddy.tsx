import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  XCircle,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { toast } from 'sonner'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Label } from '@/components/ui/Label'
import {
  useCreateFlashcard,
  useDeleteFlashcard,
  useDueFlashcards,
  useFlashcards,
  useGenerateFlashcards,
  usePracticeNext,
  useReviewFlashcard,
  type Flashcard,
  type PracticeQuestion,
} from '@/hooks/useStudyBuddy'
import { apiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Course } from '@/types'

type Tab = 'flashcards' | 'practice'

export function StudyBuddy() {
  const { course } = useOutletContext<{ course: Course }>()
  const [tab, setTab] = useState<Tab>('flashcards')

  return (
    <div className="space-y-5">
      <GlassCard strong padding="lg" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-16 -right-12 h-48 w-48 rounded-full bg-[#815AFF]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-[#00C8FF]/25 blur-3xl" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="h-12 w-12 rounded-2xl bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)] flex items-center justify-center shadow-[0_8px_30px_-12px_rgba(255,70,190,0.6)]">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge variant="primary" className="mb-1">
              <Sparkles className="h-3 w-3" /> Study Buddy
            </Badge>
            <h1 className="font-display text-xl md:text-2xl font-semibold leading-tight">
              Drill what you've learned in {course.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Spaced-repetition flashcards and AI-generated practice questions, both
              grounded in this course's materials.
            </p>
          </div>
        </div>

        <div className="relative mt-4 inline-flex rounded-full glass p-0.5">
          <TabBtn active={tab === 'flashcards'} onClick={() => setTab('flashcards')} icon={<BookOpen className="h-3.5 w-3.5" />}>
            Flashcards
          </TabBtn>
          <TabBtn active={tab === 'practice'} onClick={() => setTab('practice')} icon={<Target className="h-3.5 w-3.5" />}>
            Practice
          </TabBtn>
        </div>
      </GlassCard>

      <AnimatePresence mode="wait">
        {tab === 'flashcards' ? (
          <motion.div
            key="flashcards"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <FlashcardSection course={course} />
          </motion.div>
        ) : (
          <motion.div
            key="practice"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <PracticeSection courseId={course.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 h-8 rounded-full text-xs transition-all font-medium',
        active
          ? 'bg-[linear-gradient(120deg,#815AFF,#FF46BE,#00C8FF)] text-white shadow-[0_4px_14px_-4px_rgba(255,70,190,0.55)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────
// Flashcards
// ─────────────────────────────────────────────────────

function FlashcardSection({ course }: { course: Course }) {
  const { data: due = [], isLoading: loadingDue } = useDueFlashcards(course.id)
  const { data: all = [], isLoading: loadingAll } = useFlashcards(course.id)
  const generate = useGenerateFlashcards(course.id)

  const [count, setCount] = useState(10)
  const [instructions, setInstructions] = useState('')
  const [genOpen, setGenOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  const onGenerate = async () => {
    try {
      const created = await generate.mutateAsync({ count, instructions })
      toast.success(
        created.length
          ? `Generated ${created.length} new flashcard${created.length === 1 ? '' : 's'}`
          : 'No new cards — they all already exist in your deck.',
      )
      setGenOpen(false)
      setInstructions('')
    } catch (err) {
      toast.error(apiError(err, 'Could not generate flashcards'))
    }
  }

  if (loadingAll || loadingDue) {
    return <Skeleton className="h-72 rounded-3xl" />
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4">
        <GlassCard padding="lg">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <h2 className="font-display font-semibold text-base">Today's review</h2>
            <Badge variant={due.length > 0 ? 'warning' : 'success'}>
              {due.length} due
            </Badge>
            <div className="ml-auto flex items-center gap-2">
              <GlassButton
                size="sm"
                variant="glass"
                onClick={() => setGenOpen((v) => !v)}
              >
                <Sparkles className="h-3.5 w-3.5" /> Generate from materials
              </GlassButton>
              {due.length > 0 && (
                <GlassButton size="sm" onClick={() => setReviewOpen(true)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Start review
                </GlassButton>
              )}
            </div>
          </div>

          {genOpen && (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3 mb-3 space-y-3">
              <div className="grid sm:grid-cols-[120px_1fr] gap-3">
                <div>
                  <Label className="mb-1.5 block text-[10px]">How many?</Label>
                  <GlassInput
                    type="number"
                    min={1}
                    max={30}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[10px]">
                    Focus (optional)
                  </Label>
                  <GlassInput
                    placeholder="e.g. recursion, dynamic programming, base cases"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <GlassButton size="sm" variant="ghost" onClick={() => setGenOpen(false)}>
                  Cancel
                </GlassButton>
                <GlassButton size="sm" onClick={onGenerate} disabled={generate.isPending}>
                  {generate.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Generate
                </GlassButton>
              </div>
            </div>
          )}

          {all.length === 0 && !genOpen && (
            <div className="text-center py-10">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-display font-semibold">Build your first deck</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {course.aiName} reads your indexed materials and turns the key concepts
                into atomic flashcards. Review them on a spaced schedule.
              </p>
              <GlassButton size="sm" className="mt-4" onClick={() => setGenOpen(true)}>
                <Sparkles className="h-3.5 w-3.5" /> Generate flashcards
              </GlassButton>
            </div>
          )}

          {due.length === 0 && all.length > 0 && (
            <p className="text-xs text-muted-foreground py-3 text-center">
              All caught up — no cards due right now. Come back later, or generate new
              ones above.
            </p>
          )}
        </GlassCard>

        <ManualAddCard courseId={course.id} />
        <DeckList courseId={course.id} cards={all} />
      </div>

      <DeckStats cards={all} due={due.length} />

      {reviewOpen && due.length > 0 && (
        <ReviewSession
          courseId={course.id}
          cards={due}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  )
}

function DeckStats({ cards, due }: { cards: Flashcard[]; due: number }) {
  const learning = cards.filter((c) => c.reviewCount > 0 && c.reviewCount < 3).length
  const mature = cards.filter((c) => c.intervalDays >= 21).length
  const lapses = cards.filter((c) => c.reviewCount === 0 && !!c.lastReviewedAt).length

  return (
    <div className="space-y-3">
      <GlassCard padding="md">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Deck stats
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Total" value={cards.length} tone="default" />
          <Stat label="Due now" value={due} tone="warn" />
          <Stat label="Learning" value={learning} tone="info" />
          <Stat label="Mature" value={mature} tone="ok" />
          <Stat label="Lapses" value={lapses} tone="bad" />
          <Stat
            label="Avg ease"
            value={cards.length ? (cards.reduce((s, c) => s + c.ease, 0) / cards.length).toFixed(2) : '—'}
            tone="default"
          />
        </div>
      </GlassCard>
      <GlassCard padding="md">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          How spaced repetition works
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Each card you rate <span className="text-emerald-300">Easy</span>{' '}
          comes back later; cards you rate <span className="text-rose-300">Again</span>{' '}
          come back tomorrow. Over time, the deck molds itself to what you actually
          remember.
        </p>
      </GlassCard>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'default' | 'ok' | 'warn' | 'bad' | 'info'
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-rose-300'
          : tone === 'info'
            ? 'text-[#9be7ff]'
            : 'text-foreground'
  return (
    <div className="rounded-lg bg-white/5 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('font-mono font-semibold tabular-nums', toneClass)}>{value}</div>
    </div>
  )
}

function ManualAddCard({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const create = useCreateFlashcard(courseId)

  const submit = async () => {
    if (!front.trim() || !back.trim()) return
    try {
      await create.mutateAsync({ front: front.trim(), back: back.trim() })
      toast.success('Card added')
      setFront('')
      setBack('')
      setOpen(false)
    } catch (err) {
      toast.error(apiError(err, 'Could not save card'))
    }
  }

  return (
    <GlassCard padding="md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> {open ? 'Cancel' : 'Add a card manually'}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <div>
            <Label className="mb-1 block text-[10px]">Front (prompt)</Label>
            <GlassInput value={front} onChange={(e) => setFront(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-[10px]">Back (answer)</Label>
            <GlassTextarea rows={2} value={back} onChange={(e) => setBack(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <GlassButton size="sm" onClick={submit} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add card
            </GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  )
}

function DeckList({ courseId, cards }: { courseId: string; cards: Flashcard[] }) {
  const del = useDeleteFlashcard(courseId)
  const [showAll, setShowAll] = useState(false)
  if (cards.length === 0) return null
  const shown = showAll ? cards : cards.slice(0, 8)
  return (
    <GlassCard padding="md">
      <div className="flex items-center mb-3">
        <h3 className="font-display font-semibold text-sm">Your deck</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">{cards.length} cards</span>
      </div>
      <ul className="space-y-2">
        {shown.map((c) => {
          const due = new Date(c.dueAt).getTime()
          const isDue = due <= Date.now()
          return (
            <li key={c.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium line-clamp-1">{c.front}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{c.back}</div>
                  <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                    {c.sourceFilename && (
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="h-2.5 w-2.5" /> {c.sourceFilename}
                        {c.sourcePage > 0 && ` · p.${c.sourcePage}`}
                      </span>
                    )}
                    <Badge variant={isDue ? 'warning' : 'muted'}>
                      {isDue ? 'due now' : `due in ${humanRelative(due)}`}
                    </Badge>
                    <span>ease {c.ease.toFixed(2)}</span>
                    <span>×{c.reviewCount}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => del.mutate(c.id)}
                  className="text-rose-300/70 hover:text-rose-200 mt-0.5"
                  aria-label="Delete card"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {cards.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showAll ? 'Show fewer' : `Show all ${cards.length}`}
        </button>
      )}
    </GlassCard>
  )
}

function humanRelative(targetMs: number): string {
  const diff = targetMs - Date.now()
  const abs = Math.abs(diff)
  const m = Math.round(abs / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  return `${d}d`
}

function ReviewSession({
  courseId,
  cards,
  onClose,
}: {
  courseId: string
  cards: Flashcard[]
  onClose: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const review = useReviewFlashcard(courseId)
  const total = cards.length
  const card = cards[idx]

  if (!card) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <GlassCard strong padding="lg" className="max-w-md text-center" onClick={(e) => e.stopPropagation()}>
          <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/40 mx-auto flex items-center justify-center mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-300" />
          </div>
          <h2 className="font-display text-lg font-semibold">All done</h2>
          <p className="text-xs text-muted-foreground mt-1">
            You reviewed {doneCount} card{doneCount === 1 ? '' : 's'}. Come back tomorrow.
          </p>
          <GlassButton size="sm" className="mt-4" onClick={onClose}>
            Close
          </GlassButton>
        </GlassCard>
      </div>
    )
  }

  const grade = async (quality: number) => {
    try {
      await review.mutateAsync({ cardId: card.id, quality })
      setDoneCount((n) => n + 1)
      setShowBack(false)
      setIdx((i) => i + 1)
    } catch (err) {
      toast.error(apiError(err, 'Could not save review'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <GlassCard strong padding="lg" className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-[#815AFF]/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-[#00C8FF]/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="primary">
                {idx + 1} / {total}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                ease {card.ease.toFixed(2)} · interval {card.intervalDays}d
              </span>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div
              className="cursor-pointer rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-6 min-h-[180px] flex items-center justify-center text-center"
              onClick={() => setShowBack((v) => !v)}
            >
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  {showBack ? 'Answer' : 'Prompt'}
                </div>
                <div className="font-display text-lg md:text-xl leading-relaxed">
                  {showBack ? card.back : card.front}
                </div>
                {!showBack && (
                  <div className="text-[10px] text-muted-foreground mt-3">
                    tap card to reveal
                  </div>
                )}
              </div>
            </div>

            {showBack ? (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <GradeBtn label="Again" hint="< 1m" tone="rose" onClick={() => grade(0)} disabled={review.isPending} />
                <GradeBtn label="Hard" hint="6m" tone="amber" onClick={() => grade(3)} disabled={review.isPending} />
                <GradeBtn label="Good" hint="1d+" tone="cyan" onClick={() => grade(4)} disabled={review.isPending} />
                <GradeBtn label="Easy" hint="more" tone="emerald" onClick={() => grade(5)} disabled={review.isPending} />
              </div>
            ) : (
              <div className="mt-4 flex justify-center">
                <GlassButton onClick={() => setShowBack(true)}>Show answer</GlassButton>
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

function GradeBtn({
  label,
  hint,
  tone,
  onClick,
  disabled,
}: {
  label: string
  hint: string
  tone: 'rose' | 'amber' | 'cyan' | 'emerald'
  onClick: () => void
  disabled?: boolean
}) {
  const toneClass =
    tone === 'rose'
      ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/25'
      : tone === 'amber'
        ? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/40 hover:bg-amber-400/25'
        : tone === 'cyan'
          ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/40 hover:bg-cyan-400/25'
          : 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/25'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-xl px-3 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none',
        toneClass,
      )}
    >
      <div>{label}</div>
      <div className="text-[10px] font-normal opacity-80 mt-0.5">{hint}</div>
    </button>
  )
}

// ─────────────────────────────────────────────────────
// Practice mode
// ─────────────────────────────────────────────────────

function PracticeSection({ courseId }: { courseId: string }) {
  const next = usePracticeNext(courseId)
  const [question, setQuestion] = useState<PracticeQuestion | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [topic, setTopic] = useState('')
  const [stats, setStats] = useState({ correct: 0, total: 0 })

  const fetchNext = async () => {
    setRevealed(false)
    setSelected(null)
    try {
      const q = await next.mutateAsync({ instructions: topic })
      setQuestion(q)
    } catch (err) {
      toast.error(apiError(err, 'Could not generate a practice question'))
    }
  }

  const submit = () => {
    if (selected == null || !question) return
    setRevealed(true)
    const ok = question.correct.includes(selected)
    setStats((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }))
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4">
        <GlassCard padding="lg">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <h2 className="font-display font-semibold text-base">Practice mode</h2>
            <Badge variant="info">infinite drill</Badge>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {stats.total > 0
                ? `${stats.correct}/${stats.total} correct (${Math.round((stats.correct / stats.total) * 100)}%)`
                : 'no attempts yet'}
            </span>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 mb-3">
            <GlassInput
              placeholder="Topic to drill on (optional) — e.g. graph traversal"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <GlassButton onClick={fetchNext} disabled={next.isPending}>
              {next.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {question ? 'Skip / next' : 'Start'}
            </GlassButton>
          </div>

          {!question && !next.isPending && (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-muted-foreground">
              Click <span className="text-foreground font-semibold">Start</span> for a fresh
              question generated from this course's materials. Nothing is graded — drill as
              long as you want.
            </div>
          )}

          {question && (
            <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="primary">
                  {question.type === 'mcq_single' ? 'Multiple choice' : 'True / False'}
                </Badge>
              </div>
              <div className="font-display text-base md:text-lg leading-relaxed prose-chat">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {question.body}
                </ReactMarkdown>
              </div>
              <div className="mt-4 space-y-2">
                {question.options.map((opt, i) => {
                  const isPicked = selected === i
                  const isAnswer = revealed && question.correct.includes(i)
                  const isWrongPick = revealed && isPicked && !isAnswer
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={revealed}
                      onClick={() => setSelected(i)}
                      className={cn(
                        'w-full text-left p-3 rounded-xl transition-all flex items-start gap-3 border',
                        isAnswer
                          ? 'border-emerald-400/50 bg-emerald-500/10'
                          : isWrongPick
                            ? 'border-rose-400/50 bg-rose-500/10'
                            : isPicked
                              ? 'border-transparent bg-[linear-gradient(120deg,rgba(129,90,255,0.18),rgba(255,70,190,0.18))] ring-2 ring-[#815AFF]/50'
                              : 'border-white/10 bg-white/5 hover:bg-white/10',
                      )}
                    >
                      <span className="font-mono text-[10px] mt-0.5">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-sm flex-1">{opt}</span>
                      {isAnswer && <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />}
                      {isWrongPick && <XCircle className="h-4 w-4 text-rose-300 shrink-0" />}
                    </button>
                  )
                })}
              </div>

              {revealed && question.explanation && (
                <div className="mt-3 text-[12px] text-muted-foreground border-l-2 border-[#00C8FF] pl-3">
                  {question.explanation}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                {!revealed ? (
                  <GlassButton onClick={submit} disabled={selected == null}>
                    Check answer
                  </GlassButton>
                ) : (
                  <GlassButton onClick={fetchNext} disabled={next.isPending}>
                    {next.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Next question
                  </GlassButton>
                )}
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      <div className="space-y-3">
        <GlassCard padding="md">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Session
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Asked" value={stats.total} tone="default" />
            <Stat label="Correct" value={stats.correct} tone="ok" />
            <Stat
              label="Accuracy"
              value={stats.total ? `${Math.round((stats.correct / stats.total) * 100)}%` : '—'}
              tone="info"
            />
            <Stat label="Streak" value={stats.total >= 3 && stats.correct === stats.total ? '🔥' : '—'} tone="warn" />
          </div>
        </GlassCard>
        <GlassCard padding="md">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            How this differs from a quiz
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Practice mode never stores anything — questions are generated fresh, scores are
            local to this session, and there's no grade. Use it to drill weak areas before
            the real exam.
          </p>
        </GlassCard>
      </div>
    </div>
  )
}
