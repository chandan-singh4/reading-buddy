import { useEffect, useState } from 'react'

import { watch, wanted } from './turnClock.ts'
import type { Turn } from './turnClock.ts'

/**
 * The readout for `turnClock.ts`. A short list in the corner, one row per turn,
 * newest at the bottom.
 *
 * It is deliberately plain and deliberately opaque: it is read from a photograph
 * of a phone screen, not from a desk. No animation, no fading, nothing that can
 * itself cost a frame during the turn it is measuring.
 */
export function TurnClock() {
  const [turns, setTurns] = useState<readonly Turn[]>([])
  const [on] = useState(wanted)

  useEffect(() => {
    if (!on) return
    return watch((all) => setTurns([...all]))
  }, [on])

  if (!on) return null

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 60,
        pointerEvents: 'none',
        padding: '6px 8px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.78)',
        color: '#fff',
        font: '11px/1.45 ui-monospace, monospace',
        whiteSpace: 'pre',
      }}
    >
      {turns.length === 0
        ? 'turn clock: flip a page'
        : `dir  still  build  paint   ink` +
          '\n' +
          turns
            .map((t) => {
              const cell = (n: number, width: number) =>
                Math.round(n).toString().padStart(width)
              const dir = t.by === 1 ? ' ->' : ' <-'
              return (
                dir + cell(t.still, 7) + cell(t.build, 7) + cell(t.paint, 7) +
                t.strokes.toString().padStart(6)
              )
            })
            .join('\n')}
    </div>
  )
}
