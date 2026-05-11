import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Lock, User as UserIcon, ArrowRight, GraduationCap, Users } from 'lucide-react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Label } from '@/components/ui/Label'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { apiError } from '@/lib/api'

export function Register() {
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [institution, setInstitution] = useState('')
  const [loading, setLoading] = useState(false)
  const register = useAuthStore((s) => s.register)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        institution: institution.trim() || undefined,
      })
      toast.success(`Account created — signed in as ${role}`)
      navigate('/app')
    } catch (err) {
      toast.error(apiError(err, 'Could not create account'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-7xl mx-auto w-full px-6 pt-6 flex items-center justify-between">
        <Link to="/">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <GlassCard strong padding="lg">
            <h1 className="font-display text-2xl font-semibold">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              One account, every course. Pick your role — you can always switch later.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <RoleChip
                active={role === 'student'}
                icon={<GraduationCap className="h-4 w-4" />}
                label="Student"
                desc="Join courses, chat, take quizzes"
                onClick={() => setRole('student')}
              />
              <RoleChip
                active={role === 'teacher'}
                icon={<Users className="h-4 w-4" />}
                label="Teacher"
                desc="Build courses, upload, grade"
                onClick={() => setRole('teacher')}
              />
            </div>

            <form onSubmit={submit} className="mt-5 space-y-3">
              <div>
                <Label className="mb-1.5 block">Full name</Label>
                <GlassInput
                  placeholder="Fahmid Uzzaman"
                  leadingIcon={<UserIcon className="h-4 w-4" />}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Email</Label>
                <GlassInput
                  type="email"
                  placeholder="you@university.edu"
                  leadingIcon={<Mail className="h-4 w-4" />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Password</Label>
                <GlassInput
                  type="password"
                  placeholder="At least 8 characters"
                  leadingIcon={<Lock className="h-4 w-4" />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Institution (optional)</Label>
                <GlassInput
                  placeholder="Paragon University"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>
              <GlassButton type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? 'Creating…' : 'Create account'}
                <ArrowRight className="h-4 w-4" />
              </GlassButton>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-5">
              Already have an account?{' '}
              <Link to="/login" className="text-foreground underline-offset-2 hover:underline">
                Sign in
              </Link>
            </p>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  )
}

function RoleChip({
  active,
  icon,
  label,
  desc,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-2xl p-3 border transition-all',
        active
          ? 'ring-gradient bg-white/10 border-transparent shadow-[0_8px_24px_-12px_rgba(129,90,255,0.6)]'
          : 'glass hover:bg-white/10',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center">
          {icon}
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="text-[11px] text-muted-foreground leading-snug">{desc}</div>
    </button>
  )
}
