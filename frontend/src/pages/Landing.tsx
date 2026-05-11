import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Sparkles,
  BookOpen,
  MessagesSquare,
  Trophy,
  ShieldCheck,
  ArrowRight,
  CircleCheckBig,
} from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Badge } from '@/components/ui/Badge'

export function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="max-w-7xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition">Features</a>
          <a href="#rag" className="hover:text-foreground transition">Dedicated AIs</a>
          <a href="#stack" className="hover:text-foreground transition">Stack</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <GlassButton asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </GlassButton>
          <GlassButton asChild size="sm">
            <Link to="/register">
              Get started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </GlassButton>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-24 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="primary" className="mb-5">
              <Sparkles className="h-3 w-3" />
              RAG-powered classrooms
            </Badge>
            <h1 className="font-display text-5xl md:text-6xl font-semibold tracking-tight text-balance">
              A dedicated{' '}
              <span className="text-gradient">course AI</span>{' '}
              for every classroom.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl leading-relaxed">
              Paragon gives every course its own assistant — <span className="text-foreground font-medium">DS AI, Algo AI, DBMS AI</span> — trained on that course's materials.
              Students ask questions, receive grounded answers with citations, and never lose the thread.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <GlassButton asChild size="lg">
                <Link to="/register">
                  Start a classroom
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </GlassButton>
              <GlassButton asChild variant="glass" size="lg">
                <Link to="/login">I have an account</Link>
              </GlassButton>
            </div>
            <ul className="mt-10 grid grid-cols-2 gap-2 max-w-md text-sm text-muted-foreground">
              {[
                'Per-course isolation (ChromaDB)',
                'Streaming answers with citations',
                'Provider-agnostic (OpenAI / Claude / Gemini)',
                'Quizzes, leaderboards, assignments',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CircleCheckBig className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Preview card */}
        <motion.div
          initial={{ opacity: 0, y: 20, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="[perspective:1200px]"
        >
          <GlassCard strong padding="md" className="relative overflow-hidden">
            <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,70,190,0.45)_0%,transparent_70%)]" />
            <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(0,200,255,0.35)_0%,transparent_70%)]" />

            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="h-8 w-8 rounded-xl text-white text-xs font-bold flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #815AFF, #FF46BE, #00C8FF)',
                  }}
                >
                  DS
                </span>
                <div>
                  <div className="text-sm font-semibold">DS AI</div>
                  <div className="text-[11px] text-muted-foreground">Data Structures · 4 sources</div>
                </div>
                <Badge variant="success" className="ml-auto">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  streaming
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="glass rounded-2xl rounded-tr-sm p-3 text-sm ml-auto max-w-[80%]">
                  When should I prefer a red-black tree over an AVL tree?
                </div>
                <div className="glass rounded-2xl rounded-tl-sm p-4 text-sm max-w-[90%]">
                  <span className="text-gradient font-semibold">Short answer:</span>{' '}
                  prefer <span className="font-medium">red-black</span> when writes dominate,{' '}
                  <span className="font-medium">AVL</span> when reads dominate.
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <CitationChip file="Lecture_03_Binary_Trees.pdf" page={12} />
                    <CitationChip file="CLRS_Ch12_BST.pdf" page={34} />
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 pb-24">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">
            Built for focused, <span className="text-gradient">rigorous</span> learning.
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Every surface is designed to reduce friction between a question and an answer — grounded in the material your instructor actually assigned.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <Feature
            icon={<BookOpen className="h-5 w-5" />}
            title="Organized materials"
            body="Class Materials (open to everyone) and Additional Materials (teacher-curated). Every upload is ingested for the course AI automatically."
          />
          <Feature
            icon={<MessagesSquare className="h-5 w-5" />}
            title="Cited, streaming chat"
            body="Ask the course assistant anything. Answers stream with page-level citations and teacher-controlled strictness."
          />
          <Feature
            icon={<Trophy className="h-5 w-5" />}
            title="Quizzes + leaderboards"
            body="Six question types, full-screen timer, auto-grading for objective items, medal podium for top performers."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Isolation by design"
            body="Each course gets its own ChromaDB collection. A student in Algorithms can't leak context into DBMS — ever."
          />
          <Feature
            icon={<Sparkles className="h-5 w-5" />}
            title="Provider-agnostic LLM"
            body="Swap OpenAI, Anthropic Claude, or Google Gemini behind a single LLMProvider interface. Pick what fits."
          />
          <Feature
            icon={<CircleCheckBig className="h-5 w-5" />}
            title="Assignments + forum"
            body="Post, submit, grade with rubrics. Discussion forum with pins, replies, and @mentions."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground border-t border-white/5">
        <div className="flex items-center gap-2">
          <Logo size={22} showWord={false} />
          <span>Paragon — RAG classrooms</span>
        </div>
        <div>Built with a FastAPI + React stack. Demo data shown.</div>
      </footer>
    </div>
  )
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <GlassCard hover padding="md" className="h-full">
      <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-white/5 mb-3 text-foreground">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-base">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </GlassCard>
  )
}

function CitationChip({ file, page }: { file: string; page: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px]">
      <span className="h-1 w-1 rounded-full bg-[#00C8FF]" />
      <span className="truncate max-w-[14rem]">{file}</span>
      <span className="text-muted-foreground">· p.{page}</span>
    </span>
  )
}
