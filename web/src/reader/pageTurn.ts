/**
 * Making a turn between two sections look like a turn within one.
 *
 * ## The problem this solves
 *
 * Inside a section, a page turn is a sideways scroll of one column. Two pages
 * are on the move at once and they move *together*: the page you are leaving
 * slides off to the left in exactly the same motion that brings the next one in
 * from the right. Nothing appears and nothing vanishes — the strip slides, and
 * your eye tracks it.
 *
 * Between sections there is no strip to slide. The new section is different
 * text loaded into the same box, so the page you were on is simply gone the
 * instant the next one exists. Animating the arriving text alone — which is
 * what the first attempt did — is better than a hard cut, but it reads wrong,
 * and the reason is precise: **one page moves instead of two.** The eye is
 * expecting the outgoing page to carry the movement and it isn't there.
 *
 * ## What this does
 *
 * Gives the outgoing page back. At the moment of the turn it takes a copy of
 * the laid-out section, still scrolled to the page being left, and lays it over
 * the strip. The real strip then loads the new section *underneath* that copy —
 * so there is no blank flash while the section is fetched, either, which the
 * previous version had. Once the new section is on screen and scrolled to the
 * right page, both move at once: the copy slides out, the strip slides in, same
 * distance, same curve, same time. That is the same movement as a scroll, made
 * out of two elements instead of one.
 *
 * ## Why a DOM clone rather than a second React tree
 *
 * Rendering the outgoing section a second time through React would put every
 * one of its anchors into the document twice, and the whole reading screen
 * finds paragraphs with `document.getElementById` — the page number, the
 * landing scroll, following a link. Duplicated ids would quietly hand half of
 * those the wrong element. A clone has no such problem: the ids are stripped
 * from it on the way out, and it never re-renders, because it is a picture of
 * something that has already happened.
 */

import { MOVE_TIMING, prefersReducedMotion } from './motion.ts'
import {
  castShadow,
  COMPLETE_MS,
  completionEase,
  curl,
  PERSPECTIVE,
  releaseInto,
  SNAP_MS,
  snapBackEase,
  STRIPS,
} from './pageCurl.ts'

/** An outgoing page being held on screen, waiting for the new one to arrive. */
export interface HeldPage {
  /** The copy laid over the strip. */
  node: HTMLElement
  /** Which way the turn was going: 1 forwards, -1 back. */
  by: 1 | -1
  /** How small the text was drawn when the turn began — see `holdOutgoing`. */
  scale: number
}

/**
 * The box a copy is laid inside: the reading screen itself.
 *
 * Found by attribute rather than by walking up to `strip.parentElement`, which
 * is what this did until the text gained a wrapper of its own that *scales*
 * (`.stage`). Hanging the copy inside a scaled box would have scaled every
 * measured offset a second time. Marked on the element instead, so the frame
 * stays the unscaled screen however the boxes between are rearranged.
 */
const FRAME = '[data-page-frame]'

/**
 * Take a copy of the page being left and lay it over the strip.
 *
 * `scale` is how small the *text* is currently drawn — 1 while reading, less
 * while the toolbar is up and the page has stepped back for it. It cannot be
 * measured here to the precision this needs (`offsetWidth` is a whole number,
 * and a fraction of a per cent of a page's width is a visible misalignment), so
 * the reading page, which owns the number, hands it over.
 *
 * Returns `null` when there is nothing to do — no strip, no frame to hang the
 * copy on, or a reader who has asked for less movement, who gets the instant
 * change they asked for.
 */
export function holdOutgoing(
  strip: HTMLElement | null,
  by: 1 | -1,
  scale = 1,
): HeldPage | null {
  const node = copyOf(strip, 1, scale)
  // Whichever way the turn goes, this copy is the page being left: forwards it
  // is the sheet that flies away, backwards it is the one that lies still while
  // the destination lands on top of it. Both are gone at the end, so both may
  // travel without their pen. See `HandDrawn.module.css`.
  node?.setAttribute('data-page-leaving', '')
  return node ? { node, by, scale } : null
}

/**
 * What belongs to the page rather than to the app around it.
 *
 * Carried by the status line in `reader/Chrome.tsx` — the page number and the
 * "% left". The top bar is deliberately *not* marked: it is navigation that
 * happens to be over a book, and a sheet of paper does not take the room's
 * furniture with it when it turns.
 */
const FURNITURE = '[data-page-furniture]'

/**
 * How many children `pageCopy` looks back through for a column boundary.
 *
 * A bound, not a budget. Looking is cheap once the strip is laid out, but a
 * book of long paragraphs may have no boundary for a very long way, and copying
 * from the start of the chapter is the 24 s stall. Past this, the copy uses the
 * spacer instead.
 */
const REACH = 64

/**
 * A picture, not a page: nothing in a copy may be tapped, focused, found by a
 * search or read out by a screen reader, all of which would be describing
 * something the reader can no longer see. Ids go too — the reading screen looks
 * paragraphs up with `getElementById`, and a second copy of each would answer
 * those lookups with an element on its way off the screen.
 */
function makeInert(node: HTMLElement): void {
  node.removeAttribute('id')
  for (const element of Array.from(node.querySelectorAll('[id]'))) {
    element.removeAttribute('id')
  }
  node.setAttribute('aria-hidden', 'true')
  node.inert = true
}

/**
 * Lay a clone of `source` inside `wrapper` at the place `source` occupies on
 * screen.
 *
 * Everything is placed from measured rectangles rather than inherited from the
 * stylesheet, which is what lets a `position: fixed` element — the status line
 * is one — travel inside a wrapper that rotates. Fractional widths, from the
 * rect rather than `offsetWidth`: a copy a whole pixel wider than the original
 * lays its columns out at a different pitch, and the still picture of the page
 * you just left would not quite be it.
 *
 * ## Size and scale are two different questions
 *
 * A measured rectangle is what the source *looks* like. When the page has
 * stepped back for the toolbar, that is smaller than what it *is* — and the two
 * cannot be conflated here, because a copy given the smaller size would lay its
 * columns out to fit it and quietly show different text. A still picture of the
 * page you just left has to be the same words in the same places.
 *
 * So the copy is built at the source's real size, `box.width / scale`, and then
 * drawn at `scale`. Laid out identically, painted identically, and the two
 * facts kept apart. `scale` is 1 for anything outside the box that shrinks —
 * the status line is placed with 1 whatever the text is doing.
 */
function place(
  source: HTMLElement,
  box: DOMRect,
  frame: DOMRect,
  wrapper: HTMLElement,
  scale: number,
  prepared?: HTMLElement,
  offset = 0,
): HTMLElement {
  // `box` is handed in, never measured here, and that is not tidiness — see
  // `measureSheet`. A dragged turn calls this thirty-odd times in a row, each
  // call appending to the document; a rectangle read in between makes the
  // browser lay the whole chapter out again before it can answer.
  //
  // `prepared` is a copy someone else has already made and cut down — see
  // `pageCopy`. The size still comes from the real element, because the copy has
  // to be laid out at the size of the original to show the same words in the
  // same places; only the *content* is smaller.
  const clone = prepared ?? (source.cloneNode(true) as HTMLElement)

  makeInert(clone)

  clone.style.position = 'absolute'
  clone.style.top = `${box.top - frame.top}px`
  clone.style.left = `${box.left - frame.left}px`
  clone.style.width = `${box.width / scale}px`
  clone.style.height = `${box.height / scale}px`
  if (scale !== 1 || offset !== 0) {
    // From the top left, which is the corner the position above pins. Any other
    // origin would move the copy away from the rectangle it was measured at.
    clone.style.transformOrigin = 'top left'
    // `translateX` before the scale is applied, so `offset` stays in the source's
    // own pixels — the same units a scroll position is in. Written in this order
    // because CSS applies the list right to left.
    clone.style.transform = `scale(${scale}) translateX(${-offset}px)`
  }
  if (offset !== 0) {
    // ## Why the page is moved and not scrolled
    //
    // The copy is a scrolling box, and the obvious way to show page forty of it
    // is to set `scrollLeft`. It was, and it cost 165 ms of the roughly 200 ms
    // a dragged turn took. A dragged turn makes sixteen copies; each `scrollLeft`
    // is a write the browser has to lay the page out to honour, and it cannot
    // batch sixteen of them, so it laid the chapter out sixteen times.
    //
    // A transform is not a layout at all — the box stays where it is and only
    // the painting moves. Nothing is scrolled now, so the columns to the right
    // of the page hang outside the copy's box, and the sheet (`sheetBox`, which
    // clips) is what hides them. Same picture, one layout instead of sixteen.
    clone.style.overflow = 'visible'
  }
  clone.style.margin = '0'
  clone.style.maxWidth = 'none'
  clone.style.zIndex = 'auto'
  // A backward turn copies the page a second time, by which point the real
  // furniture is already hidden for the first copy — and `cloneNode` brings
  // that inline `visibility` with it. Overridden here, or the second sheet
  // would turn with a hole in it where the page number should be.
  clone.style.visibility = 'visible'
  // The clone inherits whatever entrance animation its original last played,
  // and would replay it on being inserted.
  clone.style.animation = 'none'
  // It also inherits `scroll-behavior: smooth`, which turns the scroll
  // assignment in `copyOf` into an *animation*. That was the whole of one
  // earlier glitch, and it explains why only turning forwards looked wrong:
  // going back you always leave from a section's first page, where the position
  // to restore is zero and there is nothing to animate. Going forward you leave
  // from the last page, so the copy — meant to be a still picture of where you
  // just were — visibly raced from page one to that page as the turn started.
  clone.style.scrollBehavior = 'auto'

  wrapper.append(clone)
  return clone
}

/**
 * A copy of the strip holding only the pages near the one on screen.
 *
 * `shift` is how many content pixels were cut off the left, so a scroll
 * position in the real strip becomes `scrollLeft - shift` in the copy.
 */
interface PageCopy {
  node: HTMLElement
  shift: number
}

/**
 * Copy the page the reader is looking at — and **only** that page.
 *
 * ## Why this exists
 *
 * A turn used to copy the whole laid-out section. That is not the visible page:
 * it is the entire chapter as a multi-column strip, which on a real book runs to
 * thousands of columns. Copying the nodes is not the problem — measured at
 * **7 ms** for 6,003 of them. Laying them out afterwards is: **1,529 ms**, and a
 * dragged turn needs sixteen of them, which is where the twenty-four seconds and
 * the out-of-memory crash came from.
 *
 * So the copy is cut down before it ever enters the document. A detached node
 * costs nothing to edit — the browser lays nothing out until it is inserted — so
 * the removal is free and what does get laid out is a dozen paragraphs instead of
 * six thousand. Measured on the same book: **13 ms**, and 43 ms for a complete
 * sixteen-band sheet against 24,583 ms before. The point is not the ratio; it is
 * that the cost no longer grows with the length of the chapter.
 *
 * ## Two things that have to be exact, or the copy shows the wrong words
 *
 * **Where the text starts.** The copy always begins at a child that begins a
 * column in the strip, so its own first column begins in the same state and
 * every break after it falls in the same place. See `columnTop` for why no
 * other start works.
 *
 * **Where to scroll it to.** A block child's left edge *is* its column's left
 * edge, so the first kept paragraph's position is a column boundary, and content
 * in the copy sits exactly `shift` pixels left of where it sits in the strip.
 *
 * ## Finding the paragraphs without reading six thousand rectangles
 *
 * Children of a column box run left to right in document order, so the position
 * is monotonic and a binary search finds the ends in about two dozen
 * measurements. A whole page is kept either side of the visible one, which
 * covers an image or a float that reaches back further than its own paragraph.
 *
 * Falls back to copying everything whenever the assumptions do not hold — no
 * layout yet, too few children, or a position that is not monotonic. Slow is a
 * great deal better than wrong, and a strip with no layout is also a strip with
 * nothing to lay out.
 */
function pageCopy(strip: HTMLElement): PageCopy {
  const whole = (): PageCopy => ({ node: strip.cloneNode(true) as HTMLElement, shift: 0 })

  const children = strip.children
  const count = children.length
  const pageWidth = strip.clientWidth
  if (pageWidth <= 0 || count < 4) return whole()

  const box = strip.getBoundingClientRect()

  /**
   * Where a child *starts*, which is not what its bounding box says.
   *
   * A paragraph long enough to break across a column boundary is drawn in two
   * pieces, and `getBoundingClientRect` hands back the box around both of them:
   * top at the top of the continued piece, left at the left of the first. So its
   * `top` is the top of the *column*, not the top of the paragraph, and the copy
   * built from it began the text a whole column too high — every line after it
   * moved up, the column breaks fell somewhere else, and the sheet showed words
   * from further down the chapter than the page it was supposed to be a picture
   * of. `getClientRects()[0]` is the first piece, which is the one that answers
   * "where does this begin".
   */
  const startOf = (node: Element): DOMRect =>
    node.getClientRects()[0] ?? node.getBoundingClientRect()

  const edge = (i: number) => startOf(children[i]!).left - box.left + strip.scrollLeft

  // The monotonicity the search depends on, checked rather than assumed.
  if (edge(0) > edge(count - 1)) return whole()

  /** The first child at or past `target` content pixels. */
  const search = (target: number) => {
    let low = 0
    let high = count
    while (low < high) {
      const mid = (low + high) >> 1
      if (edge(mid) < target) low = mid + 1
      else high = mid
    }
    return low
  }

  /** How far down its column a child starts, in content pixels. */
  const style = getComputedStyle(strip)
  const inset = parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)
  const below = (i: number) => startOf(children[i]!).top - box.top - inset

  /**
   * The last child at or before `from` that begins at the top of a column.
   *
   * ## Why the copy is not allowed to start anywhere else
   *
   * The copy has to break its columns in exactly the places the strip breaks
   * its own, or it shows the same paragraphs re-wrapped — a line of the page
   * before pushed onto the top of the page, every line after it moved down one,
   * and a reader mid-swipe watching the page they are leaving turn into a page
   * they have never seen. That was the reported fault.
   *
   * Starting at a column boundary needs nothing made up. The child sits at the
   * top of the copy's first column exactly as it sits at the top of its own,
   * and every break decision after it is made from the same state.
   *
   * ## Why the search stops
   *
   * A book of long paragraphs has very few boundaries: a paragraph that fills
   * three columns puts a boundary on none of them. An unbounded search walks
   * back to the start of the chapter and copies all of it — 24 s of blocked
   * thread, which is the stall this whole task removed. So the search stops
   * after `REACH` children and the copy falls back to the spacer, which holds
   * the first kept child at its measured height down the column.
   *
   * The spacer is measured to match, and it does; see the fingerprint runs in
   * `progress.md`. It was blamed once for a re-wrap that turned out to be the
   * lost `text-indent` below.
   */
  const columnTop = (from: number) => {
    for (let i = from; i >= 0 && from - i < REACH; i -= 1) {
      if (Math.abs(below(i)) < 1) return i
    }
    return -1
  }

  const candidate = Math.max(0, search(strip.scrollLeft - pageWidth) - 1)
  const aligned = columnTop(candidate)
  const first = aligned < 0 ? candidate : aligned
  /*
   * The end of the visible page, and not a page past it.
   *
   * This used to keep a whole page of slack on this side, mirroring the page
   * kept in front. The two are not the same, though, and only one of them earns
   * its keep. Columns flow forwards: what comes *before* the page decides where
   * its breaks fall, so the leading page is load-bearing. What comes *after* it
   * decides nothing, is off the sheet's right edge, and is never seen.
   *
   * It was a third of everything cloned, and it was cloned once per band. On a
   * phone that was about 25 ms of a 75 ms turn, spent on words outside the
   * picture. `search` returns the first child at or past the mark, and `last`
   * keeps it, so a paragraph straddling the edge is still whole.
   */
  const last = Math.min(count - 1, search(strip.scrollLeft + pageWidth))
  if (last <= first) return whole()

  const node = strip.cloneNode(false) as HTMLElement

  if (aligned < 0) {
    const spacer = document.createElement('div')
    spacer.style.height = `${below(first)}px`
    spacer.setAttribute('aria-hidden', 'true')
    node.append(spacer)
  }

  for (let i = first; i <= last; i += 1) {
    const child = children[i]!.cloneNode(true) as HTMLElement
    if (i === first) {
      // A top margin is truncated away at a column break, and it is already
      // counted inside the spacer's height. Either way, kept, it would push the
      // copy's text down by that much and break its columns a line early.
      child.style.marginTop = '0'
      // The copy's first child has no previous sibling, and the paragraph
      // indent is written as `.prose + .prose`. So the clone loses its indent,
      // the first line starts 1.5em further left, and — because that line now
      // has 1.5em more room — the paragraph can wrap a word early and take the
      // rest of the page down with it. Carry the real indent across.
      child.style.textIndent = getComputedStyle(children[i]!).textIndent
    }
    node.append(child)
  }

  return { node, shift: edge(first) }
}

/**
 * The real page furniture, hidden while a copy of it is doing the turning.
 *
 * Module-level rather than carried on the held page: a backward turn makes a
 * second copy after the first, and both would otherwise hide and restore
 * independently. One list, hidden once, restored once.
 */
let concealed: HTMLElement[] = []

/**
 * Take the real furniture off the screen for the length of a turn.
 *
 * It has to go, and `z-index` cannot do the job. The status line sits above the
 * overlay on purpose so it stays readable while the bars are up — which also
 * puts it above the turning sheet, where it would hang stationary over a page
 * visibly rotating out from under it. That is exactly the fault this change is
 * removing, so the real one steps aside and its copy, inside the sheet, is what
 * the reader sees turn.
 *
 * `visibility` rather than `display`: it keeps the element's box, so nothing
 * below it reflows for the length of a page turn.
 */
function concealFurniture(parent: HTMLElement): void {
  if (concealed.length > 0) return
  for (const item of Array.from(parent.querySelectorAll<HTMLElement>(FURNITURE))) {
    item.style.visibility = 'hidden'
    concealed.push(item)
  }
}

/** Give it back. Called when a turn ends, however it ends. */
function revealFurniture(): void {
  for (const item of concealed) item.style.visibility = ''
  concealed = []
}

/**
 * Sweep away any copy left standing after its turn ended.
 *
 * ## Why this exists at all
 *
 * Every copy this module makes is taken down by the thing that put it there —
 * `playFlip` clears its own, `settleDrag` clears the sheet. Both rely on a
 * frame arriving to tell them the animation has finished, and a frame is not a
 * promise. A tab backgrounded mid-turn, a compositor that stops for a
 * screenshot, an animation the browser never starts because the page was hidden
 * on the exact frame it was scheduled — in every one of those the copy stays,
 * and because a copy is a *photograph* of the page, the reader is left looking
 * at a book that has stopped responding. Swipes and taps still work underneath
 * it; nothing they do changes what they see. That is indistinguishable from a
 * crash, and it is the worst failure this screen has.
 *
 * So this is the floor. Call it when nothing is legitimately in flight and it
 * puts the real page back, whatever went wrong and whichever code path dropped
 * the ball. **It is never the fix for a leak** — a leak that reaches here has
 * already shown the reader a frozen page for as long as it took them to touch
 * it again. It is the guarantee that the freeze cannot outlast one touch.
 */
export function clearSheets(strip: HTMLElement | null): void {
  if (!strip || typeof document === 'undefined') return
  const parent = strip.closest<HTMLElement>(FRAME) ?? strip.parentElement
  if (!parent) return
  for (const sheet of Array.from(parent.querySelectorAll<HTMLElement>('[data-page-sheet]'))) {
    sheet.remove()
  }
  revealFurniture()
}

/**
 * A still picture of the whole page exactly as it looks now, laid over it.
 *
 * Both halves of a flip are made of these: the page being left, and — turning
 * backwards — the page arriving on top of it. Returns `null` when there is
 * nothing to copy or the reader has asked for less movement, in which case the
 * caller gets the instant change they asked for.
 *
 * ## Why this is the whole page and not just the text
 *
 * It used to copy the text strip alone, so a turn rotated the words while the
 * page number and the "% left" printed underneath them stayed nailed to the
 * screen. Paper does not do that. Everything printed on a sheet turns with the
 * sheet, so the copy is now the page-sized box the reading screen occupies,
 * holding the text *and* every element marked `data-page-furniture`, each laid
 * at the position it really has. One wrapper, one rotation, one sheet.
 *
 * ## Why the copies are wrapped rather than used bare
 *
 * The strip is a *scrolling* box — that is what a page turn inside a section
 * moves — and a copy of it is scrolled too. Anything laid over it with
 * `inset: 0` therefore lands at the copy's scroll *origin*, which on page forty
 * of a chapter is thirty-nine screens off to the left. The flip's shading has
 * to sit still over the page, so it hangs on a wrapper that doesn't scroll,
 * with the scrolled copy inside it. The wrapper is also the thing that gets
 * rotated, which keeps the rotation and the scroll from having to share one
 * element's `transform`.
 */
function copyOf(strip: HTMLElement | null, layer: number, scale: number): HTMLElement | null {
  if (!strip || prefersReducedMotion() || typeof document === 'undefined') return null

  // The reading screen's own box, which is the sheet's size — and deliberately
  // not the scaled wrapper the text sits in, so every offset below is measured
  // against something that never moves. `Reader.module.css` guarantees this
  // element is positioned and untransformed, so a child at `top: 0; left: 0`
  // lands on its top-left corner.
  const parent = strip.closest<HTMLElement>(FRAME) ?? strip.parentElement
  if (!parent) return null

  const frame = parent.getBoundingClientRect()
  const wrapper = sheetBox(frame)
  wrapper.style.zIndex = String(layer)

  const copy = pageCopy(strip)
  const plan = measureSheet(strip, parent)
  fillSheet(strip, plan, frame, wrapper, scale, copy)
  parent.append(wrapper)

  concealFurniture(parent)

  return wrapper
}

/**
 * An empty page-sized box, positioned over the frame's top-left corner.
 *
 * Shared by the fixed animation and the dragged one so the two are the same
 * object: whatever a turn is made of, it is made of this.
 */
function sheetBox(frame: DOMRect): HTMLElement {
  const box = document.createElement('div')
  box.setAttribute('aria-hidden', 'true')
  // Every scrap this module hangs on the page is branded, so `clearSheets` can
  // find one that has outlived its turn. See the note there.
  box.dataset.pageSheet = ''
  box.style.position = 'absolute'
  box.style.top = '0'
  box.style.left = '0'
  box.style.width = `${frame.width}px`
  box.style.height = `${frame.height}px`
  box.style.margin = '0'
  box.style.pointerEvents = 'none'
  // Opaque, or the page underneath shows through this one while they cross.
  box.style.background = 'var(--color-bg)'
  box.style.overflow = 'hidden'
  return box
}

/**
 * Put a picture of the whole page — text and furniture — inside `wrapper`.
 *
 * Split out of `copyOf` for the dragged turn, which needs the same picture
 * several times over: one per strip of the curling sheet, each clipped to its
 * own vertical band. Both callers get identical sheets by construction, which
 * is the point of the split — a tapped turn and a dragged one must not be
 * subtly different pictures of the same page.
 *
 * Returns the copied text, already showing the page the reader is on. It used
 * to be the caller's job to scroll it there after insertion; it is now a
 * transform applied here, which needs no document and no layout — see the note
 * on `offset` in `place`.
 */
function fillSheet(
  strip: HTMLElement,
  plan: SheetPlan,
  frame: DOMRect,
  wrapper: HTMLElement,
  scale: number,
  copy: PageCopy,
): HTMLElement {
  // One `pageCopy` per turn, cloned per sheet. Cloning the cut-down copy is a
  // dozen nodes; cutting it down again per sheet would repeat the search for
  // no gain, and cloning the *strip* again is the cost this all exists to avoid.
  // Less `shift`, because the copy starts at a later paragraph than the strip
  // does — see `pageCopy`. It is 0 when nothing was cut, so the whole-strip
  // fallback still lands on the same page it always did.
  const text = place(
    strip,
    plan.strip,
    frame,
    wrapper,
    scale,
    copy.node.cloneNode(true) as HTMLElement,
    strip.scrollLeft - copy.shift,
  )
  // The furniture is outside the box that shrinks — it holds its size while the
  // text steps back — so its copy is placed at 1, not at the text's scale.
  for (const item of plan.furniture) {
    place(item.node, item.box, frame, wrapper, 1)
  }
  return text
}

/**
 * Every rectangle a sheet needs, read once, before anything is added.
 *
 * ## Why this is a separate step
 *
 * A dragged turn builds sixteen sheets, and each sheet places the text plus
 * every piece of furniture. Each `place` used to measure its own source. That
 * is a read of the layout after the previous sheet was added to the document,
 * and the browser cannot answer a read with unapplied changes waiting, so it
 * lays out the page again first. On a long chapter — 1.38 million pixels of
 * columns — one turn did that thirty-odd times and took about 200 ms.
 *
 * Nothing being measured moves during a turn. The real page is still, and the
 * sheets go on top of it. So the numbers are all read here, before the first
 * sheet exists, and each `place` gets the answer instead of asking for it.
 */
interface SheetPlan {
  strip: DOMRect
  furniture: { node: HTMLElement; box: DOMRect }[]
}

function measureSheet(strip: HTMLElement, parent: HTMLElement): SheetPlan {
  return {
    strip: strip.getBoundingClientRect(),
    furniture: Array.from(parent.querySelectorAll<HTMLElement>(FURNITURE)).map((node) => ({
      node,
      box: node.getBoundingClientRect(),
    })),
  }
}

/**
 * How far over the page leans as it turns.
 *
 * Past ninety degrees on purpose: a page that stops edge-on hasn't turned, it
 * has folded. Carrying on to a hundred and eighteen takes it visibly *over* the
 * spine, which is the moment the eye reads as the turn having happened.
 */
const FLIP_DEGREES = 118

/**
 * How far the eye is from the page.
 *
 * One value for both kinds of turn — the fixed one below and the dragged one at
 * the foot of this file — so a page tapped over and a page pulled over are the
 * same object seen from the same place. It lives in `pageCurl.ts` with the rest
 * of the geometry.
 */
const FLIP_PERSPECTIVE = PERSPECTIVE

/**
 * Turn the page over.
 *
 * ## Why a rotation and not a slide
 *
 * A slide is what a *scroll* looks like, and for a long time that is what this
 * was — the outgoing page and the incoming one crossing sideways at the same
 * speed. It is honest about the underlying mechanism and it is the wrong
 * metaphor: the book on screen has a spine, a cover and page edges, and paper
 * does not slide sideways. It pivots about the binding.
 *
 * ## The two directions are not mirror images
 *
 * Turning **forwards**, the page you are leaving lifts and swings left over the
 * spine, uncovering the next one underneath. One moving page, one still page,
 * and the still one is the arriving one — which is already on the strip. So a
 * forward turn is a single copy of the outgoing page, rotating away.
 *
 * Turning **back** is the same motion run the other way, and that means the
 * moving page is the *arriving* one: it swings in from the left and lands on
 * top of the page you were reading. That page therefore has to stay visible
 * underneath for the whole turn — but the strip beneath has already been
 * scrolled to the destination. So a backward turn needs two copies: the page
 * being left, sitting still, and the page arriving, flipping onto it. Both are
 * dropped at the end and the real strip — which has shown the destination all
 * along, behind both of them — is simply revealed.
 *
 * Doing it with copies rather than by transforming the strip itself is what
 * keeps this free of the reading screen: nothing here reorders, re-styles or
 * re-stacks an element React owns.
 *
 * ## The shading
 *
 * A rotated `<div>` of text with no shading reads as a flat rectangle being
 * spun, and worse, shows its own text mirrored once it passes ninety degrees.
 * A single overlay handles both: it fades to the page colour as the sheet turns
 * edge-on — so what you see past halfway is the *back* of the page, blank, as
 * it would be — with a soft gradient across it for the shadow the lifted edge
 * casts on itself.
 */
export function playFlip(held: HeldPage | null, strip: HTMLElement | null): void {
  if (!held) return

  // No strip, or a platform with no Web Animations API — jsdom is the one that
  // matters, where there is no layout to animate either. The honest outcome is
  // the instant change: drop the copy and let the new page stand.
  if (!strip || typeof strip.animate !== 'function') {
    held.node.remove()
    revealFurniture()
    return
  }

  // Forwards, the outgoing copy is the one that moves. Backwards, it stays put
  // as the page being landed on, and a second copy — the page arriving — does
  // the moving on top of it.
  const still = held.by === -1 ? held.node : null
  const moving = held.by === -1 ? copyOf(strip, 2, held.scale) : held.node

  // `moving` here is the *arriving* page, and it is the one copy in this module
  // that is not marked as leaving. See `holdOutgoing` and `HandDrawn.module.css`.

  // The second copy couldn't be made (no parent, reduced motion changed under
  // us). Falling back to the instant change beats a half-played turn.
  if (!moving) {
    held.node.remove()
    revealFurniture()
    return
  }

  const shade = shadeOver(moving)

  moving.style.transformOrigin = '0% 50%'
  moving.style.backfaceVisibility = 'hidden'
  moving.style.willChange = 'transform, opacity'

  /*
   * Lay the copy out *before* the clock starts.
   *
   * This is what was making the turn feel like a jump rather than a movement,
   * and it is not a timing problem — it is a bookkeeping one. `holdOutgoing`
   * has just cloned a laid-out section: on a long chapter that is dozens of
   * pages of multi-column DOM, and none of it has been laid out yet, because
   * nothing has asked. `Element.animate` records its start time immediately and
   * then the browser does that layout — so the first frames of the turn are
   * spent on work, the animation is already 60–100 ms in by the time it paints,
   * and what the reader sees is the page appearing part-way through its swing.
   * The eye reads a movement that starts in the middle as no movement at all.
   *
   * Reading a geometry property forces the layout to happen here instead, on
   * the frame the reader's finger left the screen — where they are expecting
   * the gesture to cost something anyway. The animation then starts at zero and
   * every frame of the curve reaches the screen. Deliberately kept and not
   * "optimised away": the return value is unused on purpose, and that is the
   * whole point of the line.
   */
  void moving.getBoundingClientRect().width

  const at = (degrees: number) => `perspective(${FLIP_PERSPECTIVE}px) rotateY(${degrees}deg)`

  // Read forwards for a forward turn, backwards for a backward one — the same
  // motion, which is what makes going back feel like undoing rather than like a
  // second, different gesture.
  const sheet: Keyframe[] = [
    { transform: at(0), opacity: 1, offset: 0 },
    { transform: at(-FLIP_DEGREES * 0.6), opacity: 1, offset: 0.62 },
    { transform: at(-FLIP_DEGREES), opacity: 0, offset: 1 },
  ]

  // Opaque by halfway, which is where the sheet is edge-on: past that point the
  // reader is looking at the back of the page, and the back of a page has no
  // text on it.
  const shading: Keyframe[] = [
    { opacity: 0, offset: 0 },
    { opacity: 0.45, offset: 0.32 },
    { opacity: 1, offset: 0.5 },
    { opacity: 1, offset: 1 },
  ]

  const timing: KeyframeAnimationOptions =
    held.by === 1 ? MOVE_TIMING : { ...MOVE_TIMING, direction: 'reverse' }

  const turning = moving.animate(sheet, timing)
  shade?.animate(shading, timing)

  // Removed on completion *and* on failure — an animation can be cancelled by
  // the element being taken out from under it, and a copy left behind would sit
  // over the book showing the wrong page.
  let cleared = false
  const clear = () => {
    if (cleared) return
    cleared = true
    clearTimeout(guard)
    moving.remove()
    still?.remove()
    // Last, and unconditionally. The real page number has to come back even if
    // the turn was abandoned half-played — a reader left looking at a page with
    // no number on it is a worse outcome than a turn that didn't finish.
    revealFurniture()
  }

  /*
   * `finished` is a promise about frames, and frames are not guaranteed.
   *
   * The document timeline these animations run on stops while the page is
   * hidden. A reader who turns a page and immediately switches app — or takes a
   * call, or is interrupted by the system — can leave this animation created,
   * never started and never finished, and `finished` then never settles. The
   * copy is an opaque photograph of the page they just left, so what they come
   * back to is a book that has frozen: swipes and taps keep working underneath,
   * and nothing they do changes what is on the screen.
   *
   * A timer is not subject to the same rule. This is the same backstop
   * `settleDrag` carries, for the same reason, and `clear` is idempotent so
   * whichever gets there first is the one that counts.
   */
  const guard = setTimeout(clear, Number(MOVE_TIMING.duration ?? 0) + 600)

  turning.finished.then(clear, clear)
}

/**
 * The blank back of the turning page, and the shadow the lift casts on it.
 *
 * Appended to the copy rather than drawn with a filter so it can be faded in on
 * its own clock: the page has to become paper-coloured exactly as it goes
 * edge-on, which is a different curve from the rotation itself.
 */
function shadeOver(node: HTMLElement): HTMLElement | null {
  if (typeof document === 'undefined') return null

  const shade = document.createElement('div')
  shade.setAttribute('aria-hidden', 'true')
  shade.style.position = 'absolute'
  shade.style.inset = '0'
  shade.style.pointerEvents = 'none'
  shade.style.opacity = '0'
  shade.style.backgroundColor = 'var(--color-bg)'
  // Darkest at the spine, where a lifted sheet curves away from the light.
  shade.style.backgroundImage =
    'linear-gradient(90deg, rgb(0 0 0 / 0.30) 0%, rgb(0 0 0 / 0.10) 38%, rgb(0 0 0 / 0) 78%)'

  // Onto the wrapper, which is positioned and does not scroll — see `copyOf`.
  // Appended last, so it lies over the copy rather than under it.
  node.append(shade)
  return shade
}

/**
 * Drop a held page without playing anything.
 *
 * For the reader who turns again before the first turn has resolved — a fast
 * tapper must always outrun the animation rather than queue behind it.
 */
export function cancelTurn(held: HeldPage | null): void {
  held?.node.remove()
  revealFurniture()
}

/* ------------------------------------------------------------------------- *
 * The dragged turn.
 *
 * Everything above plays a turn at a fixed speed once the reader has let go.
 * Everything below lets them hold it half-turned. The shape is not defined
 * here — it is arithmetic and lives in `pageCurl.ts`, which has no DOM in it so
 * it can be tested. This half is only the elements that shape is written onto.
 * ------------------------------------------------------------------------- */

/** One vertical band of the curling sheet, and the two washes laid over it. */
interface Band {
  root: HTMLElement
  /** The blank back of the page, faded in as this band passes edge-on. */
  back: HTMLElement
  /** The shadow on this band, from its own angle. */
  dark: HTMLElement
}

/** A turn the reader is holding in their hand. */
export interface Drag {
  /** Which way it is going: 1 forwards, -1 back. */
  by: 1 | -1
  /** The sheet's width in unscaled pixels — what a whole turn's travel is. */
  width: number
  /** The frame the whole thing hangs in. */
  parent: HTMLElement
  /** The perspective box the bands live in. */
  stage: HTMLElement
  bands: Band[]
  /** The shadow the lifted sheet throws on the page revealed beneath it. */
  cast: HTMLElement
  /**
   * Turning back, the page being *left* — which has to stay visible under the
   * arriving sheet, because the real strip beneath has already been scrolled to
   * the destination. Forwards there is nothing to hold: the destination is on
   * the strip and the sheet on top of it is the page being left.
   */
  still: HTMLElement | null
  /** The settle in flight after release, so a new gesture can cut it short. */
  frame: number | null
}

/**
 * Build the sheet and hang it over the page, folded to `startAt`.
 *
 * ## The order the caller has to keep
 *
 * The bands are pictures of whatever the strip is showing *at the moment this
 * is called*, so the two directions need opposite sequencing and there is no
 * way to hide that from the caller:
 *
 * - **Forwards:** call this first — the bands become the page being left — and
 *   scroll the strip to the destination straight afterwards. The next page is
 *   then sitting underneath from the first millimetre of the drag, which is the
 *   whole difference between a turn and a transition.
 * - **Backwards:** take a still copy with `holdStill` *first*, then scroll the
 *   strip to the destination, then call this. The bands become the arriving
 *   page and the still copy is what they are arriving on top of.
 *
 * Returns `null` for a reader who has asked for less movement, or a platform
 * with nothing to hang the sheet on. Both mean the caller should fall back to
 * the instant change, which is what those readers asked for.
 */
export function beginDrag(
  strip: HTMLElement | null,
  by: 1 | -1,
  scale: number,
  still: HTMLElement | null,
  startAt: number,
): Drag | null {
  if (!strip || prefersReducedMotion() || typeof document === 'undefined') return null

  const parent = strip.closest<HTMLElement>(FRAME) ?? strip.parentElement
  if (!parent) return null

  const frame = parent.getBoundingClientRect()
  if (frame.width <= 0) return null

  const stage = document.createElement('div')
  stage.setAttribute('aria-hidden', 'true')
  stage.dataset.pageSheet = ''
  // Forwards the bands are the page being left; backwards they are the
  // destination — see the ordering note above. Only the first kind may have its
  // pen taken off. See `HandDrawn.module.css`.
  if (by === 1) stage.dataset.pageLeaving = ''
  stage.style.position = 'absolute'
  stage.style.inset = '0'
  stage.style.pointerEvents = 'none'
  stage.style.zIndex = '3'
  // Perspective belongs to the box the bands live in, applied once. Putting it
  // on each band instead would give every band its own vanishing point, and the
  // sheet would fan out rather than bend.
  stage.style.perspective = `${PERSPECTIVE}px`
  stage.style.transformStyle = 'preserve-3d'

  const step = frame.width / STRIPS
  const bands: Band[] = []

  // Once, before the loop. This is the whole fix: sixteen bands used to mean
  // sixteen copies of the entire chapter, each one laid out in full.
  const copy = pageCopy(strip)
  // Likewise once. Every rectangle the sixteen sheets need, read while the
  // document is still untouched — see `measureSheet`.
  const plan = measureSheet(strip, parent)

  for (let i = 0; i < STRIPS; i += 1) {
    const root = document.createElement('div')
    root.style.position = 'absolute'
    root.style.top = '0'
    root.style.left = `${i * step}px`
    // A hair wider than the arithmetic says. Bands meet exactly in the maths
    // and land on fractional device pixels in practice, and a sub-pixel seam
    // between two opaque sheets is a bright hairline on a dark theme. The
    // overlap is under a pixel and hides behind the next band.
    root.style.width = `${step + 0.5}px`
    root.style.height = `${frame.height}px`
    root.style.overflow = 'hidden'
    // The left edge, which is where the previous band's right edge is handed
    // over. Any other origin and the seams open as the sheet bends.
    root.style.transformOrigin = '0% 50%'
    root.style.willChange = 'transform'
    // The bands are opaque pictures of the same page; letting the compositor
    // guess at their order produces flicker as they cross.
    root.style.backfaceVisibility = 'visible'

    // The page, slid left so that this band's slice of it lands in the band.
    const sheet = sheetBox(frame)
    sheet.style.left = `${-i * step}px`
    sheet.style.pointerEvents = 'none'
    root.append(sheet)
    fillSheet(strip, plan, frame, sheet, scale, copy)

    const back = wash(root, 'var(--color-bg)')
    const dark = wash(root, '#000')

    stage.append(root)
    bands.push({ root, back, dark })
  }

  const cast = document.createElement('div')
  cast.setAttribute('aria-hidden', 'true')
  cast.dataset.pageSheet = ''
  cast.style.position = 'absolute'
  cast.style.top = '0'
  cast.style.height = `${frame.height}px`
  cast.style.pointerEvents = 'none'
  cast.style.zIndex = '2'
  cast.style.opacity = '0'

  parent.append(cast)
  parent.append(stage)

  concealFurniture(parent)

  const drag: Drag = {
    by,
    width: frame.width,
    parent,
    stage,
    bands,
    cast,
    still,
    frame: null,
  }

  /*
   * Lay it all out before the reader's finger moves.
   *
   * The same bookkeeping problem `playFlip` documents, and worse here: this has
   * just cloned a laid-out section STRIPS times over. If that layout is left to
   * happen on the first `pointermove`, the sheet does not appear until the thumb
   * is already an inch across the screen — and the reader reads the lag as the
   * gesture not having been noticed. Forced on `pointerdown` instead, where a
   * gesture is expected to cost something.
   */
  void stage.getBoundingClientRect().width
  paintDrag(drag, startAt)

  return drag
}

/** A full-bleed wash over a band, faded by `paintDrag`. Returns the element. */
function wash(parent: HTMLElement, colour: string): HTMLElement {
  const layer = document.createElement('div')
  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.pointerEvents = 'none'
  layer.style.backgroundColor = colour
  layer.style.opacity = '0'
  parent.append(layer)
  return layer
}

/**
 * A still copy of the page being left, for a backward turn to land on.
 *
 * Must be taken *before* the strip is scrolled to the destination, which is why
 * it is the caller's call and not something `beginDrag` can do for itself.
 */
export function holdStill(strip: HTMLElement | null, scale: number): HTMLElement | null {
  return copyOf(strip, 1, scale)
}

/**
 * Put back a still copy that never got used.
 *
 * Taking one conceals the real page furniture, so simply removing the node
 * leaves the reader on a page with no page number and no running head until
 * they turn again — and the copy that was carrying them has gone. This is the
 * half of the pair that `remove()` on its own quietly misses.
 */
export function dropStill(still: HTMLElement | null): void {
  still?.remove()
  revealFurniture()
}

/**
 * Write a gesture position onto the sheet.
 *
 * `gesture` runs 0 → 1 in the direction of travel for **both** directions: 0 is
 * "not started", 1 is "turned". The mapping onto the curl is where the two part
 * company — forwards the sheet unfolds from flat, backwards it arrives already
 * folded away and flattens onto the page. One number for the caller, one shape
 * for the eye, and no second set of keyframes to keep in step with the first.
 *
 * Nothing here is eased, tweened or scheduled. It is a straight write of the
 * arithmetic in `pageCurl`, so a thumb held still leaves a sheet held still —
 * the reader's actual requirement, and the reason this is not an animation with
 * a scrubbed playback position.
 */
export function paintDrag(drag: Drag, gesture: number): void {
  const progress = drag.by === 1 ? gesture : 1 - gesture
  const strips = curl(drag.width, progress)

  for (let i = 0; i < drag.bands.length; i += 1) {
    const band = drag.bands[i]
    const shape = strips[i]
    if (!band || !shape) continue
    band.root.style.transform = shape.transform
    band.back.style.opacity = String(shape.blank)
    band.dark.style.opacity = String(shape.dark)
  }

  const { at, opacity } = castShadow(drag.width, progress)
  drag.cast.style.left = `${at}px`
  drag.cast.style.width = `${CAST_WIDTH}px`
  drag.cast.style.opacity = String(opacity)
  drag.cast.style.backgroundImage = `linear-gradient(90deg, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0) 100%)`
}

/** How far the fold's shadow reaches across the page it is falling on. */
const CAST_WIDTH = 96

/**
 * The reader has let go. Run the rest of the turn, or put the page back.
 *
 * `done` is handed `true` when the turn completed and `false` when it sprang
 * back, and is called **once**, after the sheet has been taken down. The caller
 * uses it to decide whether the strip stays where it was scrolled to or goes
 * home, which is why it cannot fire early: for one frame between the last paint
 * and the removal, the sheet and the strip must agree.
 */
export function settleDrag(
  drag: Drag,
  gesture: number,
  velocity: number,
  done: (committed: boolean) => void,
): void {
  const commit = releaseInto(gesture, velocity) === 'complete'
  const to = commit ? 1 : 0
  const from = gesture
  const span = Math.abs(to - from)

  let over = false
  const finish = () => {
    if (over) return
    over = true
    if (guard !== null) clearTimeout(guard)
    drag.frame = null
    dropDrag(drag)
    done(commit)
  }

  /*
   * The sheet comes down on a clock, not only on a frame.
   *
   * `requestAnimationFrame` is a request. A tab that goes to the background
   * between the finger lifting and the settle ending simply stops being offered
   * frames, and the loop below is left holding an opaque photograph of the page
   * over the real one — the reader comes back to a book that has frozen. Timers
   * are throttled in the background but they *fire*, so this is the promise the
   * frame loop cannot make: however few frames arrive, the sheet is down and
   * `done` has run shortly after the animation was due to end.
   *
   * Generous on purpose. It is a backstop, not a second animation, and it must
   * never cut short a settle that is merely running on a slow device.
   */
  let guard: ReturnType<typeof setTimeout> | null = null

  // Already there, or a platform with no clock to animate against. Either way
  // the honest outcome is to be done rather than to schedule nothing.
  if (span < 0.001 || typeof requestAnimationFrame !== 'function') {
    finish()
    return
  }

  // Distance-proportional, so letting go at 5% does not take as long as letting
  // go at 95%. Floored, or a nearly-finished turn ends in a visible snap.
  const ms = Math.max(90, (commit ? COMPLETE_MS : SNAP_MS) * span)
  const ease = commit ? completionEase : snapBackEase
  const started = performance.now()

  const step = (now: number) => {
    const t = (now - started) / ms
    const value = from + (to - from) * ease(t)
    paintDrag(drag, value)
    if (t >= 1) {
      finish()
      return
    }
    drag.frame = requestAnimationFrame(step)
  }

  guard = setTimeout(finish, ms + 600)
  drag.frame = requestAnimationFrame(step)
}

/**
 * Take the sheet down, however the turn ended.
 *
 * Unconditional about the furniture, like `playFlip`'s `clear`: a reader left
 * looking at a page with no page number on it is a worse outcome than a turn
 * that did not finish.
 */
export function dropDrag(drag: Drag | null): void {
  if (!drag) return
  if (drag.frame !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(drag.frame)
  }
  drag.frame = null
  drag.stage.remove()
  drag.cast.remove()
  drag.still?.remove()
  revealFurniture()
}
