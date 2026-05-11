import { useOutletContext } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus, Download, Loader2 } from 'lucide-react'
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
import { useCourseCalendar, useCreateEvent, useDeleteEvent } from '@/hooks/useCalendar'
import { useAuthStore } from '@/stores/authStore'
import { apiError } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { CalendarEvent, Course } from '@/types'

interface Props {
  courseId?: string
  events?: CalendarEvent[]
  isTeacher?: boolean
}

export function CourseCalendar({ courseId: courseIdProp, events: eventsProp, isTeacher: isTeacherProp }: Props = {}) {
  // Pull course context if available (when nested under CourseLayout)
  let outletCourse: Course | undefined
  try {
    outletCourse = useOutletContext<{ course: Course }>()?.course
  } catch {
    outletCourse = undefined
  }
  const courseId = courseIdProp ?? outletCourse?.id
  const user = useAuthStore((s) => s.user)
  const isTeacher =
    isTeacherProp ?? (outletCourse ? user?.id === outletCourse.teacherId || user?.role === 'admin' : false)

  const fetched = useCourseCalendar(courseId)
  const events = eventsProp ?? fetched.data ?? []
  const isLoading = !eventsProp && fetched.isLoading

  const [cursor, setCursor] = useState(() => new Date())
  const { grid, monthLabel } = useMemo(() => buildGrid(cursor), [cursor])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = new Date(e.startAt).toDateString()
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return map
  }, [events])

  const step = (n: number) =>
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() + n, 1))

  const [createOpen, setCreateOpen] = useState(false)

  return (
    <GlassCard padding="md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GlassButton variant="glass" size="icon-sm" onClick={() => step(-1)} aria-label="Previous month">
            <ChevronLeft className="h-3.5 w-3.5" />
          </GlassButton>
          <h2 className="font-display text-lg font-semibold min-w-[140px] text-center">
            {monthLabel}
          </h2>
          <GlassButton variant="glass" size="icon-sm" onClick={() => step(1)} aria-label="Next month">
            <ChevronRight className="h-3.5 w-3.5" />
          </GlassButton>
        </div>
        <div className="flex items-center gap-2">
          <GlassButton
            variant="glass"
            size="sm"
            onClick={() => downloadIcs(events)}
            disabled={events.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> Export .ics
          </GlassButton>
          {courseId && isTeacher && (
            <GlassButton size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Event
            </GlassButton>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="h-[480px] skeleton rounded-xl" />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="px-2 py-1 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              const isCurrentMonth = d.getMonth() === cursor.getMonth()
              const key = d.toDateString()
              const dayEvents = eventsByDay.get(key) ?? []
              const isToday = d.toDateString() === new Date().toDateString()
              return (
                <motion.div
                  key={key + i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.004 }}
                  className={cn(
                    'min-h-[88px] rounded-xl p-1.5 border text-[10px]',
                    isCurrentMonth
                      ? 'border-white/5 bg-white/[0.03]'
                      : 'border-transparent bg-white/[0.01] opacity-40',
                    isToday && 'ring-2 ring-[#815AFF]/60 bg-white/10',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'font-medium',
                        isToday && 'text-foreground',
                        !isCurrentMonth && 'text-muted-foreground',
                      )}
                    >
                      {d.getDate()}
                    </span>
                    {dayEvents.length > 2 && (
                      <span className="text-[9px] text-muted-foreground">
                        +{dayEvents.length - 2}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) => (
                      <Badge
                        key={e.id}
                        variant={
                          e.type === 'quiz'
                            ? 'danger'
                            : e.type === 'assignment'
                              ? 'warning'
                              : e.type === 'lecture'
                                ? 'info'
                                : 'default'
                        }
                        className="w-full truncate justify-start text-[9px]"
                      >
                        <span className="truncate">{e.title}</span>
                      </Badge>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </>
      )}

      {courseId && (
        <CreateEventModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          courseId={courseId}
        />
      )}
    </GlassCard>
  )
}

function buildGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return {
    grid: days,
    monthLabel: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  }
}

function downloadIcs(events: CalendarEvent[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paragon//Calendar//EN']
  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@paragon`)
    lines.push(`DTSTART:${toIcsDate(e.startAt)}`)
    lines.push(`DTEND:${toIcsDate(e.endAt)}`)
    lines.push(`SUMMARY:${escapeIcs(e.title)}`)
    if (e.description) lines.push(`DESCRIPTION:${escapeIcs(e.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'paragon-calendar.ics'
  link.click()
  URL.revokeObjectURL(url)
}

function toIcsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}
function escapeIcs(s: string) {
  return s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
}

function CreateEventModal({
  open,
  onOpenChange,
  courseId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  courseId: string
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [start, setStart] = useState(() =>
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  )
  const [end, setEnd] = useState(() =>
    new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString().slice(0, 16),
  )
  const [type, setType] = useState<CalendarEvent['type']>('lecture')
  const create = useCreateEvent(courseId)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
        type,
      })
      toast.success('Event added')
      onOpenChange(false)
    } catch (err) {
      toast.error(apiError(err, 'Could not create event'))
    }
  }
  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="md">
        <GlassModalHeader>
          <GlassModalTitle>New event</GlassModalTitle>
          <GlassModalDescription>
            Lectures, office hours, holidays — anything that should appear on the course calendar.
          </GlassModalDescription>
        </GlassModalHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Title</Label>
            <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label className="mb-1.5 block">Description</Label>
            <GlassTextarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Starts</Label>
              <GlassInput
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Ends</Label>
              <GlassInput
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Type</Label>
            <div className="flex gap-2 flex-wrap">
              {(['lecture', 'office_hours', 'custom'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs transition',
                    type === t
                      ? 'bg-[linear-gradient(120deg,#815AFF,#FF46BE)] text-white'
                      : 'glass text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <GlassModalFooter>
            <GlassButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </GlassButton>
            <GlassButton type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}

// Re-export for unused import warnings
void useDeleteEvent
