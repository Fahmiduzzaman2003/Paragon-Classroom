import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpenCheck,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Flame,
  GraduationCap,
  Inbox as InboxIcon,
  Loader2,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { CourseCard } from '@/components/course/CourseCard'
import { DailyDose } from '@/components/dashboard/DailyDose'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  GlassModal,
  GlassModalContent,
  GlassModalDescription,
  GlassModalFooter,
  GlassModalHeader,
  GlassModalTitle,
} from '@/components/glass/GlassModal'
import { Label } from '@/components/ui/Label'
import { useAuthStore } from '@/stores/authStore'
import { useCourses, useCreateCourse, useJoinCourse } from '@/hooks/useCourses'
import { useGlobalCalendar } from '@/hooks/useCalendar'
import { apiError } from '@/lib/api'
import { cn } from '@/lib/utils'

export function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const firstName = user?.name.split(' ')[0] ?? 'there'
  const { data: courses = [], isLoading, isError } = useCourses()
  const { data: events = [] } = useGlobalCalendar()

  const [joinOpen, setJoinOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const now = Date.now()
  const upcoming = events
    .filter((e) => new Date(e.startAt).getTime() >= now - 24 * 60 * 60 * 1000)
    .slice(0, 5)
  const unread = courses.reduce((s, c) => s + c.unread, 0)
  const avgProgress =
    courses.length === 0
      ? 0
      : Math.round(courses.reduce((s, c) => s + (c.progress ?? 0), 0) / courses.length)

  return (
    <div className="max-w-[1400px] mx-auto pb-8">
      {/* Top row: greeting (left) + Daily Dose (right) — pairs the empty
          space the page used to leave above the fold with something useful. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="grid lg:grid-cols-[1fr_minmax(360px,460px)] gap-5 mb-5"
      >
        <div className="flex flex-col justify-center">
          <Badge variant="primary" className="mb-3 self-start">
            <Sparkles className="h-3 w-3" />
            Your dedicated AIs are ready
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Good {timeOfDay()}, <span className="text-gradient">{firstName}</span>.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {courses.length
              ? `You have ${courses.length} course${courses.length === 1 ? '' : 's'} — each with its own AI.`
              : 'Create or join your first course to meet your AI assistant.'}
          </p>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <GlassButton variant="glass" size="md" onClick={() => setJoinOpen(true)}>
              <Plus className="h-4 w-4" />
              Join course
            </GlassButton>
            {user?.role === 'teacher' && (
              <GlassButton size="md" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New course
              </GlassButton>
            )}
            <GlassButton asChild variant="ghost" size="md">
              <Link to="/app/exam/join">
                <BookOpenCheck className="h-4 w-4" />
                Join an exam
              </Link>
            </GlassButton>
          </div>
        </div>
        <DailyDose />
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Courses"
          value={courses.length.toString()}
          change={user?.role === 'teacher' ? 'you teach' : 'you are enrolled in'}
          icon={<GraduationCap className="h-4 w-4" />}
          tone="violet"
        />
        <StatCard
          label="Unread threads"
          value={unread.toString()}
          change="across your courses"
          icon={<InboxIcon className="h-4 w-4" />}
          tone="cyan"
        />
        <StatCard
          label="Avg. progress"
          value={`${avgProgress}%`}
          change={avgProgress === 0 ? 'start a course to grow this' : 'across your courses'}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="pink"
        />
        <StatCard
          label="Quiz streak"
          value="0"
          change="start a quiz to build it"
          icon={<Flame className="h-4 w-4" />}
          tone="amber"
          highlight
        />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <SectionHeader
            title="Your courses"
            hint="Each course has its own AI assistant."
            rightLabel={`${courses.length} total`}
          />
          {isLoading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[300px] rounded-3xl" />
              ))}
            </div>
          ) : isError ? (
            <GlassCard padding="lg" className="text-center">
              <p className="text-sm text-muted-foreground">Could not load courses — is the backend running?</p>
            </GlassCard>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {courses.map((c, i) => (
                <CourseCard key={c.id} course={c} index={i} />
              ))}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <GlassCard
                  hover
                  padding="none"
                  className="h-full min-h-[280px] flex flex-col items-center justify-center gap-2 text-center border-dashed border-white/15"
                >
                  <div className="h-11 w-11 rounded-2xl flex items-center justify-center bg-white/5">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div className="font-display text-sm font-semibold">
                    {user?.role === 'teacher' ? 'Create another course' : 'Join another course'}
                  </div>
                  <div className="text-[11px] text-muted-foreground px-6">
                    {user?.role === 'teacher'
                      ? 'Spin up a new classroom with its own dedicated AI.'
                      : 'Enter the 6-character code your teacher provides.'}
                  </div>
                  <GlassButton
                    size="sm"
                    variant="glass"
                    className="mt-2"
                    onClick={() => (user?.role === 'teacher' ? setCreateOpen(true) : setJoinOpen(true))}
                  >
                    {user?.role === 'teacher' ? 'New course' : 'Enter code'}
                  </GlassButton>
                </GlassCard>
              </motion.div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <GlassCard padding="md">
            <SectionHeader title="Upcoming this week" icon={<Calendar className="h-4 w-4" />} />
            {upcoming.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                Nothing scheduled — quizzes and assignments show up here.
              </p>
            )}
            <ul className="space-y-2 mt-1">
              {upcoming.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition"
                >
                  <div className="h-10 w-10 rounded-xl bg-white/5 flex flex-col items-center justify-center leading-none shrink-0">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      {new Date(e.startAt).toLocaleString('en-US', { month: 'short' })}
                    </span>
                    <span className="text-sm font-semibold">
                      {new Date(e.startAt).getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{e.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(e.startAt).toLocaleString('en-US', {
                        weekday: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <Badge
                    variant={
                      e.type === 'quiz' ? 'danger' : e.type === 'assignment' ? 'warning' : 'info'
                    }
                  >
                    {e.type}
                  </Badge>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard padding="md">
            <SectionHeader
              title="Announcements"
              icon={<CheckCircle2 className="h-4 w-4" />}
              rightLabel={courses.length ? `${courses.length} courses` : undefined}
            />
            {courses.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                Join a course to see announcements here.
              </p>
            )}
            <ul className="space-y-2 mt-1">
              {courses.slice(0, 3).map((c) => (
                <li
                  key={c.id}
                  className="p-3 rounded-xl bg-white/5 border border-white/5"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="h-5 w-5 rounded-md text-[10px] font-bold flex items-center justify-center text-white"
                      style={{
                        background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]}, ${c.gradient[2]})`,
                      }}
                    >
                      {c.aiName.split(' ')[0]?.[0]}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {c.aiName}
                    </span>
                  </div>
                  <div className="text-xs font-semibold">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {c.description}
                  </div>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard
            padding="md"
            className="relative overflow-hidden"
          >
            <div
              className="absolute inset-0 opacity-60 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 20% 0%, rgba(129,90,255,0.3), transparent 60%), radial-gradient(circle at 80% 100%, rgba(0,200,255,0.28), transparent 60%)',
              }}
            />
            <div className="relative">
              <SectionHeader title="Pro tip" icon={<TrendingUp className="h-4 w-4" />} />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload a PDF to any course's <span className="text-foreground font-semibold">Materials</span>{' '}
                tab and, within a minute, your course AI can answer questions about it — with
                page-level citations.
              </p>
              {courses.length > 0 && (
                <Link
                  to={`/app/courses/${courses[0]!.id}/chat`}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                >
                  Open {courses[0]!.aiName} <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      <JoinCourseModal open={joinOpen} onOpenChange={setJoinOpen} />
      <CreateCourseModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function timeOfDay() {
  const h = new Date().getHours()
  if (h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

type StatTone = 'violet' | 'cyan' | 'pink' | 'amber'

const STAT_TONES: Record<StatTone, { ring: string; chip: string; glow: string }> = {
  violet: {
    ring: 'ring-1 ring-[#815AFF]/25',
    chip: 'bg-[#815AFF]/15 text-[#cbb6ff] ring-1 ring-[#815AFF]/30',
    glow: 'bg-[radial-gradient(circle,rgba(129,90,255,0.45)_0%,transparent_70%)]',
  },
  cyan: {
    ring: 'ring-1 ring-[#00C8FF]/25',
    chip: 'bg-[#00C8FF]/12 text-[#9be7ff] ring-1 ring-[#00C8FF]/30',
    glow: 'bg-[radial-gradient(circle,rgba(0,200,255,0.45)_0%,transparent_70%)]',
  },
  pink: {
    ring: 'ring-1 ring-[#FF46BE]/25',
    chip: 'bg-[#FF46BE]/15 text-[#ffb3df] ring-1 ring-[#FF46BE]/30',
    glow: 'bg-[radial-gradient(circle,rgba(255,70,190,0.45)_0%,transparent_70%)]',
  },
  amber: {
    ring: 'ring-1 ring-amber-400/25',
    chip: 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30',
    glow: 'bg-[radial-gradient(circle,rgba(251,191,36,0.45)_0%,transparent_70%)]',
  },
}

function StatCard({
  label,
  value,
  change,
  icon,
  tone = 'violet',
  highlight,
}: {
  label: string
  value: string
  change: string
  icon?: React.ReactNode
  tone?: StatTone
  highlight?: boolean
}) {
  const t = STAT_TONES[tone]
  return (
    <GlassCard padding="md" hover className={cn('relative overflow-hidden', t.ring)}>
      <div className={cn('absolute -top-6 -right-6 h-24 w-24 rounded-full', t.glow, !highlight && 'opacity-60')} />
      <div className="relative flex items-start gap-3">
        {icon && (
          <div
            className={cn(
              'h-9 w-9 rounded-xl inline-flex items-center justify-center shrink-0',
              t.chip,
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-0.5 font-display text-2xl font-semibold leading-none tabular-nums">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-1 truncate">{change}</div>
        </div>
      </div>
    </GlassCard>
  )
}

function SectionHeader({
  title,
  hint,
  icon,
  rightLabel,
}: {
  title: string
  hint?: string
  icon?: React.ReactNode
  rightLabel?: string
}) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-display font-semibold text-sm">{title}</h2>
        </div>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {rightLabel && (
        <span className="text-[10px] text-muted-foreground">{rightLabel}</span>
      )}
    </div>
  )
}

function JoinCourseModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [code, setCode] = useState('')
  const join = useJoinCourse()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const course = await join.mutateAsync(code.trim().toUpperCase())
      toast.success(`Joined ${course.name}`)
      onOpenChange(false)
      setCode('')
    } catch (err) {
      toast.error(apiError(err, 'Could not join course'))
    }
  }
  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="sm">
        <GlassModalHeader>
          <GlassModalTitle>Join a course</GlassModalTitle>
          <GlassModalDescription>
            Enter the 6-character code your teacher shared (it looks like PRG-XXXXXX).
          </GlassModalDescription>
        </GlassModalHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Course code</Label>
            <GlassInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="PRG-XXXXXX"
              autoFocus
              required
            />
          </div>
          <GlassModalFooter>
            <GlassButton
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </GlassButton>
            <GlassButton type="submit" disabled={join.isPending || !code.trim()}>
              {join.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Join
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}

const PALETTE: string[][] = [
  ['#815AFF', '#FF46BE', '#00C8FF'],
  ['#FF46BE', '#FF8A3D', '#FFD66B'],
  ['#00C8FF', '#78FFD2', '#815AFF'],
  ['#78FFD2', '#00C8FF', '#815AFF'],
]

function CreateCourseModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [name, setName] = useState('')
  const [aiName, setAiName] = useState('')
  const [description, setDescription] = useState('')
  const [semester, setSemester] = useState('')
  const [personality, setPersonality] = useState('')
  const [paletteIdx, setPaletteIdx] = useState(0)
  const create = useCreateCourse()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const course = await create.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        semester: semester.trim(),
        ai_name: aiName.trim() || `${name.trim().split(' ')[0] ?? 'Course'} AI`,
        ai_personality: personality.trim(),
        gradient: PALETTE[paletteIdx]!.join(','),
      })
      toast.success(`Course created · code ${course.code}`)
      onOpenChange(false)
      setName('')
      setAiName('')
      setDescription('')
      setSemester('')
      setPersonality('')
    } catch (err) {
      toast.error(apiError(err, 'Could not create course'))
    }
  }

  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="lg">
        <GlassModalHeader>
          <GlassModalTitle>Create a course</GlassModalTitle>
          <GlassModalDescription>
            Name the class and give its dedicated AI a personality. Students join with a
            6-character code.
          </GlassModalDescription>
        </GlassModalHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Course name</Label>
              <GlassInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Data Structures"
                required
                autoFocus
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Semester</Label>
              <GlassInput
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                placeholder="Spring 2026"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Description</Label>
              <GlassTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Arrays, lists, trees, graphs…"
                rows={2}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">AI assistant name</Label>
              <GlassInput
                value={aiName}
                onChange={(e) => setAiName(e.target.value)}
                placeholder="DS AI"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Accent</Label>
              <div className="flex items-center gap-2 h-11">
                {PALETTE.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPaletteIdx(i)}
                    className={`h-8 w-8 rounded-lg ring-2 transition ${paletteIdx === i ? 'ring-white/90' : 'ring-white/10'}`}
                    style={{
                      background: `linear-gradient(135deg, ${p[0]}, ${p[1]}, ${p[2]})`,
                    }}
                    aria-label={`Palette ${i + 1}`}
                  />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">AI personality (optional)</Label>
              <GlassTextarea
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="A focused, patient tutor. Prefers step-by-step derivations."
                rows={2}
              />
            </div>
          </div>
          <GlassModalFooter>
            <GlassButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </GlassButton>
            <GlassButton type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create course
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}
