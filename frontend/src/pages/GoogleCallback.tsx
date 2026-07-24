import { useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/glass/GlassCard'
import { Logo } from '@/components/layout/Logo'
import { useAuthStore } from '@/stores/authStore'
import { apiError } from '@/lib/api'

/**
 * Google OAuth redirect landing page.
 *
 * Flow:
 *   1. User clicks "Sign in with Google" on /login
 *   2. Backend redirects browser to Google with a `state` nonce
 *   3. Google redirects back to /auth/google/callback?code=...&state=...
 *   4. This page extracts the code + state, posts them to the backend,
 *      receives Paragon tokens, and forwards the user to /app.
 *
 * If the backend is in dev-fallback mode, the OAuth step never happens — this
 * page will simply show an error explaining that, with a link back to /login.
 */
export function GoogleCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const code = params.get('code')
    const state = params.get('state')
    const err = params.get('error')
    if (err) {
      toast.error(`Google sign-in cancelled: ${err}`)
      navigate('/login', { replace: true })
      return
    }
    if (!code || !state) {
      toast.error('Google sign-in returned an invalid payload')
      navigate('/login', { replace: true })
      return
    }
    ;(async () => {
      try {
        await loginWithGoogle(code, state)
        toast.success('Welcome — signed in with Google')
        navigate('/app', { replace: true })
      } catch (e) {
        toast.error(apiError(e, 'Google sign-in failed'))
        navigate('/login', { replace: true })
      }
    })()
  }, [params, navigate, loginWithGoogle])

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Link to="/" className="inline-flex mb-6">
          <Logo />
        </Link>
        <GlassCard strong padding="lg" className="hairline-gradient">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[rgb(var(--accent-primary)/0.18)] to-[rgb(var(--accent-tertiary)/0.18)] grid place-items-center text-[rgb(var(--accent-primary))] ring-1 ring-[rgb(var(--accent-primary)/0.25)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">Finishing Google sign-in…</h1>
              <p className="text-sm text-muted-foreground">
                Verifying your Google account and minting a Paragon session.
              </p>
            </div>
          </div>
          <div className="mt-5 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              initial={{ width: '8%' }}
              animate={{ width: '92%' }}
              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
              className="h-full bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-tertiary))]"
            />
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}
