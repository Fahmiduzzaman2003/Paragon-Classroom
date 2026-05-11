import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  size?: number
  showWord?: boolean
}

export function Logo({ className, size = 32, showWord = true }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden
        className="drop-shadow-[0_4px_16px_rgba(129,90,255,0.45)]"
      >
        <defs>
          <linearGradient id="paragon-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#815AFF" />
            <stop offset="0.5" stopColor="#FF46BE" />
            <stop offset="1" stopColor="#00C8FF" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#paragon-g)" />
        <path
          d="M21 46V18h13.5a8.5 8.5 0 010 17H27v11h-6zm6-17h7.5a2.5 2.5 0 000-5H27v5z"
          fill="white"
        />
      </svg>
      {showWord && (
        <span className="font-display text-lg font-semibold tracking-tight">
          Paragon
        </span>
      )}
    </div>
  )
}
