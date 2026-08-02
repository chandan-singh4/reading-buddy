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
  if (!strip || prefersReducedMotion()) return null

  const parent = strip.parentElement
  if (!parent) return null

  const node = strip.cloneNode(true) as HTMLElement

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

  // Laid exactly over the strip, in the strip's own coordinates. `offsetTop`
  // and friends are relative to the nearest positioned ancestor, which
  // `Reader.module.css` guarantees is the parent.
  node.style.position = 'absolute'
  node.style.top = `${strip.offsetTop}px`
  node.style.left = `${strip.offsetLeft}px`
  // Fractional, from the rect rather than from `offsetWidth`. A copy a whole
  // pixel wider than the original lays its columns out at a different pitch,
  // and the still picture of the page you just left would not quite be it.
  const box = strip.getBoundingClientRect()
  node.style.width = `${box.width}px`
  node.style.height = `${box.height}px`
  node.style.margin = '0'
  node.style.pointerEvents = 'none'
  node.style.zIndex = '1'
  // Opaque, or the new section shows through the old one while they cross.
  node.style.background = 'var(--color-bg)'
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

  parent.append(node)
  // After insertion: a node outside the document has no scroll position to set.
  node.scrollLeft = strip.scrollLeft

  return { node, by }
}

/**
 * Cross the two pages: the held copy out, the strip in.
 *
 * Called once the new section is on screen *and* scrolled to the page it should
 * land on — animating before that would slide in a page that then jumps.
 */
export function playTurn(held: HeldPage | null, strip: HTMLElement | null): void {
  if (!held) return

  // No strip to cross with, or a platform with no Web Animations API — jsdom is
  // the one that matters, where there is no layout to animate either. Either
  // way the honest outcome is the instant change: drop the copy and let the new
  // page stand.
  if (!strip || typeof strip.animate !== 'function') {
    held.node.remove()
    return
  }

  // The one timing, from `motion.ts` — the same length and the same curve as a
  // turn within a section, which is the whole point of it living there.
  const away = held.by === 1 ? '-100%' : '100%'
  const from = held.by === 1 ? '100%' : '-100%'

  strip.animate(
    [{ transform: `translateX(${from})` }, { transform: 'translateX(0)' }],
    MOVE_TIMING,
  )

  const leaving = held.node.animate(
    [{ transform: 'translateX(0)' }, { transform: `translateX(${away})` }],
    MOVE_TIMING,
  )

  // Removed on completion, and again on failure — an animation can be cancelled
  // by the element being taken out from under it, and a copy left behind would
  // sit over the book blocking nothing but showing the wrong page.
  const remove = () => held.node.remove()
  leaving.finished.then(remove, remove)
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
