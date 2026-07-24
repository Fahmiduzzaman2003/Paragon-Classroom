import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  KeyRound,
  Loader2,
  ScanLine,
  ShieldCheck,
  Timer,
  FileText,
} from 'lucide-react'
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
      // Drop straight into the attempt page — the runner picks up the remaining
      // time off the server-recorded started_at when they hit Start.
      navigate(`/app/courses/${r.courseId}/quizzes/${r.quizId}`)
    } catch (err) {
      toast.error(apiError(err, 'Could not join exam'))
    }
  }

  return (
    <div className="max-w-5xl mx-auto pt-6 px-2 sm:px-0">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid lg:grid-cols-[1fr_auto] gap-6 items-stretch"
      >
        {/* Instruction column */}
        <GlassCard padding="lg" className="hairline-gradient">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-12 w-12 rounded-2xl grid place-items-center bg-gradient-to-br from-[#7C60F0] via-[#C03CDC] to-[#00C4F0] text-white shadow-[0_8px_24px_-6px_rgb(var(--accent-primary)/0.55)]">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <span className="section-eyebrow mb-1 inline-flex">
                <Timer className="h-3 w-3" />
                Exam room entry
              </span>
              <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">
                Join an exam
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter the code your teacher shared to enter the exam room.
              </p>
            </div>
          </div>

          <ul className="grid sm:grid-cols-3 gap-2 text-sm">
            {[
              { icon: ShieldCheck, t: 'One attempt' },
              { icon: Timer, t: 'Server timer' },
              { icon: FileText, t: 'Auto-grade on submit' },
            ].map(({ icon: Icon, t }) => (
              <li
                key={t}
                className="flex items-center gap-2 rounded-xl glass px-2.5 py-2 text-muted-foreground"
              >
                <Icon className="h-3.5 w-3.5 text-[rgb(var(--accent-primary))]" />
                <span className="text-foreground text-xs">{t}</span>
              </li>
            ))}
          </ul>

          <form onSubmit={onSubmit} className="mt-5">
            <div>
              <Label className="mb-1.5 block">Exam code</Label>
              <GlassInput
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="X7K2QA"
                className="font-mono tracking-[0.4em] text-center text-xl uppercase h-14"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-2 inline-flex items-center gap-1">
                <ScanLine className="h-3 w-3" />
                Codes are case-insensitive · letters and digits only
              </p>
            </div>
            <GlassButton type="submit" className="w-full mt-5" disabled={join.isPending}>
              {join.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Enter exam room
            </GlassButton>
          </form>
        </GlassCard>

        {/* Code helper / checklist */}
        <GlassCard padding="md" className="lg:w-80 hairline-gradient flex flex-col">
          <span className="section-eyebrow mb-3 self-start">Before you begin</span>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {[
              'Find a quiet, well-lit space.',
              'Close other tabs — focus matters.',
              'Have a stable internet connection.',
              'Have your student ID ready (if required).',
            ].map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="h-6 w-6 rounded-full bg-[rgb(var(--accent-primary)/0.16)] text-[rgb(var(--accent-primary))] grid place-items-center text-[11px] font-semibold shrink-0 border border-[rgb(var(--accent-primary)/0.30)]">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-5 text-[11px] text-muted-foreground/80">
            Trouble joining? Reach out to your teacher — they can re-issue a fresh code.
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}
