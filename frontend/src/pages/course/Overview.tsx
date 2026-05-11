import { Link, useOutletContext } from 'react-router-dom'
import {
  Sparkles,
  ArrowRight,
  Clock,
  FolderOpen,
  MessagesSquare,
  ClipboardList,
  Trophy,
  FileText,
  CalendarDays,
  Megaphone,
} from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { useMaterials } from '@/hooks/useMaterials'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import { useCourseCalendar } from '@/hooks/useCalendar'
import { formatRelative } from '@/lib/utils'
import type { Course } from '@/types'

export function CourseOverview() {
  const { course } = useOutletContext<{ course: Course }>()
  const { data: materials = [] } = useMaterials(course.id)
  const { data: announcements = [] } = useAnnouncements(course.id)
  const { data: events = [] } = useCourseCalendar(course.id)
  const ready = materials.filter((m) => m.status === 'ready').length
  const processing = materials.filter((m) => m.status === 'processing').length
  const pinned = announcements.find((a) => a.pinned) ?? announcements[0]
  const now = Date.now()
  const upcoming = events
    .filter((e) => new Date(e.startAt).getTime() >= now - 24 * 60 * 60 * 1000)
    .slice(0, 4)

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-5">
        <GlassCard padding="lg" className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-90 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 10% 0%, rgba(129,90,255,0.25), transparent 55%), radial-gradient(circle at 100% 100%, rgba(0,200,255,0.22), transparent 55%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="h-14 w-14 rounded-2xl flex items-center justify-center text-white font-display text-xl font-bold shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${course.gradient[0]}, ${course.gradient[1]}, ${course.gradient[2]})`,
                }}
              >
                {course.aiName.split(' ')[0]?.[0]}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Sparkles className="h-3.5 w-3.5 text-foreground/80" />
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Dedicated course assistant
                  </span>
                </div>
                <h2 className="font-display text-xl font-semibold">
                  Ask <span className="text-gradient">{course.aiName}</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Trained on {ready} ready material{ready === 1 ? '' : 's'}
                  {processing > 0 ? ` · ${processing} ingesting` : ''}.
                </p>
              </div>
            </div>
            <Link
              to={`/app/courses/${course.id}/chat`}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_18px_-4px_rgba(129,90,255,0.55)] bg-[linear-gradient(120deg,#815AFF_0%,#FF46BE_55%,#00C8FF_100%)] hover:brightness-110 transition"
            >
              Open chat
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </GlassCard>

        <div>
          <h3 className="font-display text-sm font-semibold mb-2">Jump into</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <QuickCard
              to={`/app/courses/${course.id}/materials`}
              icon={<FolderOpen className="h-4 w-4" />}
              label="Materials"
              hint={`${materials.length} files`}
              gradient="from-violet-500/30 to-indigo-500/30"
            />
            <QuickCard
              to={`/app/courses/${course.id}/quizzes`}
              icon={<ClipboardList className="h-4 w-4" />}
              label="Quizzes"
              hint="coming in phase 3"
              gradient="from-pink-500/30 to-rose-500/30"
            />
            <QuickCard
              to={`/app/courses/${course.id}/assignments`}
              icon={<FileText className="h-4 w-4" />}
              label="Assignments"
              hint="coming soon"
              gradient="from-cyan-500/30 to-emerald-500/30"
            />
            <QuickCard
              to={`/app/courses/${course.id}/forum`}
              icon={<MessagesSquare className="h-4 w-4" />}
              label="Forum"
              hint="coming soon"
              gradient="from-emerald-500/30 to-cyan-500/30"
            />
            <QuickCard
              to={`/app/courses/${course.id}/leaderboard`}
              icon={<Trophy className="h-4 w-4" />}
              label="Leaderboard"
              hint="coming soon"
              gradient="from-amber-500/30 to-orange-500/30"
            />
            <QuickCard
              to={`/app/courses/${course.id}/calendar`}
              icon={<CalendarDays className="h-4 w-4" />}
              label="Calendar"
              hint={`${upcoming.length} upcoming`}
              gradient="from-indigo-500/30 to-blue-500/30"
            />
          </div>
        </div>

        {pinned && (
          <GlassCard padding="md" className="border-l-2 border-l-[#FF46BE]">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <Megaphone className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="primary">Pinned</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelative(pinned.createdAt)} · {pinned.authorName}
                  </span>
                </div>
                <h4 className="font-display font-semibold text-sm mt-1.5">{pinned.title}</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{pinned.body}</p>
              </div>
            </div>
          </GlassCard>
        )}

        <GlassCard padding="md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display text-sm font-semibold">Ingestion status</h3>
            <span className="text-xs text-muted-foreground">
              {ready}/{Math.max(materials.length, 1)} ready
            </span>
          </div>
          <Progress value={materials.length ? (ready / materials.length) * 100 : 0} />
          <p className="mt-3 text-[11px] text-muted-foreground">
            Upload materials to the course and {course.aiName} will index them automatically
            — answers will cite the exact page a claim came from.
          </p>
        </GlassCard>
      </div>

      <div className="space-y-4">
        <GlassCard padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4" />
            <h3 className="font-display text-sm font-semibold">Upcoming</h3>
          </div>
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <li key={e.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5">
                <div className="h-10 w-10 rounded-xl bg-white/5 flex flex-col items-center justify-center leading-none shrink-0">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                    {new Date(e.startAt).toLocaleString('en-US', { month: 'short' })}
                  </span>
                  <span className="text-sm font-semibold">{new Date(e.startAt).getDate()}</span>
                </div>
                <div className="flex-1 min-w-0">
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
            {upcoming.length === 0 && (
              <li className="text-[11px] text-muted-foreground">No upcoming events.</li>
            )}
          </ul>
        </GlassCard>

        <GlassCard padding="md">
          <h3 className="font-display text-sm font-semibold mb-1">About {course.aiName}</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {course.aiPersonality || 'A focused, patient assistant trained on this course.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="default">Per-course ChromaDB</Badge>
            <Badge variant="default">Hybrid retrieval</Badge>
            <Badge variant="default">Cited answers</Badge>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

function QuickCard({
  to,
  icon,
  label,
  hint,
  gradient,
}: {
  to: string
  icon: React.ReactNode
  label: string
  hint: string
  gradient: string
}) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl p-4 glass glass-hover relative overflow-hidden"
    >
      <div
        className={`pointer-events-none absolute -top-14 -right-14 h-32 w-32 rounded-full blur-2xl opacity-60 bg-gradient-to-br ${gradient}`}
      />
      <div className="relative flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
        </div>
        <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition" />
      </div>
    </Link>
  )
}
