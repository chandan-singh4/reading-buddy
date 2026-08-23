/**
 * Running the digest engine against the real database, one chapter at a time.
 *
 * Kept apart from `digest.ts` on purpose. That file is the rule — block
 * arithmetic, prompts, staleness — and has no idea where a book is stored, so
 * it can be tested without a database or a network. This file is the wiring,
 * and it is deliberately small.
 *
 * ## Two guards, because every rebuild is money
 *
 * 1. **It is off unless the reader turned it on.** Recaps are paid model calls
 *    that nobody asked for at the moment they fire. A reader who has not opted
 *    in never spends a penny on them. See `recapsOn`.
 * 2. **One chapter per run.** A reader who switches recaps on halfway through a
 *    book has a dozen stale chapters behind them. Digesting all twelve at once
 *    would be a dozen calls in one breath, on a phone, unasked. Instead the
 *    oldest stale chapter is built, and the next boundary builds the next one.
 */

import { chapterPath, parseAnchor } from '../structure/anchor.ts'
import { repository } from '../storage/repository.ts'
import { digestStore } from '../storage/digests.ts'
import { tutorStore } from '../storage/tutor.ts'
import {
  askMemory,
  buildDigest,
  NOTHING_YET,
  planBlocks,
  proseOf,
  work,
  type BuiltDigest,
  type MemoryModule,
} from './digest.ts'
import type { StoredDigest } from '../storage/db.ts'
import type { BookId, SectionPath } from '../structure/index.ts'

const RECAPS_KEY = 'reading-buddy:recaps'

/**
 * Whether the reader has switched automatic recaps on.
 *
 * Default **off**, and that is the whole point of the setting. Everything else
 * the tutor does happens because a thumb touched something; a recap happens on
 * its own, in the background, and costs money each time. A feature like that
 * asks first.
 */
export function recapsOn(): boolean {
  try {
    return localStorage.getItem(RECAPS_KEY) === 'on'
  } catch {
    return false
  }
}

export function setRecapsOn(on: boolean): void {
  try {
    localStorage.setItem(RECAPS_KEY, on ? 'on' : 'off')
  } catch {
    // A phone with storage blocked simply never remembers the answer.
  }
}

/** Where the reader is, as the digest engine needs it. */
export interface Place {
  chapter: number
  section: number
}

/** The place an anchor points at. */
export function placeOf(anchor: string): Place {
  const { chapter, section } = parseAnchor(anchor)
  return { chapter, section }
}

function rowToBuilt(row: StoredDigest | undefined): BuiltDigest {
  if (!row) return NOTHING_YET
  return {
    blocks: row.blocks,
    contentRecap: row.contentRecap,
    conversationDigest: row.conversationDigest,
    coversNConversations: row.coversNConversations,
    coversThroughSection: row.coversThroughSection,
  }
}

/**
 * Bring one chapter's digest up to date: the earliest one behind the reader
 * that has fallen behind. Returns the chapter it built, or nothing.
 *
 * Safe to call at any section boundary and when the book closes. It answers
 * `undefined` immediately when there is nothing to do, which is the normal
 * case, and it never touches `positions`.
 */
export async function refreshOneChapter(
  bookId: BookId,
  at: Place,
  ask: (module: MemoryModule, material: string) => Promise<string> = askMemory,
): Promise<number | undefined> {
  const indexes = await repository.listChapterIndexes(bookId)
  if (indexes.length === 0) return undefined

  const threads = await tutorStore.listThreads(bookId)

  for (const index of indexes) {
    // Never look ahead of the reader. A chapter they have not opened has no
    // digest and must not get one.
    if (index.chapter > at.chapter) break

    const finished = index.chapter < at.chapter
    const read = finished
      ? index.sections
      : index.sections.filter((entry) => entry.section <= at.section)

    const closed = planBlocks(read, finished).length
    const mine = threads.filter((thread) => {
      try {
        return parseAnchor(thread.anchor).chapter === index.chapter
      } catch {
        return false
      }
    })

    const chapterId = chapterPath(index.chapter)
    const row = await digestStore.get(bookId, chapterId)
    const had = rowToBuilt(row)
    const todo = work(had, closed, mine.length)
    if (!todo.content && !todo.conversation) continue

    const built = await buildDigest(
      {
        sections: read,
        finished,
        read: async (path: SectionPath) => {
          const section = await repository.getSection(bookId, path)
          return section ? proseOf(section) : ''
        },
        threads: mine,
        ask,
      },
      todo,
      had,
    )

    await digestStore.save({
      bookId,
      chapterId,
      ...built,
      generatedAt: new Date().toISOString(),
    })
    return index.chapter
  }

  return undefined
}

/**
 * The books with a digest being built right now.
 *
 * Two triggers can land close together — crossing a section boundary and then
 * closing the book a second later. Without this, both would read the same
 * stored row, both would see the same block as missing, and the reader would
 * pay for it twice.
 */
const busy = new Set<BookId>()

/**
 * The same job, wrapped so a caller on the reading screen can fire it and
 * forget it. A failed digest must never interrupt reading.
 */
export function refreshInBackground(bookId: BookId, at: Place): void {
  if (!recapsOn() || busy.has(bookId)) return
  busy.add(bookId)
  void refreshOneChapter(bookId, at)
    .catch(() => {
      // Deliberately silent. The reader did not ask for this to happen now, so
      // they must not be told off when it fails.
    })
    .finally(() => busy.delete(bookId))
}
