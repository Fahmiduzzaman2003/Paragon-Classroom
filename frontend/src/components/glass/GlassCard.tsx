import * as React from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  strong?: boolean
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings: Record<NonNullable<GlassCardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, strong, hover, padding = 'md', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        strong ? 'glass-strong' : 'glass',
        hover && 'glass-hover',
        'rounded-2xl',
        paddings[padding],
        className,
      )}
      {...props}
    />
  ),
)
GlassCard.displayName = 'GlassCard'
