import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { fetchQuestionImageBlob } from '@/hooks/useQuizzes'
import { cn } from '@/lib/utils'

export function QuestionImage({
  questionId,
  className,
}: {
  questionId: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let revoked = false
    let objectUrl: string | null = null
    setError(false)
    setUrl(null)
    fetchQuestionImageBlob(questionId)
      .then((u) => {
        if (revoked) URL.revokeObjectURL(u)
        else {
          objectUrl = u
          setUrl(u)
        }
      })
      .catch(() => setError(true))
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [questionId])

  if (error) {
    return (
      <div
        className={cn(
          'rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-muted-foreground inline-flex items-center gap-2',
          className,
        )}
      >
        <ImageOff className="h-3.5 w-3.5" /> Could not load question image
      </div>
    )
  }

  if (!url) {
    return (
      <div
        className={cn(
          'rounded-lg border border-white/10 bg-white/[0.03] h-32 flex items-center justify-center text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={cn('block', className)}>
      <img
        src={url}
        alt="Question illustration"
        className="rounded-lg max-h-80 w-full object-contain bg-black/30 border border-white/10"
      />
    </a>
  )
}
