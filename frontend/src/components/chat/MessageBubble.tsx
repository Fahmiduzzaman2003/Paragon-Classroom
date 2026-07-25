import { memo, useMemo } from 'react'
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

// Full plugin set once the message is settled; a lighter set while streaming.
// rehype-highlight (syntax highlighting) is the most expensive plugin and code
// blocks are incomplete mid-stream, so we skip it until the answer finishes.
const REMARK = [remarkGfm, remarkMath]
const REHYPE_FULL = [rehypeKatex, rehypeHighlight]
const REHYPE_STREAMING = [rehypeKatex]

function MessageBubbleInner({ message, aiName, gradient }: Props) {
  const isUser = message.role === 'user'

  // Memoize the rendered body so it only re-parses when the text (or streaming
  // state) actually changes — not when unrelated parent state updates.
  const body = useMemo(() => {
    if (isUser) {
      return <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
    }
    return (
      <div className={message.streaming ? 'stream-caret' : ''}>
        <ReactMarkdown
          remarkPlugins={REMARK}
          rehypePlugins={message.streaming ? REHYPE_STREAMING : REHYPE_FULL}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    )
  }, [isUser, message.content, message.streaming])

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
              title={`Served instantly from the semantic cache${
                typeof message.grounding === 'number' ? ` (at ${message.grounding}% grounding)` : ''
              }`}
            >
              <Zap className="h-2.5 w-2.5" /> instant
              {typeof message.grounding === 'number' && (
                <span className="opacity-80">· {message.grounding}%</span>
              )}
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
          {body}
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

// Memoized so that, during streaming, only the one changing bubble re-renders —
// prior messages keep a stable reference and are skipped.
export const MessageBubble = memo(MessageBubbleInner)
