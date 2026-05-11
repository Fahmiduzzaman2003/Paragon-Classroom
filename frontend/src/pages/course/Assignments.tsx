import { useOutletContext } from 'react-router-dom'
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Calendar,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  Upload,
  Trash2,
  Sparkles,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
import { Progress } from '@/components/ui/Progress'
import { Label } from '@/components/ui/Label'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useAssignments,
  useCreateAssignment,
  useGradeSubmission,
  useSubmissions,
  useSubmitAssignment,
} from '@/hooks/useAssignments'
import { useAuthStore } from '@/stores/authStore'
import { apiError } from '@/lib/api'
import { formatBytes, formatRelative } from '@/lib/utils'
import { toast } from 'sonner'
import type { Assignment, Course, Submission } from '@/types'

export function Assignments() {
  const { course } = useOutletContext<{ course: Course }>()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.id === course.teacherId || user?.role === 'admin'
  const { data: list = [], isLoading } = useAssignments(course.id)
  const [createOpen, setCreateOpen] = useState(false)
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Assignments</h2>
          <p className="text-xs text-muted-foreground">
            Submit text + attachments. Teacher grades with optional rubric.
          </p>
        </div>
        {isTeacher && (
          <GlassButton onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New assignment
          </GlassButton>
        )}
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <GlassCard padding="lg" className="text-center border-dashed border-white/10">
          <h3 className="font-display font-semibold">No assignments yet</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {isTeacher ? 'Create one to give students something to submit.' : 'Check back soon — your teacher hasn’t posted any yet.'}
          </p>
        </GlassCard>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <AssignmentCard
                assignment={a}
                onOpen={() => setActiveAssignment(a)}
              />
            </motion.div>
          ))}
        </div>
      )}

      <CreateAssignmentModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        courseId={course.id}
      />
      {activeAssignment && (
        <AssignmentDetailModal
          assignment={activeAssignment}
          onClose={() => setActiveAssignment(null)}
          isTeacher={isTeacher}
        />
      )}
    </div>
  )
}

function AssignmentCard({
  assignment,
  onOpen,
}: {
  assignment: Assignment
  onOpen: () => void
}) {
  const a = assignment
  const pct = Math.round((a.graded / Math.max(1, a.submissionCount)) * 100)
  const overdue = new Date(a.deadline).getTime() < Date.now() && a.status === 'open'
  return (
    <GlassCard padding="md" hover>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {a.status === 'open' && !overdue && (
              <Badge variant="success">
                <Check className="h-2.5 w-2.5" /> open
              </Badge>
            )}
            {overdue && (
              <Badge variant="danger">
                <AlertCircle className="h-2.5 w-2.5" /> overdue
              </Badge>
            )}
            {a.status === 'closed' && <Badge variant="default">closed</Badge>}
            {a.myGrade != null && (
              <Badge variant="primary">graded · {a.myGrade}/{a.maxPoints}</Badge>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {a.maxPoints} pts max
            </span>
          </div>
          <h3 className="font-display text-base font-semibold mt-1">{a.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground flex items-center gap-2">
        <Calendar className="h-3 w-3" />
        Due {formatRelative(a.deadline)} ·{' '}
        {new Date(a.deadline).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="glass rounded-xl px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Submissions</div>
          <div className="font-medium">{a.submissionCount}</div>
        </div>
        <div className="glass rounded-xl px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Graded</div>
          <div className="font-medium">{a.graded}/{a.submissionCount}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Grading progress</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <GlassButton size="sm" className="ml-auto" onClick={onOpen}>
          {a.mySubmissionId ? 'View submission' : 'Open'}
        </GlassButton>
      </div>
    </GlassCard>
  )
}

// ─────────────────────────────────────────────────────
// Create-assignment modal (teacher)
// ─────────────────────────────────────────────────────

function CreateAssignmentModal({
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
  const [maxPoints, setMaxPoints] = useState(50)
  const [deadline, setDeadline] = useState(() =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  )
  const create = useCreateAssignment(courseId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        deadline: new Date(deadline).toISOString(),
        max_points: maxPoints,
        rubric: [],
      })
      toast.success('Assignment posted')
      onOpenChange(false)
      setTitle('')
      setDescription('')
    } catch (err) {
      toast.error(apiError(err, 'Could not create assignment'))
    }
  }

  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="md">
        <GlassModalHeader>
          <GlassModalTitle>Create assignment</GlassModalTitle>
          <GlassModalDescription>
            Markdown is supported in the description. Add rubric later from the assignment view.
          </GlassModalDescription>
        </GlassModalHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Title</Label>
            <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label className="mb-1.5 block">Description</Label>
            <GlassTextarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Deadline</Label>
              <GlassInput
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Max points</Label>
              <GlassInput
                type="number"
                min={1}
                max={1000}
                value={maxPoints}
                onChange={(e) => setMaxPoints(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <GlassModalFooter>
            <GlassButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </GlassButton>
            <GlassButton type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Post
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}

// ─────────────────────────────────────────────────────
// Detail modal (student submission UI / teacher grading UI)
// ─────────────────────────────────────────────────────

function AssignmentDetailModal({
  assignment,
  onClose,
  isTeacher,
}: {
  assignment: Assignment
  onClose: () => void
  isTeacher: boolean
}) {
  return (
    <GlassModal open onOpenChange={(v) => !v && onClose()}>
      <GlassModalContent size="xl">
        <GlassModalHeader>
          <GlassModalTitle>{assignment.title}</GlassModalTitle>
          <GlassModalDescription>
            Due {new Date(assignment.deadline).toLocaleString()} · {assignment.maxPoints} pts max
          </GlassModalDescription>
        </GlassModalHeader>

        <div className="prose-chat text-sm max-h-44 overflow-auto rounded-xl glass p-3 mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {assignment.description || '_No description._'}
          </ReactMarkdown>
        </div>

        {isTeacher ? (
          <TeacherGrading assignment={assignment} />
        ) : (
          <StudentSubmit assignment={assignment} />
        )}

        <GlassModalFooter>
          <GlassButton variant="ghost" onClick={onClose}>
            Close
          </GlassButton>
        </GlassModalFooter>
      </GlassModalContent>
    </GlassModal>
  )
}

function StudentSubmit({ assignment }: { assignment: Assignment }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const submit = useSubmitAssignment(assignment.id)
  const { data: subs = [] } = useSubmissions(assignment.id)
  const mine = subs[0]

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await submit.mutateAsync({ text: text.trim(), files })
      toast.success('Submitted')
      setText('')
      setFiles([])
    } catch (err) {
      toast.error(apiError(err, 'Submit failed'))
    }
  }

  if (mine) {
    return (
      <div className="space-y-3">
        <div className="text-[11px] text-muted-foreground">Your submission · {formatRelative(mine.submittedAt)}{mine.isLate && ' · late'}</div>
        {mine.text && (
          <div className="prose-chat text-sm rounded-xl glass p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{mine.text}</ReactMarkdown>
          </div>
        )}
        {mine.files.length > 0 && (
          <ul className="text-xs space-y-1">
            {mine.files.map((f) => (
              <li key={f.path} className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> {f.filename}{' '}
                <span className="text-muted-foreground">({formatBytes(f.size)})</span>
              </li>
            ))}
          </ul>
        )}
        {mine.grade != null ? (
          <GlassCard padding="md" className="border-l-2 border-l-[#00C8FF]">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-[#00C8FF]" />
              <span className="text-sm font-semibold">
                Grade: {mine.grade}/{assignment.maxPoints}
              </span>
            </div>
            {mine.feedback && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{mine.feedback}</p>
            )}
          </GlassCard>
        ) : (
          <Badge variant="warning">Pending grade</Badge>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label className="mb-1.5 block">Your answer (markdown)</Label>
        <GlassTextarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div>
        <Label className="mb-1.5 block">Files (optional)</Label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-2xl border border-dashed border-white/15 glass p-4 text-center hover:bg-white/5 transition"
        >
          <Upload className="h-5 w-5 mx-auto mb-1" />
          {files.length === 0 ? (
            <div className="text-xs text-muted-foreground">Click to attach files</div>
          ) : (
            <div className="text-xs text-left">
              {files.map((f) => (
                <div key={f.name} className="flex items-center justify-between py-0.5">
                  <span className="truncate">{f.name}</span>
                  <span className="text-muted-foreground text-[10px]">{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </button>
      </div>
      <GlassButton type="submit" disabled={submit.isPending} className="w-full">
        {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Submit
      </GlassButton>
    </form>
  )
}

function TeacherGrading({ assignment }: { assignment: Assignment }) {
  const { data: subs = [], isLoading } = useSubmissions(assignment.id)
  const grade = useGradeSubmission(assignment.id)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ grade: number; feedback: string }>({
    grade: 0,
    feedback: '',
  })

  if (isLoading) return <Skeleton className="h-32 rounded-xl" />
  if (subs.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-6">
        No submissions yet.
      </div>
    )
  }

  const onGrade = async (s: Submission) => {
    try {
      await grade.mutateAsync({
        submissionId: s.id,
        grade: draft.grade,
        feedback: draft.feedback,
        rubric_scores: [],
      })
      toast.success(`Graded ${s.studentName}`)
      setEditing(null)
    } catch (err) {
      toast.error(apiError(err, 'Grading failed'))
    }
  }

  return (
    <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
      {subs.map((s) => (
        <GlassCard key={s.id} padding="md">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm font-semibold">{s.studentName}</span>
            {s.isLate && <Badge variant="danger">late</Badge>}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {formatRelative(s.submittedAt)}
            </span>
          </div>
          {s.text && (
            <div className="prose-chat text-xs rounded-lg bg-white/5 p-2 mb-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.text}</ReactMarkdown>
            </div>
          )}
          {s.files.length > 0 && (
            <ul className="text-[11px] space-y-0.5 mb-2">
              {s.files.map((f) => (
                <li key={f.path} className="flex items-center gap-2">
                  <FileText className="h-3 w-3" /> {f.filename}{' '}
                  <span className="text-muted-foreground">({formatBytes(f.size)})</span>
                </li>
              ))}
            </ul>
          )}
          {s.grade != null && editing !== s.id ? (
            <div className="flex items-center justify-between">
              <Badge variant="success">
                {s.grade}/{assignment.maxPoints}
              </Badge>
              <GlassButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft({ grade: s.grade ?? 0, feedback: s.feedback })
                  setEditing(s.id)
                }}
              >
                Edit
              </GlassButton>
            </div>
          ) : editing === s.id ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="shrink-0">Grade</Label>
                <GlassInput
                  type="number"
                  min={0}
                  max={assignment.maxPoints}
                  value={draft.grade}
                  onChange={(e) =>
                    setDraft({ ...draft, grade: Number(e.target.value) || 0 })
                  }
                />
                <span className="text-xs text-muted-foreground">/ {assignment.maxPoints}</span>
              </div>
              <GlassTextarea
                rows={2}
                value={draft.feedback}
                onChange={(e) => setDraft({ ...draft, feedback: e.target.value })}
                placeholder="Feedback (optional)"
              />
              <div className="flex gap-2 justify-end">
                <GlassButton size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </GlassButton>
                <GlassButton size="sm" disabled={grade.isPending} onClick={() => onGrade(s)}>
                  {grade.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save grade
                </GlassButton>
              </div>
            </div>
          ) : (
            <GlassButton
              size="sm"
              onClick={() => {
                setDraft({ grade: 0, feedback: '' })
                setEditing(s.id)
              }}
            >
              Grade
            </GlassButton>
          )}
        </GlassCard>
      ))}
    </div>
  )
}

// (Trash2 import retained for symmetry with other pages, even if unused here)
void Trash2
