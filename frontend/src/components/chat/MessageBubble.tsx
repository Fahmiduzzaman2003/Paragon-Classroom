import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { motion } from 'framer-motion'
import { Sparkles, User2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types'
import { CitationChip } from './CitationChip'

interface Props {
  message: ChatMessage
  aiName: string
  gradient: [string, string, string]
}

export function MessageBubble({ message, aiName, gradient }: Props) {
  const isUser = message.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('flex gap-3 max-w-3xl', isUser ? 'ml-auto flex-row-reverse' : 'mr-auto')}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-semibold',
        )}
        style={
          isUser
            ? {
                background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
              }
            : {
                background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`,
              }
        }
      >
        {isUser ? <User2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>

      <div className={cn('flex flex-col gap-1.5 min-w-0 flex-1', isUser && 'items-end')}>
        <div className="text-[10px] text-muted-foreground px-1">
          {isUser ? 'You' : aiName}
          {message.streaming && (
            <span className="ml-2 inline-flex items-center gap-1 text-emerald-300">
              <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" /> streaming…
            </span>
          )}
          {!isUser && message.cached && !message.streaming && (
            <span
              className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-amber-300"
              title="Answered instantly from the semantic cache"
            >
              <Zap className="h-2.5 w-2.5" /> instant
            </span>
          )}
        </div>

        <div
          className={cn(
            'rounded-2xl px-4 py-3 max-w-full',
            isUser
              ? 'glass rounded-tr-sm text-sm'
              : 'glass-strong rounded-tl-sm text-sm prose-chat',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <div className={message.streaming ? 'stream-caret' : ''}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1 px-1">
            {message.citations.map((c, i) => (
              <CitationChip key={c.id} citation={c} index={i} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
