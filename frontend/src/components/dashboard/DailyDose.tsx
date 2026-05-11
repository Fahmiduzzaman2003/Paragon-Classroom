import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Calendar as CalendarIcon,
  Lightbulb,
  Quote,
  Sparkles,
  Volume2,
} from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { IDIOMS, PHRASES, VOCAB } from '@/data/dailyDose'

type Tab = 'word' | 'idiom' | 'phrase'

// Days since the Unix epoch — stable per calendar day in the user's locale.
function dayIndex(d = new Date()): number {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor(local.getTime() / 86_400_000)
}

const today = new Date()
const todayLabel = today.toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

export function DailyDose() {
  const [tab, setTab] = useState<Tab>('word')
  const idx = dayIndex()

  const vocab = useMemo(() => VOCAB[idx % VOCAB.length]!, [idx])
  const idiom = useMemo(() => IDIOMS[idx % IDIOMS.length]!, [idx])
  const phrase = useMemo(() => PHRASES[idx % PHRASES.length]!, [idx])

  // Browser TTS — best-effort; quietly no-ops if unsupported.
  const speak = (text: string) => {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.95
      u.pitch = 1
      synth.speak(u)
    } catch {
      /* ignore */
    }
  }

  return (
    <GlassCard padding="none" strong className="relative overflow-hidden">
      {/* Decorative gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute -top-16 -left-12 h-44 w-44 rounded-full bg-[#815AFF]/30 blur-3xl" />
        <div className="absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-[#00C8FF]/25 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full bg-[#FF46BE]/20 blur-3xl" />
      </div>

      <div className="relative p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-[linear-gradient(135deg,#815AFF,#FF46BE,#00C8FF)] flex items-center justify-center shadow-[0_4px_14px_-4px_rgba(255,70,190,0.55)]">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-sm leading-none">Daily dose</h2>
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                <CalendarIcon className="h-2.5 w-2.5" /> {todayLabel}
              </span>
            </div>
          </div>
          <div className="inline-flex rounded-full glass p-0.5 text-[11px]">
            <TabBtn active={tab === 'word'} onClick={() => setTab('word')} icon={<BookOpen className="h-3 w-3" />}>
              Word
            </TabBtn>
            <TabBtn active={tab === 'idiom'} onClick={() => setTab('idiom')} icon={<Lightbulb className="h-3 w-3" />}>
              Idiom
            </TabBtn>
            <TabBtn active={tab === 'phrase'} onClick={() => setTab('phrase')} icon={<Quote className="h-3 w-3" />}>
              Phrase
            </TabBtn>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {tab === 'word' && (
            <motion.div
              key="word"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="grid sm:grid-cols-[1fr_auto] gap-3"
            >
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-gradient">
                    {vocab.word}
                  </h3>
                  <button
                    type="button"
                    onClick={() => speak(vocab.word)}
                    className="h-7 w-7 rounded-full glass inline-flex items-center justify-center hover:bg-white/10 transition"
                    aria-label="Listen"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                  <Badge variant="muted">{vocab.partOfSpeech}</Badge>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono mt-0.5 block">
                  {vocab.pronunciation}
                </span>
                <p className="mt-2 text-sm leading-relaxed">{vocab.meaning}</p>
                <p className="mt-2 text-[12px] italic text-muted-foreground border-l-2 border-[#FF46BE]/60 pl-3">
                  “{vocab.example}”
                </p>
              </div>
            </motion.div>
          )}

          {tab === 'idiom' && (
            <motion.div
              key="idiom"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-gradient">
                  {idiom.idiom}
                </h3>
                <button
                  type="button"
                  onClick={() => speak(idiom.idiom)}
                  className="h-7 w-7 rounded-full glass inline-flex items-center justify-center hover:bg-white/10 transition"
                  aria-label="Listen"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
                <Badge variant="info">idiom</Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{idiom.meaning}</p>
              <p className="mt-2 text-[12px] italic text-muted-foreground border-l-2 border-[#00C8FF]/60 pl-3">
                “{idiom.example}”
              </p>
            </motion.div>
          )}

          {tab === 'phrase' && (
            <motion.div
              key="phrase"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-gradient">
                  {phrase.phrase}
                </h3>
                <button
                  type="button"
                  onClick={() => speak(phrase.phrase)}
                  className="h-7 w-7 rounded-full glass inline-flex items-center justify-center hover:bg-white/10 transition"
                  aria-label="Listen"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
                {phrase.origin && <Badge variant="warning">{phrase.origin}</Badge>}
              </div>
              <p className="mt-2 text-sm leading-relaxed">{phrase.meaning}</p>
              {phrase.example && (
                <p className="mt-2 text-[12px] italic text-muted-foreground border-l-2 border-[#815AFF]/60 pl-3">
                  “{phrase.example}”
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>A new word, idiom &amp; phrase appear every day.</span>
          <span className="font-mono">#{idx % 1000}</span>
        </div>
      </div>
    </GlassCard>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 h-7 rounded-full transition-all font-medium',
        active
          ? 'bg-[linear-gradient(120deg,#815AFF,#FF46BE,#00C8FF)] text-white shadow-[0_4px_14px_-4px_rgba(255,70,190,0.55)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
