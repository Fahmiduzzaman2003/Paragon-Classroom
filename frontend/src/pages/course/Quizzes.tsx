import { Link, useOutletContext } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Clock,
  ClipboardList,
  Copy,
  Eye,
  Plus,
  ListChecks,
  ArrowRight,
  Image as ImageIcon,
  RefreshCw,
  Sparkles,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { Badge } from '@/components/ui/Badge'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useCreateQuiz,
  useDeleteQuiz,
  useGenerateQuiz,
  useQuizzes,
  useRegenerateExamCode,
  useUploadQuestionImage,
} from '@/hooks/useQuizzes'
import { useAuthStore } from '@/stores/authStore'
import { apiError } from '@/lib/api'
import type { Course, Quiz } from '@/types'

export function Quizzes() {
  const { course } = useOutletContext<{ course: Course }>()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.id === course.teacherId || user?.role === 'admin'
  const { data: list = [], isLoading } = useQuizzes(course.id)
  const [genOpen, setGenOpen] = useState(false)
  const [examOpen, setExamOpen] = useState(false)

  const live = list.filter((q) => q.status === 'live')
  const upcoming = list.filter((q) => q.status === 'scheduled' || q.status === 'draft')
  const closed = list.filter((q) => q.status === 'closed')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-semibold">Quizzes</h2>
          <p className="text-xs text-muted-foreground">
            Objective questions auto-grade. Subjective items go to the teacher's queue.
          </p>
        </div>
        {isTeacher && (
          <div className="flex gap-2">
            <GlassButton variant="glass" onClick={() => setGenOpen(true)}>
              <Sparkles className="h-4 w-4" /> Draft from materials
            </GlassButton>
            <GlassButton onClick={() => setExamOpen(true)}>
              <Plus className="h-4 w-4" /> Create exam
            </GlassButton>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <Section title="Live now" items={live} accent isTeacher={isTeacher} />
          <Section title="Open / scheduled" items={upcoming} isTeacher={isTeacher} />
          <Section title="Closed" items={closed} isTeacher={isTeacher} />
          {list.length === 0 && (
            <GlassCard padding="lg" className="text-center border-dashed border-white/10">
              <h3 className="font-display font-semibold">No quizzes yet</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isTeacher
                  ? 'Draft your first quiz from the course materials in one click.'
                  : 'Your teacher hasn’t posted a quiz yet — check back soon.'}
              </p>
              {isTeacher && (
                <GlassButton size="sm" className="mt-4" onClick={() => setGenOpen(true)}>
                  <Sparkles className="h-3.5 w-3.5" /> Generate a draft
                </GlassButton>
              )}
            </GlassCard>
          )}
        </>
      )}

      <GenerateQuizModal
        open={genOpen}
        onOpenChange={setGenOpen}
        courseId={course.id}
        aiName={course.aiName}
      />
      <CreateExamModal open={examOpen} onOpenChange={setExamOpen} courseId={course.id} />
    </div>
  )
}

function Section({
  title,
  items,
  accent,
  isTeacher,
}: {
  title: string
  items: Quiz[]
  accent?: boolean
  isTeacher: boolean
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        <span className="text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {items.map((q, i) => (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <QuizCard quiz={q} accent={accent} isTeacher={isTeacher} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function QuizCard({ quiz, accent, isTeacher }: { quiz: Quiz; accent?: boolean; isTeacher: boolean }) {
  const start = quiz.startAt ? new Date(quiz.startAt) : null
  const end = quiz.endAt ? new Date(quiz.endAt) : null
  const del = useDeleteQuiz(quiz.courseId)
  const regen = useRegenerateExamCode(quiz.id)

  const onDelete = () => {
    if (!confirm(`Delete "${quiz.title}"? Submissions will be lost.`)) return
    del
      .mutateAsync(quiz.id)
      .then(() => toast.success('Quiz deleted'))
      .catch((e) => toast.error(apiError(e, 'Delete failed')))
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success(`Copied exam code ${code}`)
    } catch {
      toast.error('Copy failed — your browser blocked clipboard access')
    }
  }

  return (
    <GlassCard padding="md" hover className={accent ? 'ring-gradient bg-white/5' : ''}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={quiz.status} />
            <span className="text-[10px] text-muted-foreground">
              {quiz.durationMin} min · {quiz.questionCount} q · {quiz.totalPoints} pts
            </span>
            {quiz.myScore != null && (
              <Badge variant="success">your score: {quiz.myScore}/{quiz.totalPoints}</Badge>
            )}
          </div>
          <h3 className="font-display text-base font-semibold mt-1">{quiz.title}</h3>
        </div>
        <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
          <ClipboardList className="h-4 w-4" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{quiz.description}</p>

      {quiz.examMode && quiz.examCode && (
        <div className="mt-3 flex items-center gap-2 glass rounded-xl px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Exam code
          </span>
          <code className="font-mono font-bold tracking-[0.25em] text-base text-[#FF46BE]">
            {quiz.examCode}
          </code>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => copyCode(quiz.examCode!)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 h-6 text-[10px] hover:bg-white/10"
              title="Copy code"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
            {isTeacher && (
              <button
                type="button"
                onClick={() =>
                  regen
                    .mutateAsync()
                    .then((q) => toast.success(`New code: ${q.examCode}`))
                    .catch((e) => toast.error(apiError(e, 'Could not rotate code')))
                }
                disabled={regen.isPending}
                className="inline-flex items-center gap-1 rounded-md px-1.5 h-6 text-[10px] hover:bg-white/10"
                title="Generate a new code"
              >
                {regen.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                New
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="glass rounded-xl px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Window</div>
          <div className="text-foreground font-medium">
            {start && end
              ? `${start.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })} → ${end.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}`
              : 'Anytime'}
          </div>
        </div>
        <div className="glass rounded-xl px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Submissions</div>
          <div className="text-foreground font-medium">{quiz.submissionCount}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {isTeacher && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-xs text-rose-300 hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
        {isTeacher && (
          <GlassButton asChild size="sm" variant="ghost">
            <Link to={`/app/courses/${quiz.courseId}/quizzes/${quiz.id}/submissions`}>
              <Eye className="h-3.5 w-3.5" /> Folder ({quiz.submissionCount})
            </Link>
          </GlassButton>
        )}
        <GlassButton asChild size="sm" variant="ghost" className="ml-auto">
          <Link to={`/app/courses/${quiz.courseId}/quizzes/${quiz.id}`}>
            <ListChecks className="h-3.5 w-3.5" /> {isTeacher ? 'Open' : 'Details'}
          </Link>
        </GlassButton>
        {!isTeacher && quiz.status !== 'closed' && quiz.myAttemptId == null && (
          <GlassButton asChild size="sm">
            <Link to={`/app/courses/${quiz.courseId}/quizzes/${quiz.id}`}>
              <Clock className="h-3.5 w-3.5" /> Start
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </GlassButton>
        )}
        {!isTeacher && quiz.myAttemptId && (
          <GlassButton asChild size="sm" variant="glass">
            <Link to={`/app/courses/${quiz.courseId}/quizzes/${quiz.id}`}>
              View result <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </GlassButton>
        )}
      </div>
    </GlassCard>
  )
}

function StatusBadge({ status }: { status: Quiz['status'] }) {
  if (status === 'live')
    return (
      <Badge variant="danger" className="animate-pulse-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-300" /> live
      </Badge>
    )
  if (status === 'scheduled') return <Badge variant="warning">scheduled</Badge>
  if (status === 'draft') return <Badge variant="muted">draft</Badge>
  return <Badge variant="default">closed</Badge>
}

function GenerateQuizModal({
  open,
  onOpenChange,
  courseId,
  aiName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  courseId: string
  aiName: string
}) {
  const [title, setTitle] = useState('Practice quiz')
  const [num, setNum] = useState(6)
  const [instructions, setInstructions] = useState('')
  const generate = useGenerateQuiz(courseId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await generate.mutateAsync({
        title,
        num_questions: num,
        types: ['mcq_single', 'true_false', 'short_answer'],
        instructions,
      })
      toast.success(`${aiName} drafted a quiz — review and publish it`)
      onOpenChange(false)
    } catch (err) {
      toast.error(apiError(err, 'Could not generate quiz'))
    }
  }

  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="md">
        <GlassModalHeader>
          <GlassModalTitle>
            <Sparkles className="inline h-4 w-4 text-[#FF46BE] mr-1.5 -mt-0.5" />
            Draft a quiz from materials
          </GlassModalTitle>
          <GlassModalDescription>
            {aiName} will read the indexed sources and propose mixed-format questions with
            explanations cited back to the source pages.
          </GlassModalDescription>
        </GlassModalHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid sm:grid-cols-[1fr_120px] gap-3">
            <div>
              <Label className="mb-1.5 block">Title</Label>
              <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <Label className="mb-1.5 block"># questions</Label>
              <GlassInput
                type="number"
                min={1}
                max={20}
                value={num}
                onChange={(e) => setNum(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Extra instructions (optional)</Label>
            <GlassTextarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Focus on graph traversal and the divide-and-conquer recurrences."
            />
          </div>
          <GlassModalFooter>
            <GlassButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </GlassButton>
            <GlassButton type="submit" disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Generate draft
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}

// ─────────────────────────────────────────────────────
// Create Exam — teacher authors a fresh exam (MCQ + written + attachments)
// ─────────────────────────────────────────────────────

type DraftQuestion = {
  type: Quiz['questions'] extends (infer Q)[] | undefined ? Q extends { type: infer T } ? T : never : never
  body: string
  options: string[]
  correct: (number | string)[]
  points: number
  explanation: string
  accepts_attachment?: boolean
  // Staged image — uploaded after the quiz is created and a question id exists.
  imageFile?: File | null
}

function CreateExamModal({
  open,
  onOpenChange,
  courseId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  courseId: string
}) {
  const create = useCreateQuiz(courseId)
  // No quizId yet at this point — images upload after the quiz is created. We
  // still pass `undefined` so the hook's invalidation gates on it.
  const uploadImage = useUploadQuestionImage(undefined)
  const [title, setTitle] = useState('Term exam')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState(60)
  const [allowRetake, setAllowRetake] = useState(false)
  // Schedule (live exam start time). Empty string = "anytime / start now".
  const [startAtLocal, setStartAtLocal] = useState('')
  const [proctoring, setProctoring] = useState(true)
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { type: 'mcq_single', body: '', options: ['', ''], correct: [0], points: 5, explanation: '' },
  ])

  const reset = () => {
    setTitle('Term exam')
    setDescription('')
    setDuration(60)
    setAllowRetake(false)
    setStartAtLocal('')
    setProctoring(true)
    setQuestions([
      { type: 'mcq_single', body: '', options: ['', ''], correct: [0], points: 5, explanation: '' },
    ])
  }

  const updateQ = (idx: number, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)))

  const addQuestion = (type: DraftQuestion['type']) =>
    setQuestions((qs) => [
      ...qs,
      type === 'mcq_single' || type === 'mcq_multi'
        ? { type, body: '', options: ['', ''], correct: [0], points: 5, explanation: '' }
        : type === 'true_false'
          ? { type, body: '', options: ['True', 'False'], correct: [0], points: 5, explanation: '' }
          : { type, body: '', options: [], correct: [], points: 10, explanation: '', accepts_attachment: type !== 'short_answer' },
    ])

  const removeQ = (idx: number) =>
    setQuestions((qs) => qs.filter((_, i) => i !== idx))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (questions.some((q) => !q.body.trim())) {
      toast.error('Every question needs a prompt')
      return
    }
    // Convert the datetime-local "YYYY-MM-DDTHH:mm" (local TZ) to a real ISO
    // string the backend can parse. Empty string ⇒ "anytime / start now".
    const startIso = startAtLocal ? new Date(startAtLocal).toISOString() : null
    // Status flips based on schedule: future start ⇒ 'scheduled', else 'live'.
    const startMs = startIso ? new Date(startIso).getTime() : 0
    const isFutureStart = startMs > Date.now() + 30_000
    const status: Quiz['status'] = isFutureStart ? 'scheduled' : 'live'

    try {
      const created = await create.mutateAsync({
        title,
        description,
        duration_min: duration,
        allow_retake: allowRetake,
        exam_mode: true,
        proctoring_enabled: proctoring,
        start_at: startIso,
        end_at: startIso
          ? new Date(startMs + duration * 60_000 + 5 * 60_000).toISOString()
          : null,
        status,
        questions: questions.map((q) => ({
          type: q.type as string,
          body: q.body,
          options: q.options,
          correct: q.correct,
          points: q.points,
          explanation: q.explanation,
          accepts_attachment: !!q.accepts_attachment,
        })),
      })

      // Now that questions have ids, upload any staged images. The server
      // returns questions sorted by position, which matches our draft order.
      const createdQs = created.questions ?? []
      const pending = questions
        .map((q, i) => ({ qid: createdQs[i]?.id, file: q.imageFile ?? null }))
        .filter((x): x is { qid: string; file: File } => !!x.qid && !!x.file)
      if (pending.length > 0) {
        const results = await Promise.allSettled(
          pending.map(({ qid, file }) =>
            uploadImage.mutateAsync({ questionId: qid, file }),
          ),
        )
        const failed = results.filter((r) => r.status === 'rejected').length
        if (failed > 0) {
          toast.error(`${failed} question image(s) failed to upload — try editing them later`)
        }
      }

      toast.success(`Exam created · code ${created.examCode ?? '—'}`)
      onOpenChange(false)
      reset()
    } catch (err) {
      toast.error(apiError(err, 'Could not create exam'))
    }
  }

  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="lg">
        <GlassModalHeader>
          <GlassModalTitle>
            <ClipboardList className="inline h-4 w-4 text-[#00C8FF] mr-1.5 -mt-0.5" />
            Create a new exam
          </GlassModalTitle>
          <GlassModalDescription>
            MCQs are auto-graded against the keys you set here. Written answers go to your folder
            for manual marking; attach-enabled questions let students upload paper photos.
          </GlassModalDescription>
        </GlassModalHeader>
        <form onSubmit={submit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid sm:grid-cols-[1fr_140px] gap-3">
            <div>
              <Label className="mb-1.5 block">Title</Label>
              <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <Label className="mb-1.5 block">Duration (min)</Label>
              <GlassInput
                type="number"
                min={1}
                max={600}
                value={duration}
                onChange={(e) => setDuration(Math.max(1, Math.min(600, Number(e.target.value) || 60)))}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div>
              <Label className="mb-1.5 block">
                Schedule start (local time)
                <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                  empty = start now
                </span>
              </Label>
              <GlassInput
                type="datetime-local"
                value={startAtLocal}
                onChange={(e) => setStartAtLocal(e.target.value)}
              />
              {startAtLocal && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Students will be auto-launched into the exam at exactly{' '}
                  <span className="text-foreground font-medium">
                    {new Date(startAtLocal).toLocaleString()}
                  </span>
                  . A calendar event + notification go out to every enrolled student.
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none h-10">
              <input
                type="checkbox"
                checked={allowRetake}
                onChange={(e) => setAllowRetake(e.target.checked)}
              />
              Allow retake
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none h-10">
              <input
                type="checkbox"
                checked={proctoring}
                onChange={(e) => setProctoring(e.target.checked)}
              />
              Lockdown / proctoring
            </label>
          </div>
          <div>
            <Label className="mb-1.5 block">Description</Label>
            <GlassTextarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instructions visible to students before they start."
            />
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => (
              <DraftQuestionEditor
                key={idx}
                index={idx}
                q={q}
                onChange={(patch) => updateQ(idx, patch)}
                onRemove={() => removeQ(idx)}
                canRemove={questions.length > 1}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
              Add question:
            </span>
            {(
              [
                ['mcq_single', 'MCQ'],
                ['mcq_multi', 'Multi-select'],
                ['true_false', 'True / False'],
                ['short_answer', 'Short answer'],
                ['essay', 'Essay'],
              ] as [DraftQuestion['type'], string][]
            ).map(([t, label]) => (
              <GlassButton
                key={t}
                type="button"
                size="sm"
                variant="glass"
                onClick={() => addQuestion(t)}
              >
                <Plus className="h-3 w-3" /> {label}
              </GlassButton>
            ))}
          </div>

          <GlassModalFooter>
            <GlassButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </GlassButton>
            <GlassButton type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Publish exam
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}

function DraftQuestionEditor({
  index,
  q,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number
  q: DraftQuestion
  onChange: (patch: Partial<DraftQuestion>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const isMcq = q.type === 'mcq_single' || q.type === 'mcq_multi' || q.type === 'true_false'
  const isWritten = q.type === 'short_answer' || q.type === 'essay'

  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="default">Q{index + 1}</Badge>
        <Badge variant="info">{q.type.replace('_', ' ')}</Badge>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Points</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={q.points}
            onChange={(e) => onChange({ points: Math.max(1, Number(e.target.value) || 1) })}
            className="w-16 bg-white/5 rounded px-2 py-1"
          />
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-rose-300/80 hover:text-rose-200"
              title="Remove question"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      <Label className="mb-1.5 block text-[10px]">Prompt</Label>
      <GlassTextarea
        rows={2}
        value={q.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="What do you want to ask?"
      />

      <div className="mt-2">
        <DraftImagePicker
          file={q.imageFile ?? null}
          onChange={(file) => onChange({ imageFile: file })}
        />
      </div>

      {isMcq && q.type !== 'true_false' && (
        <div className="mt-2 space-y-1.5">
          {q.options.map((opt, oi) => {
            const checked = q.type === 'mcq_multi'
              ? (q.correct as number[]).includes(oi)
              : q.correct[0] === oi
            return (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type={q.type === 'mcq_multi' ? 'checkbox' : 'radio'}
                  name={`q${index}-correct`}
                  checked={checked}
                  onChange={() => {
                    if (q.type === 'mcq_multi') {
                      const set = new Set(q.correct as number[])
                      if (set.has(oi)) set.delete(oi)
                      else set.add(oi)
                      onChange({ correct: Array.from(set).sort() })
                    } else {
                      onChange({ correct: [oi] })
                    }
                  }}
                />
                <GlassInput
                  className="flex-1"
                  value={opt}
                  onChange={(e) => {
                    const next = [...q.options]
                    next[oi] = e.target.value
                    onChange({ options: next })
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                />
                <button
                  type="button"
                  onClick={() => onChange({ options: q.options.filter((_, i) => i !== oi) })}
                  className="text-rose-300/80 hover:text-rose-200"
                  title="Remove option"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
          <GlassButton
            type="button"
            size="sm"
            variant="glass"
            onClick={() => onChange({ options: [...q.options, ''] })}
          >
            <Plus className="h-3 w-3" /> Add option
          </GlassButton>
          <p className="text-[10px] text-muted-foreground">
            Tick the option(s) that count as correct — used for automatic marking.
          </p>
        </div>
      )}

      {q.type === 'true_false' && (
        <div className="mt-2 flex gap-3 text-xs">
          {['True', 'False'].map((opt, oi) => (
            <label key={opt} className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`q${index}-tf`}
                checked={q.correct[0] === oi}
                onChange={() => onChange({ correct: [oi] })}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {isWritten && (
        <div className="mt-2 space-y-2">
          <Label className="block text-[10px]">
            Model answer(s) — used for NLP suggested score (one per line, optional)
          </Label>
          <GlassTextarea
            rows={2}
            value={(q.correct as string[]).join('\n')}
            onChange={(e) =>
              onChange({
                correct: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder={'Mitochondria produce ATP via oxidative phosphorylation.'}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={!!q.accepts_attachment}
              onChange={(e) => onChange({ accepts_attachment: e.target.checked })}
            />
            Allow students to attach paper photo / PDF
          </label>
        </div>
      )}

      <Label className="mt-3 mb-1.5 block text-[10px]">
        Explanation (shown to students after grading)
      </Label>
      <GlassInput
        value={q.explanation}
        onChange={(e) => onChange({ explanation: e.target.value })}
        placeholder="Optional teaching note"
      />
    </GlassCard>
  )
}

// Picks a single image off disk, shows a live preview, and stages the File for
// upload after the quiz has been created. The actual POST happens once we have
// a question id from the server.
function DraftImagePicker({
  file,
  onChange,
}: {
  file: File | null
  onChange: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onPick = () => inputRef.current?.click()
  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    if (f && !f.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (f && f.size > 8 * 1024 * 1024) {
      toast.error('Image too large (max 8 MB)')
      return
    }
    onChange(f)
  }

  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-2 mb-2">
        <ImageIcon className="h-3.5 w-3.5 text-[#00C8FF]" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Question image (optional — for diagrams, graphs, photos)
        </span>
      </div>
      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="Question preview"
            className="rounded-lg max-h-44 object-contain bg-black/30"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 hover:bg-rose-500/80 flex items-center justify-center"
            aria-label="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <GlassButton
          type="button"
          variant="glass"
          size="sm"
          onClick={onPick}
        >
          <Upload className="h-3.5 w-3.5" /> Upload image
        </GlassButton>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onSelect}
        className="hidden"
      />
    </div>
  )
}
