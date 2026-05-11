import { Link, useOutletContext, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  FolderOpen,
  Paperclip,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { useQuiz, useSubmissions } from '@/hooks/useQuizzes'
import { cn } from '@/lib/utils'
import type { AttemptSummary, Course } from '@/types'

export function ExamFolder() {
  const { quizId } = useParams()
  const { course } = useOutletContext<{ course: Course }>()
  const { data: quiz } = useQuiz(quizId)
  const { data: subs = [], isLoading } = useSubmissions(quizId)

  const submitted = subs.filter((s) => s.submittedAt)
  const inProgress = subs.filter((s) => !s.submittedAt)
  const needsReview = submitted.filter((s) => s.needsManualGrading || !s.released)
  const released = submitted.filter((s) => s.released)

  return (
    <div className="space-y-5">
      <Link
        to={`/app/courses/${course.id}/quizzes`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to quizzes
      </Link>

      <GlassCard strong padding="lg">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="h-12 w-12 rounded-2xl bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)] flex items-center justify-center">
            <FolderOpen className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge variant="primary" className="mb-1">
              <Sparkles className="h-3 w-3" /> Exam folder
            </Badge>
            <h1 className="font-display text-2xl font-semibold truncate">
              {quiz?.title ?? 'Exam'} — submissions
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Auto-marked MCQs are scored on submit. Review written answers and release results
              when ready.
            </p>
          </div>
          {quiz?.examCode && (
            <div className="glass rounded-xl px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Code</div>
              <div className="font-mono font-bold tracking-[0.25em] text-[#FF46BE]">
                {quiz.examCode}
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <Section
            title="Needs review"
            icon={<Clock className="h-3 w-3 text-amber-300" />}
            tone="warn"
            rows={needsReview}
            emptyHint="No written answers waiting for marking."
            courseId={course.id}
            quizId={quiz?.id ?? ''}
          />
          <Section
            title="Released"
            icon={<CheckCircle2 className="h-3 w-3 text-emerald-300" />}
            tone="ok"
            rows={released}
            emptyHint="No releases yet."
            courseId={course.id}
            quizId={quiz?.id ?? ''}
          />
          {inProgress.length > 0 && (
            <Section
              title="In progress"
              icon={<Clock className="h-3 w-3" />}
              tone="muted"
              rows={inProgress}
              emptyHint=""
              courseId={course.id}
              quizId={quiz?.id ?? ''}
            />
          )}
          {subs.length === 0 && (
            <GlassCard padding="lg" className="text-center border-dashed border-white/10">
              <h3 className="font-display font-semibold">No submissions yet</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Share the exam code with your students to get started.
              </p>
            </GlassCard>
          )}
        </>
      )}
    </div>
  )
}

function Section({
  title,
  icon,
  tone,
  rows,
  emptyHint,
  courseId,
  quizId,
}: {
  title: string
  icon: React.ReactNode
  tone: 'warn' | 'ok' | 'muted'
  rows: AttemptSummary[]
  emptyHint: string
  courseId: string
  quizId: string
}) {
  if (!rows || rows.length === 0) {
    if (!emptyHint) return null
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="font-display text-sm font-semibold">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        <span className="text-[10px] text-muted-foreground">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <GlassCard padding="md" hover>
              <div className="flex items-center gap-3 flex-wrap">
                <div
                  className={cn(
                    'h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold',
                    tone === 'warn'
                      ? 'bg-amber-500/15 text-amber-200'
                      : tone === 'ok'
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'bg-white/5 text-muted-foreground',
                  )}
                >
                  {r.studentName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{r.studentName}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.submittedAt
                      ? `Submitted ${new Date(r.submittedAt).toLocaleString()}`
                      : `Started ${new Date(r.startedAt).toLocaleString()} · still in progress`}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {r.attachmentCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Paperclip className="h-3 w-3" /> {r.attachmentCount}
                    </span>
                  )}
                  <span className="text-xs font-mono">
                    {r.score}
                    <span className="text-muted-foreground">/{r.maxScore}</span>
                  </span>
                  {r.released && <Badge variant="success">released</Badge>}
                  {!r.released && r.submittedAt && r.needsManualGrading && (
                    <Badge variant="warning">pending</Badge>
                  )}
                  <GlassButton asChild size="sm" variant="glass">
                    <Link
                      to={`/app/courses/${courseId}/quizzes/${quizId}/submissions/${r.id}`}
                    >
                      <Eye className="h-3.5 w-3.5" /> Review
                    </Link>
                  </GlassButton>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
