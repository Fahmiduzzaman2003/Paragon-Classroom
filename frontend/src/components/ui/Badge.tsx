import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badge = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-white/10 text-foreground border border-white/10 backdrop-blur-sm',
        primary:
          'bg-[linear-gradient(120deg,rgba(129,90,255,0.25),rgba(255,70,190,0.25))] text-foreground border border-white/15',
        success:
          'bg-emerald-500/15 text-emerald-200 border border-emerald-400/25 dark:text-emerald-300',
        warning:
          'bg-amber-500/15 text-amber-200 border border-amber-400/25 dark:text-amber-300',
        danger:
          'bg-rose-500/15 text-rose-200 border border-rose-400/25 dark:text-rose-300',
        info:
          'bg-cyan-500/15 text-cyan-100 border border-cyan-400/25 dark:text-cyan-200',
        muted:
          'bg-muted/40 text-muted-foreground border border-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badge({ variant }), className)} {...props} />
}
