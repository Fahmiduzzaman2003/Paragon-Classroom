import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowRight, GraduationCap, Sparkles, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Label } from '@/components/ui/Label'
import { useAuthStore } from '@/stores/authStore'
import { API_URL, apiError } from '@/lib/api'

// ─────────────────────────────────────────────────────
// Real Google "G" badge — used in the sign-in button
// ─────────────────────────────────────────────────────
function GoogleG({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 11v3.2h4.5c-.2 1.4-1.6 4-4.5 4-2.7 0-4.9-2.2-4.9-5s2.2-5 4.9-5c1.5 0 2.6.6 3.2 1.2l2.2-2.1C16 5.7 14.2 4.9 12 4.9 7.6 4.9 4 8.4 4 12.9s3.6 8 8 8c4.6 0 7.7-3.2 7.7-7.8 0-.5-.1-.9-.1-1.3H12z"
      />
      <path
        fill="#4285F4"
        d="M12 4.9c2.2 0 4 .8 5.4 2.4l-2.2 2.1c-.6-.6-1.7-1.2-3.2-1.2-2.7 0-4.9 2.2-4.9 5h-3c0-4.5 3.6-8 8-8z"
      />
      <path
        fill="#34A853"
        d="M12 20.9c-4.4 0-8-3.5-8-8h3c0 2.8 2.2 5 4.9 5 2.9 0 4.3-2.6 4.5-4h3.1c-.6 3.1-3.5 7-7.5 7z"
      />
      <path
        fill="#FBBC05"
        d="M20 12.9c0 .4-.1.8-.1 1.3h-3.4c.1-.4.1-.9.1-1.3 0-.5 0-.9-.1-1.3h3.5c0 .4 0 .9 0 1.3z"
      />
    </svg>
  )
}

interface GoogleLoginDescriptor {
  mode: 'redirect' | 'dev'
  authorization_url?: string
  message?: string
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleMode, setGoogleMode] = useState<'redirect' | 'dev' | null>(null)
  const [googleReady, setGoogleReady] = useState(false)
  const [showGoogleDev, setShowGoogleDev] = useState(false)
  const [googleEmail, setGoogleEmail] = useState('')
  const [googleName, setGoogleName] = useState('')
  const [googleBusy, setGoogleBusy] = useState(false)

  const login = useAuthStore((s) => s.login)
  const loginWithGoogleDev = useAuthStore((s) => s.loginWithGoogleDev)
  const navigate = useNavigate()

  // Detect Google OAuth mode (real redirect vs dev fallback)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await axios.get<GoogleLoginDescriptor>(
          `${API_URL}/auth/google/login`,
        )
        if (cancelled) return
        setGoogleMode(data.mode ?? null)
        setGoogleReady(true)
      } catch {
        if (!cancelled) setGoogleReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email.trim().toLowerCase(), password)
      toast.success('Welcome back')
      navigate('/app')
    } catch (err) {
      toast.error(apiError(err, 'Sign-in failed'))
    } finally {
      setLoading(false)
    }
  }

  const googleRedirect = async () => {
    if (googleMode !== 'redirect') return
    try {
      const { data } = await axios.get<GoogleLoginDescriptor>(
        `${API_URL}/auth/google/login`,
      )
      if (data.authorization_url) {
        window.location.href = data.authorization_url
      }
    } catch (err) {
      toast.error(apiError(err, 'Could not start Google sign-in'))
    }
  }

  const googleDevSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!googleEmail.trim()) return
    setGoogleBusy(true)
    try {
      await loginWithGoogleDev(googleEmail.trim().toLowerCase(), googleName.trim() || undefined)
      toast.success('Signed in with Google')
      navigate('/app')
    } catch (err) {
      toast.error(apiError(err, 'Google sign-in failed'))
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-7xl mx-auto w-full px-6 pt-6 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
        <Link to="/" className="press focus-ring rounded-xl">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex-1 grid lg:grid-cols-2 items-center px-4 sm:px-6 py-10 max-w-7xl mx-auto w-full gap-12">
        {/* Left: brand panel */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="hidden lg:flex flex-col gap-6"
        >
          <span className="section-eyebrow self-start">
            <Sparkles className="h-3 w-3" />
            Sign in to your classroom
          </span>
          <h1 className="font-display text-4xl xl:text-5xl font-bold tracking-tight leading-[1.05] text-balance">
            Continue learning with a{' '}
            <span className="text-gradient">course AI</span>{' '}
            that already read the syllabus.
          </h1>
          <p className="text-muted-foreground max-w-lg leading-relaxed">
            Pick up where you left off. Your dedicated course assistants have been
            studying — ask a question, jump into a quiz, or check what's due.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 max-w-lg mt-2">
            {[
              { icon: GraduationCap, t: 'Graded quizzes', s: 'Six question types, instant feedback' },
              { icon: ShieldCheck, t: 'Isolated by course', s: 'Your context never leaks across classes' },
            ].map(({ icon: Icon, t, s }) => (
              <div
                key={t}
                className="glass rounded-2xl p-3 hairline-gradient"
              >
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[rgb(var(--accent-primary)/0.18)] to-[rgb(var(--accent-tertiary)/0.18)] grid place-items-center text-[rgb(var(--accent-primary))] ring-1 ring-[rgb(var(--accent-primary)/0.25)] mb-2">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold">{t}</div>
                <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{s}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right: form card */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md mx-auto"
        >
          <GlassCard strong padding="lg" className="relative overflow-hidden hairline-gradient">
            <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(124,96,240,0.40)_0%,transparent_70%)]" />
            <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(192,60,220,0.30)_0%,transparent_70%)]" />
            <div className="relative">
              <span className="section-eyebrow lg:hidden mb-3 inline-flex">
                <Sparkles className="h-3 w-3" />
                Welcome back
              </span>
              <h1 className="font-display text-2xl lg:text-3xl font-bold">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Pick up where you left off. Your course AIs have been studying.
              </p>

              {/* Google sign-in — primary path */}
              {googleReady && googleMode && (
                <div className="mt-5">
                  {googleMode === 'redirect' ? (
                    <button
                      type="button"
                      onClick={googleRedirect}
                      className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-white/15 dark:border-white/10 bg-white text-slate-900 hover:bg-slate-50 dark:bg-white/95 dark:hover:bg-white shadow-sm press focus-ring py-2.5 font-medium text-sm transition"
                    >
                      <GoogleG className="h-5 w-5" />
                      Sign in with Google
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowGoogleDev((v) => !v)}
                      className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-white/15 dark:border-white/10 bg-white text-slate-900 hover:bg-slate-50 dark:bg-white/95 dark:hover:bg-white shadow-sm press focus-ring py-2.5 font-medium text-sm transition"
                    >
                      <GoogleG className="h-5 w-5" />
                      Sign in with Google (demo)
                    </button>
                  )}

                  {showGoogleDev && googleMode === 'dev' && (
                    <motion.form
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onSubmit={googleDevSubmit}
                      className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/5 dark:bg-white/[0.03] p-3 space-y-2"
                    >
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Real Google credentials aren't configured on this server.
                        Use this fallback to mint Paragon tokens for a chosen email —
                        perfect for offline demos and tests.
                      </p>
                      <GlassInput
                        placeholder="you@university.edu"
                        type="email"
                        value={googleEmail}
                        onChange={(e) => setGoogleEmail(e.target.value)}
                        leadingIcon={<Mail className="h-4 w-4" />}
                        required
                      />
                      <GlassInput
                        placeholder="Display name (optional)"
                        value={googleName}
                        onChange={(e) => setGoogleName(e.target.value)}
                      />
                      <GlassButton
                        type="submit"
                        className="w-full"
                        variant="ghost"
                        disabled={googleBusy}
                      >
                        {googleBusy ? 'Signing in…' : 'Continue with Google (demo)'}
                      </GlassButton>
                    </motion.form>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="flex-1 h-px bg-white/10" />
                or with email
                <span className="flex-1 h-px bg-white/10" />
              </div>

              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label htmlFor="email" className="mb-1.5 block">Email</Label>
                  <GlassInput
                    id="email"
                    type="email"
                    placeholder="you@university.edu"
                    leadingIcon={<Mail className="h-4 w-4" />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password" className="mb-1.5 flex items-center justify-between">
                    <span>Password</span>
                    <Link
                      to="/forgot-password"
                      className="text-muted-foreground hover:text-foreground transition normal-case"
                    >
                      Forgot?
                    </Link>
                  </Label>
                  <GlassInput
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    leadingIcon={<Lock className="h-4 w-4" />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <GlassButton type="submit" className="w-full mt-2" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                  <ArrowRight className="h-4 w-4" />
                </GlassButton>
              </form>

              <div className="mt-6 pt-5 border-t border-white/10 dark:border-white/5 text-center text-xs text-muted-foreground">
                New here?{' '}
                <Link to="/register" className="text-foreground underline-offset-2 hover:underline font-medium">
                  Create an account
                </Link>
              </div>
            </div>
          </GlassCard>

          <p className="text-center text-[11px] text-muted-foreground mt-4">
            By signing in, you agree to Paragon's acceptable-use guidelines.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
