/**
 * Bringing the books up to date, at the one moment the reader expects to be
 * asked: launch.
 *
 * There used to be two separate updates with two separate buttons — a panel at
 * startup for the *app*, and a card on the Library tab for the *books*. That is
 * one distinction too many. From the reader's side there is a single question,
 * "is anything out of date?", and being told yes twice, in two places, one of
 * them two taps deep, reads as the first update not having worked.
 *
 * So there is now one panel and one button (`app/UpdatePrompt.tsx`). This module
 * is the book half of what sits behind it.
 *
 * ## Why the books cannot simply be done first
 *
 * A new build re-parses books *differently* — that is the entire reason they
 * need re-parsing. Doing them before the new code is running would redo them
 * with the old parser and stamp them as current, which is worse than not
 * bothering. So the order is fixed: take the app update, reload, then re-read
 * the books with the build that knows how.
 *
 * That reload is why `CONSENTED` exists. Having agreed to update, the reader
 * should not land in a fresh app being asked a second time — as far as they are
 * concerned they already answered. The flag survives the reload and nothing
 * else, so the books run on their own that once, with the panel showing what is
 * happening rather than asking permission for it.
 */

import { isOutOfDate, reparseBooks, type ReparseOutcome } from '../import/index.ts'
import { repository } from '../storage/index.ts'
import type { BookMeta } from '../structure/index.ts'

/**
 * Set immediately before an app update reloads the page, read once on the way
 * back up. `sessionStorage` rather than `localStorage` on purpose: consent given
 * to one reload should not still be lying around a week later, and a tab that
 * was never reloaded must not inherit it.
 */
const CONSENTED = 'reading-buddy:update-consented'

export function rememberConsent(): void {
  try {
    sessionStorage.setItem(CONSENTED, '1')
  } catch {
    // Private mode, or storage turned off. The reader is asked once more, which
    // is a small cost next to refusing to update at all.
  }
}

/** True once, for the launch that follows an accepted app update. */
export function tookConsent(): boolean {
  try {
    const found = sessionStorage.getItem(CONSENTED) !== null
    sessionStorage.removeItem(CONSENTED)
    return found
  } catch {
    return false
  }
}

/** What is behind, split by whether anything can be done about it. */
export interface Outdated {
  /** Behind, and the original file is still kept — these can be re-read. */
  updatable: BookMeta[]
  /**
   * Behind, but imported before the file was kept. Counted rather than listed
   * because the only remedy is the reader re-importing them by hand, and the
   * panel says so in a sentence.
   */
  stranded: number
}

const NOTHING: Outdated = { updatable: [], stranded: 0 }

/**
 * Which books an update would actually help.
 *
 * Never throws. This runs at launch, and a library that can't be read is a
 * reason to show no panel — not a reason to fail to start.
 */
export async function findOutdated(): Promise<Outdated> {
  try {
    const books = await repository.listBooks()
    const behind = books.filter(isOutOfDate)
    if (behind.length === 0) return NOTHING

    const withSource = await repository.booksWithSource()
    const updatable = behind.filter((book) => withSource.has(book.id))
    return { updatable, stranded: behind.length - updatable.length }
  } catch {
    return NOTHING
  }
}

export type { ReparseOutcome }
export { reparseBooks }
