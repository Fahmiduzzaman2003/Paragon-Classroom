import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { Label } from '@/components/ui/Label'
import { AuthShell } from '@/components/layout/AuthShell'
import { api, apiError } from '@/lib/api'

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && confirm !== password

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/reset-password', { token, new_password: password })
      toast.success('Password updated — sign in with your new password.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(apiError(err, 'This reset link is invalid or has expired.'))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthShell>
        <h1 className="font-display text-2xl font-bold">Invalid link</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This reset link is missing its token. Request a new one from the forgot-password page.
        </p>
        <Link to="/forgot-password" className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Request a new link
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h1 className="font-display text-2xl font-bold">Set a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose a strong password you don't use elsewhere.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="rp-password">New password</Label>
          <GlassInput
            id="rp-password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {tooShort && <p className="mt-1 text-xs text-amber-400">Must be at least 8 characters.</p>}
        </div>
        <div>
          <Label htmlFor="rp-confirm">Confirm password</Label>
          <GlassInput
            id="rp-confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {mismatch && <p className="mt-1 text-xs text-red-400">Passwords do not match.</p>}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <GlassButton
          type="submit"
          className="w-full"
          disabled={loading || password.length < 8 || password !== confirm}
        >
          {loading ? 'Updating…' : 'Update password'}
        </GlassButton>
      </form>
      <Link to="/login" className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>
    </AuthShell>
  )
}
