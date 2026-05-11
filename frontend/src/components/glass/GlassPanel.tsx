import * as React from 'react'
import { cn } from '@/lib/utils'

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'aside' | 'nav' | 'header' | 'footer'
}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, as = 'div', ...props }, ref) => {
    const Comp = as as 'div'
    return (
      <Comp
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn('glass rounded-3xl', className)}
        {...props}
      />
    )
  },
)
GlassPanel.displayName = 'GlassPanel'
