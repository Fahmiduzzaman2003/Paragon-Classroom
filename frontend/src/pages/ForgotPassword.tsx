import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { Label } from '@/components/ui/Label'
import { AuthShell } from '@/components/layout/AuthShell'
import { api, apiError } from '@/lib/api'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // The backend always responds 200 (anti-enumeration); we show the same
      // confirmation regardless of whether the email exists.
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(apiError(err, 'Could not send the reset link. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      {sent ? (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <MailCheck className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account exists for <span className="text-foreground">{email}</span>, a password-reset
            link is on its way. The link expires in 24 hours.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your account email and we'll send you a link to reset it.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="fp-email">Email</Label>
              <GlassInput
                id="fp-email"
                type="email"
                autoComplete="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <GlassButton type="submit" className="w-full" disabled={loading || !email.trim()}>
              {loading ? 'Sending…' : 'Send reset link'}
            </GlassButton>
          </form>
          <Link
            to="/login"
            className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </>
      )}
    </AuthShell>
  )
}
