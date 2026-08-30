/**
 * The check-in: "Still reading?"
 *
 * ## The problem it solves
 *
 * The clock counts time in the book and has no idle pause, on purpose — an
 * idle pause once threw away a half-hour argument with Veda about one
 * paragraph, and it was removed. But the same rule credits a reader who fell
 * asleep with the whole night, up to the six-hour cap.
 *
 * Nothing the app can measure tells those two apart. A reader deep in an answer
 * from Veda touches nothing for ten minutes; so does a reader asleep. So the
 * app stops guessing and asks. The clock keeps running while it waits, because
 * the reader is probably reading, and the question is only worth asking at all
 * if answering it is optional.
 *
 * ## Why a module-level store
 *
 * The same argument as `place.ts`. The clock runs above the router and outside
 * React (`timer.ts`), and the bar that asks the question is a component. This
 * is the seam between them: the timer opens and closes the question, the
 * component subscribes to it with `useSyncExternalStore`.
 */

/**
 * Silence before the question is asked.
 *
 * Ten minutes, not five. Five is an ordinary page of Jung, and a reader who is
 * asked whether they are awake every five minutes has been given a chore, not
 * a feature. The cost of waiting is small: an unanswered question trims from
 * the moment it appeared, so the extra five minutes are credited to a sleeper
 * only once per sitting.
 */
export const ASK_AFTER_MS = 10 * 60 * 1000

/**
 * The attribute the bar carries, so the clock can tell a tap on the bar from a
 * tap on the page. A tap on the page means "I am here"; a tap on the bar is an
 * answer, and answering must not erase the silence being answered for.
 */
export const VIGIL_MARK = 'data-vigil'

/** How the reader answers, both handled by the session that asked. */
export interface Answers {
  stillHere: () => void
  steppedAway: () => void
}

export interface Vigil {
  /** When the question went up, or `undefined` while nothing is being asked. */
  askedAt?: number
}

let state: Vigil = {}
let answers: Answers | undefined
const listeners = new Set<() => void>()

function announce(next: Vigil): void {
  state = next
  for (const listener of listeners) listener()
}

/** For `useSyncExternalStore`. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The same object while nothing changes — `useSyncExternalStore` compares
 * snapshots by identity and would loop for ever on a fresh object each call.
 */
export function snapshot(): Vigil {
  return state
}

/** Called by the session when the reader has been quiet long enough. */
export function ask(at: number, how: Answers): void {
  answers = how
  announce({ askedAt: at })
}

/** Called by the session when the question no longer applies. */
export function stopAsking(): void {
  answers = undefined
  announce({})
}

/** The two answers, from the bar. Each closes the question. */
export function answerStillHere(): void {
  answers?.stillHere()
}

export function answerSteppedAway(): void {
  answers?.steppedAway()
}

/** Tests only — the store outlives a test file otherwise. */
export function forgetVigil(): void {
  answers = undefined
  state = {}
  listeners.clear()
}
