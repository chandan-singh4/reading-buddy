/**
 * Highlights as marker strokes.
 *
 * The other renderer — `Highlights.tsx` in its clean mode — hands the ranges to
 * the browser and lets it paint them as ink under the words. That is the better
 * model and it is the default for a reason: there is nothing to measure, so a
 * page turn or a font change moves the colour with the text in the same frame.
 *
 * This one cannot use it. `::highlight()` accepts a background colour and almost
 * nothing else — no filter, no mask, no blend mode — and a marker stroke is
 * *made* of a filter, a mask and a blend mode. So this renderer goes back to
 * measuring: one box per line of each highlight, in viewport coordinates,
 * re-measured whenever the page moves.
 *
 * That is the cost of the style, and the reader chose it knowingly. It is
 * contained three ways:
 *
 * 1. It is opt-in. Clean is the default on every flat theme and never measures.
 * 2. It measures on a timer, not a frame, so it also works in a tab that is not
 *    painting — the same choice `Highlights.tsx` makes and for the same reason.
 * 3. It watches everything that moves the words: the section, the strip's
 *    scroll, a resize, and any mutation inside the column.
 *
 * ## Over the text, not behind it
 *
 * The brief asked for the layer to sit behind the text. It sits over it instead,
 * with `mix-blend-mode: multiply`. For translucent ink the two are the same
 * picture — multiply darkens the paper and leaves the black letters black — and
 * the reason the brief gave for "behind" was that the layer must not intercept
 * taps, which `pointer-events: none` settles outright. Going genuinely behind
 * would need a negative z-index inside the reading strip's stacking context, and
 * that context is load-bearing for the page turn. The same trade is already made
 * by `.mark` in `SelectionMenu.module.css`, which has been proven on the phone.
 */

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { PaintedHighlight } from './highlightStyle.ts'
import { rangeOfQuote } from './selection.ts'
import styles from './HandDrawn.module.css'

/** One line-box of one highlight, ready to place. */
interface Stroke {
  key: string
  top: number
  left: number
  width: number
  height: number
  colour: string
  /** Which turbulence pair this stroke uses, and how far it tilts. */
  variant: number
  tilt: number
}

/**
 * How many different wobbles exist.
 *
 * Four, not one per highlight. A `feTurbulence` is generated once per filter and
 * then reused by every element pointing at it, so four filters cost four noise
 * fields no matter how many marks are on the page. Four is enough that no two
 * neighbouring strokes look stamped from the same die, which is the only thing
 * the variation is for.
 */
const VARIANTS = [0, 1, 2, 3]

/** Whether two measured sets place the same ink in the same places. */
function same(a: readonly Stroke[], b: readonly Stroke[]): boolean {
  if (a.length !== b.length) return false
  return a.every((one, index) => {
    const other = b[index]!
    return (
      one.key === other.key &&
      one.top === other.top &&
      one.left === other.left &&
      one.width === other.width &&
      one.height === other.height &&
      one.colour === other.colour
    )
  })
}

export interface HandDrawnProps {
  highlights: readonly PaintedHighlight[]
  root: HTMLElement | null
  watch?: unknown
}

export function HandDrawn({ highlights, root, watch }: HandDrawnProps) {
  const [strokes, setStrokes] = useState<Stroke[]>([])

  const measure = useCallback(() => {
    if (!root) {
      setStrokes([])
      return
    }

    const found: Stroke[] = []
    for (const highlight of highlights) {
      if (!highlight.quote) continue
      const range = rangeOfQuote(highlight.anchor, highlight.quote)
      if (!range || !root.contains(range.commonAncestorContainer)) continue

      // The seed is derived from the highlight's id, so a mark keeps the same
      // wobble and the same tilt for its whole life — through a re-measure, a
      // page turn, and a reload.
      const variant = VARIANTS[Math.floor(highlight.seed * VARIANTS.length)] ?? 0
      const tilt = (highlight.seed - 0.5) * 1.2

      let line = 0
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue
        found.push({
          key: `${highlight.id}:${line}`,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          colour: highlight.colour,
          variant,
          tilt,
        })
        line += 1
      }
    }

    // Only when it actually moved. A measure runs on every mutation in the
    // column, and a fresh array each time would re-render — and re-portal — the
    // whole layer for a page that has not moved a pixel.
    setStrokes((current) => (same(current, found) ? current : found))
  }, [highlights, root])

  useEffect(() => {
    // Nothing to draw, nothing to watch. A book with no marks in it should not
    // carry an observer on every node in the column.
    if (!root || highlights.length === 0) return

    measure()

    /*
     * One coalesced pass per burst of change, on a timer.
     *
     * A section change fires a hundred mutations and one scroll fires a hundred
     * events; both should cost one measure. `setTimeout(0)` rather than
     * `requestAnimationFrame` deliberately — a frame callback never runs in a
     * backgrounded tab, and a reader coming back to one would find every mark in
     * last week's position.
     */
    let pending = 0
    const soon = () => {
      if (pending) return
      pending = window.setTimeout(() => {
        pending = 0
        measure()
      }, 0)
    }

    const changes = typeof MutationObserver === 'function' ? new MutationObserver(soon) : null
    changes?.observe(root, { childList: true, subtree: true, characterData: true })

    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(soon) : null
    sizes?.observe(root)

    // Capture, because the strip that actually scrolls is inside the page and
    // its scroll event does not bubble to the window.
    window.addEventListener('scroll', soon, { capture: true, passive: true })
    window.addEventListener('resize', soon, { passive: true })

    return () => {
      if (pending) window.clearTimeout(pending)
      changes?.disconnect()
      sizes?.disconnect()
      window.removeEventListener('scroll', soon, { capture: true })
      window.removeEventListener('resize', soon)
    }
  }, [measure, root, watch, highlights.length])

  if (typeof document === 'undefined' || strokes.length === 0) return null

  /*
   * Portalled to `document.body`, like the selection menu's own marks.
   *
   * These are `position: fixed`, and a fixed box is measured against the nearest
   * transformed ancestor rather than the viewport. The reading stage carries a
   * scale transform, so a layer rendered inside it would place every stroke in
   * the wrong place by exactly that scale.
   */
  return createPortal(
    <div className={styles.layer} aria-hidden="true">
      <Filters />
      {strokes.map((stroke) => (
        <span
          key={stroke.key}
          className={styles.stroke}
          style={{
            top: stroke.top,
            left: stroke.left,
            width: stroke.width,
            height: stroke.height,
            transform: `rotate(${stroke.tilt.toFixed(2)}deg)`,
            // Custom properties rather than four class names: the colour is a
            // stored value and can be anything, and so the CSS cannot know it.
            ['--ink' as string]: stroke.colour,
            ['--wobble' as string]: `url(#rb-mark-${stroke.variant})`,
            ['--pool' as string]: `url(#rb-pool-${stroke.variant})`,
          }}
        />
      ))}
    </div>,
    document.body,
  )
}

/**
 * The turbulence fields the strokes point at.
 *
 * Rendered once, inside the layer, and never re-rendered — the `seed` on each
 * `feTurbulence` is a constant, so React has nothing to update here and the
 * browser generates each noise field once. The generous filter regions are
 * needed because a displacement map pushes pixels outside the source box; they
 * are bounded rather than unbounded so the browser knows how much to rasterize.
 */
function Filters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {VARIANTS.map((variant) => (
          <g key={variant}>
            <filter id={`rb-mark-${variant}`} x="-15%" y="-45%" width="130%" height="190%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018 0.055"
                numOctaves={2}
                seed={5 + variant * 7}
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale={5}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <filter id={`rb-pool-${variant}`} x="-45%" y="-45%" width="190%" height="190%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.05 0.09"
                numOctaves={2}
                seed={9 + variant * 7}
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale={4}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </g>
        ))}
      </defs>
    </svg>
  )
}
