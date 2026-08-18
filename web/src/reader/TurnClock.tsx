import { useEffect, useState } from 'react'

import { keepsInk, watch, wanted } from './turnClock.ts'
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
  const [ink] = useState(keepsInk)

  useEffect(() => {
    if (!on) return
    return watch((all) => setTurns([...all]))
  }, [on])

  // Outside the `on` guard: the switch has to work whether or not the numbers
  // are shown, so a normal reading session can carry it too.
  useEffect(() => {
    if (ink) document.body.dataset.keepInk = ''
    else delete document.body.dataset.keepInk
  }, [ink])

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
        : `ink texture in turn: ${ink ? 'KEPT' : 'dropped'}\nbuild  paint  ink\n${turns
            .map(
              (t) =>
                `${Math.round(t.build).toString().padStart(5)}${Math.round(t.paint)
                  .toString()
                  .padStart(7)}${t.strokes.toString().padStart(6)}`,
            )
            .join('\n')}`}
    </div>
  )
}
