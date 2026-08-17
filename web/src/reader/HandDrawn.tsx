/**
 * Highlights as marker strokes.
 *
 * The other renderer — `Highlights.tsx` in its clean mode — hands the ranges to
 * the browser and lets it paint them as ink under the words. That is the better
 * model and it is the default for a reason: there is nothing to measure, so a
 * page turn or a font change moves the colour with the text in the same frame.
 *
 * This one cannot use it. `::highlight()` accepts a background colour and almost
 * nothing else — no filter, no mask — and a marker stroke is *made* of a filter
 * and a mask. So this renderer measures: one box per line of each highlight.
 *
 * ## The ink goes inside the paragraph it marks
 *
 * The first version painted into one fixed layer over the whole screen. It was
 * wrong three times over on the phone, and all three faults were the same fault:
 * ink that is not part of the page does not travel with the page.
 *
 * - Raising the toolbars scales the reading stage. The words moved; the ink,
 *   fixed to the screen, did not, and then visibly chased them.
 * - Starting a page turn lays a copy of the page over the real one. The copy had
 *   no ink on it, so the mark vanished the moment a finger moved.
 * - Nothing above reports a transform, so there was nothing honest to listen to.
 *
 * Now each mark is drawn inside the anchored paragraph that holds its words, in
 * that paragraph's own coordinates. A transform on any ancestor carries it. The
 * strip scrolling carries it. And a page turn copies the paragraph — with the
 * ink already in it — into the sheet that flips.
 *
 * ## Alpha, not multiply
 *
 * The consequence, and it is worth stating plainly: `mix-blend-mode: multiply`
 * only mixes with the backdrop of the stacking context the ink sits in, and
 * inside the page that backdrop is the page, not the paper. So the ink is
 * translucent instead — the same thing the clean style does with its background
 * colour, which is legible on every theme this app ships.
 */

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { PaintedHighlight } from './highlightStyle.ts'
import { ANCHOR_ID, rangeOfQuote } from './selection.ts'
import styles from './HandDrawn.module.css'

/** The anchored paragraph a node sits in, if it is in one. */
function blockOf(node: Node | null): HTMLElement | null {
  let element = node instanceof Element ? node : (node?.parentElement ?? null)
  while (element) {
    if (element instanceof HTMLElement && ANCHOR_ID.test(element.id)) return element
    element = element.parentElement
  }
  return null
}

/** One line-box of one highlight, in its paragraph's own coordinates. */
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

/** Every stroke that belongs in one paragraph. */
interface Mark {
  key: string
  block: HTMLElement
  strokes: Stroke[]
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
function same(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a.length !== b.length) return false
  return a.every((one, index) => {
    const other = b[index]!
    if (one.block !== other.block || one.strokes.length !== other.strokes.length) return false
    return one.strokes.every((stroke, at) => {
      const twin = other.strokes[at]!
      return (
        stroke.key === twin.key &&
        stroke.top === twin.top &&
        stroke.left === twin.left &&
        stroke.width === twin.width &&
        stroke.height === twin.height &&
        stroke.colour === twin.colour
      )
    })
  })
}

export interface HandDrawnProps {
  highlights: readonly PaintedHighlight[]
  root: HTMLElement | null
  watch?: unknown
  /**
   * The marker look, or a flat wash.
   *
   * Both styles are painted here, and that is deliberate. The clean style used
   * the browser's own highlight API, which holds *text nodes* — and this reader
   * shows a copy of the page whenever it turns one, with its own text nodes. So
   * the colour stayed on the page underneath and the reader watched it go. Ink
   * that is real elements inside the paragraph is copied with the paragraph, by
   * every mechanism, for free.
   */
  marker?: boolean
}

export function HandDrawn({ highlights, root, watch, marker = true }: HandDrawnProps) {
  const [marks, setMarks] = useState<Mark[]>([])

  const measure = useCallback(() => {
    if (!root || highlights.length === 0) {
      // Not an early return with the state left alone: a highlight the reader
      // has just taken off must take its ink with it.
      setMarks((current) => (current.length === 0 ? current : []))
      return
    }

    const byBlock = new Map<HTMLElement, Mark>()

    for (const highlight of highlights) {
      if (!highlight.quote) continue
      const range = rangeOfQuote(highlight.anchor, highlight.quote)
      if (!range || !root.contains(range.commonAncestorContainer)) continue

      /*
       * The block comes from the range, not from `getElementById(anchor)`. An
       * anchor is stored in brackets — `[ch02-s03-p013]` — and the element's id
       * is the bare part inside them, so looking one up by the stored string
       * finds nothing at all. Walking up from the range cannot get that wrong,
       * and it lands on the same paragraph the quote was matched inside.
       */
      const block = blockOf(range.startContainer)
      if (!block || !root.contains(block)) continue

      /*
       * The page can be under a scale — that is what raising the toolbars does —
       * and `getClientRects` answers in painted pixels while the box the ink is
       * placed in is measured in layout ones. One divides out the other.
       */
      const box = block.getBoundingClientRect()
      const scale = block.offsetWidth > 0 ? box.width / block.offsetWidth : 1
      if (scale <= 0) continue

      // The seed is derived from the highlight's id, so a mark keeps the same
      // wobble and the same tilt for its whole life — through a re-measure, a
      // page turn, and a reload.
      const variant = VARIANTS[Math.floor(highlight.seed * VARIANTS.length)] ?? 0
      const tilt = (highlight.seed - 0.5) * 1.2

      const mark = byBlock.get(block) ?? { key: block.id, block, strokes: [] }
      byBlock.set(block, mark)

      let line = 0
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue
        mark.strokes.push({
          key: `${highlight.id}:${line}`,
          top: (rect.top - box.top) / scale,
          left: (rect.left - box.left) / scale,
          width: rect.width / scale,
          height: rect.height / scale,
          colour: highlight.colour,
          variant,
          tilt,
        })
        line += 1
      }
    }

    const found = [...byBlock.values()].filter((mark) => mark.strokes.length > 0)
    // Only when it actually moved. A measure runs on every mutation in the
    // column, and a fresh array each time would re-render every layer for a page
    // that has not moved a pixel.
    setMarks((current) => (same(current, found) ? current : found))
  }, [highlights, root])

  useEffect(() => {
    if (!root) return

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

    /*
     * Our own ink is a mutation too. Watching it would be a loop: measure, place
     * a stroke, hear the stroke land, measure again.
     */
    const ours = (node: Node): boolean =>
      node instanceof Element
        ? node.closest(`.${styles.layer}`) !== null
        : node.parentElement?.closest(`.${styles.layer}`) !== null

    const changes =
      typeof MutationObserver === 'function'
        ? new MutationObserver((records) => {
            if (records.every((record) => ours(record.target))) return
            soon()
          })
        : null
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
  }, [measure, root, watch])

  /*
   * A paragraph is not a positioned box, and the ink has to be placed against
   * one. Set here rather than in the stylesheet because the paragraphs belong to
   * the book, not to this component, and only the ones actually carrying a mark
   * should be touched. Put back on the way out.
   */
  useEffect(() => {
    const touched = marks.map((mark) => mark.block)
    for (const block of touched) block.style.position = 'relative'
    return () => {
      for (const block of touched) block.style.position = ''
    }
  }, [marks])

  if (typeof document === 'undefined' || marks.length === 0) return null

  return (
    <>
      <Filters />
      {marks.map((mark) =>
        createPortal(
          <span className={styles.layer} aria-hidden="true">
            {mark.strokes.map((stroke) => (
              <span
                key={stroke.key}
                className={marker ? styles.stroke : `${styles.stroke} ${styles.plain}`}
                style={{
                  top: stroke.top,
                  left: stroke.left,
                  width: stroke.width,
                  height: stroke.height,
                  // Custom properties rather than four class names: the colour
                  // is a stored value and can be anything, so the CSS cannot
                  // know it. The tilt is one too, so that the box holding the
                  // ink stays free of a transform of its own.
                  ['--tilt' as string]: `${stroke.tilt.toFixed(2)}deg`,
                  ['--ink' as string]: stroke.colour,
                  ['--wobble' as string]: `url(#rb-mark-${stroke.variant})`,
                  ['--pool' as string]: `url(#rb-pool-${stroke.variant})`,
                }}
              />
            ))}
          </span>,
          mark.block,
          mark.key,
        ),
      )}
    </>
  )
}

/**
 * The turbulence fields the strokes point at.
 *
 * Rendered once, and never re-rendered — the `seed` on each `feTurbulence` is a
 * constant, so React has nothing to update here and the browser generates each
 * noise field once. The generous filter regions are needed because a
 * displacement map pushes pixels outside the source box; they are bounded rather
 * than unbounded so the browser knows how much to rasterize.
 *
 * They live at the end of the document rather than inside a paragraph: a filter
 * is referenced by id from anywhere, and a page turn copies paragraphs — which
 * would copy these too, ids and all, and a duplicate id is a filter nobody can
 * name reliably.
 */
function Filters() {
  return createPortal(
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
    </svg>,
    document.body,
  )
}
