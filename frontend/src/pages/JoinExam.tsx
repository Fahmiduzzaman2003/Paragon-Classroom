import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, KeyRound, Loader2, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { Label } from '@/components/ui/Label'
import { useJoinExam } from '@/hooks/useQuizzes'
import { apiError } from '@/lib/api'

export function JoinExam() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const join = useJoinExam()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = code.trim().toUpperCase()
    if (cleaned.length < 4) {
      toast.error('Codes are at least 4 characters')
      return
    }
    try {
      const r = await join.mutateAsync(cleaned)
      toast.success(`Joining "${r.title}"`)
      // Drop straight into the attempt page — RunningAttempt will pick up the
      // remaining time off the server-recorded started_at when they hit Start.
      navigate(`/app/courses/${r.courseId}/quizzes/${r.quizId}`)
    } catch (err) {
      toast.error(apiError(err, 'Could not join exam'))
    }
  }

  return (
    <div className="max-w-md mx-auto pt-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <GlassCard padding="lg" strong>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)]">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold">Join an exam</h1>
              <p className="text-xs text-muted-foreground">
                Enter the code your teacher shared to start the exam.
              </p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label className="mb-1.5 block">Exam code</Label>
              <GlassInput
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="X7K2QA"
                className="font-mono tracking-[0.4em] text-center text-lg uppercase"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
                <ScanLine className="h-3 w-3" /> Codes are case-insensitive · letters and digits
                only
              </p>
            </div>
            <GlassButton type="submit" className="w-full" disabled={join.isPending}>
              {join.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Enter exam room
            </GlassButton>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  )
}
