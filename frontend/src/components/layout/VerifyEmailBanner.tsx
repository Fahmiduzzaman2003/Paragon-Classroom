import { useEffect, useState } from 'react'
import { MailWarning, X } from 'lucide-react'
import { toast } from 'sonner'
import { sendEmailVerification } from 'firebase/auth'
import { auth, firebaseEnabled } from '@/lib/firebase'

/**
 * Soft email-verification nudge (Firebase mode only). Shows when the signed-in
 * Firebase user hasn't verified their email yet — they can still use the app.
 * Never hard-blocks; offers a one-click resend.
 */
export function VerifyEmailBanner() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!firebaseEnabled || !auth) return
    const unsub = auth.onIdTokenChanged((u) => {
      setShow(Boolean(u) && !u!.emailVerified)
    })
    return unsub
  }, [])

  if (!show || dismissed) return null

  async function resend() {
    if (!auth?.currentUser) return
    setSending(true)
    try {
      await sendEmailVerification(auth.currentUser)
      toast.success('Verification email sent — check your inbox.')
    } catch {
      toast.error('Could not send the email right now. Try again shortly.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      <MailWarning className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        Please verify your email to secure your account.
      </span>
      <button
        onClick={resend}
        disabled={sending}
        className="rounded-md px-2 py-1 font-medium text-amber-100 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Resend email'}
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-amber-200/70 hover:text-amber-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
