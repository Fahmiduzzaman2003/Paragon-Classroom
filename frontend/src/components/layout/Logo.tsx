import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  size?: number
  showWord?: boolean
}

/**
 * Paragon wordmark. SVG monogram is the cornerstone of brand identity and is
 * used everywhere the app surfaces itself (sidebar, exam chrome, login, etc).
 */
export function Logo({ className, size = 36, showWord = true }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden
        className="drop-shadow-[0_6px_20px_rgba(124,96,240,0.55)] transition-transform duration-300 group-hover:scale-105"
      >
        <defs>
          <linearGradient id="paragon-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C60F0" />
            <stop offset="0.55" stopColor="#C03CDC" />
            <stop offset="1" stopColor="#00C4F0" />
          </linearGradient>
          <linearGradient id="paragon-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.55" />
            <stop offset="1" stopColor="white" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="58"
          height="58"
          rx="16"
          fill="url(#paragon-g)"
          stroke="url(#paragon-stroke)"
          strokeWidth="1"
        />
        {/* Stylized "P" + checkmark combo */}
        <path
          d="M22 47V17h14a9 9 0 010 18h-8v12h-6zm6-18h7.5a3 3 0 000-6H28v6z"
          fill="white"
        />
        {/* Graduation cap tassel accent */}
        <circle cx="44" cy="22" r="2.6" fill="white" />
      </svg>
      {showWord && (
        <span className="font-display text-[1.05rem] font-bold tracking-tight leading-none flex flex-col">
          <span>Paragon</span>
          <span className="text-[9px] font-medium text-muted-foreground tracking-[0.18em] uppercase mt-0.5">
            Classroom
          </span>
        </span>
      )}
    </div>
  )
}
