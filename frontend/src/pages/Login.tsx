import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Label } from '@/components/ui/Label'
import { useAuthStore } from '@/stores/authStore'
import { apiError } from '@/lib/api'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

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
          <GlassCard strong padding="lg" className="relative overflow-hidden">
            <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(129,90,255,0.35)_0%,transparent_70%)]" />
            <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,70,190,0.25)_0%,transparent_70%)]" />

            <div className="relative">
              <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Pick up where you left off. Your course AIs have been studying.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-3">
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
                    <a href="#" className="text-muted-foreground hover:text-foreground transition normal-case">
                      Forgot?
                    </a>
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

              <p className="text-center text-xs text-muted-foreground mt-6">
                New here?{' '}
                <Link to="/register" className="text-foreground underline-offset-2 hover:underline">
                  Create an account
                </Link>
              </p>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  )
}
