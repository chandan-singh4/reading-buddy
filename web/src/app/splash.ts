/**
 * Taking the launch screen away.
 *
 * The splash itself is markup and inline CSS in `index.html` — it has to be, or
 * it would arrive after the wait it exists to cover (see the note there). This
 * module owns the only interesting part: *when* it goes.
 *
 * ## The two failures this is between
 *
 * A launch screen can be wrong in two opposite directions, and both read as an
 * unfinished app.
 *
 * Held too long, it is a toll gate. The brief was explicit about this and it is
 * the right instinct: nobody opened the app to look at the logo. So there is no
 * timer counting down to a fixed reveal — the splash leaves the moment the
 * first real screen is on the glass, whenever that is.
 *
 * Dropped too fast, it is a *flicker*. On a warm start with a small library the
 * app is ready in well under a tenth of a second, and a logo that appears and
 * vanishes inside 60 ms is not perceived as a launch screen at all; it is
 * perceived as the screen glitching. That is worse than never showing one.
 *
 * So: no minimum wait, and no flicker either — resolved by `MIN_VISIBLE`, which
 * is a floor on how long it stays *once it is going to be seen*, not a floor on
 * how long the reader waits for their books.
 */

/**
 * The shortest time the mark stays put once the app is ready.
 *
 * Not a delay in the usual sense: it only ever applies when the app became
 * ready *sooner* than this, and in that case the app is already rendered and
 * sitting behind the splash. Nothing is being computed during it and nothing is
 * being withheld — the reader is looking at an animation finishing rather than
 * at a wait.
 *
 * 260 ms is roughly where the mark's own entrance (320 ms, in `index.html`)
 * has done most of its work. Leaving before that means animating something in
 * and immediately animating it out, which is the flicker by another name.
 */
const MIN_VISIBLE = 260

/**
 * How long the fade out runs. Must match the `transition` on `#splash`.
 *
 * Sits in the screen-transition band, alongside opening a book — arriving at
 * the shelf from a cold start and arriving at it from a book are the same
 * event as far as the reader's eye is concerned, and timing them differently
 * is the kind of seam that makes an app feel assembled from parts.
 */
const FADE_MS = 300

/** When the document started painting — the closest thing to "launch". */
const startedAt = typeof performance !== 'undefined' ? performance.now() : 0

let dismissed = false

function removeNow(splash: HTMLElement): void {
  splash.dataset.leaving = 'true'

  // Removed from the DOM rather than left at `opacity: 0`. An invisible fixed
  // overlay at z-index 9999 is still a lid over the whole app for anything that
  // hit-tests — and `Reader`'s taps in particular go to `document`.
  window.setTimeout(() => {
    splash.remove()
  }, FADE_MS)
}

/**
 * Take the launch screen down, once the first screen has actually painted.
 *
 * Called after `createRoot().render()`, which is *not* the same moment: React
 * having built the tree says nothing about the browser having drawn it. Two
 * animation frames is the standard way to wait for that — the first is
 * scheduled before the paint that includes our render, the second after it —
 * and without it the splash starts fading against a still-blank `#root`, which
 * is the original flash of nothing with an extra step in front of it.
 */
export function dismissSplash(): void {
  if (dismissed) return
  dismissed = true

  const splash = document.getElementById('splash')
  if (!splash) return

  // No rAF to schedule against: jsdom under test, or a document in a background
  // tab where frames may not come at all. A launch screen that can outlive the
  // app because the tab was backgrounded is a bug, so it simply goes.
  if (typeof window.requestAnimationFrame !== 'function') {
    splash.remove()
    return
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const shown = performance.now() - startedAt
      const wait = Math.max(0, MIN_VISIBLE - shown)
      if (wait === 0) removeNow(splash)
      else window.setTimeout(() => removeNow(splash), wait)
    })
  })
}
