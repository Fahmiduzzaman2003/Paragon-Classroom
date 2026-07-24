import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  FileImage,
  Flag,
  LayoutGrid,
  ListChecks,
  Loader2,
  LogOut,
  Maximize2,
  Paperclip,
  Send,
  Shield,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassTextarea } from '@/components/glass/GlassInput'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { QuestionImage } from '@/components/quiz/QuestionImage'
import {
  useAttempt,
  useAttemptAttachments,
  useDeleteAttachment,
  useQuiz,
  useQuizStatus,
  useReportViolation,
  useStartAttempt,
  useSubmitAttempt,
  useUploadAttachment,
  type AttemptStart,
} from '@/hooks/useQuizzes'
import { streamExplainWrong } from '@/hooks/useStudyBuddy'
import { useLockdown, type LockdownEvent } from '@/hooks/useLockdown'
import { useAuthStore } from '@/stores/authStore'
import { apiError } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AttemptAttachment, Course, Question } from '@/types'

export function QuizAttempt() {
  const { quizId } = useParams()
  const { course } = useOutletContext<{ course: Course }>()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.id === course.teacherId || user?.role === 'admin'
  const { data: quiz, isLoading } = useQuiz(quizId)

  const [attempt, setAttempt] = useState<AttemptStart | null>(null)
  const start = useStartAttempt()

  if (isLoading || !quiz) {
    return <Skeleton className="h-96 rounded-3xl" />
  }

  // Teacher view: read-only summary of all questions with answer keys.
  if (isTeacher) {
    return <TeacherView quiz={quiz} courseId={course.id} />
  }

  // Student already attempted: show result.
  if (quiz.myAttemptId && !attempt) {
    return <StudentResultView attemptId={quiz.myAttemptId} courseId={course.id} quizTitle={quiz.title} />
  }

  // Not started yet — show landing card / waiting room.
  if (!attempt) {
    return (
      <WaitingRoom
        quiz={quiz}
        courseId={course.id}
        onStart={async () => {
          try {
            const a = await start.mutateAsync(quiz.id)
            setAttempt(a)
          } catch (err) {
            toast.error(apiError(err, 'Could not start attempt'))
          }
        }}
        starting={start.isPending}
      />
    )
  }

  return (
    <RunningAttempt
      attempt={attempt}
      courseId={course.id}
      totalPoints={quiz.totalPoints}
      examTitle={quiz.title}
      proctoringEnabled={!!quiz.proctoringEnabled}
    />
  )
}

// ─────────────────────────────────────────────────────
// Waiting room — countdown to scheduled start, auto-launch when live
// ─────────────────────────────────────────────────────

function WaitingRoom({
  quiz,
  courseId,
  onStart,
  starting,
}: {
  quiz: import('@/types').Quiz
  courseId: string
  onStart: () => void
  starting: boolean
}) {
  // Poll the server every 5 s once the start time is in view, every 30 s
  // before then (lighter load), and stop once we're live.
  const status = useQuizStatus(quiz.id, quiz.startAt && quiz.status !== 'live' ? 5000 : 0)
  const s = status.data
  const startsIn = s?.startsInSeconds ?? null

  // Live "seconds-remaining" tick that updates every second between server
  // pulls, so the countdown doesn't feel choppy.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  // Anchored countdown: when status arrives, snapshot Date.now() vs the
  // remaining seconds and decrement locally between polls.
  const anchorRef = useRef<{ at: number; remaining: number } | null>(null)
  useEffect(() => {
    if (typeof startsIn === 'number') {
      anchorRef.current = { at: Date.now(), remaining: startsIn }
    }
  }, [startsIn])
  const localRemaining =
    anchorRef.current
      ? Math.max(0, anchorRef.current.remaining - Math.floor((Date.now() - anchorRef.current.at) / 1000))
      : null
  // Reference so the linter is happy and we still re-render every second.
  void tick

  // Auto-launch the moment the server says we can start.
  const launchedRef = useRef(false)
  useEffect(() => {
    if (!s) return
    if (s.canStart && !launchedRef.current && !starting) {
      launchedRef.current = true
      onStart()
    }
  }, [s, starting, onStart])

  const formatHMS = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const sec = secs % 60
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const isScheduled =
    !!quiz.startAt && (s?.status === 'scheduled' || (typeof localRemaining === 'number' && localRemaining > 0))

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Link
        to={`/app/courses/${courseId}/quizzes`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition mb-1"
      >
        <ArrowLeft className="h-3 w-3" /> Back to quizzes
      </Link>

      <div className="flex items-center gap-2">
        <div className="section-eyebrow">
          <Target className="h-3 w-3" /> Assessment
        </div>
        <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground">
          {quiz.proctoringEnabled ? 'Proctored' : 'Open session'}
        </span>
      </div>

      <GlassCard padding="lg" strong className="relative overflow-hidden">
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -top-20 -right-12 h-56 w-56 rounded-full bg-[#815AFF]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-[#00C8FF]/25 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full bg-[#FF46BE]/15 blur-3xl" />

        <div className="relative">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#815AFF] via-[#FF46BE] to-[#00C8FF] flex items-center justify-center text-white shadow-lg shrink-0">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-semibold leading-tight">
                {quiz.title}
              </h1>
              {quiz.description && (
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  {quiz.description}
                </p>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: Clock, label: 'Duration', value: `${quiz.durationMin}m` },
              { icon: ListChecks, label: 'Questions', value: String(quiz.questionCount) },
              { icon: Target, label: 'Total pts', value: String(quiz.totalPoints) },
              {
                icon: quiz.allowRetake ? Sparkles : AlertTriangle,
                label: 'Retakes',
                value: quiz.allowRetake ? 'Allowed' : 'Once',
              },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl glass px-3 py-2.5 hover:bg-white/[0.06] transition"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  {label}
                </div>
                <div className="text-base font-semibold tabular-nums mt-0.5">
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Proctoring warning */}
          {quiz.proctoringEnabled && (
            <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-3 flex items-start gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-amber-400/20 ring-1 ring-amber-400/40 flex items-center justify-center shrink-0">
                <Shield className="h-3.5 w-3.5 text-amber-200" />
              </div>
              <div className="text-xs text-amber-100/90 leading-relaxed">
                <div className="font-semibold mb-0.5">Lockdown mode is active</div>
                You'll be placed in fullscreen — copy/paste, tab switching and developer tools are flagged.
              </div>
            </div>
          )}

          {/* Countdown or CTA */}
          {isScheduled ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 rounded-2xl bg-gradient-to-br from-[#815AFF]/20 via-[#FF46BE]/10 to-[#00C8FF]/15 ring-1 ring-white/15 p-5 text-center relative overflow-hidden"
            >
              <div className="pointer-events-none absolute inset-0 bg-dots opacity-30" />
              <div className="relative">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center justify-center gap-1.5">
                  <Zap className="h-3 w-3 text-amber-300" />
                  Live exam starts in
                </div>
                <div className="font-mono text-5xl font-semibold tabular-nums leading-none text-white tracking-tight">
                  {formatHMS(localRemaining ?? 0)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-3">
                  Auto-launch at{' '}
                  <span className="text-foreground font-medium">
                    {quiz.startAt ? new Date(quiz.startAt).toLocaleString() : '—'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 italic">
                  Keep this tab open — the exam will start automatically.
                </p>
              </div>
            </motion.div>
          ) : (
            <GlassButton
              className="mt-6 w-full"
              size="lg"
              disabled={starting || (s ? !s.canStart : false)}
              onClick={onStart}
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {starting ? 'Starting…' : 'Begin assessment'}
            </GlassButton>
          )}
        </div>
      </GlassCard>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Active attempt — timer, navigation, submission
// ─────────────────────────────────────────────────────

// Parse a server-supplied ISO timestamp as UTC. SQLite stores naive UTC
// datetimes and serialises them without a trailing `Z`, which JavaScript would
// otherwise parse as local time — silently shifting the clock by the user's
// timezone offset and auto-firing the timer-expiry submit on first render.
function parseServerTimeAsUTC(s: string): number {
  if (!s) return Date.now()
  // Already has a timezone designator (Z or ±HH:MM)?
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s).getTime()
  // Naive datetime — treat as UTC.
  return new Date(s + 'Z').getTime()
}

// Single short beep using the WebAudio API — no asset to bundle, no autoplay
// blockers because it fires after a user gesture (Start) on the same page.
function playAlarm(frequencyHz: number, durationSec: number) {
  try {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequencyHz
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + durationSec)
    osc.onended = () => ctx.close().catch(() => {})
  } catch {
    // Audio is best-effort. The visual alarm + toast still fire.
  }
}

function RunningAttempt({
  attempt,
  courseId,
  totalPoints,
  examTitle,
  proctoringEnabled = false,
}: {
  attempt: AttemptStart
  courseId: string
  totalPoints: number
  examTitle?: string
  proctoringEnabled?: boolean
}) {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { selected: number[]; text: string }>>({})
  const submit = useSubmitAttempt()
  const submittedRef = useRef(false)
  const [resultId, setResultId] = useState<string | null>(null)
  const lastAlarmRef = useRef<number | null>(null)
  const [gridOpen, setGridOpen] = useState(false)
  const violationCountRef = useRef(0)
  const [violationCount, setViolationCount] = useState(0)
  const reportViolation = useReportViolation(attempt.id)
  const examShellRef = useRef<HTMLDivElement | null>(null)
  const MAX_VIOLATIONS = 5

  const onLockdownEvent = (e: LockdownEvent) => {
    // Server is the source of truth: it stamps the time, caps the log, and
    // the teacher review surface reads from here.
    reportViolation.mutate({ type: e.type, extra: e.extra })
    violationCountRef.current += 1
    setViolationCount(violationCountRef.current)
    const remaining = Math.max(0, MAX_VIOLATIONS - violationCountRef.current)
    const friendly: Record<LockdownEvent['type'], string> = {
      tab_blur: 'You switched away from the exam tab',
      tab_focus: 'Welcome back',
      visibility_hidden: 'Exam tab was hidden',
      fullscreen_exit: 'You exited fullscreen',
      fullscreen_enter: 'Fullscreen restored',
      copy_attempt: 'Copy is disabled during the exam',
      paste_attempt: 'Paste is disabled during the exam',
      cut_attempt: 'Cut is disabled during the exam',
      context_menu: 'Right-click is disabled during the exam',
      blocked_shortcut: 'That shortcut is disabled',
      devtools_suspected: 'Developer tools detected — close them',
      page_resized: 'Window size changed unexpectedly',
    }
    const message = friendly[e.type] || `Violation: ${e.type}`
    if (e.type === 'tab_focus' || e.type === 'fullscreen_enter') {
      // Recovery events are informational, not violations.
      toast.success(message)
      return
    }
    toast.warning(`${message} · ${remaining} warning${remaining === 1 ? '' : 's'} left`)
  }

  const lockdown = useLockdown(proctoringEnabled, onLockdownEvent, examShellRef)

  // Block accidental tab close / refresh while the exam is running.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (resultId) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [resultId])

  // Engage lockdown once on mount: try to put the page in fullscreen.
  useEffect(() => {
    if (!proctoringEnabled) return
    void lockdown.requestFullscreen()
  }, [proctoringEnabled, lockdown])

  // Anchor the countdown to the client's clock at mount. Computing it from
  // attempt.startedAt is fragile because SQLite stores naive UTC datetimes —
  // when the API serialises them without a `Z`, the browser parses them as
  // *local* time and a UTC+6 client ends up "6 hours in the past", which
  // immediately auto-submits the exam. We instead snapshot Date.now() once
  // and tick down from there. To still support reloading mid-attempt, we
  // parse startedAt defensively and only deduct the elapsed time if it's
  // within a sane range (between 0 and the full duration).
  const endMsRef = useRef<number>(0)
  if (endMsRef.current === 0) {
    const fullMs = attempt.durationMin * 60_000
    const startedMs = parseServerTimeAsUTC(attempt.startedAt)
    const elapsed = Date.now() - startedMs
    const safeElapsed = elapsed >= 0 && elapsed < fullMs ? elapsed : 0
    endMsRef.current = Date.now() + (fullMs - safeElapsed)
  }
  const endMs = endMsRef.current
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secondsLeft = Math.max(0, Math.floor((endMs - now) / 1000))

  const total = attempt.questions.length
  const q = attempt.questions[idx]!
  const answered = Object.keys(answers).filter((id) => {
    const a = answers[id]!
    return (a.selected && a.selected.length) || (a.text && a.text.trim())
  }).length
  const pct = Math.round((answered / Math.max(1, total)) * 100)
  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const ss = (secondsLeft % 60).toString().padStart(2, '0')
  const elapsedRatio = Math.min(1, Math.max(0, 1 - secondsLeft / Math.max(1, attempt.durationMin * 60)))
  // Bucket the timer into colour bands. Final-minute alarm pulses red and beeps once.
  const danger = secondsLeft <= 60
  const warn = !danger && elapsedRatio >= 0.75
  const caution = !danger && !warn && elapsedRatio >= 0.5
  const timerTextClass = danger
    ? 'text-rose-300'
    : warn
      ? 'text-amber-300'
      : caution
        ? 'text-yellow-200'
        : 'text-emerald-300'

  // Sound the last-minute alarm once and a tick-tock every second of the
  // final 10 seconds (alternating high/low for the classic clock cadence).
  const lastTickRef = useRef<number>(-1)
  useEffect(() => {
    if (secondsLeft === 60 && lastAlarmRef.current !== 60) {
      lastAlarmRef.current = 60
      playAlarm(880, 0.6)
      toast.warning('1 minute left — wrap up your answers')
    }
    if (secondsLeft <= 10 && secondsLeft > 0 && lastTickRef.current !== secondsLeft) {
      lastTickRef.current = secondsLeft
      // Even seconds = "tock" (low), odd seconds = "tick" (high).
      const isTock = secondsLeft % 2 === 0
      playAlarm(isTock ? 700 : 1400, 0.08)
    }
  }, [secondsLeft])

  const setSel = (qid: string, idxs: number[]) =>
    setAnswers((p) => ({ ...p, [qid]: { selected: idxs, text: p[qid]?.text ?? '' } }))
  const setText = (qid: string, text: string) =>
    setAnswers((p) => ({ ...p, [qid]: { selected: p[qid]?.selected ?? [], text } }))

  // `submittedRef` guards the in-flight call; it can be reset by a manual
  // retry. `autoFiredRef` is a one-shot latch for the timer-expiry effect —
  // once auto-submit has run (success OR failure), the timer effect can never
  // fire it again, which prevents the "Attempt already submitted" toast loop
  // we saw when the server replied 409 and the catch handler unset the guard.
  const autoFiredRef = useRef(false)

  const finish = useMemo(
    () => async (source: 'manual' | 'auto') => {
      if (submittedRef.current) return
      submittedRef.current = true
      try {
        const result = await submit.mutateAsync({
          attemptId: attempt.id,
          answers: attempt.questions.map((qq) => ({
            question_id: qq.id,
            selected: answers[qq.id]?.selected ?? [],
            text: answers[qq.id]?.text ?? '',
          })),
        })
        setResultId(result.id)
        toast.success(`Submitted — ${result.score}/${result.maxScore}`)
      } catch (err) {
        const msg = apiError(err, 'Submit failed')
        // 409 "Attempt already submitted" or "You have already attempted" mean
        // the server has the submission — there is nothing to retry. Route the
        // student to the result view using the attempt id we already have.
        if (/already (submitted|attempted)/i.test(msg)) {
          setResultId(attempt.id)
          return
        }
        // Real failure: allow a manual retry, but never let the timer fire it
        // again automatically.
        if (source === 'manual') submittedRef.current = false
        toast.error(msg)
      }
    },
    [attempt, answers, submit],
  )

  // Auto-submit on timer expiry. Three safeguards:
  //   1. armedRef only flips true after the first interval tick, so a buggy
  //      first-render `secondsLeft === 0` cannot fire the submit before the
  //      timer has actually run.
  //   2. autoFiredRef is a one-shot latch — once we've auto-submitted we
  //      never auto-submit again, no matter how the server replied.
  //   3. We require the duration to have been > 0 to begin with.
  const armedRef = useRef(false)
  useEffect(() => {
    if (attempt.durationMin <= 0) return
    if (!armedRef.current) {
      armedRef.current = true
      return
    }
    if (secondsLeft <= 0 && !autoFiredRef.current) {
      autoFiredRef.current = true
      void finish('auto')
    }
  }, [secondsLeft, finish, attempt.durationMin])

  // Auto-submit on too many proctoring violations.
  useEffect(() => {
    if (!proctoringEnabled) return
    if (violationCount >= MAX_VIOLATIONS && !autoFiredRef.current) {
      autoFiredRef.current = true
      toast.error(
        `${MAX_VIOLATIONS} integrity violations — your exam has been auto-submitted.`,
      )
      void finish('auto')
    }
  }, [violationCount, proctoringEnabled, finish])

  if (resultId) {
    return <StudentResultView attemptId={resultId} courseId={courseId} />
  }

  const isAnsweredAt = (i: number) => {
    const qid = attempt.questions[i]?.id
    if (!qid) return false
    return !!answers[qid]?.selected?.length || !!answers[qid]?.text?.trim()
  }

  const onLeave = () => {
    if (!confirm('Leave the exam? Unsaved answers will be lost. To save your work, submit instead.')) return
    navigate(`/app/courses/${courseId}/quizzes`)
  }

  // ─── Reused inside the sidebar (desktop) and the mobile drawer ────────────
  // Circular SVG timer ring — gives the exam window a professional dashboard feel.
  const ringR = 34
  const ringC = 2 * Math.PI * ringR
  const ringPct = Math.max(0, Math.min(1, 1 - elapsedRatio))
  const ringColor = danger
    ? '#fb7185' // rose
    : warn
      ? '#fbbf24' // amber
      : caution
        ? '#fde68a' // yellow
        : '#34d399' // emerald
  const ringGradientId = `timer-ring-grad-${danger ? 'd' : warn ? 'w' : caution ? 'c' : 's'}`

  const TimerBlock = (
    <div
      className={cn(
        'rounded-2xl px-3 py-4 transition-colors relative overflow-hidden',
        danger
          ? 'bg-gradient-to-br from-rose-500/30 to-rose-700/10 ring-2 ring-rose-500/50'
          : warn
            ? 'bg-gradient-to-br from-amber-400/20 to-amber-600/5 ring-1 ring-amber-400/40'
            : caution
              ? 'bg-gradient-to-br from-yellow-300/15 to-yellow-500/5 ring-1 ring-yellow-300/30'
              : 'bg-gradient-to-br from-emerald-400/15 to-emerald-600/5 ring-1 ring-emerald-400/30',
      )}
    >
      <div className="flex items-center gap-3">
        {/* Circular ring */}
        <div className="relative shrink-0">
          <svg width="84" height="84" viewBox="0 0 84 84" className="overflow-visible">
            <defs>
              <linearGradient id={ringGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={ringColor} stopOpacity="1" />
                <stop offset="100%" stopColor={ringColor} stopOpacity="0.55" />
              </linearGradient>
            </defs>
            <circle
              cx="42"
              cy="42"
              r={ringR}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-white/10"
            />
            <circle
              cx="42"
              cy="42"
              r={ringR}
              fill="none"
              stroke={`url(#${ringGradientId})`}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ringC}
              strokeDashoffset={ringC * (1 - ringPct)}
              transform="rotate(-90 42 42)"
              style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {danger ? (
              <AlertTriangle className="h-4 w-4 text-rose-300 animate-pulse-soft" />
            ) : (
              <Clock className="h-4 w-4 text-white/70" />
            )}
          </div>
        </div>

        {/* Time + label */}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {danger ? 'Time critical' : warn ? 'Hurry up' : 'Time left'}
          </div>
          <div className={cn('font-mono text-2xl tabular-nums font-semibold leading-none mt-1', timerTextClass)}>
            {mm}:{ss}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1.5">
            {attempt.durationMin}m total · {Math.round((1 - elapsedRatio) * 100)}% remaining
          </div>
        </div>
      </div>
    </div>
  )

  const ProgressBlock = (
    <div className="rounded-2xl glass px-3 py-3.5 hover:bg-white/[0.06] transition">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-md bg-[#00C8FF]/15 ring-1 ring-[#00C8FF]/30 flex items-center justify-center">
          <ListChecks className="h-3.5 w-3.5 text-[#00C8FF]" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Progress</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {pct}%
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-2xl font-semibold tabular-nums font-display">
          {answered}
        </div>
        <div className="text-sm text-muted-foreground tabular-nums">/ {total}</div>
        <div className="ml-auto text-[10px] text-muted-foreground">
          {totalPoints} pts max
        </div>
      </div>
      <div className="mt-2.5 relative h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#815AFF] via-[#FF46BE] to-[#00C8FF] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  )

  const QuestionGrid = (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-md bg-[#FF46BE]/15 ring-1 ring-[#FF46BE]/30 flex items-center justify-center">
          <LayoutGrid className="h-3.5 w-3.5 text-[#FF46BE]" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Questions</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {answered}/{total}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {attempt.questions.map((_, i) => {
          const isAnswered = isAnsweredAt(i)
          const isCurrent = i === idx
          return (
            <motion.button
              key={i}
              onClick={() => {
                setIdx(i)
                setGridOpen(false)
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                'relative aspect-square min-h-[36px] rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center',
                isCurrent
                  ? 'bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)] text-white shadow-[0_4px_14px_-4px_rgba(255,70,190,0.6)]'
                  : isAnswered
                    ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30'
                    : 'bg-white/5 text-muted-foreground ring-1 ring-white/10 hover:bg-white/10 hover:text-foreground',
              )}
              aria-label={`Go to question ${i + 1}${isAnswered ? ' (answered)' : ''}`}
            >
              {isCurrent && (
                <motion.span
                  layoutId="q-grid-current"
                  className="absolute inset-0 rounded-lg ring-2 ring-white/40 ring-pulse pointer-events-none"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                />
              )}
              {isAnswered && !isCurrent && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
              <span className="relative">{i + 1}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )

  const SubmitButton = (
    <GlassButton
      onClick={() => {
        if (answered < total) {
          if (!confirm(`You have ${total - answered} unanswered question(s). Submit anyway?`)) return
        }
        finish('manual')
      }}
      disabled={submit.isPending}
      className="w-full"
      size="lg"
    >
      {submit.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
      {submit.isPending ? 'Submitting…' : 'Submit exam'}
    </GlassButton>
  )

  return (
    <div
      ref={examShellRef}
      className={cn(
        'fixed inset-0 z-50 flex flex-col md:flex-row bg-[radial-gradient(ellipse_at_top_left,rgba(129,90,255,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(0,200,255,0.16),transparent_55%),linear-gradient(135deg,#0b0a1a_0%,#160a25_60%,#0a1825_100%)]',
        proctoringEnabled && 'select-none',
      )}
      style={proctoringEnabled ? { WebkitUserSelect: 'none', userSelect: 'none' } : undefined}
    >
      {/* Decorative grid + glow overlays — purely visual, click-through */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-20 -left-20 h-80 w-80 rounded-full bg-[#815AFF]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-[#FF46BE]/25 blur-3xl" />

      {/* ─── Lockdown banner ─── */}
      {proctoringEnabled && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center px-3 py-2 text-[10px] uppercase tracking-[0.18em] bg-gradient-to-r from-rose-500/20 via-rose-500/15 to-rose-500/20 backdrop-blur-md border-b border-rose-400/40 text-rose-100"
        >
          <AlertTriangle className="h-3 w-3 mr-1.5 animate-pulse-soft" />
          <span className="font-semibold">Lockdown active</span>
          <span className="mx-2 text-rose-200/60">·</span>
          <span className="text-rose-100/80">No copy/paste · No tab switching</span>
          {violationCount > 0 && (
            <span className="ml-3 font-mono px-1.5 py-0.5 rounded bg-rose-500/30 ring-1 ring-rose-300/40">
              {violationCount}/{MAX_VIOLATIONS}
            </span>
          )}
          {!lockdown.isFullscreen && (
            <button
              type="button"
              onClick={() => void lockdown.requestFullscreen()}
              className="ml-3 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/30 ring-1 ring-rose-300/40 hover:bg-rose-500/50 transition"
            >
              <Maximize2 className="h-2.5 w-2.5" />
              <span>Restore fullscreen</span>
            </button>
          )}
        </motion.div>
      )}

      {/* ─── Mobile top bar ─── */}
      <div className="md:hidden relative z-10 flex items-center gap-2 px-3 py-2.5 border-b border-white/10 backdrop-blur-md bg-black/30">
        <button
          onClick={onLeave}
          className="h-9 w-9 rounded-full glass inline-flex items-center justify-center active:scale-95 transition"
          aria-label="Leave exam"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <div
          className={cn(
            'flex-1 px-3 py-1.5 rounded-full text-center font-mono text-sm tabular-nums font-semibold',
            danger
              ? 'bg-gradient-to-r from-rose-500/30 to-rose-600/20 text-rose-100 ring-1 ring-rose-400/60 animate-pulse-soft'
              : warn
                ? 'bg-gradient-to-r from-amber-400/25 to-amber-500/10 text-amber-100 ring-1 ring-amber-300/40'
                : caution
                  ? 'bg-gradient-to-r from-yellow-300/20 to-yellow-500/10 text-yellow-100 ring-1 ring-yellow-300/30'
                  : 'bg-white/5 text-foreground ring-1 ring-white/10',
          )}
        >
          {mm}:{ss}
        </div>
        <button
          onClick={() => setGridOpen((v) => !v)}
          className={cn(
            'h-9 px-3 rounded-full glass inline-flex items-center gap-1.5 text-xs transition active:scale-95',
            gridOpen && 'bg-white/10',
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> {answered}/{total}
        </button>
        <GlassButton
          size="sm"
          onClick={() => {
            if (answered < total) {
              if (!confirm(`You have ${total - answered} unanswered question(s). Submit anyway?`)) return
            }
            finish('manual')
          }}
          disabled={submit.isPending}
        >
          {submit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Submit
        </GlassButton>
      </div>

      {/* ─── Mobile drawer (question grid) ─── */}
      <AnimatePresence>
        {gridOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="md:hidden relative z-10 overflow-hidden border-b border-white/10 backdrop-blur-md bg-black/30"
          >
            <div className="p-3">{QuestionGrid}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Desktop left rail ─── */}
      <aside className="hidden md:flex relative z-10 w-72 lg:w-80 flex-col gap-3 px-4 py-5 border-r border-white/10 backdrop-blur-xl bg-black/25 overflow-y-auto">
        <button
          onClick={onLeave}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition self-start group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Leave exam
        </button>

        {/* Exam title card */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl p-4 bg-[linear-gradient(135deg,rgba(129,90,255,0.30),rgba(255,70,190,0.22),rgba(0,200,255,0.22))] ring-1 ring-white/15 shadow-[0_8px_30px_-12px_rgba(129,90,255,0.5)] overflow-hidden"
        >
          <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 bg-dots opacity-20" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-white/20 ring-1 ring-white/30 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-semibold">
                Exam in progress
              </span>
            </div>
            <h1 className="font-display text-base font-semibold leading-tight text-white">
              {examTitle ?? 'Exam'}
            </h1>
          </div>
        </motion.div>

        {TimerBlock}
        {ProgressBlock}

        {/* Divider */}
        <div className="hairline-gradient my-1" />

        {QuestionGrid}

        <div className="mt-auto pt-3">{SubmitButton}</div>
      </aside>

      {/* ─── Main content ─── */}
      <main className="relative z-10 flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 md:px-8 py-5 md:py-8 pb-28 md:pb-12">
          {/* Section eyebrow */}
          <div className="hidden md:flex items-center gap-2 mb-4">
            <div className="section-eyebrow">
              <Target className="h-3 w-3" />
              Question {idx + 1} of {total}
            </div>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {pct}% complete · {totalPoints} pts max
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 14, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.99 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <GlassCard padding="lg" strong className="relative overflow-hidden">
                {/* Animated gradient top accent strip */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-[linear-gradient(90deg,#815AFF,#FF46BE,#00C8FF,#815AFF)] bg-[length:200%_100%] animate-[gradient_8s_ease_infinite]" />

                {/* Card meta row */}
                <div className="flex items-center gap-2 mb-4 flex-wrap pt-1">
                  <Badge variant="primary" className="font-mono">
                    Q{idx + 1}
                    <span className="opacity-50 mx-0.5">/</span>
                    {total}
                  </Badge>
                  <Badge variant={q.type === 'mcq_multi' ? 'info' : 'muted'}>
                    {labelForType(q.type)}
                  </Badge>
                  <Badge variant="muted">
                    <Target className="h-2.5 w-2.5 mr-0.5" />
                    {q.points} pts
                  </Badge>
                  {q.acceptsAttachment && (
                    <Badge variant="warning">
                      <Paperclip className="h-2.5 w-2.5" />
                      attachment
                    </Badge>
                  )}
                  {isAnsweredAt(idx) && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Answered
                    </motion.span>
                  )}
                </div>

                {/* Question body */}
                <div className="font-display text-lg md:text-xl leading-relaxed prose-chat prose prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {q.body}
                  </ReactMarkdown>
                </div>

                {q.hasImage && (
                  <div className="mt-4 rounded-xl overflow-hidden ring-1 ring-white/10">
                    <QuestionImage questionId={q.id} />
                  </div>
                )}

                {/* Divider */}
                <div className="my-6 hairline-gradient" />

                {/* Answer area */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Your answer
                    </span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground">
                      Choose one or more options
                    </span>
                  </div>
                  <QuestionInput
                    question={q}
                    selected={answers[q.id]?.selected ?? []}
                    text={answers[q.id]?.text ?? ''}
                    onSelect={(s) => setSel(q.id, s)}
                    onText={(t) => setText(q.id, t)}
                  />
                </div>

                {q.acceptsAttachment && (
                  <AttachmentDock attemptId={attempt.id} questionId={q.id} />
                )}
              </GlassCard>
            </motion.div>
          </AnimatePresence>

          {/* Prev / Next nav — keeps current question count visible */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-5 flex items-center justify-between gap-2"
          >
            <GlassButton
              variant="glass"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="group"
            >
              <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              Previous
            </GlassButton>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF46BE]" />
              <span className="text-xs text-muted-foreground tabular-nums font-medium">
                {idx + 1} of {total}
              </span>
            </div>
            {idx === total - 1 ? (
              <GlassButton
                onClick={() => {
                  if (answered < total) {
                    if (!confirm(`You have ${total - answered} unanswered question(s). Submit anyway?`)) return
                  }
                  finish('manual')
                }}
                disabled={submit.isPending}
                className="group"
              >
                {submit.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                )}
                Submit
              </GlassButton>
            ) : (
              <GlassButton
                onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                className="group"
              >
                Next
                <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </GlassButton>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Question input — adapts to the question type
// ─────────────────────────────────────────────────────

function QuestionInput({
  question,
  selected,
  text,
  onSelect,
  onText,
}: {
  question: Question
  selected: number[]
  text: string
  onSelect: (s: number[]) => void
  onText: (t: string) => void
}) {
  const t = question.type
  if (t === 'mcq_single' || t === 'true_false') {
    const opts = t === 'true_false' && (!question.options || question.options.length === 0)
      ? ['True', 'False']
      : question.options ?? []
    return (
      <>
        {opts.map((opt, i) => {
          const on = selected[0] === i
          return (
            <OptionRow
              key={i}
              label={String.fromCharCode(65 + i)}
              text={opt}
              selected={on}
              onClick={() => onSelect([i])}
            />
          )
        })}
      </>
    )
  }
  if (t === 'mcq_multi') {
    return (
      <>
        {(question.options ?? []).map((opt, i) => {
          const on = selected.includes(i)
          return (
            <OptionRow
              key={i}
              label={on ? '✓' : String.fromCharCode(65 + i)}
              text={opt}
              selected={on}
              onClick={() =>
                onSelect(on ? selected.filter((j) => j !== i) : [...selected, i])
              }
            />
          )
        })}
      </>
    )
  }
  if (t === 'short_answer') {
    return (
      <GlassTextarea
        rows={2}
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Type your answer…"
      />
    )
  }
  if (t === 'code') {
    return (
      <GlassTextarea
        rows={8}
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="// Write your code here"
        className="font-mono text-xs"
      />
    )
  }
  // essay
  return (
    <GlassTextarea
      rows={6}
      value={text}
      onChange={(e) => onText(e.target.value)}
      placeholder="Write your essay answer (manually graded)…"
    />
  )
}

// ─────────────────────────────────────────────────────
// Attachment uploader for written answers (paper photos, scanned PDFs)
// ─────────────────────────────────────────────────────

function AttachmentDock({
  attemptId,
  questionId,
}: {
  attemptId: string
  questionId: string
}) {
  const { data: existing } = useAttemptAttachments(attemptId)
  const upload = useUploadAttachment()
  const del = useDeleteAttachment()
  const [staged, setStaged] = useState<AttemptAttachment[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Combine server-known + just-uploaded attachments, scoped to this question.
  const all = [...(existing ?? []), ...staged].filter(
    (a, i, arr) => arr.findIndex((x) => x.id === a.id) === i,
  )
  const forQuestion = all.filter((a) => a.questionId === questionId)

  const onPick = () => inputRef.current?.click()

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      try {
        const att = await upload.mutateAsync({ attemptId, questionId, file })
        setStaged((s) => [...s, att])
        toast.success(`Uploaded ${att.filename}`)
      } catch (err) {
        toast.error(apiError(err, 'Upload failed'))
      }
    }
  }

  const onRemove = async (att: AttemptAttachment) => {
    try {
      await del.mutateAsync({ attemptId, attachmentId: att.id })
      setStaged((s) => s.filter((x) => x.id !== att.id))
      toast.success('Attachment removed')
    } catch (err) {
      toast.error(apiError(err, 'Could not remove'))
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04] transition p-3.5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="h-6 w-6 rounded-md bg-[#FF46BE]/15 ring-1 ring-[#FF46BE]/30 flex items-center justify-center">
          <Paperclip className="h-3.5 w-3.5 text-[#FF46BE]" />
        </div>
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Attach paper / photo
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          PNG · JPG · WEBP · PDF · ≤ 10 MB
        </span>
      </div>
      {forQuestion.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {forQuestion.map((a) => (
            <motion.li
              key={a.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-xs glass rounded-lg px-2.5 py-2"
            >
              <div className="h-6 w-6 rounded-md bg-[#00C8FF]/15 ring-1 ring-[#00C8FF]/30 flex items-center justify-center shrink-0">
                <FileImage className="h-3.5 w-3.5 text-[#00C8FF]" />
              </div>
              <span className="truncate flex-1 font-medium">{a.filename}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {(a.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => onRemove(a)}
                className="h-6 w-6 rounded-md text-rose-300/80 hover:text-rose-100 hover:bg-rose-500/20 inline-flex items-center justify-center transition"
                aria-label="Remove attachment"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </motion.li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        onChange={onChange}
        multiple
        className="hidden"
      />
      <GlassButton
        type="button"
        variant="glass"
        size="sm"
        onClick={onPick}
        disabled={upload.isPending}
      >
        {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {upload.isPending ? 'Uploading…' : 'Upload file'}
      </GlassButton>
    </div>
  )
}

function OptionRow({
  label,
  text,
  selected,
  onClick,
}: {
  label: string
  text: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'group relative w-full text-left p-3.5 rounded-xl transition-all flex items-start gap-3 border overflow-hidden',
        selected
          ? 'border-transparent bg-[linear-gradient(120deg,rgba(129,90,255,0.20),rgba(255,70,190,0.18),rgba(0,200,255,0.10))] ring-2 ring-[#815AFF]/50 shadow-[0_8px_24px_-12px_rgba(129,90,255,0.6)]'
          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/15',
      )}
    >
      {selected && (
        <motion.span
          layoutId={`opt-glow-${label}`}
          className="absolute inset-0 pointer-events-none"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#815AFF] via-[#FF46BE] to-[#00C8FF]" />
        </motion.span>
      )}
      <span
        className={cn(
          'relative h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 transition-all',
          selected
            ? 'bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)] text-white shadow-md'
            : 'border border-white/20 text-muted-foreground group-hover:border-white/30 group-hover:text-foreground',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'relative text-sm leading-relaxed flex-1',
          selected && 'font-medium',
        )}
      >
        {text}
      </span>
      {selected && (
        <motion.span
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', bounce: 0.4, duration: 0.4 }}
          className="relative shrink-0 mt-1"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
        </motion.span>
      )}
    </motion.button>
  )
}

function labelForType(t: Question['type']) {
  switch (t) {
    case 'mcq_single':
      return 'Single choice'
    case 'mcq_multi':
      return 'Select all'
    case 'true_false':
      return 'True / False'
    case 'short_answer':
      return 'Short answer'
    case 'code':
      return 'Code'
    case 'essay':
      return 'Essay'
  }
}

// ─────────────────────────────────────────────────────
// Result view (student)
// ─────────────────────────────────────────────────────

function StudentResultView({
  attemptId,
  courseId,
  quizTitle,
}: {
  attemptId: string
  courseId: string
  quizTitle?: string
}) {
  const { data: attempt, isLoading } = useAttempt(attemptId)
  const { data: quiz } = useQuiz(attempt?.quizId)
  if (isLoading || !attempt) {
    return <Skeleton className="h-64 rounded-3xl" />
  }
  const pct = attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : 0
  const grade =
    pct >= 90 ? { label: 'Outstanding', color: 'emerald', icon: Trophy }
    : pct >= 75 ? { label: 'Strong', color: 'cyan', icon: Sparkles }
    : pct >= 60 ? { label: 'Passing', color: 'amber', icon: CheckCircle2 }
    : { label: 'Needs review', color: 'rose', icon: AlertTriangle }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link
        to={`/app/courses/${courseId}/quizzes`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition group"
      >
        <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
        Back to quizzes
      </Link>

      <div className="flex items-center gap-2">
        <div className="section-eyebrow">
          <Trophy className="h-3 w-3" /> Results
        </div>
        <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground">
          Submitted · {attempt.released ? 'Released' : 'Pending review'}
        </span>
      </div>

      <GlassCard strong padding="lg" className="relative overflow-hidden">
        {/* Celebratory orbs */}
        <div className="pointer-events-none absolute -top-20 -right-12 h-56 w-56 rounded-full bg-[#815AFF]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-[#00C8FF]/25 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full bg-[#FF46BE]/15 blur-3xl" />

        <div className="relative flex items-center gap-4 flex-wrap">
          {/* Score badge */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
            className="relative h-20 w-20 rounded-2xl flex items-center justify-center text-white text-2xl font-bold bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)] shadow-[0_10px_30px_-10px_rgba(255,70,190,0.6)] shrink-0"
          >
            {pct}%
            <div className="absolute inset-0 rounded-2xl ring-1 ring-white/30" />
          </motion.div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge variant={`${grade.color === 'emerald' ? 'success' : grade.color === 'rose' ? 'danger' : 'info'}` as 'success' | 'danger' | 'info'}>
                <grade.icon className="h-3 w-3" />
                {grade.label}
              </Badge>
              {!attempt.released && attempt.needsManualGrading && (
                <Badge variant="warning">Manual review pending</Badge>
              )}
            </div>
            <h2 className="font-display text-xl font-semibold">
              {quizTitle ?? quiz?.title ?? 'Quiz result'}
            </h2>
            <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {attempt.released
                ? `Final: ${attempt.score} / ${attempt.maxScore} (auto + manual marks merged)`
                : attempt.needsManualGrading
                  ? `${attempt.score} / ${attempt.maxScore} so far · pending teacher review for written answers`
                  : `You scored ${attempt.score} / ${attempt.maxScore}`}
            </div>
          </div>
        </div>

        {(attempt.autoMax || attempt.manualMax) ? (
          <div className="relative mt-5 grid sm:grid-cols-3 gap-2 text-[11px]">
            <div className="glass rounded-xl px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Auto-marked</div>
              <div className="font-mono text-base font-semibold tabular-nums">{attempt.autoScore ?? 0} / {attempt.autoMax ?? 0}</div>
            </div>
            <div className="glass rounded-xl px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Teacher-marked</div>
              <div className="font-mono text-base font-semibold tabular-nums">
                {attempt.manualScore ?? 0} / {attempt.manualMax ?? 0}
                {!attempt.released && (attempt.pendingManual ?? 0) > 0 && (
                  <span className="text-amber-300 ml-1.5 text-[10px]">· {attempt.pendingManual} pending</span>
                )}
              </div>
            </div>
            <div className="rounded-xl px-3 py-2.5 bg-[linear-gradient(135deg,rgba(129,90,255,0.18),rgba(255,70,190,0.12))] ring-1 ring-white/15">
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/70 mb-1">Merged total</div>
              <div className="font-mono text-base font-semibold tabular-nums">{attempt.score} / {attempt.maxScore}</div>
            </div>
          </div>
        ) : null}

        {attempt.released && attempt.teacherFeedback && (
          <div className="relative mt-4 glass rounded-xl px-3.5 py-3 text-xs border-l-2 border-[#FF46BE]">
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Teacher feedback</div>
            <p className="leading-relaxed">{attempt.teacherFeedback}</p>
          </div>
        )}
      </GlassCard>

      {/* Per-question breakdown */}
      <div className="space-y-3">
        {(quiz?.questions ?? []).map((q, i) => {
          const g = attempt.graded.find((x) => x.questionId === q.id)
          return (
            <ResultQuestionCard
              key={q.id}
              index={i}
              question={q}
              graded={g}
              attemptId={attempt.id}
            />
          )
        })}
      </div>
    </div>
  )
}

function ResultQuestionCard({
  index,
  question,
  graded,
  attemptId,
}: {
  index: number
  question: import('@/types').Question
  graded: import('@/types').GradedQuestion | undefined
  attemptId: string
}) {
  const correct = graded?.correct === true
  // Offer "why is this wrong?" only when there's actually something to explain.
  const wasWrong = !!graded && graded.auto && !correct
  const [explainOpen, setExplainOpen] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)

  const askWhy = async () => {
    setExplainOpen(true)
    if (explanation || explainLoading) return
    setExplainLoading(true)
    setExplainError(null)
    setExplanation('')
    try {
      await streamExplainWrong(attemptId, question.id, (delta) => {
        setExplanation((s) => s + delta)
      })
    } catch (err) {
      setExplainError(apiError(err, 'Could not generate explanation'))
    } finally {
      setExplainLoading(false)
    }
  }

  return (
    <GlassCard padding="md" className={cn(
      'relative overflow-hidden',
      correct && 'ring-1 ring-emerald-400/20',
      wasWrong && 'ring-1 ring-rose-400/20',
    )}>
      {correct && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
      )}
      {wasWrong && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-rose-400 to-transparent" />
      )}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge variant="default" className="font-mono">Q{index + 1}</Badge>
        {graded?.auto === false ? (
          <Badge variant="warning">manual review</Badge>
        ) : correct ? (
          <Badge variant="success">
            <CheckCircle2 className="h-2.5 w-2.5" /> correct
          </Badge>
        ) : (
          <Badge variant="danger">
            <XCircle className="h-2.5 w-2.5" /> incorrect
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums font-medium">
          {graded?.points ?? 0}
          <span className="opacity-50">/</span>
          {graded?.maxPoints ?? question.points} pts
        </span>
      </div>
      <div className="text-sm prose prose-invert prose-chat max-w-none leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
          {question.body}
        </ReactMarkdown>
      </div>
      {question.hasImage && (
        <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-white/10">
          <QuestionImage questionId={question.id} className="max-w-md" />
        </div>
      )}
      {graded?.explanation && (
        <div className="mt-3 text-[11px] text-muted-foreground border-l-2 border-[#00C8FF] pl-3 py-1 leading-relaxed">
          {graded.explanation}
        </div>
      )}
      {wasWrong && (
        <div className="mt-3">
          {!explainOpen ? (
            <button
              type="button"
              onClick={askWhy}
              className="group inline-flex items-center gap-1.5 rounded-full glass px-3.5 h-8 text-[11px] hover:bg-white/10 transition"
            >
              <Sparkles className="h-3 w-3 text-[#FF46BE] group-hover:rotate-12 transition-transform" />
              Why is this wrong?
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/10 bg-[linear-gradient(120deg,rgba(129,90,255,0.08),rgba(255,70,190,0.05),rgba(0,200,255,0.05))] p-3.5"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-md bg-[#FF46BE]/15 ring-1 ring-[#FF46BE]/30 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-[#FF46BE]" />
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  AI explanation
                </span>
                {explainLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                <button
                  type="button"
                  onClick={() => setExplainOpen(false)}
                  className="ml-auto text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>
              {explainError ? (
                <p className="text-[12px] text-rose-300">{explainError}</p>
              ) : (
                <div className="text-[12px] prose prose-invert prose-chat leading-relaxed max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {explanation || '_Asking the course AI…_'}
                  </ReactMarkdown>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </GlassCard>
  )
}

// ─────────────────────────────────────────────────────
// Teacher view — review the full quiz with answers
// ─────────────────────────────────────────────────────

function TeacherView({ quiz, courseId }: { quiz: import('@/types').Quiz; courseId: string }) {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link
        to={`/app/courses/${courseId}/quizzes`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition group"
      >
        <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
        Back to quizzes
      </Link>

      <div className="flex items-center gap-2">
        <div className="section-eyebrow">
          <Sparkles className="h-3 w-3" /> Teacher view
        </div>
        <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground">
          {quiz.questions?.length ?? 0} questions · {quiz.totalPoints} pts
        </span>
      </div>

      <GlassCard strong padding="lg" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-[#815AFF]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-[#00C8FF]/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <Badge variant="primary" className="mb-3">
              <Sparkles className="h-3 w-3" /> Teacher preview
            </Badge>
            <h2 className="font-display text-xl font-semibold leading-tight">
              {quiz.title}
            </h2>
            {quiz.description && (
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {quiz.description}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <GlassButton variant="glass" size="sm">
              <Edit3 className="h-3.5 w-3.5" /> Edit
            </GlassButton>
            <GlassButton variant="glass" size="sm">
              <Eye className="h-3.5 w-3.5" /> Submissions ({quiz.submissionCount})
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      <div className="space-y-3">
        {(quiz.questions ?? []).map((q, i) => (
          <GlassCard key={q.id} padding="md" className="hover:bg-white/[0.05] transition">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge variant="default" className="font-mono">Q{i + 1}</Badge>
              <Badge variant="info">{labelForType(q.type)}</Badge>
              <Badge variant="muted">
                <Target className="h-2.5 w-2.5 mr-0.5" />
                {q.points} pts
              </Badge>
              <span className="ml-auto text-[10px] text-muted-foreground">
                Question {i + 1} of {quiz.questions?.length ?? 0}
              </span>
            </div>
            <div className="prose prose-invert prose-chat text-sm leading-relaxed max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {q.body}
              </ReactMarkdown>
            </div>
            {q.hasImage && (
              <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-white/10">
                <QuestionImage questionId={q.id} className="max-w-md" />
              </div>
            )}
            {q.options && q.options.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {q.options.map((opt, oi) => {
                  const isCorrect = (q.correct as number[] | undefined)?.includes?.(oi)
                  return (
                    <li
                      key={oi}
                      className={cn(
                        'flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5',
                        isCorrect
                          ? 'bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-400/30'
                          : 'bg-white/[0.04] text-muted-foreground',
                      )}
                    >
                      <span className={cn(
                        'h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
                        isCorrect
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/10',
                      )}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {isCorrect && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {q.explanation && (
              <div className="mt-3 text-[11px] text-muted-foreground border-l-2 border-[#00C8FF] pl-3 py-1 leading-relaxed">
                {q.explanation}
              </div>
            )}
          </GlassCard>
        ))}
        {(!quiz.questions || quiz.questions.length === 0) && (
          <GlassCard padding="md" className="text-center text-xs text-muted-foreground">
            No questions yet — try drafting from materials.
          </GlassCard>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <GlassButton variant="destructive" size="sm">
          <Trash2 className="h-3.5 w-3.5" /> Delete quiz
        </GlassButton>
        <GlassButton size="sm">
          <Flag className="h-3.5 w-3.5" /> Publish
        </GlassButton>
      </div>
    </div>
  )
}
