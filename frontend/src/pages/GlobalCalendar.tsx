import { CourseCalendar } from './course/CourseCalendar'
import { useGlobalCalendar } from '@/hooks/useCalendar'

export function GlobalCalendar() {
  const { data = [] } = useGlobalCalendar()
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Calendar</h1>
        <p className="text-xs text-muted-foreground">
          All deadlines and events across your courses in one view.
        </p>
      </div>
      <CourseCalendar events={data} />
    </div>
  )
}
