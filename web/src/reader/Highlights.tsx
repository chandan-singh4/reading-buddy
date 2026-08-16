/**
 * The highlights, drawn on the page.
 *
 * A highlight is stored as an anchor, the words, and a colour — never as DOM
 * offsets, which do not survive a re-parse. So drawing one means finding the
 * words again in their paragraph and measuring where they landed. See
 * `rangeOfQuote`.
 *
 * The marks go through a portal onto `<body>` for the same reason the selection
 * menu does: `position: fixed` is measured against the nearest transformed
 * ancestor, and the page sits inside one. They are measured again whenever the
 * page moves under them — a turn scrolls the strip, a font change resizes it.
 */

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Anchor } from '../structure/index.ts'
import styles from './Highlights.module.css'
import { rangeOfQuote, type SelectionRect } from './selection.ts'

/** One stored highlight: enough to find it and enough to paint it. */
export interface HighlightLike {
  id: string
  anchor: Anchor
  quote?: string
  colour?: string
}

export interface HighlightsProps {
  highlights: readonly HighlightLike[]
  /** The reading column. Nothing is drawn until it exists. */
  root: HTMLElement | null
  /** A tap on a highlight. The Reader reopens the menu over it. */
  onPick: (id: string, range: Range) => void
}

interface Painted {
  id: string
  anchor: Anchor
  quote: string
  colour: string
  rects: SelectionRect[]
}

export function Highlights({ highlights, root, onPick }: HighlightsProps) {
  const [painted, setPainted] = useState<Painted[]>([])

  const measure = useCallback(() => {
    if (!root) {
      setPainted([])
      return
    }

    const next: Painted[] = []
    for (const highlight of highlights) {
      if (!highlight.quote || !highlight.colour) continue

      const range = rangeOfQuote(highlight.anchor, highlight.quote)
      if (!range || !root.contains(range.commonAncestorContainer)) continue

      const rects = [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        // A paragraph on another page is laid out off to the side, and its
        // boxes are off the screen. The *middle* has to be on screen, not just
        // an edge of it: a box hanging off the left of the page would otherwise
        // paint a stripe of colour down the margin of the page being read.
        .filter((rect) => {
          const middle = (rect.left + rect.right) / 2
          return middle > 0 && middle < window.innerWidth
        })
        .map((rect) => ({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }))

      if (rects.length > 0) {
        next.push({
          id: highlight.id,
          anchor: highlight.anchor,
          quote: highlight.quote,
          colour: highlight.colour,
          rects,
        })
      }
    }

    setPainted(next)
  }, [highlights, root])

  useEffect(() => {
    measure()
    if (!root) return

    // A turn scrolls the strip; a font or width change resizes it. Both move
    // every box on the page, and neither one tells React anything.
    // One measure per frame however many events arrive. A page turn and a
    // section load both fire these in bursts.
    let pending = 0
    const again = () => {
      if (pending) return
      pending = requestAnimationFrame(() => {
        pending = 0
        measure()
      })
    }
    root.addEventListener('scroll', again, { passive: true })
    window.addEventListener('resize', again)

    // Both observers are asked for rather than assumed. jsdom has neither, and
    // a reading screen that throws in a test is worse than one that measures a
    // little less often.
    const size = typeof ResizeObserver === 'function' ? new ResizeObserver(again) : null
    size?.observe(root)

    // The section itself can be replaced — a chapter loaded, a link followed —
    // which changes every paragraph under the column without resizing it.
    const content = typeof MutationObserver === 'function' ? new MutationObserver(again) : null
    content?.observe(root, { childList: true, subtree: true, characterData: true })

    return () => {
      root.removeEventListener('scroll', again)
      window.removeEventListener('resize', again)
      size?.disconnect()
      content?.disconnect()
      if (pending) cancelAnimationFrame(pending)
    }
  }, [measure, root])

  if (painted.length === 0) return null

  return createPortal(
    <>
      {painted.map((highlight) =>
        highlight.rects.map((rect, index) => (
          <span
            key={`${highlight.id}-${index}`}
            className={styles.mark}
            style={{
              top: `${rect.top}px`,
              left: `${rect.left}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              background: highlight.colour,
            }}
            role="button"
            tabIndex={-1}
            aria-label="Highlight"
            onPointerDown={(event) => {
              // Taken before the page sees it: a tap on a highlight is a tap on
              // the highlight, not the tap that shows the overlay.
              event.preventDefault()
              event.stopPropagation()
              // Measured again rather than kept: the range these boxes came
              // from was thrown away, and the page may have moved since.
              const range = rangeOfQuote(highlight.anchor, highlight.quote)
              if (range) onPick(highlight.id, range)
            }}
          />
        )),
      )}
    </>,
    document.body,
  )
}
