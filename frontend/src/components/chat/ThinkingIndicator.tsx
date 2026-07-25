import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

// Playful, rotating status words shown while the assistant is working — same
// idea as Claude's "Thinking / Pondering / …" line. Ordered so the first few
// roughly match what the backend is actually doing (retrieve → reason → write).
const PHASES = [
  'Retrieving sources',
  'Thinking',
  'Connecting the dots',
  'Reasoning it through',
  'Composing',
  'Mulling it over',
  'Almost there',
]

export function ThinkingIndicator({ gradient }: { gradient: [string, string, string] }) {
  const [i, setI] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % PHASES.length), 1700)
    return () => clearInterval(t)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 max-w-3xl mr-auto"
    >
      {/* Moving sparkle avatar */}
      <motion.div
        className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-white shadow-[0_6px_20px_-6px_rgba(129,90,255,0.6)]"
        style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})` }}
        animate={{ scale: [1, 1.12, 1], rotate: [0, 10, -8, 0] }}
        transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="h-4 w-4" />
      </motion.div>

      <div className="flex items-center gap-2 h-8">
        {/* Shimmering, rotating status word */}
        <div className="relative h-5 min-w-[9rem] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.span
              key={PHASES[i]}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="absolute inset-0 text-sm font-medium shimmer-text"
            >
              {PHASES[i]}…
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Pulsing dots */}
        <span className="flex gap-1">
          {[0, 1, 2].map((d) => (
            <motion.span
              key={d}
              className="h-1.5 w-1.5 rounded-full bg-[#9B7CFF]"
              animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.18, ease: 'easeInOut' }}
            />
          ))}
        </span>
      </div>
    </motion.div>
  )
}
