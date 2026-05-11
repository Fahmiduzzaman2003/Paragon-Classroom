import * as React from 'react'
import { cn } from '@/lib/utils'

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, leadingIcon, trailingIcon, ...props }, ref) => (
    <div
      className={cn(
        'flex items-center gap-2 h-11 px-4 rounded-xl glass',
        'transition-all duration-200 focus-within:ring-2 focus-within:ring-ring/70',
        'focus-within:border-transparent',
        className,
      )}
    >
      {leadingIcon && <span className="text-muted-foreground shrink-0">{leadingIcon}</span>}
      <input
        ref={ref}
        className={cn(
          'flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70',
          'text-sm text-foreground',
        )}
        {...props}
      />
      {trailingIcon && <span className="text-muted-foreground shrink-0">{trailingIcon}</span>}
    </div>
  ),
)
GlassInput.displayName = 'GlassInput'

interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export const GlassTextarea = React.forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-xl glass px-4 py-3 text-sm bg-transparent text-foreground',
        'placeholder:text-muted-foreground/70 outline-none resize-none',
        'transition-all focus:ring-2 focus:ring-ring/70',
        className,
      )}
      {...props}
    />
  ),
)
GlassTextarea.displayName = 'GlassTextarea'
