import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  BookCheck,
  Clock,
  GraduationCap,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  BarChart,
  GaugeRing,
  HeatStrip,
  Histogram,
  LineChart,
} from '@/components/charts/Charts'
import {
  useAnalytics,
  useAnalyticsInsights,
  type AssignmentRow,
  type QuestionRow,
  type StudentRow,
} from '@/hooks/useAnalytics'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import type { Course } from '@/types'

export function Analytics() {
  const { course } = useOutletContext<{ course: Course }>()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.id === course.teacherId || user?.role === 'admin'

  const { data, isLoading, isError, refetch, isFetching } = useAnalytics(course.id)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const insights = useAnalyticsInsights(course.id, insightsOpen)

  if (!isTeacher) {
    return (
      <GlassCard padding="lg" className="text-center">
        <p className="text-sm text-muted-foreground">
          Analytics are visible only to the course teacher.
        </p>
      </GlassCard>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <GlassCard padding="lg" className="text-center">
        <p className="text-sm text-muted-foreground">Could not load analytics.</p>
        <GlassButton size="sm" className="mt-3" onClick={() => refetch()}>
          Retry
        </GlassButton>
      </GlassCard>
    )
  }

  const { overview, score_distribution: dist, students, questions, trends, assignments } = data

  return (
    <div className="space-y-5">
      <Header
        course={course}
        onRefresh={() => refetch()}
        refreshing={isFetching}
        onShowInsights={() => setInsightsOpen(true)}
      />

      <KpiGrid overview={overview} />

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <ScoreDistributionCard dist={dist} />
        <EngagementCard overview={overview} />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <QuizTrendCard points={trends.quiz_points} />
        <SubmissionsHeatCard daily={trends.submissions_by_day} />
      </div>

      <StudentsTable rows={students} />
      <QuestionsTable rows={questions} />
      <AssignmentsTable rows={assignments} />

      {insightsOpen && (
        <InsightsCard
          loading={insights.isLoading}
          summary={insights.data?.summary ?? ''}
          onClose={() => setInsightsOpen(false)}
          onRetry={() => insights.refetch()}
        />
      )}
    </div>
  )
}

function Header({
  course,
  onRefresh,
  refreshing,
  onShowInsights,
}: {
  course: Course
  onRefresh: () => void
  refreshing: boolean
  onShowInsights: () => void
}) {
  return (
    <GlassCard strong padding="lg" className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-20 -right-12 h-56 w-56 rounded-full bg-[#815AFF]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[#00C8FF]/25 blur-3xl" />
      <div className="relative flex items-center gap-3 flex-wrap">
        <div className="h-12 w-12 rounded-2xl bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)] flex items-center justify-center shadow-[0_8px_30px_-12px_rgba(255,70,190,0.6)]">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <Badge variant="primary" className="mb-1">
            <Sparkles className="h-3 w-3" /> Class analytics
          </Badge>
          <h1 className="font-display text-xl md:text-2xl font-semibold leading-tight">
            {course.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cohort performance, question quality, engagement, and at-risk learners
            — all in one view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GlassButton size="sm" variant="glass" onClick={onShowInsights}>
            <Sparkles className="h-3.5 w-3.5 text-[#FF46BE]" /> AI insights
          </GlassButton>
          <GlassButton size="sm" variant="ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </GlassButton>
        </div>
      </div>
    </GlassCard>
  )
}

// ─────────────────────────────────────────────────────
// KPI cards
// ─────────────────────────────────────────────────────

function KpiGrid({ overview: o }: { overview: ReturnType<typeof useAnalytics>['data'] extends infer X ? X extends { overview: infer Y } ? Y : never : never }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        label="Students"
        value={o.students_enrolled}
        sub={`${o.active_7d} active 7d`}
        icon={<Users className="h-4 w-4" />}
        tone="violet"
      />
      <KpiCard
        label="Class avg"
        value={`${o.avg_class_pct}%`}
        sub={`±${o.stddev_class_pct} sd · median ${o.median_class_pct}%`}
        icon={<TrendingUp className="h-4 w-4" />}
        tone="cyan"
      />
      <KpiCard
        label="Submission rate"
        value={`${o.submission_rate_pct}%`}
        sub={`${o.total_attempts} attempts on ${o.total_quizzes} quizzes`}
        icon={<BookCheck className="h-4 w-4" />}
        tone="pink"
      />
      <KpiCard
        label="To grade"
        value={o.assignments_to_grade + o.pending_manual_review}
        sub={`${o.pending_manual_review} exams · ${o.assignments_to_grade} assignments`}
        icon={<Clock className="h-4 w-4" />}
        tone={o.assignments_to_grade + o.pending_manual_review > 0 ? 'amber' : 'emerald'}
      />
      <KpiCard
        label="Inactive 14d+"
        value={o.inactive_14d_plus}
        sub={`${o.stale_7_14d} stale (7–14d)`}
        icon={<AlertTriangle className="h-4 w-4" />}
        tone={o.inactive_14d_plus > 0 ? 'rose' : 'emerald'}
      />
      <KpiCard
        label="AI engagement"
        value={o.chat_messages_total}
        sub={`${o.avg_chat_per_student} msgs / student`}
        icon={<MessageSquare className="h-4 w-4" />}
        tone="violet"
      />
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string
  value: string | number
  sub: string
  icon: React.ReactNode
  tone: 'violet' | 'cyan' | 'pink' | 'amber' | 'emerald' | 'rose'
}) {
  const ring =
    tone === 'cyan'
      ? 'ring-1 ring-[#00C8FF]/25'
      : tone === 'pink'
        ? 'ring-1 ring-[#FF46BE]/25'
        : tone === 'amber'
          ? 'ring-1 ring-amber-400/30'
          : tone === 'emerald'
            ? 'ring-1 ring-emerald-400/25'
            : tone === 'rose'
              ? 'ring-1 ring-rose-400/30'
              : 'ring-1 ring-[#815AFF]/25'
  const chip =
    tone === 'cyan'
      ? 'bg-[#00C8FF]/12 text-[#9be7ff] ring-1 ring-[#00C8FF]/30'
      : tone === 'pink'
        ? 'bg-[#FF46BE]/15 text-[#ffb3df] ring-1 ring-[#FF46BE]/30'
        : tone === 'amber'
          ? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/30'
          : tone === 'emerald'
            ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30'
            : tone === 'rose'
              ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30'
              : 'bg-[#815AFF]/15 text-[#cbb6ff] ring-1 ring-[#815AFF]/30'
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      <GlassCard padding="md" hover className={cn('relative overflow-hidden', ring)}>
        <div className="flex items-start gap-3">
          <div className={cn('h-9 w-9 rounded-xl inline-flex items-center justify-center shrink-0', chip)}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="font-display text-xl font-semibold tabular-nums">{value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────
// Score distribution
// ─────────────────────────────────────────────────────

function ScoreDistributionCard({ dist }: { dist: ReturnType<typeof useAnalytics>['data'] extends infer X ? X extends { score_distribution: infer Y } ? Y : never : never }) {
  const bars = dist.histogram.map((b) => ({ label: b.bucket, value: b.count }))
  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-[#FF46BE]" />
        <h2 className="font-display font-semibold text-sm">Score distribution</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {dist.samples} students with submitted attempts
        </span>
      </div>
      {dist.samples === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No submitted attempts yet — once students submit, the distribution lights up.
        </p>
      ) : (
        <Histogram
          data={bars}
          mean={dist.mean}
          median={dist.median}
          formatXLabel={(s) => s.replace('-', '–')}
        />
      )}
    </GlassCard>
  )
}

// ─────────────────────────────────────────────────────
// Engagement panel
// ─────────────────────────────────────────────────────

function EngagementCard({ overview: o }: { overview: ReturnType<typeof useAnalytics>['data'] extends infer X ? X extends { overview: infer Y } ? Y : never : never }) {
  const total = o.students_enrolled || 1
  const activePct = (o.active_7d / total) * 100
  const stalePct = (o.stale_7_14d / total) * 100
  const inactivePct = (o.inactive_14d_plus / total) * 100
  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-[#00C8FF]" />
        <h2 className="font-display font-semibold text-sm">Engagement</h2>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="flex flex-col items-center">
          <GaugeRing pct={activePct} tone="emerald" label="active 7d" />
        </div>
        <div className="flex flex-col items-center">
          <GaugeRing pct={stalePct} tone="amber" label="stale" />
        </div>
        <div className="flex flex-col items-center">
          <GaugeRing pct={inactivePct} tone="rose" label="inactive" />
        </div>
      </div>
      <BarChart
        data={[
          { label: 'Submission rate', value: o.submission_rate_pct, sub: `${o.total_attempts} attempts on ${o.total_quizzes} quizzes` },
          { label: 'Assignments', value: o.total_assignments ? Math.min(100, (o.assignment_submissions / Math.max(1, o.total_assignments * o.students_enrolled)) * 100) : 0, sub: `${o.assignment_submissions} submissions` },
          { label: 'AI usage / student', value: Math.min(100, o.avg_chat_per_student * 5), sub: `${o.chat_messages_total} messages total` },
        ]}
        max={100}
        formatValue={(v) => `${Math.round(v)}%`}
      />
    </GlassCard>
  )
}

// ─────────────────────────────────────────────────────
// Quiz trend over time
// ─────────────────────────────────────────────────────

function QuizTrendCard({ points }: { points: ReturnType<typeof useAnalytics>['data'] extends infer X ? X extends { trends: { quiz_points: infer Y } } ? Y : never : never }) {
  const data = points.map((p) => ({
    label: p.title.slice(0, 14),
    value: p.mean,
    low: p.p25,
    high: p.p75,
  }))
  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-[#00C8FF]" />
        <h2 className="font-display font-semibold text-sm">Class average per quiz</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">
          shaded band = p25–p75
        </span>
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          No quiz attempts yet.
        </p>
      ) : (
        <LineChart data={data} ariaLabel="Class average per quiz" />
      )}
    </GlassCard>
  )
}

function SubmissionsHeatCard({ daily }: { daily: ReturnType<typeof useAnalytics>['data'] extends infer X ? X extends { trends: { submissions_by_day: infer Y } } ? Y : never : never }) {
  // Backfill missing days so the strip shows continuous time, last 30 days.
  const filled = useMemo(() => {
    const map = new Map(daily.map((d) => [d.date, d.count]))
    const out: { label: string; value: number }[] = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      const label = `${d.getMonth() + 1}/${d.getDate()}`
      out.push({ label, value: map.get(iso) ?? 0 })
    }
    return out
  }, [daily])
  const total = filled.reduce((s, d) => s + d.value, 0)
  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-[#FF46BE]" />
        <h2 className="font-display font-semibold text-sm">Submissions, last 30 days</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">{total} total</span>
      </div>
      <HeatStrip data={filled} />
    </GlassCard>
  )
}

// ─────────────────────────────────────────────────────
// Students table — risk-ranked
// ─────────────────────────────────────────────────────

function StudentsTable({ rows }: { rows: StudentRow[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'inactive'>('all')

  const filtered = rows.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q.toLowerCase()) || r.email.toLowerCase().includes(q.toLowerCase()))) return false
    if (filter === 'high' && r.risk_label !== 'high') return false
    if (filter === 'medium' && r.risk_label !== 'medium') return false
    if (filter === 'inactive' && (r.days_since_active ?? 0) < 14) return false
    return true
  })

  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <GraduationCap className="h-4 w-4 text-[#815AFF]" />
        <h2 className="font-display font-semibold text-sm">Students</h2>
        <span className="text-[10px] text-muted-foreground">
          {filtered.length} / {rows.length}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterPill>
          <FilterPill active={filter === 'high'} onClick={() => setFilter('high')} tone="rose">
            At risk
          </FilterPill>
          <FilterPill active={filter === 'medium'} onClick={() => setFilter('medium')} tone="amber">
            Watch
          </FilterPill>
          <FilterPill active={filter === 'inactive'} onClick={() => setFilter('inactive')} tone="rose">
            Inactive 14d+
          </FilterPill>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <GlassInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="pl-7 h-8 text-xs w-44"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/10">
              <th className="py-2 pr-2 text-left font-medium">Student</th>
              <th className="py-2 pr-2 text-right font-medium">Avg %</th>
              <th className="py-2 pr-2 text-right font-medium">Quizzes</th>
              <th className="py-2 pr-2 text-right font-medium">Coverage</th>
              <th className="py-2 pr-2 text-right font-medium">Late</th>
              <th className="py-2 pr-2 text-right font-medium">Last seen</th>
              <th className="py-2 pr-2 text-right font-medium">Risk</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.user_id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-7 w-7 rounded-full bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-[10px] font-bold shrink-0"
                      aria-hidden
                    >
                      {r.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{r.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">
                  <span className={cn(
                    r.avg_pct >= 75 ? 'text-emerald-300' : r.avg_pct >= 60 ? 'text-foreground' : r.avg_pct > 0 ? 'text-amber-300' : 'text-muted-foreground',
                  )}>
                    {r.avg_pct ? `${r.avg_pct.toFixed(0)}%` : '—'}
                  </span>
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">{r.attempts_count}</td>
                <td className="py-2 pr-2 text-right">
                  <Coverage pct={r.quiz_coverage_pct} />
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">
                  {r.late_count > 0 ? <span className="text-amber-300">{r.late_count}</span> : '—'}
                </td>
                <td className="py-2 pr-2 text-right">
                  <LastSeen days={r.days_since_active} />
                </td>
                <td className="py-2 pr-2 text-right">
                  <RiskBadge label={r.risk_label} score={r.risk_score} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted-foreground text-[11px]">
                  No students match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

function FilterPill({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean
  tone?: 'rose' | 'amber'
  onClick: () => void
  children: React.ReactNode
}) {
  const activeClass =
    tone === 'rose'
      ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
      : tone === 'amber'
        ? 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/40'
        : 'bg-[linear-gradient(120deg,#815AFF,#FF46BE,#00C8FF)] text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 h-7 rounded-full text-[11px] font-medium transition',
        active ? activeClass : 'glass text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Coverage({ pct }: { pct: number }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="h-1 w-12 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-[linear-gradient(90deg,#815AFF,#00C8FF)]"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
        {Math.round(pct)}%
      </span>
    </div>
  )
}

function LastSeen({ days }: { days: number | null }) {
  if (days === null) return <span className="text-[10px] text-rose-300">never</span>
  if (days === 0) return <span className="text-[10px] text-emerald-300">today</span>
  if (days < 7) return <span className="text-[10px] text-foreground">{days}d</span>
  if (days < 14) return <span className="text-[10px] text-amber-300">{days}d</span>
  return <span className="text-[10px] text-rose-300">{days}d</span>
}

function RiskBadge({ label, score }: { label: 'low' | 'medium' | 'high'; score: number }) {
  const cls =
    label === 'high'
      ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/40'
      : label === 'medium'
        ? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/40'
        : 'bg-emerald-500/12 text-emerald-200 ring-1 ring-emerald-400/30'
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 h-5 rounded-full text-[10px] font-medium', cls)}>
      <span className="font-mono tabular-nums">{score}</span>
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────
// Per-question table
// ─────────────────────────────────────────────────────

function QuestionsTable({ rows }: { rows: QuestionRow[] }) {
  const [filter, setFilter] = useState<'all' | 'review' | 'easy' | 'good'>('all')
  const filtered = rows.filter((r) => {
    if (filter === 'review' && r.flag !== 'review') return false
    if (filter === 'easy' && r.flag !== 'too easy') return false
    if (filter === 'good' && r.flag !== 'good') return false
    return true
  })
  if (rows.length === 0) {
    return (
      <GlassCard padding="md">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-[#FF46BE]" />
          <h2 className="font-display font-semibold text-sm">Question quality</h2>
        </div>
        <p className="text-xs text-muted-foreground py-6 text-center">
          No graded questions yet.
        </p>
      </GlassCard>
    )
  }
  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Target className="h-4 w-4 text-[#FF46BE]" />
        <h2 className="font-display font-semibold text-sm">Question quality</h2>
        <span className="text-[10px] text-muted-foreground">
          difficulty = % correct · discrimination = correlation with overall score
        </span>
        <div className="ml-auto flex items-center gap-2">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterPill>
          <FilterPill active={filter === 'review'} onClick={() => setFilter('review')} tone="rose">
            Confusing
          </FilterPill>
          <FilterPill active={filter === 'easy'} onClick={() => setFilter('easy')} tone="amber">
            Too easy
          </FilterPill>
          <FilterPill active={filter === 'good'} onClick={() => setFilter('good')}>
            Strong
          </FilterPill>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/10">
              <th className="py-2 pr-2 text-left font-medium">Question</th>
              <th className="py-2 pr-2 text-left font-medium">Quiz</th>
              <th className="py-2 pr-2 text-right font-medium">N</th>
              <th className="py-2 pr-2 text-right font-medium">Difficulty</th>
              <th className="py-2 pr-2 text-right font-medium">Discrim.</th>
              <th className="py-2 pr-2 text-right font-medium">Flag</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.question_id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="py-2 pr-2 max-w-[360px]">
                  <div className="line-clamp-2">{r.body}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{r.type} · {r.points} pts</div>
                </td>
                <td className="py-2 pr-2 truncate max-w-[140px]">
                  <span className="text-muted-foreground">{r.quiz_title}</span>
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">{r.n_responses}</td>
                <td className="py-2 pr-2 text-right">
                  <DiffBar value={r.difficulty} />
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">
                  <span className={cn(
                    r.discrimination >= 0.3
                      ? 'text-emerald-300'
                      : r.discrimination >= 0.1
                        ? 'text-foreground'
                        : 'text-amber-300',
                  )}>
                    {r.discrimination.toFixed(2)}
                  </span>
                </td>
                <td className="py-2 pr-2 text-right">
                  <FlagPill flag={r.flag} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

function DiffBar({ value }: { value: number }) {
  // value is 0..1 — display as % correct. Color tone: low=hard (rose), high=easy (amber).
  const pct = Math.round(value * 100)
  const tone = value < 0.4 ? 'rose' : value > 0.85 ? 'amber' : 'cyan'
  const fill = tone === 'rose' ? 'bg-rose-400' : tone === 'amber' ? 'bg-amber-300' : 'bg-cyan-300'
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="h-1 w-16 rounded-full bg-white/5 overflow-hidden">
        <div className={cn('h-full', fill)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums w-9 text-right">{pct}%</span>
    </div>
  )
}

function FlagPill({ flag }: { flag: 'good' | 'ok' | 'review' | 'too easy' }) {
  const cls =
    flag === 'good'
      ? 'bg-emerald-500/12 text-emerald-200 ring-1 ring-emerald-400/30'
      : flag === 'review'
        ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/40'
        : flag === 'too easy'
          ? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/40'
          : 'bg-white/5 text-muted-foreground ring-1 ring-white/10'
  return (
    <span className={cn('inline-flex items-center px-2 h-5 rounded-full text-[10px]', cls)}>
      {flag}
    </span>
  )
}

// ─────────────────────────────────────────────────────
// Assignments table
// ─────────────────────────────────────────────────────

function AssignmentsTable({ rows }: { rows: AssignmentRow[] }) {
  if (rows.length === 0) {
    return null
  }
  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <BookCheck className="h-4 w-4 text-[#00C8FF]" />
        <h2 className="font-display font-semibold text-sm">Assignments</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/10">
              <th className="py-2 pr-2 text-left font-medium">Title</th>
              <th className="py-2 pr-2 text-right font-medium">Submitted</th>
              <th className="py-2 pr-2 text-right font-medium">Graded</th>
              <th className="py-2 pr-2 text-right font-medium">Avg</th>
              <th className="py-2 pr-2 text-right font-medium">Late</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.assignment_id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="py-2 pr-2 truncate max-w-[260px]">
                  <div className="font-medium truncate">{r.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Due {new Date(r.deadline).toLocaleDateString()} · {r.max_points} pts
                  </div>
                </td>
                <td className="py-2 pr-2 text-right">
                  <Coverage pct={r.submission_rate_pct} />
                  <div className="text-[9px] text-muted-foreground mt-0.5 font-mono">
                    {r.submission_count} subs
                  </div>
                </td>
                <td className="py-2 pr-2 text-right">
                  <Coverage pct={r.grading_progress_pct} />
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">
                  {r.avg_grade ? r.avg_grade.toFixed(1) : '—'}
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">
                  {r.late_count > 0 ? (
                    <span className="text-amber-300">
                      {r.late_count} ({Math.round(r.late_rate_pct)}%)
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

// ─────────────────────────────────────────────────────
// AI insights drawer
// ─────────────────────────────────────────────────────

function InsightsCard({
  loading,
  summary,
  onClose,
  onRetry,
}: {
  loading: boolean
  summary: string
  onClose: () => void
  onRetry: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-2 bottom-2 md:inset-x-auto md:right-4 md:bottom-4 md:w-[400px] z-40"
    >
      <GlassCard strong padding="md" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-12 -right-8 h-32 w-32 rounded-full bg-[#FF46BE]/30 blur-3xl" />
        <div className="relative flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-[#FF46BE]" />
          <h3 className="font-display font-semibold text-sm">AI insights</h3>
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
        <div className="relative max-h-[60vh] overflow-y-auto pr-1 prose-chat text-xs leading-relaxed">
          {loading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : summary ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground">No summary available.</p>
          )}
        </div>
      </GlassCard>
    </motion.div>
  )
}
