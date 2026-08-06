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

/** An outgoing page being held on screen, waiting for the new one to arrive. */
export interface HeldPage {
  /** The copy laid over the strip. */
  node: HTMLElement
  /** Which way the turn was going: 1 forwards, -1 back. */
  by: 1 | -1
}

/**
 * Take a copy of the page being left and lay it over the strip.
 *
 * Returns `null` when there is nothing to do — no strip, no parent to hang the
 * copy on, or a reader who has asked for less movement, who gets the instant
 * change they asked for.
 */
export function holdOutgoing(strip: HTMLElement | null, by: 1 | -1): HeldPage | null {
  const node = copyOf(strip, 1)
  return node ? { node, by } : null
}

/**
 * A still picture of the strip exactly as it looks now, laid over it.
 *
 * Both halves of a flip are made of these: the page being left, and — turning
 * backwards — the page arriving on top of it. Returns `null` when there is
 * nothing to copy or the reader has asked for less movement, in which case the
 * caller gets the instant change they asked for.
 *
 * ## Why the copy is wrapped rather than used bare
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
function copyOf(strip: HTMLElement | null, layer: number): HTMLElement | null {
  if (!strip || prefersReducedMotion() || typeof document === 'undefined') return null

  const parent = strip.parentElement
  if (!parent) return null

  const node = strip.cloneNode(true) as HTMLElement
  const wrapper = document.createElement('div')

  // Every id, gone. This is the one thing that makes a clone safe: the reading
  // screen looks paragraphs up by id, and a second copy of each would answer
  // those lookups with an element that is on its way off the screen.
  node.removeAttribute('id')
  for (const element of Array.from(node.querySelectorAll('[id]'))) {
    element.removeAttribute('id')
  }

  // A picture, not a page: nothing in it may be tapped, focused, found by a
  // search or read out by a screen reader, all of which would be describing
  // something the reader can no longer see.
  node.setAttribute('aria-hidden', 'true')
  node.inert = true

  // The wrapper is laid exactly over the strip, in the strip's own coordinates.
  // `offsetTop` and friends are relative to the nearest positioned ancestor,
  // which `Reader.module.css` guarantees is the parent.
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.position = 'absolute'
  wrapper.style.top = `${strip.offsetTop}px`
  wrapper.style.left = `${strip.offsetLeft}px`
  // Fractional, from the rect rather than from `offsetWidth`. A copy a whole
  // pixel wider than the original lays its columns out at a different pitch,
  // and the still picture of the page you just left would not quite be it.
  const box = strip.getBoundingClientRect()
  wrapper.style.width = `${box.width}px`
  wrapper.style.height = `${box.height}px`
  wrapper.style.margin = '0'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.zIndex = String(layer)
  // Opaque, or the page underneath shows through this one while they cross.
  wrapper.style.background = 'var(--color-bg)'
  wrapper.style.overflow = 'hidden'

  // The copy fills its wrapper and keeps its own scroll.
  node.style.position = 'absolute'
  node.style.inset = '0'
  node.style.width = '100%'
  node.style.height = '100%'
  node.style.margin = '0'
  node.style.maxWidth = 'none'
  // The clone inherits whatever entrance animation the strip last played, and
  // would replay it on being inserted.
  node.style.animation = 'none'

  // And it inherits `scroll-behavior: smooth`, which turns the assignment below
  // into an *animation*. That was the whole of the remaining glitch, and it
  // explains why only turning forwards looked wrong: going back you always
  // leave from a section's first page, where the position to restore is zero
  // and there is nothing to animate. Going forward you leave from the last
  // page, so the copy — meant to be a still picture of where you just were —
  // visibly raced from page one to that page while the turn was starting.
  node.style.scrollBehavior = 'auto'

  wrapper.append(node)
  parent.append(wrapper)
  // After insertion: a node outside the document has no scroll position to set.
  node.scrollLeft = strip.scrollLeft

  return wrapper
}

/**
 * How far over the page leans as it turns.
 *
 * Past ninety degrees on purpose: a page that stops edge-on hasn't turned, it
 * has folded. Carrying on to a hundred and eighteen takes it visibly *over* the
 * spine, which is the moment the eye reads as the turn having happened.
 */
const FLIP_DEGREES = 118

/** How far the eye is from the page. Shallower reads as a pop-up book. */
const FLIP_PERSPECTIVE = 1600

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
    return
  }

  // Forwards, the outgoing copy is the one that moves. Backwards, it stays put
  // as the page being landed on, and a second copy — the page arriving — does
  // the moving on top of it.
  const still = held.by === -1 ? held.node : null
  const moving = held.by === -1 ? copyOf(strip, 2) : held.node

  // The second copy couldn't be made (no parent, reduced motion changed under
  // us). Falling back to the instant change beats a half-played turn.
  if (!moving) {
    held.node.remove()
    return
  }

  const shade = shadeOver(moving)

  moving.style.transformOrigin = '0% 50%'
  moving.style.backfaceVisibility = 'hidden'
  moving.style.willChange = 'transform, opacity'

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
  const clear = () => {
    moving.remove()
    still?.remove()
  }
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
}
