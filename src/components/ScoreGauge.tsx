'use client'

// ─── ScoreGauge ───────────────────────────────────────────────────────────────
// Reusable gradient semicircle gauge.
// Props:
//   score  — integer 0–100
//   size   — 'sm' | 'md' | 'lg'  (defaults 'md')
//   showLabel — whether to show Excellent/Good/Fair label (default true)

type ScoreGaugeProps = {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

type SizeConfig = {
  svgW: number
  svgH: number
  cx: number
  cy: number
  r: number
  stroke: number
  fontSize: number
  labelSize: number
  dotR: number
}

const SIZES: Record<string, SizeConfig> = {
  sm: { svgW: 80,  svgH: 50,  cx: 40,  cy: 44,  r: 30,  stroke: 5,  fontSize: 14, labelSize: 7,  dotR: 4 },
  md: { svgW: 160, svgH: 100, cx: 80,  cy: 88,  r: 62,  stroke: 10, fontSize: 28, labelSize: 10, dotR: 7 },
  lg: { svgW: 220, svgH: 130, cx: 110, cy: 118, r: 86,  stroke: 12, fontSize: 38, labelSize: 12, dotR: 9 },
}

function scoreLabel(score: number) {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  return 'Fair'
}

function scoreColor(score: number) {
  // Interpolate: red(0) → orange(50) → yellow(70) → teal(100)
  if (score >= 80) return '#2dd4bf'
  if (score >= 60) return '#eab308'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

export default function ScoreGauge({ score, size = 'md', showLabel = true }: ScoreGaugeProps) {
  const s = SIZES[size]
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))

  // Arc math — semicircle from left (180°) to right (0°)
  // Full arc circumference for a half-circle = π × r
  const arcLength = Math.PI * s.r
  // How much of the arc to fill (score 0 = none, 100 = all)
  const fillLength = (clampedScore / 100) * arcLength
  // Gap = rest of arc
  // strokeDasharray = "fill gap" on the arc path

  // Arc path: M (cx-r, cy) A r r 0 0 1 (cx+r, cy)
  const arcPath = `M ${s.cx - s.r} ${s.cy} A ${s.r} ${s.r} 0 0 1 ${s.cx + s.r} ${s.cy}`

  // Dot position at the score angle
  // angle 0 = right (score 100), angle π = left (score 0)
  // angle = (1 - score/100) × π
  const dotAngle = (1 - clampedScore / 100) * Math.PI
  const dotX = s.cx + s.r * Math.cos(Math.PI - dotAngle)
  const dotY = s.cy - s.r * Math.sin(Math.PI - dotAngle)

  const color = scoreColor(clampedScore)
  const label = scoreLabel(clampedScore)
  const gradId = `gauge-grad-${size}`

  return (
    <svg
      width={s.svgW}
      height={s.svgH}
      viewBox={`0 0 ${s.svgW} ${s.svgH}`}
      style={{ display: 'block' }}
      aria-label={`ATS score: ${clampedScore} — ${label}`}
    >
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse"
          x1={String(s.cx - s.r)} y1={String(s.cy)} x2={String(s.cx + s.r)} y2={String(s.cy)}>
          <stop offset="0%"   stopColor="#ef4444" />
          <stop offset="35%"  stopColor="#f97316" />
          <stop offset="60%"  stopColor="#eab308" />
          <stop offset="100%" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>

      {/* Track */}
      <path
        d={arcPath}
        fill="none"
        stroke="var(--bg3, #1e293b)"
        strokeWidth={s.stroke}
        strokeLinecap="round"
      />

      {/* Gradient fill — only up to score position */}
      {clampedScore > 0 && (
        <path
          d={arcPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={s.stroke}
          strokeLinecap="round"
          strokeDasharray={`${fillLength} ${arcLength}`}
          // Offset so fill starts from the left (score=0 side)
          strokeDashoffset={0}
          // The path goes left→right, so dasharray fills from left = low→high score ✓
        />
      )}

      {/* White dot at score position */}
      {clampedScore > 0 && clampedScore < 100 && (
        <>
          <circle cx={dotX} cy={dotY} r={s.dotR + 1.5} fill="var(--bg, #0f1117)" />
          <circle cx={dotX} cy={dotY} r={s.dotR} fill="#fff" />
        </>
      )}

      {/* Score number */}
      <text
        x={s.cx}
        y={s.cy - (size === 'sm' ? 10 : size === 'lg' ? 20 : 15)}
        textAnchor="middle"
        fontSize={s.fontSize}
        fontWeight="800"
        fill={color}
        fontFamily="var(--font, -apple-system, sans-serif)"
        letterSpacing="-0.02em"
      >
        {clampedScore}
      </text>

      {/* Label */}
      {showLabel && (
        <text
          x={s.cx}
          y={s.cy + (size === 'sm' ? 1 : 2)}
          textAnchor="middle"
          fontSize={s.labelSize}
          fill="var(--text3, #64748b)"
          fontFamily="var(--font, -apple-system, sans-serif)"
        >
          {label}
        </text>
      )}

      {/* Min/max ticks */}
      <text x={s.cx - s.r + 2} y={s.cy + s.stroke + 8} textAnchor="middle" fontSize={s.labelSize - 1} fill="var(--text3, #64748b)" fontFamily="monospace">0</text>
      <text x={s.cx + s.r - 2} y={s.cy + s.stroke + 8} textAnchor="middle" fontSize={s.labelSize - 1} fill="var(--text3, #64748b)" fontFamily="monospace">100</text>
    </svg>
  )
}

// ─── ScoreChip ─────────────────────────────────────────────────────────────────
// Compact inline score badge for lists/tables.
// Shows: colored circle + number

export function ScoreChip({ score }: { score: number | null | undefined }) {
  if (score == null) return null
  const color = scoreColor(score)
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 8px',
      borderRadius: 20,
      border: `1px solid ${color}55`,
      background: color + '18',
    }}>
      <svg width="8" height="8" viewBox="0 0 8 8">
        <circle cx="4" cy="4" r="3.5" fill={color} />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'var(--font)', letterSpacing: '-0.01em' }}>
        {score}
      </span>
    </div>
  )
}
