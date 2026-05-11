import { NavLink, Navigate, Outlet, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  FolderOpen,
  Sparkles,
  ClipboardList,
  BarChart3,
  Brain,
  Trophy,
  FileText,
  MessagesSquare,
  CalendarDays,
  Copy,
  Check,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useCourse } from '@/hooks/useCourses'
import { GlassCard } from '@/components/glass/GlassCard'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from 'sonner'

export function CourseLayout() {
  const { courseId } = useParams()
  const { data: course, isLoading, isError } = useCourse(courseId)
  const user = useAuthStore((s) => s.user)
  const [copied, setCopied] = useState(false)

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto pb-8">
        <Skeleton className="h-44 rounded-3xl mb-4" />
        <Skeleton className="h-10 rounded-full mb-5 max-w-3xl" />
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    )
  }

  if (isError || !course) return <Navigate to="/app" replace />

  const [a, b, c] = course.gradient
  const isTeacher = user?.id === course.teacherId || user?.role === 'admin'

  const tabs: Array<{ to: string; label: string; icon: React.ElementType; end?: boolean; hot?: boolean }> = [
    { to: `/app/courses/${course.id}`, label: 'Overview', icon: LayoutDashboard, end: true },
    { to: `/app/courses/${course.id}/materials`, label: 'Materials', icon: FolderOpen },
    { to: `/app/courses/${course.id}/chat`, label: course.aiName, icon: Sparkles, hot: true },
    { to: `/app/courses/${course.id}/quizzes`, label: 'Quizzes', icon: ClipboardList },
    { to: `/app/courses/${course.id}/study`, label: 'Study', icon: Brain },
    ...(isTeacher
      ? [{ to: `/app/courses/${course.id}/analytics`, label: 'Analytics', icon: BarChart3 }]
      : []),
    { to: `/app/courses/${course.id}/leaderboard`, label: 'Leaderboard', icon: Trophy },
    { to: `/app/courses/${course.id}/assignments`, label: 'Assignments', icon: FileText },
    { to: `/app/courses/${course.id}/forum`, label: 'Forum', icon: MessagesSquare },
    { to: `/app/courses/${course.id}/calendar`, label: 'Calendar', icon: CalendarDays },
  ]

  const copy = () => {
    navigator.clipboard.writeText(course.code)
    setCopied(true)
    toast.success('Course code copied')
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-8">
      <GlassCard padding="none" className="relative overflow-hidden mb-5">
        <div
          className="relative h-36 md:h-44 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${a} 0%, ${b} 50%, ${c} 100%)`,
          }}
        >
          <div
            className="absolute -top-16 -right-20 h-56 w-56 rounded-full blur-2xl opacity-60"
            style={{ background: c }}
          />
          <div
            className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full blur-2xl opacity-50"
            style={{ background: a }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />

          <div className="relative h-full flex flex-col md:flex-row items-start md:items-end justify-between p-5 md:p-6 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded-full bg-black/30 backdrop-blur-md border border-white/20 px-2.5 py-1 inline-flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-white" />
                  <span className="text-[11px] font-semibold text-white">{course.aiName}</span>
                </div>
                {course.semester && (
                  <Badge variant="default" className="bg-black/30 border-white/20 text-white">
                    {course.semester}
                  </Badge>
                )}
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-semibold text-white drop-shadow">
                {course.name}
              </h1>
              <p className="text-[12px] md:text-sm text-white/90 max-w-xl mt-0.5 line-clamp-2">
                {course.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-full bg-black/30 backdrop-blur-md border border-white/20 px-3 py-1.5 text-[11px] font-mono text-white hover:bg-black/40 transition"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {course.code}
              </button>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-black/30 backdrop-blur-md border border-white/20 px-3 py-1.5 text-[11px] text-white">
                <Users className="h-3 w-3" /> {course.studentCount}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <nav className="mb-5 overflow-x-auto">
        <div className="inline-flex min-w-full items-center gap-1 rounded-full glass p-1">
          {tabs.map(({ to, label, icon: Icon, end, hot }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                  isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="course-tab"
                      className="absolute inset-0 rounded-full bg-[linear-gradient(120deg,rgba(129,90,255,0.9),rgba(255,70,190,0.9))] shadow-[0_4px_14px_-4px_rgba(129,90,255,0.7)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 36 }}
                    />
                  )}
                  <Icon className="relative h-3.5 w-3.5" />
                  <span className="relative">{label}</span>
                  {hot && !isActive && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet context={{ course }} />
    </div>
  )
}
