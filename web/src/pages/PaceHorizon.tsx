/**
 * The Pace Horizon: the trajectory strip, drawn instead of listed.
 *
 * The strip used to be two numbers and two labels. Both facts were true and
 * neither answered the question the reader actually asks at the front door,
 * which is not "how fast am I reading?" but "is this going anywhere?" A number
 * cannot show a slump; a line can. So the last seven days are drawn as a wave,
 * and the days between here and the finish are drawn as the dashed
 * continuation of it, ending on a pin.
 *
 * ## The shape of the drawing
 *
 * The historical wave takes the left ~55% and the projection the rest, whatever
 * the card is wide. The split is deliberate: the past is the part with detail in
 * it, and a projection given equal room reads as equally known.
 *
 * The projection lands on the seven-day mean rather than on some rising line.
 * Nothing here forecasts an increase in pace — `trajectoryOf` assumes you carry
 * on as you have been — and drawing a climb would say something the maths never
 * said. Against a recent dip the flat mean still rises, which is honest: it *is*
 * a recovery to your own average.
 *
 * ## Why the pin is not in the SVG
 *
 * The chart stretches to the card, and card width varies with the phone. An SVG
 * that stretches is an SVG whose circles turn into ellipses and whose strokes
 * thin out on one axis. So the wave is drawn with `preserveAspectRatio="none"`,
 * where that distortion is invisible on a smooth curve, and the pin is an HTML
 * dot positioned over it — always round, always the same weight.
 */

import type { CSSProperties } from 'react'

import styles from './paceHorizon.module.css'

export type PaceStatus = 'ahead' | 'on_track' | 'behind'

export interface PaceHorizonProps {
  /** Minutes read on each of the last 7 days, oldest first. */
  historicalMinutes: readonly number[]
  /** Days left at the current pace. Shown in the footer's subtext. */
  projectedDays: number
  /** Already formatted for display, e.g. `Sep 18`. */
  estimatedFinishDate: string
  /** Already formatted for display, e.g. `77m / day`. */
  pacePerDay: string
  status: PaceStatus
}

const LABELS: Record<PaceStatus, string> = {
  ahead: 'Ahead',
  on_track: 'On track',
  behind: 'Behind',
}

/*
 * The drawing grid. Only the ratios matter — the SVG is stretched to the card,
 * so these are proportions written as numbers, not pixels.
 */
const W = 100
const H = 40
/** Where the known part ends and the guess begins. */
const SPLIT = 55
/** Kept clear top and bottom so a peak day is not clipped by the viewBox. */
const PAD = 6

/**
 * Turn a run of points into one smooth path.
 *
 * A Catmull-Rom spline converted to cubic beziers: each control point is set
 * from the slope between a point's two neighbours, which is what makes the line
 * pass *through* every day rather than near it. A polyline would be truthful
 * too, but a reading week is not a set of corners.
 */
function smooth(points: readonly [number, number][]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0]![0]} ${points[0]![1]}`

  let d = `M ${points[0]![0]} ${points[0]![1]}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[i + 2] ?? p2
    // A sixth of the neighbour span is the standard Catmull-Rom tension. Higher
    // and the curve overshoots a spike into a loop.
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2[0])} ${round(p2[1])}`
  }
  return d
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** Minutes to a y in the viewBox, with the top of the box being the best day. */
function scaler(values: readonly number[]): (minutes: number) => number {
  const peak = Math.max(...values, 1)
  return (minutes) => {
    const share = Math.min(Math.max(minutes / peak, 0), 1)
    return H - PAD - share * (H - PAD * 2)
  }
}

export function PaceHorizon({
  historicalMinutes,
  projectedDays,
  estimatedFinishDate,
  pacePerDay,
  status,
}: PaceHorizonProps) {
  // A single day cannot be a wave, so it is drawn as its own flat week. The
  // strip still has a finish date to show, which is the part worth being here.
  const days = historicalMinutes.length > 0 ? historicalMinutes : [0]
  const mean = days.reduce((sum, n) => sum + n, 0) / days.length

  const y = scaler([...days, mean])
  const step = days.length > 1 ? SPLIT / (days.length - 1) : SPLIT
  const points = days.map((minutes, i) => [round(i * step), round(y(minutes))] as [number, number])

  const past = smooth(points)
  const last = points[points.length - 1]!
  const endY = round(y(mean))
  // One control point, not two: the guess is a single easing from where you are
  // to where the pace says you will be. A wavier projection would invent detail.
  const projection = `M ${last[0]} ${last[1]} C ${round((last[0] + W) / 2)} ${last[1]}, ${round((last[0] + W) / 2)} ${endY}, ${W} ${endY}`
  const area = `${past} L ${last[0]} ${H} L 0 ${H} Z`

  // The pin rides the chart's own box, so it stays on the line's end at any
  // width. Percent of the viewBox height, because the box is what stretches.
  const pinStyle = { '--pin-y': `${(endY / H) * 100}%` } as CSSProperties

  return (
    <div className={styles.horizon}>
      <div className={styles.head}>
        <span className={styles.kicker}>Trajectory</span>
        <span className={`${styles.badge} ${styles[status]}`}>{LABELS[status]}</span>
      </div>

      {/* Decoration: every fact in it is written in words underneath. */}
      <div className={styles.chart} aria-hidden="true">
        <svg
          className={styles.svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          focusable="false"
        >
          <defs>
            {/* Scoped by the module's own hashed class name would be neater, but
                gradient ids are global — this one is unique enough and stable. */}
            <linearGradient id="paceHorizonFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--horizon-accent)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--horizon-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#paceHorizonFill)" />
          {/* `vector-effect` keeps the stroke one weight while the box stretches. */}
          <path d={past} className={styles.line} />
          <path d={projection} className={`${styles.line} ${styles.projected}`} />
        </svg>
        <span className={styles.pin} style={pinStyle} />
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.value}>{estimatedFinishDate}</span>
          <span className={styles.label}>Est. finish ({projectedDays}d)</span>
        </div>
        <div className={`${styles.fact} ${styles.factEnd}`}>
          <span className={`${styles.value} ${styles.rate}`}>{pacePerDay}</span>
        </div>
      </div>
    </div>
  )
}
