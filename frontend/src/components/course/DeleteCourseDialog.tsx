import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import {
  GlassModal,
  GlassModalContent,
  GlassModalDescription,
  GlassModalFooter,
  GlassModalHeader,
  GlassModalTitle,
} from '@/components/glass/GlassModal'
import { Label } from '@/components/ui/Label'
import { useDeleteCourse } from '@/hooks/useCourses'
import { apiError } from '@/lib/api'
import type { Course } from '@/types'

interface Props {
  course: Course
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Fired after a successful delete — e.g. to navigate away from the course. */
  onDeleted?: () => void
}

/**
 * Type-the-name confirmation for an irreversible course delete. Shared by the
 * dashboard card menu and the course Overview danger zone.
 */
export function DeleteCourseDialog({ course, open, onOpenChange, onDeleted }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const del = useDeleteCourse()
  const canDelete = confirmText.trim() === course.name

  const change = (v: boolean) => {
    onOpenChange(v)
    if (!v) setConfirmText('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canDelete) return
    try {
      await del.mutateAsync(course.id)
      toast.success(`Deleted ${course.name}`)
      change(false)
      onDeleted?.()
    } catch (err) {
      toast.error(apiError(err, 'Could not delete course'))
    }
  }

  return (
    <GlassModal open={open} onOpenChange={change}>
      <GlassModalContent size="sm">
        <GlassModalHeader>
          <GlassModalTitle>Delete {course.name}?</GlassModalTitle>
          <GlassModalDescription>
            {course.studentCount} enrolled student{course.studentCount === 1 ? '' : 's'} will
            lose access immediately, along with all materials, quizzes, attempts and grades.
            There is no undo.
          </GlassModalDescription>
        </GlassModalHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">
              Type <span className="font-semibold text-foreground">{course.name}</span> to confirm
            </Label>
            <GlassInput
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={course.name}
              autoFocus
            />
          </div>
          <GlassModalFooter>
            <GlassButton type="button" variant="ghost" onClick={() => change(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              type="submit"
              variant="destructive"
              disabled={!canDelete || del.isPending}
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete permanently
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}
