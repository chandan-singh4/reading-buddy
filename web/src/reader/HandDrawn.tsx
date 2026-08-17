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
  /** Which highlight this stroke belongs to, so ink can outlive its row or not. */
  id: string
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

/**
 * Every anchored block a quote covers, from the first to the last.
 *
 * They are siblings in the strip, so the walk is `nextElementSibling`. Bounded,
 * because a range whose end is somehow not after its start must not become a
 * walk to the end of the chapter.
 */
function blocksOf(first: HTMLElement, last: HTMLElement | null): HTMLElement[] {
  const blocks: HTMLElement[] = [first]
  if (!last || last === first) return blocks

  let node = first.nextElementSibling
  for (let step = 0; node && step < SPAN_BLOCKS; step += 1) {
    if (node instanceof HTMLElement && ANCHOR_ID.test(node.id)) blocks.push(node)
    if (node === last) return blocks
    node = node.nextElementSibling
  }
  // The end was never reached: paint the block we are sure of and no more.
  return [first]
}

/** How many blocks past the first one one quote may cover. */
const SPAN_BLOCKS = 64

/**
 * The line boxes of a range — the words, and nothing but the words.
 *
 * `Range.getClientRects()` is not one answer but two, and which one it gives
 * depends on where the boundaries sit. Boundaries *inside* text return tight
 * boxes around the letters. Boundaries on an element — which is what cutting a
 * range at a paragraph's edge produces — let the browser answer with the boxes
 * of whole nodes instead, and a fully covered paragraph then comes back as one
 * rectangle the size of the paragraph. Painted, that is a solid slab of colour
 * from margin to margin, over the line gaps and past the end of the last line.
 * That is what the reader photographed: two paragraphs as blocks, and the third
 * — the only one cut inside its text — correct.
 *
 * So no rectangle here is ever asked for across an element edge. The range is
 * split into one piece per text node, each piece measured on its own, and the
 * pieces that share a line are joined back together. Text boundaries only, so
 * there is only ever the one answer.
 */
function linesOf(part: Range): DOMRect[] {
  const found: DOMRect[] = []

  const holder =
    part.commonAncestorContainer instanceof Element
      ? part.commonAncestorContainer
      : part.commonAncestorContainer.parentElement
  if (!holder) return found

  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!part.intersectsNode(node)) continue

    const piece = document.createRange()
    piece.selectNodeContents(node)
    if (piece.compareBoundaryPoints(Range.START_TO_START, part) < 0) {
      piece.setStart(part.startContainer, part.startOffset)
    }
    if (piece.compareBoundaryPoints(Range.END_TO_END, part) > 0) {
      piece.setEnd(part.endContainer, part.endOffset)
    }
    if (piece.collapsed) continue

    for (const rect of piece.getClientRects()) {
      if (rect.width > 0 && rect.height > 0) found.push(rect)
    }
  }

  return join(found)
}

/**
 * One box per line, out of one box per run of text.
 *
 * A line broken by an italic word measures as two or three boxes, and drawn as
 * three the marker would put a wet pen-pool in the middle of a word. Boxes that
 * sit on the same line and touch are made one.
 */
function join(rects: readonly DOMRect[]): DOMRect[] {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: DOMRect[] = []

  for (const rect of sorted) {
    const last = lines[lines.length - 1]
    // Two pixels of tolerance: a superscript or a smaller font on the same line
    // sits a little higher, and a space between two runs is not a gap.
    if (last && Math.abs(last.top - rect.top) <= 2 && rect.left <= last.right + 2) {
      const left = Math.min(last.left, rect.left)
      const top = Math.min(last.top, rect.top)
      const right = Math.max(last.right, rect.right)
      const bottom = Math.max(last.bottom, rect.bottom)
      lines[lines.length - 1] = new DOMRect(left, top, right - left, bottom - top)
      continue
    }
    lines.push(rect)
  }

  return lines
}

/**
 * The part of `range` that lies inside `block`, or `null` if none of it does.
 *
 * A range over three paragraphs measures as one set of line boxes across all
 * three, and those boxes have to be placed in three different paragraphs. Cut
 * the range at the block's own edges and each piece measures where it belongs.
 */
function clipTo(range: Range, block: HTMLElement): Range | null {
  const whole = document.createRange()
  whole.selectNodeContents(block)

  const part = range.cloneRange()
  try {
    if (part.compareBoundaryPoints(Range.START_TO_START, whole) < 0) {
      part.setStart(whole.startContainer, whole.startOffset)
    }
    if (part.compareBoundaryPoints(Range.END_TO_END, whole) > 0) {
      part.setEnd(whole.endContainer, whole.endOffset)
    }
  } catch {
    // Boundary points in different documents — a copy of the page mid-turn.
    return null
  }
  return part.collapsed ? null : part
}

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
      const first = blockOf(range.startContainer)
      const last = blockOf(range.endContainer) ?? first
      if (!first || !root.contains(first)) continue

      /*
       * One quote can cover several paragraphs, and each paragraph holds its own
       * ink. A reader who taps Paragraph twice selects two of them; the range is
       * then one range over two blocks, and a single set of strokes measured
       * against the first block would place the second block's lines hundreds of
       * pixels away — or, before this, nowhere at all.
       *
       * So the range is cut at each block boundary and each piece is measured
       * against the block it lies in.
       */
      for (const block of blocksOf(first, last)) {
        if (!root.contains(block)) continue
        const part = clipTo(range, block)
        if (!part) continue

        /*
         * The page can be under a scale — that is what raising the toolbars does
         * — and `getClientRects` answers in painted pixels while the box the ink
         * is placed in is measured in layout ones. One divides out the other.
         */
        const bounds = block.getBoundingClientRect()
        const scale = block.offsetWidth > 0 ? bounds.width / block.offsetWidth : 1
        if (scale <= 0) continue

        /*
       * The origin is the paragraph's *first* fragment, not its bounding box.
       *
       * The page is a strip of columns, and a paragraph long enough to run past
       * the foot of one is broken in two: a piece at the bottom of this page and
       * a piece at the top of the next. `getBoundingClientRect` answers with the
       * box around *both* pieces, whose top is the top of the second one — 466px
       * above where the paragraph actually starts, in the case that showed this.
       *
       * The browser does not place the ink there. An absolutely positioned child
       * of a broken paragraph hangs off the first piece (measured in the running
       * page, not assumed). Measuring from one corner and painting from another
       * is what moved a whole highlight onto the following page.
       *
       * The strokes of the second piece then come out with a left offset of
         * roughly one column plus the gap, which is exactly where that column is.
         *
         * ## The ink is folded into the next column, exactly as the text is
         *
         * The first fragment is the origin, but an offset from it is not a place
         * on the screen. The paragraph's box is broken by the column, and so is
         * anything positioned inside it: ink pushed past the foot of the column
         * does not hang below the page, it reappears at the top of the next
         * column. Measured in the running page, with a probe at known offsets:
         *
         *     top +100 → 100px down, same column
         *     top +471 → *up* 145px and one column right
         *     top +900 → two columns right
         *
         * Every fold takes the same step: down by the column's height, across by
         * the column's pitch. Ink for a line in the second fragment must
         * therefore be given the offset that folds *onto* it — its height plus
         * one column height, its left minus one column pitch — and the browser
         * lands it on the words. Placed naively it went a column early, which on
         * a phone is a highlight painted on the page before the words.
         *
         * Both numbers come from the paragraph's own fragments, so nothing here
         * knows or assumes anything about the page: the pitch is the step
         * between two fragments' left edges, and the height is the first
         * fragment's foot down to the second fragment's head.
         */
        const frags = block.getClientRects()
        const box = frags[0] ?? bounds
        const pitch = frags.length > 1 ? frags[1]!.left - frags[0]!.left : 0
        const fold = frags.length > 1 ? frags[0]!.bottom - frags[1]!.top : 0

        /** Which fragment of the paragraph a line sits in. */
        const fragmentOf = (rect: DOMRect): number => {
          for (let i = frags.length - 1; i > 0; i -= 1) {
            const frag = frags[i]!
            if (rect.left >= frag.left - 1 && rect.top >= frag.top - 1) return i
          }
          return 0
        }

        // The seed is derived from the highlight's id, so a mark keeps the same
        // wobble and the same tilt for its whole life — through a re-measure, a
        // page turn, and a reload.
        const variant = VARIANTS[Math.floor(highlight.seed * VARIANTS.length)] ?? 0
        const tilt = (highlight.seed - 0.5) * 1.2

        const mark = byBlock.get(block) ?? { key: block.id, block, strokes: [] }
        byBlock.set(block, mark)

        let line = mark.strokes.length
        for (const rect of linesOf(part)) {
          if (rect.width <= 0 || rect.height <= 0) continue
          const column = fragmentOf(rect)
          mark.strokes.push({
            key: `${highlight.id}:${line}`,
            id: highlight.id,
            top: (rect.top - box.top + column * fold) / scale,
            left: (rect.left - box.left - column * pitch) / scale,
            width: rect.width / scale,
            height: rect.height / scale,
            colour: highlight.colour,
            variant,
            tilt,
          })
          line += 1
        }
      }
    }

    const found = [...byBlock.values()].filter((mark) => mark.strokes.length > 0)

    /*
     * A measure that finds nothing, while the reader still has highlights, is
     * not an answer — it is a bad moment.
     *
     * The page is rebuilt and rearranged constantly, and a measure lands in the
     * middle of some of that: a paragraph between two renders, a strip that is
     * hidden for a turn, a copy that has replaced the original for a few frames.
     * Any of those reports no boxes at all. Acting on it takes the ink off the
     * page, and if a page turn photographs the page in that instant, the copy it
     * flips has no ink on it either — which is what the reader saw as the mark
     * disappearing the moment a slow swipe began.
     *
     * So an empty answer is ignored while the highlights themselves are still
     * there. The ink is only cleared when the reader actually removes it, which
     * is the early return at the top.
     */
    if (found.length === 0) {
      /*
       * Ignored, but not blindly. Ink for a row the reader has deleted must go.
       *
       * The rule above keeps the old ink because an empty measure is usually a
       * bad moment. It is not a bad moment when the reader has just taken a mark
       * off: the row is gone, the measure is honestly empty, and holding the old
       * answer left the colour on the words for good. That happened whenever the
       * deleted mark was the only one this root could measure — the book's other
       * highlights kept `highlights` non-empty, so the clear at the top never
       * ran, and nothing else ever cleared it.
       *
       * So drop the strokes whose highlight no longer exists, and keep the rest.
       * A mid-turn empty measure loses nothing, because every one of its rows is
       * still alive.
       */
      const live = new Set(highlights.map((highlight) => highlight.id))
      setMarks((current) => {
        const kept = current
          .map((mark) => ({ ...mark, strokes: mark.strokes.filter((s) => live.has(s.id)) }))
          .filter((mark) => mark.strokes.length > 0)
        return same(current, kept) ? current : kept
      })
      return
    }
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

    /*
     * Scroll is deliberately not listened to, and that is a fix, not an
     * omission.
     *
     * It was listened to when the ink was measured in screen coordinates. It is
     * measured in the paragraph's own coordinates now, and scrolling a strip of
     * columns moves the paragraph and the ink together — verified in the running
     * page: 1200px of scroll left every stroke's `top`, `left` and `width`
     * identical. So the listener could never change an answer.
     *
     * It could and did cost a great deal. A page turn writes to the DOM on every
     * frame and scrolls the strip, and a geometry read after a write must relay
     * the whole strip out. Measured on a 6000-paragraph section: a read costs
     * 0.1ms with layout clean and about 550ms with it dirty. One turn of a
     * heavily marked page therefore paid for several full relayouts, which is
     * exactly the slow, sticky turn the reader reported — worst in hand-drawn,
     * because that page carries the most ink.
     */
    window.addEventListener('resize', soon, { passive: true })

    /*
     * A picture arriving *does* move the words, and it is neither a mutation nor
     * a size change of the strip — the image element was always there, and the
     * strip's own box never changes. It is the columns behind it that shift.
     * Capture, because `load` does not bubble. It fires once per picture.
     */
    root.addEventListener('load', soon, { capture: true })

    return () => {
      if (pending) window.clearTimeout(pending)
      changes?.disconnect()
      sizes?.disconnect()
      window.removeEventListener('resize', soon)
      root.removeEventListener('load', soon, { capture: true })
    }
  }, [measure, root, watch])

  /*
   * A paragraph is not a positioned box, and the ink has to be placed against
   * one. Set here rather than in the stylesheet because the paragraphs belong to
   * the book, not to this component, and only the ones actually carrying a mark
   * should be touched. Put back on the way out.
   *
   * `isolation: isolate` makes the paragraph a stacking context, and that is not
   * cosmetic — it is what makes the ink survive a page turn. The layer sits at
   * `z-index: -1` so it paints under the words; without a stacking context here
   * that -1 resolves against the nearest ancestor that is one. On the live page
   * that ancestor (`.stage`) has no background and the ink shows. Inside a
   * turning sheet it is the sheet box, which is deliberately *opaque* — so the
   * ink painted behind the sheet's own background and the reader saw a page with
   * every highlight wiped off it, exactly at the moment the finger moved. With
   * the paragraph as the stacking context, -1 can only reach as far as the
   * paragraph's own background, wherever the paragraph is copied to.
   */
  useEffect(() => {
    const touched = marks.map((mark) => mark.block)
    for (const block of touched) {
      block.style.position = 'relative'
      block.style.isolation = 'isolate'
    }
    return () => {
      for (const block of touched) {
        block.style.position = ''
        block.style.isolation = ''
      }
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
