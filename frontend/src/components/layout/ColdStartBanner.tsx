import { useEffect, useState } from 'react'
import { onBackendWaking } from '@/lib/api'

/**
 * Honest cold-start indicator. Render Free spins the backend down after ~15 min
 * idle; the first request then takes ~30–60s. Rather than a frozen spinner or a
 * false error, we show a calm banner while the server wakes.
 */
export function ColdStartBanner() {
  const [waking, setWaking] = useState(false)

  useEffect(() => onBackendWaking(setWaking), [])

  if (!waking) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500/90 px-4 py-2 text-sm font-medium text-black shadow-lg"
    >
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-black/40 border-t-black" />
      Waking up the server — this can take up to a minute on the free tier…
    </div>
  )
}
