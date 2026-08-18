/**
 * A stopwatch on the page turn, for a reader with a slow phone in their hand.
 *
 * This exists to answer one question and then to be deleted: when a fully
 * highlighted page turns slowly, where does the time go? Two answers are
 * possible and they need different cures.
 *
 *  - **Build.** The app makes a copy of the page to flip. That is our own code,
 *    running on the main thread, and it is measured directly.
 *  - **Paint.** The copy then has to be drawn before anything can move. That is
 *    the browser's work, not ours, and no timer of ours sits inside it. It is
 *    measured by its shadow: the gap between handing the copy over and the next
 *    frame the browser manages to produce. A page the browser can draw at once
 *    gives a gap of one frame. A page it cannot gives a long one.
 *
 * The stroke count is the third number, because the whole complaint is that ink
 * makes it worse, and a cure has to show the time falling while the ink stays.
 *
 * Off unless asked for. See `wanted()`.
 */

/** One turn, as measured. */
export interface Turn {
  /** Our own work, in milliseconds: making the copy of the page. */
  build: number
  /** The browser's work, in milliseconds: the wait for the next drawn frame. */
  paint: number
  /** Lines of ink on the page at the moment of the turn. */
  strokes: number
}

/** The last few turns, newest last. */
const turns: Turn[] = []

/** How many turns are kept. Enough to see a pattern, few enough to read. */
const KEPT = 6

type Listener = (all: readonly Turn[]) => void
const listeners = new Set<Listener>()

/**
 * Whether the reader has asked for the readout.
 *
 * `?clock=1` in the address turns it on and remembers it, so the installed app
 * keeps showing it without the address being typed again. `?clock=0` turns it
 * off. Nothing else in the app reads this, and with it off the timers are never
 * even started.
 */
export function wanted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const asked = new URLSearchParams(window.location.search).get('clock')
    if (asked === '1') window.localStorage.setItem('rb-turn-clock', '1')
    if (asked === '0') window.localStorage.removeItem('rb-turn-clock')
    return window.localStorage.getItem('rb-turn-clock') === '1'
  } catch {
    // A browser with storage refused. The readout is not worth an error.
    return false
  }
}

/**
 * Whether the reader has asked to keep the marker texture through a turn.
 *
 * A measuring switch, paired with the rule in `HandDrawn.module.css`. `?ink=keep`
 * holds the texture on; `?ink=drop` returns to the normal behaviour. Both are
 * remembered, so the two can be compared without retyping the address.
 */
export function keepsInk(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const asked = new URLSearchParams(window.location.search).get('ink')
    if (asked === 'keep') window.localStorage.setItem('rb-keep-ink', '1')
    if (asked === 'drop') window.localStorage.removeItem('rb-keep-ink')
    return window.localStorage.getItem('rb-keep-ink') === '1'
  } catch {
    return false
  }
}

/** Watch the numbers. Returns the way to stop watching. */
export function watch(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function tell(): void {
  for (const listener of listeners) listener(turns)
}

/**
 * Start the clock on one turn. The returned call stops the build half and starts
 * the paint half; it is safe to call when the readout is off, and does nothing.
 *
 * Two frames are waited for, not one. The first callback can be served from a
 * frame that was already in flight, before the new copy has been drawn at all.
 * The second is the first frame that must include it.
 */
export function begin(): () => void {
  if (!wanted()) return () => {}

  // Counted now, before the copies exist. A moment later the frame holds the
  // page and sixteen sheets cut from it, and the same ink counts seventeen times.
  const strokes = document.querySelectorAll('[data-page-frame] [data-stroke]').length
  const from = performance.now()

  return () => {
    const built = performance.now()

    if (typeof requestAnimationFrame !== 'function') return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        turns.push({
          build: built - from,
          paint: performance.now() - built,
          strokes,
        })
        while (turns.length > KEPT) turns.shift()
        tell()
      })
    })
  }
}
