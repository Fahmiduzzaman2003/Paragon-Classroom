import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Loader2,
  Save,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import { QuestionImage } from '@/components/quiz/QuestionImage'
import {
  attachmentDownloadUrl,
  fetchAttachmentBlob,
  useAttempt,
  useGradeQuestion,
  useQuiz,
  useReleaseAttempt,
} from '@/hooks/useQuizzes'
import { apiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Course, GradedQuestion, Question } from '@/types'

export function ExamReview() {
  const { quizId, attemptId } = useParams<{ quizId: string; attemptId: string }>()
  const { course } = useOutletContext<{ course: Course }>()
  const { data: quiz } = useQuiz(quizId)
  const { data: attempt, isLoading } = useAttempt(attemptId)
  const release = useReleaseAttempt(attemptId ?? '')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (attempt?.teacherFeedback) setFeedback(attempt.teacherFeedback)
  }, [attempt?.teacherFeedback])

  if (isLoading || !attempt || !quiz) {
    return <Skeleton className="h-96 rounded-3xl" />
  }

  // Pending = any non-auto graded entry the teacher has not reviewed yet.
  const writtenPending = (attempt.graded || []).filter((g) => !g.auto && !g.reviewed)
  const autoScore = attempt.autoScore ?? 0
  const autoMax = attempt.autoMax ?? 0
  const manualScore = attempt.manualScore ?? 0
  const manualMax = attempt.manualMax ?? 0

  const onRelease = async () => {
    try {
      await release.mutateAsync(feedback)
      toast.success('Results released to student')
    } catch (err) {
      toast.error(apiError(err, 'Could not release'))
    }
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Link
        to={`/app/courses/${course.id}/quizzes/${quizId}/submissions`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to folder
      </Link>

      <GlassCard strong padding="lg">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)]">
            {attempt.maxScore
              ? Math.round((attempt.score / attempt.maxScore) * 100)
              : 0}
            %
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-semibold">{quiz.title}</h1>
            <div className="text-xs text-muted-foreground mt-1">
              Submitted{' '}
              {attempt.submittedAt
                ? new Date(attempt.submittedAt).toLocaleString()
                : '— in progress'}{' '}
              · merged total {attempt.score}/{attempt.maxScore} pts ·{' '}
              {writtenPending.length === 0
                ? 'all written items reviewed'
                : `${writtenPending.length} written item(s) awaiting marks`}
            </div>
          </div>
          <Badge variant={attempt.released ? 'success' : 'warning'}>
            {attempt.released ? 'released' : 'unreleased'}
          </Badge>
        </div>
        <div className="mt-4 grid sm:grid-cols-3 gap-2 text-[11px]">
          <div className="glass rounded-xl px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Auto-marked (MCQ &amp; objective)</div>
            <div className="font-mono">{autoScore} / {autoMax}</div>
          </div>
          <div className="glass rounded-xl px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Manual marks</div>
            <div className="font-mono">
              {manualScore} / {manualMax}
              {writtenPending.length > 0 && (
                <span className="text-amber-300 ml-1.5">· {writtenPending.length} pending</span>
              )}
            </div>
          </div>
          <div className="glass rounded-xl px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Final (auto + manual)</div>
            <div className="font-mono font-semibold">{attempt.score} / {attempt.maxScore}</div>
          </div>
        </div>
      </GlassCard>

      {(attempt.violations?.length ?? 0) > 0 && (
        <ViolationsPanel violations={attempt.violations ?? []} />
      )}

      <div className="space-y-3">
        {(quiz.questions ?? []).map((q, i) => {
          const g = attempt.graded.find((x) => x.questionId === q.id)
          if (!g) return null
          return (
            <ReviewItem
              key={q.id}
              index={i}
              question={q}
              graded={g}
              attemptId={attempt.id}
              onSaved={() => toast.success(`Q${i + 1} graded`)}
            />
          )
        })}
      </div>

      <GlassCard padding="md">
        <Label className="mb-1.5 block">Teacher feedback (visible to student on release)</Label>
        <GlassTextarea
          rows={3}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Overall comments — strengths, areas to improve, study suggestions."
        />
        <div className="mt-3 flex justify-end gap-2">
          <GlassButton onClick={onRelease} disabled={release.isPending}>
            {release.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {attempt.released ? 'Re-release' : 'Release results'}
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  )
}

function ReviewItem({
  index,
  question,
  graded,
  attemptId,
  onSaved,
}: {
  index: number
  question: Question
  graded: GradedQuestion
  attemptId: string
  onSaved: () => void
}) {
  const grade = useGradeQuestion(attemptId)
  const [points, setPoints] = useState(graded.points)
  const [feedback, setFeedback] = useState(graded.feedback ?? '')
  // All written / non-auto types need manual evaluation: short_answer, essay,
  // code, and any low-confidence NLP grading the system flagged.
  const needsManual =
    !graded.auto ||
    question.type === 'short_answer' ||
    question.type === 'essay' ||
    question.type === 'code' ||
    (graded.attachments?.length ?? 0) > 0
  const max = graded.maxPoints || question.points

  useEffect(() => {
    setPoints(graded.points)
    setFeedback(graded.feedback ?? '')
  }, [graded.points, graded.feedback])

  const onSave = async () => {
    try {
      await grade.mutateAsync({
        question_id: question.id,
        points,
        feedback,
        correct: points >= max,
      })
      onSaved()
    } catch (err) {
      toast.error(apiError(err, 'Save failed'))
    }
  }

  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="default">Q{index + 1}</Badge>
        <Badge variant="info">{question.type.replace('_', ' ')}</Badge>
        {graded.auto ? (
          graded.correct ? (
            <Badge variant="success">
              <CheckCircle2 className="h-2.5 w-2.5" /> auto · correct
            </Badge>
          ) : (
            <Badge variant="danger">
              <XCircle className="h-2.5 w-2.5" /> auto · incorrect
            </Badge>
          )
        ) : graded.reviewed ? (
          <Badge variant="success">
            <CheckCircle2 className="h-2.5 w-2.5" /> manually marked
          </Badge>
        ) : (
          <Badge variant="warning">awaiting manual mark</Badge>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {graded.points}/{max} pts
        </span>
      </div>
      <div className="text-sm prose-chat">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
          {question.body}
        </ReactMarkdown>
      </div>
      {question.hasImage && (
        <div className="mt-2">
          <QuestionImage questionId={question.id} className="max-w-md" />
        </div>
      )}

      {/* Student's answer */}
      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Student answer
        </div>
        {(question.type === 'mcq_single' ||
          question.type === 'mcq_multi' ||
          question.type === 'true_false') && (
          <ul className="text-xs space-y-1">
            {(question.options ?? []).map((opt, oi) => {
              const picked = (graded.studentSelected ?? []).includes(oi)
              const correctList = (question.correct as number[] | undefined) ?? []
              const isAnswerKey = correctList.includes(oi)
              return (
                <li
                  key={oi}
                  className={cn(
                    'rounded px-2 py-1',
                    picked && isAnswerKey && 'bg-emerald-500/15 text-emerald-200',
                    picked && !isAnswerKey && 'bg-rose-500/15 text-rose-200',
                    !picked && isAnswerKey && 'bg-white/5 text-muted-foreground',
                  )}
                >
                  <span className="font-mono mr-2">{String.fromCharCode(65 + oi)}</span>
                  {opt}
                  {picked && ' · picked'}
                  {!picked && isAnswerKey && ' · key'}
                </li>
              )
            })}
          </ul>
        )}
        {(graded.studentText ?? '').trim() && (
          <pre className="text-xs whitespace-pre-wrap font-sans">{graded.studentText}</pre>
        )}
        {!graded.studentText && !(graded.studentSelected ?? []).length && (
          <p className="text-xs text-muted-foreground">— blank —</p>
        )}

        {(graded.attachments ?? []).length > 0 && (
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            {(graded.attachments ?? []).map((a) => (
              <AttachmentPreview key={a.id} id={a.id} filename={a.filename} mime={a.mime} />
            ))}
          </div>
        )}
      </div>

      {/* Manual marking controls (only for written / unauto) */}
      {needsManual && (
        <div className="mt-3 grid sm:grid-cols-[120px_1fr_auto] gap-2 items-end">
          <div>
            <Label className="mb-1 block text-[10px]">Award (max {max})</Label>
            <GlassInput
              type="number"
              min={0}
              max={max}
              value={points}
              onChange={(e) =>
                setPoints(Math.max(0, Math.min(max, Number(e.target.value) || 0)))
              }
            />
          </div>
          <div>
            <Label className="mb-1 block text-[10px]">Feedback (optional)</Label>
            <GlassInput value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </div>
          <GlassButton onClick={onSave} size="sm" disabled={grade.isPending}>
            {grade.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </GlassButton>
        </div>
      )}
    </GlassCard>
  )
}

function AttachmentPreview({ id, filename, mime }: { id: string; filename: string; mime: string }) {
  const isImage = mime.startsWith('image/')
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const directUrl = useMemo(() => attachmentDownloadUrl(id), [id])

  useEffect(() => {
    if (!isImage) return
    let revoked = false
    let url: string | null = null
    fetchAttachmentBlob(id)
      .then((u) => {
        if (revoked) URL.revokeObjectURL(u)
        else {
          url = u
          setBlobUrl(u)
        }
      })
      .catch(() => {})
    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, isImage])

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      {isImage && blobUrl ? (
        <a href={blobUrl} target="_blank" rel="noreferrer">
          <img src={blobUrl} alt={filename} className="w-full max-h-56 object-cover" />
        </a>
      ) : (
        <div className="p-4 flex items-center gap-2 text-xs">
          <FileImage className="h-4 w-4 text-[#00C8FF]" />
          <span className="truncate">{filename}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-[10px] px-2 py-1.5 border-t border-white/5">
        <span className="truncate text-muted-foreground">{filename}</span>
        <a
          className="inline-flex items-center gap-1 hover:text-foreground"
          href={directUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Violations panel — surfaces every lockdown event recorded by the client
// during the live attempt, plus a per-type tally.
// ─────────────────────────────────────────────────────

const VIOLATION_LABELS: Record<string, { label: string; severe?: boolean }> = {
  tab_blur: { label: 'Switched to another tab/window', severe: true },
  visibility_hidden: { label: 'Exam tab hidden', severe: true },
  fullscreen_exit: { label: 'Exited fullscreen', severe: true },
  fullscreen_enter: { label: 'Restored fullscreen' },
  tab_focus: { label: 'Returned to exam tab' },
  copy_attempt: { label: 'Tried to copy text' },
  paste_attempt: { label: 'Tried to paste text' },
  cut_attempt: { label: 'Tried to cut text' },
  context_menu: { label: 'Opened right-click menu' },
  blocked_shortcut: { label: 'Used a blocked shortcut' },
  devtools_suspected: { label: 'Developer tools suspected', severe: true },
  page_resized: { label: 'Window shrunk unexpectedly' },
}

function ViolationsPanel({ violations }: { violations: import('@/types').ViolationEvent[] }) {
  const byType: Record<string, number> = {}
  for (const v of violations) {
    byType[v.type] = (byType[v.type] || 0) + 1
  }
  // Treat "recovery" events (re-entering fullscreen, returning to tab) as
  // informational — only the active deviations count toward severity.
  const severeCount = violations.filter(
    (v) => VIOLATION_LABELS[v.type]?.severe || !['tab_focus', 'fullscreen_enter'].includes(v.type),
  ).length
  const banner = severeCount >= 5
    ? 'High suspicion'
    : severeCount >= 1
      ? 'Some warnings logged'
      : 'No active warnings'
  const tone = severeCount >= 5 ? 'rose' : severeCount >= 1 ? 'amber' : 'emerald'
  const ring =
    tone === 'rose'
      ? 'ring-rose-400/40 bg-rose-500/10'
      : tone === 'amber'
        ? 'ring-amber-400/40 bg-amber-400/10'
        : 'ring-emerald-400/30 bg-emerald-500/8'

  return (
    <GlassCard padding="md" className={`ring-1 ${ring}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ShieldAlert className={tone === 'rose' ? 'h-4 w-4 text-rose-300' : tone === 'amber' ? 'h-4 w-4 text-amber-300' : 'h-4 w-4 text-emerald-300'} />
        <h3 className="font-display font-semibold text-sm">Proctoring log</h3>
        <span className="text-[11px] text-muted-foreground">{banner} · {violations.length} event{violations.length === 1 ? '' : 's'}</span>
      </div>

      {/* Per-type tally chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Object.entries(byType)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => {
            const meta = VIOLATION_LABELS[type] ?? { label: type }
            const severe = meta.severe
            const cls = severe
              ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/40'
              : 'bg-white/5 text-muted-foreground ring-1 ring-white/10'
            return (
              <span
                key={type}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-[10px] ${cls}`}
              >
                {severe && <AlertTriangle className="h-2.5 w-2.5" />}
                {meta.label}
                <span className="font-mono tabular-nums opacity-80">×{count}</span>
              </span>
            )
          })}
      </div>

      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
          Show timeline ({violations.length} entries)
        </summary>
        <ol className="mt-2 space-y-1 max-h-64 overflow-y-auto pr-1 font-mono text-[10px]">
          {violations.map((v, i) => {
            const meta = VIOLATION_LABELS[v.type] ?? { label: v.type }
            const ts = new Date(v.at)
            return (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {ts.toLocaleTimeString()}
                </span>
                <span className={meta.severe ? 'text-rose-200' : 'text-foreground/80'}>
                  {meta.label}
                </span>
                {v.extra && Object.keys(v.extra).length > 0 && (
                  <span className="text-muted-foreground truncate">
                    · {Object.entries(v.extra).map(([k, val]) => `${k}=${val}`).join(' · ')}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </details>
    </GlassCard>
  )
}
