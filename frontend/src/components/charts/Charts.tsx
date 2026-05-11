/**
 * Lightweight SVG chart primitives — no chart library, ~6 KB total.
 * Designed to drop into a GlassCard and inherit its dark/glassy aesthetic.
 *
 * Components:
 *  - Histogram     : vertical bars with optional mean/median markers
 *  - LineChart     : single or multi-series time-series line + area fill
 *  - BarChart      : horizontal stat bars (used for grading-progress, etc.)
 *  - Heatmap       : day x bucket grid (engagement style)
 *  - Sparkline     : tiny inline trend line for stat cards
 *  - GaugeRing     : circular completion ring
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────
// Histogram
// ─────────────────────────────────────────────────────

export function Histogram({
  data,
  height = 180,
  mean,
  median,
  className,
  formatXLabel = (s) => s,
  highlightIndex,
}: {
  data: { label: string; value: number }[]
  height?: number
  mean?: number | null
  median?: number | null
  className?: string
  formatXLabel?: (s: string) => string
  /** index whose bar gets the highlight gradient */
  highlightIndex?: number
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / Math.max(1, data.length)
  return (
    <div className={cn('w-full', className)}>
      <svg viewBox="0 0 100 60" className="w-full" preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id="hist-bar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#FF46BE" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#815AFF" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="hist-bar-hi" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00C8FF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#815AFF" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {/* horizontal grid lines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2="100" y1={60 * g} y2={60 * g} stroke="rgba(255,255,255,0.06)" strokeWidth="0.2" />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * 56
          const x = i * w + w * 0.12
          const bw = w * 0.76
          const isHi = i === highlightIndex
          return (
            <g key={i}>
              <rect
                x={x}
                y={60 - h - 2}
                width={bw}
                height={Math.max(0.5, h)}
                rx={0.6}
                fill={isHi ? 'url(#hist-bar-hi)' : 'url(#hist-bar)'}
              />
              {d.value > 0 && (
                <text
                  x={x + bw / 2}
                  y={60 - h - 3}
                  textAnchor="middle"
                  className="fill-white/80"
                  style={{ fontSize: 2.4 }}
                >
                  {d.value}
                </text>
              )}
            </g>
          )
        })}
        {/* mean / median markers, scaled assuming x is 0-100% */}
        {typeof mean === 'number' && (
          <line x1={mean} x2={mean} y1={0} y2={58} stroke="#00C8FF" strokeWidth="0.4" strokeDasharray="1.2 0.8" />
        )}
        {typeof median === 'number' && (
          <line x1={median} x2={median} y1={0} y2={58} stroke="#FFD66B" strokeWidth="0.4" strokeDasharray="1.2 0.8" />
        )}
      </svg>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((d, i) => (
          <div key={i} className="text-[9px] text-muted-foreground text-center font-mono">
            {formatXLabel(d.label)}
          </div>
        ))}
      </div>
      {(typeof mean === 'number' || typeof median === 'number') && (
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          {typeof mean === 'number' && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-[#00C8FF]" /> mean {mean}
            </span>
          )}
          {typeof median === 'number' && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-[#FFD66B]" /> median {median}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────
// LineChart — single series with optional band (p25..p75) and dots
// ─────────────────────────────────────────────────────

export interface LinePoint {
  label: string
  value: number
  low?: number
  high?: number
}

export function LineChart({
  data,
  height = 200,
  yMin = 0,
  yMax = 100,
  yTicks = [0, 25, 50, 75, 100],
  className,
  ariaLabel,
}: {
  data: LinePoint[]
  height?: number
  yMin?: number
  yMax?: number
  yTicks?: number[]
  className?: string
  ariaLabel?: string
}) {
  const w = 100
  const h = 60
  const padL = 7
  const padR = 2
  const innerW = w - padL - padR
  const padT = 4
  const padB = 8
  const innerH = h - padT - padB

  const norm = (v: number) => padT + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * innerH

  const xs = useMemo(
    () =>
      data.map((_, i) =>
        data.length === 1 ? padL + innerW / 2 : padL + (i / (data.length - 1)) * innerW,
      ),
    [data.length, innerW, padL],
  )

  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]!.toFixed(2)} ${norm(d.value).toFixed(2)}`)
    .join(' ')

  const areaPath =
    data.length > 0
      ? `${path} L ${xs[data.length - 1]!.toFixed(2)} ${(padT + innerH).toFixed(2)} L ${xs[0]!.toFixed(2)} ${(padT + innerH).toFixed(2)} Z`
      : ''

  const bandPath =
    data.every((d) => typeof d.low === 'number' && typeof d.high === 'number') && data.length > 1
      ? `M ${data
          .map((d, i) => `${xs[i]!.toFixed(2)} ${norm(d.high!).toFixed(2)}`)
          .join(' L ')} L ${[...data]
          .reverse()
          .map((d, i) => `${xs[data.length - 1 - i]!.toFixed(2)} ${norm(d.low!).toFixed(2)}`)
          .join(' L ')} Z`
      : ''

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height }}
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id="line-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#FF46BE" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#815AFF" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="line-band" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00C8FF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#00C8FF" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* y-axis ticks */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={w - padR}
              y1={norm(t)}
              y2={norm(t)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.18"
            />
            <text x={0} y={norm(t) + 1} className="fill-white/40" style={{ fontSize: 2.2 }}>
              {t}
            </text>
          </g>
        ))}

        {bandPath && <path d={bandPath} fill="url(#line-band)" />}
        {areaPath && <path d={areaPath} fill="url(#line-area)" />}
        {data.length > 1 && (
          <path d={path} fill="none" stroke="#FF46BE" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xs[i]}
            cy={norm(d.value)}
            r={0.9}
            fill="#FF46BE"
            stroke="#0b0a1a"
            strokeWidth="0.3"
          >
            <title>{`${d.label}: ${d.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground font-mono px-[7%]">
        {data.length === 0 ? (
          <span className="text-center w-full opacity-50">no data</span>
        ) : (
          data.map((d, i) =>
            i === 0 || i === data.length - 1 || data.length <= 8 ? (
              <span key={i} className="truncate max-w-[80px]">
                {d.label}
              </span>
            ) : (
              <span key={i} className="opacity-0 select-none">
                ·
              </span>
            ),
          )
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// BarChart — horizontal, ranked
// ─────────────────────────────────────────────────────

export function BarChart({
  data,
  className,
  formatValue = (v) => `${v}`,
  max,
  tone = 'gradient',
}: {
  data: { label: string; value: number; sub?: string }[]
  className?: string
  formatValue?: (v: number) => string
  max?: number
  tone?: 'gradient' | 'cyan' | 'pink' | 'amber'
}) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value))
  const fill =
    tone === 'cyan'
      ? 'bg-[linear-gradient(90deg,#00C8FF,#7BE0FF)]'
      : tone === 'pink'
        ? 'bg-[linear-gradient(90deg,#FF46BE,#FFB3DF)]'
        : tone === 'amber'
          ? 'bg-[linear-gradient(90deg,#FFB347,#FFD66B)]'
          : 'bg-[linear-gradient(90deg,#815AFF,#FF46BE,#00C8FF)]'
  return (
    <div className={cn('space-y-1.5', className)}>
      {data.map((d, i) => {
        const w = (d.value / m) * 100
        return (
          <div key={i} className="text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{d.label}</span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {formatValue(d.value)}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', fill)}
                style={{ width: `${Math.max(2, Math.min(100, w))}%` }}
              />
            </div>
            {d.sub && (
              <div className="text-[9px] text-muted-foreground mt-0.5">{d.sub}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Sparkline — inline, tiny
// ─────────────────────────────────────────────────────

export function Sparkline({
  values,
  height = 32,
  width = 100,
  className,
}: {
  values: number[]
  height?: number
  width?: number
  className?: string
}) {
  if (values.length === 0) {
    return <div className={cn('text-[10px] text-muted-foreground', className)}>—</div>
  }
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const norm = (v: number) => height - ((v - min) / Math.max(1, max - min)) * (height - 2) - 1
  const path = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width
      return `${i === 0 ? 'M' : 'L'} ${x} ${norm(v)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} className={cn('overflow-visible', className)}>
      <path d={path} fill="none" stroke="#00C8FF" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────
// GaugeRing — circular % indicator
// ─────────────────────────────────────────────────────

export function GaugeRing({
  pct,
  size = 64,
  thickness = 6,
  label,
  tone = 'cyan',
}: {
  pct: number
  size?: number
  thickness?: number
  label?: string
  tone?: 'cyan' | 'violet' | 'pink' | 'amber' | 'rose' | 'emerald'
}) {
  const stroke =
    tone === 'cyan'
      ? '#00C8FF'
      : tone === 'violet'
        ? '#815AFF'
        : tone === 'pink'
          ? '#FF46BE'
          : tone === 'amber'
            ? '#FFD66B'
            : tone === 'emerald'
              ? '#34D399'
              : '#FB7185'

  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(1, pct / 100)))
  return (
    <div className="inline-flex items-center justify-center relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-semibold text-sm tabular-nums">{Math.round(pct)}%</span>
        {label && <span className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Heatmap — single row of intensity cells
// ─────────────────────────────────────────────────────

export function HeatStrip({
  data,
  className,
}: {
  data: { label: string; value: number }[]
  className?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex gap-1">
        {data.map((d, i) => {
          const intensity = d.value / max
          const opacity = 0.1 + intensity * 0.85
          return (
            <div
              key={i}
              className="flex-1 h-7 rounded-md ring-1 ring-white/5"
              style={{
                background: `linear-gradient(135deg, rgba(0,200,255,${opacity}), rgba(129,90,255,${opacity * 0.7}))`,
              }}
              title={`${d.label}: ${d.value}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
        {data.length > 0 && (
          <>
            <span>{data[0]!.label}</span>
            {data.length > 2 && <span>{data[Math.floor(data.length / 2)]!.label}</span>}
            <span>{data[data.length - 1]!.label}</span>
          </>
        )}
      </div>
    </div>
  )
}
