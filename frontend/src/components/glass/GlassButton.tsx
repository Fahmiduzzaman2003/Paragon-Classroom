import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const glassButton = cva(
  'relative inline-flex items-center justify-center gap-2 rounded-full font-medium ' +
    'transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 whitespace-nowrap',
  {
    variants: {
      variant: {
        primary:
          'text-white shadow-[0_6px_18px_-4px_rgba(129,90,255,0.55)] ' +
          'bg-[linear-gradient(120deg,#815AFF_0%,#FF46BE_55%,#00C8FF_100%)] ' +
          'hover:shadow-[0_10px_28px_-6px_rgba(129,90,255,0.75)] hover:brightness-110',
        glass:
          'glass text-foreground hover:bg-white/10 dark:hover:bg-white/5',
        ghost:
          'text-foreground/80 hover:bg-white/10 dark:hover:bg-white/5 hover:text-foreground',
        outline:
          'border border-border/70 bg-white/5 dark:bg-white/5 text-foreground hover:bg-white/10',
        destructive:
          'bg-destructive text-destructive-foreground hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-5 text-sm',
        lg: 'h-12 px-7 text-base',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButton> {
  asChild?: boolean
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref as React.Ref<HTMLButtonElement>}
        className={cn(glassButton({ variant, size }), className)}
        {...props}
      />
    )
  },
)
GlassButton.displayName = 'GlassButton'

export { glassButton }
