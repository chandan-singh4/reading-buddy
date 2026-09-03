/**
 * One narrator, shared by every screen that speaks.
 *
 * ## Why this exists
 *
 * `NarratorEngine` owns a worker, and the worker owns 86 MB of model weights.
 * While the reading screen was the only thing that spoke, one engine per screen
 * was one engine. The moment Veda, the chapter summaries and the notes could
 * speak too, it would have been four workers and four copies of the same model
 * in memory — on a phone, which is where this app lives.
 *
 * So there is one, and everything that speaks asks for it.
 *
 * ## Why it is counted rather than kept forever
 *
 * A module-level engine that is never released is simpler, and it would hold
 * the model for the life of the tab whether or not anything intends to speak
 * again. That is fine on a laptop and rude on a phone.
 *
 * Counting means the model stays warm while *anything* might use it — moving
 * from a book to its chapter summaries keeps it, where a per-screen engine
 * would throw it away and load it again — and goes when the last screen that
 * could speak has gone.
 *
 * The count is of *holders*, not of sounds. A screen holds the narrator from
 * mount to unmount whether or not the reader ever presses play, because the
 * alternative is deciding what to do when two screens are half-speaking.
 */

import { NarratorEngine } from './NarratorEngine.ts'

let engine: NarratorEngine | null = null
let holders = 0

/**
 * Take the narrator. Every caller must release it exactly once.
 *
 * In React that means an effect whose cleanup releases — never a bare call in
 * a render, which runs twice under StrictMode and would leave the count high
 * forever.
 */
export function acquireNarrator(): NarratorEngine {
  if (!engine) engine = new NarratorEngine()
  holders += 1
  return engine
}

/** Give it back. The worker and the model go when the last holder does. */
export function releaseNarrator(): void {
  holders = Math.max(0, holders - 1)
  if (holders > 0 || !engine) return

  engine.close()
  engine = null
}

/**
 * Forget everything, for a test that needs a clean slate.
 *
 * Exported because the alternative — a test reaching into module state — is
 * worse, and because a shared singleton is exactly the thing that leaks between
 * test files if nobody is given a way to reset it.
 */
export function resetNarrator(): void {
  engine?.close()
  engine = null
  holders = 0
}
