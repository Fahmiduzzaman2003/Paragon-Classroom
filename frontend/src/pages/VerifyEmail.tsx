import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/layout/AuthShell'
import { api, apiError } from '@/lib/api'

type Status = 'verifying' | 'success' | 'error'

export function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // guard against React 18 StrictMode double-invoke
    ran.current = true
    if (!token) {
      setStatus('error')
      setMessage('This verification link is missing its token.')
      return
    }
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setStatus('success')
        setMessage('Your email is verified. You can sign in now.')
      })
      .catch((err) => {
        setStatus('error')
        setMessage(apiError(err, 'This verification link is invalid or has expired.'))
      })
  }, [token])

  return (
    <AuthShell>
      <div className="text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
            <h1 className="font-display text-2xl font-bold">Verifying your email…</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
            <h1 className="font-display text-2xl font-bold">Email verified</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary/90 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary press focus-ring"
            >
              Continue to sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
            <h1 className="font-display text-2xl font-bold">Verification failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <div className="mt-6 flex flex-col items-center gap-2 text-sm">
              <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
              <span className="text-muted-foreground">
                Link expired? Sign in and request a new verification email.
              </span>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  )
}
