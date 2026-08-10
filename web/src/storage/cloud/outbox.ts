/**
 * The offline write queue (WP-58, step 5) — what the reader did in the tunnel,
 * kept until there is a signal to tell the cloud about it.
 *
 * ## Why a queue at all
 *
 * `cached.ts` made the cloud library *readable* with no signal. Writing still
 * failed honestly: a bookmark said it couldn't be saved rather than pretending.
 * That was the right place to stop, and it is not a place to stay — a reading
 * app that forgets your page because the train went underground is a reading app
 * you stop trusting with your place.
 *
 * The rule here is the mirror of the read rule. **Try the cloud. If the failure
 * looks like a lost signal, apply the write to the copy and record it here.**
 * The reader sees their bookmark immediately because the copy is what they are
 * reading from anyway; the cloud finds out later.
 *
 * ## Why its own database
 *
 * Not the device library: that schema is shared with the reader's 32 real books,
 * and a new table there is a migration over all of them to support something
 * disposable. Not the cache database either, close as that is — the cache is the
 * one store in the app that is *safe to delete at any moment*, and these rows are
 * the only thing here that is not. A queued bookmark exists nowhere else until
 * it drains. So: `reading-buddy-outbox`, tiny, one table, its own lifetime.
 *
 * ## What is queued, and what still refuses
 *
 * Position, bookmarks and saved passages — the three things a reader does while
 * reading. All three merge without asking anyone: bookmarks and quotes are
 * *additive*, and position is settled by the newest `at`. Deleting a **book**
 * still requires a signal, because a delete racing an edit on another device can
 * only be resolved by asking, and a reading app should not have a conflict UI.
 * See the WP-58 block in `docs/decisions.md`.
 *
 * ## The one wrinkle: ids the cloud invents
 *
 * `addBookmark` and `addQuote` mint an id server-side, so a bookmark made
 * offline has the *copy's* id until it drains, and any later "delete that one"
 * refers to that id. Two things keep that straight:
 *
 *   1. A delete of something still sitting in this queue **cancels the add**
 *      rather than queueing a delete — nothing ever reaches the cloud, which is
 *      both correct and cheaper.
 *   2. When an add does drain, the cloud's id is remembered against the local
 *      one, for good. It has to be for good rather than a rewrite of what is
 *      queued at the time: the row sitting in the offline copy keeps the local
 *      id for as long as that copy lives, so a delete queued *tomorrow* still
 *      names it. So "bookmark it on the train, sync, unbookmark it in the next
 *      tunnel" lands on the right row.
 */

import Dexie, { type Table } from 'dexie'

import type { Anchor, BookId } from '../../structure/index.ts'
import type { Repository } from '../repository.ts'
import { looksOffline } from './offline.ts'

/** Deliberately adjacent to `DB_NAME` and `CACHE_DB_NAME`, for DevTools. */
export const OUTBOX_DB_NAME = 'reading-buddy-outbox'

/**
 * One thing the reader did with no signal.
 *
 * A tagged union rather than a generic `{ method, args }` blob: the drain has to
 * switch on the kind anyway, and this way the compiler checks that every kind
 * queued is a kind that can be sent.
 */
export type QueuedWrite =
  | { kind: 'savePosition'; bookId: BookId; anchor: Anchor; percent?: number; at: string }
  | { kind: 'addBookmark'; bookId: BookId; id: string; anchor: Anchor; label: string }
  | { kind: 'deleteBookmark'; bookId: BookId; id: string }
  | { kind: 'renameBookmark'; bookId: BookId; id: string; label: string }
  | { kind: 'addQuote'; bookId: BookId; id: string; text: string }
  | { kind: 'deleteQuote'; bookId: BookId; id: string }

/** The same, once it has a place in the line. */
export type QueuedEntry = QueuedWrite & { seq: number }

/**
 * What a row made offline is called on each side.
 *
 * Written when an add drains and kept afterwards, because the copy the reader is
 * looking at goes on calling the row by its local name for as long as that copy
 * exists. Dropped with the book (`forgetQueued`).
 */
export interface IdMapping {
  local: string
  remote: string
  bookId: BookId
}

export type OutboxDB = Dexie & {
  writes: Table<QueuedWrite, number>
  ids: Table<IdMapping, string>
}

/**
 * `++seq` is what makes this a queue rather than a bag: writes drain in the
 * order they were made, so "bookmark, rename it, remove it" cannot arrive
 * backwards. `bookId` is indexed on both tables because every housekeeping
 * query here is about one book.
 */
export function createOutboxDb(name: string = OUTBOX_DB_NAME): OutboxDB {
  const db = new Dexie(name) as OutboxDB
  db.version(1).stores({ writes: '++seq, bookId, kind', ids: 'local, bookId' })
  return db
}

/** The app-wide queue. Tests build their own. */
export const outboxDb: OutboxDB = createOutboxDb()

/** Everything still waiting, oldest first. */
export async function pendingWrites(db: OutboxDB = outboxDb): Promise<QueuedEntry[]> {
  return (await db.writes.orderBy('seq').toArray()) as QueuedEntry[]
}

/** How many writes are still waiting for a signal. */
export async function pendingCount(db: OutboxDB = outboxDb): Promise<number> {
  return db.writes.count()
}

/**
 * Record a write to be sent later.
 *
 * Two kinds get special handling, and both are about not sending pointless
 * traffic from a phone that has just come back on a train's patchy signal:
 *
 * **A new position replaces the pending one.** Position is written every few
 * seconds while reading — an hour offline is otherwise hundreds of rows saying
 * increasingly stale versions of one fact, and only the last is true.
 *
 * **A delete of something still queued cancels its add.** See the module header.
 *
 * @returns whether anything is now queued for this write (`false` when it
 *   cancelled an add instead).
 */
export async function enqueue(
  write: QueuedWrite,
  db: OutboxDB = outboxDb,
): Promise<boolean> {
  if (write.kind === 'savePosition') {
    await forBook(db, write.bookId).filter((e) => e.kind === 'savePosition').delete()
    await db.writes.add(write)
    return true
  }

  if (write.kind === 'deleteBookmark' || write.kind === 'deleteQuote') {
    const addKind = write.kind === 'deleteBookmark' ? 'addBookmark' : 'addQuote'
    const cancelled = await forBook(db, write.bookId)
      .filter((e) => e.kind === addKind && idOf(e) === write.id)
      .delete()
    if (cancelled > 0) {
      // The add never reached the cloud, so neither the rename nor the delete
      // has anything left to refer to.
      await forBook(db, write.bookId)
        .filter((e) => e.kind === 'renameBookmark' && idOf(e) === write.id)
        .delete()
      return false
    }
  }

  await db.writes.add(write)
  return true
}

/** Forget everything queued for these books — they are gone from the cloud. */
export async function forgetQueued(
  bookIds: readonly BookId[],
  db: OutboxDB = outboxDb,
): Promise<void> {
  if (bookIds.length === 0) return
  await db.writes.where('bookId').anyOf([...bookIds]).delete()
  await db.ids.where('bookId').anyOf([...bookIds]).delete()
}

function forBook(db: OutboxDB, bookId: BookId) {
  return db.writes.where('bookId').equals(bookId)
}

function idOf(write: QueuedWrite): string | undefined {
  return 'id' in write ? write.id : undefined
}

/** What one attempt at emptying the queue achieved. */
export interface DrainResult {
  /** Writes the cloud accepted. */
  sent: number
  /** Writes the cloud refused, and which will never be retried. */
  dropped: number
  /** Whether the signal went away again part-way through. */
  stopped: boolean
}

/** One drain at a time: two would send the same row twice. */
let draining = false

/**
 * Send everything queued, oldest first, and clear what lands.
 *
 * Three outcomes per entry, and the middle one is the point of the whole
 * `looksOffline` distinction:
 *
 *   - **Accepted** — the row goes.
 *   - **Refused** — a real answer from a reachable cloud: a book deleted
 *     elsewhere, a row the security policy won't have. The row goes too. It
 *     cannot ever succeed, and a queue that retries an impossible write is a
 *     queue that never empties and never stops trying.
 *   - **No signal** — stop, keep everything left, try again on the next
 *     `online` event. Deliberately stopping rather than skipping ahead: the
 *     order is part of the meaning.
 */
export async function drainOutbox(
  cloud: Repository,
  db: OutboxDB = outboxDb,
): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, dropped: 0, stopped: false }
  if (draining) return result
  draining = true

  try {
    for (const entry of await pendingWrites(db)) {
      try {
        await send(cloud, entry, db)
        result.sent += 1
      } catch (error) {
        if (looksOffline(error)) {
          result.stopped = true
          return result
        }
        result.dropped += 1
      }
      await db.writes.delete(entry.seq)
    }
    return result
  } finally {
    draining = false
  }
}

async function send(cloud: Repository, entry: QueuedEntry, db: OutboxDB): Promise<void> {
  /** The name the cloud knows this row by, which is its own unless we made it. */
  const remoteId = async (local: string): Promise<string> =>
    (await db.ids.get(local))?.remote ?? local

  switch (entry.kind) {
    case 'savePosition':
      // `at` is the moment the reader actually turned the page, not the moment
      // the signal came back — otherwise an hour in a tunnel would beat a laptop
      // write made since, and "most recent write wins" would quietly mean "most
      // recently *reconnected* wins".
      await cloud.savePosition(entry.bookId, entry.anchor, entry.percent, entry.at)
      return
    case 'addBookmark': {
      const row = await cloud.addBookmark(entry.bookId, entry.anchor, entry.label)
      await rememberId(db, entry.bookId, entry.id, row.id)
      return
    }
    case 'deleteBookmark':
      await cloud.deleteBookmark(entry.bookId, await remoteId(entry.id))
      return
    case 'renameBookmark':
      await cloud.renameBookmark(entry.bookId, await remoteId(entry.id), entry.label)
      return
    case 'addQuote': {
      const row = await cloud.addQuote(entry.bookId, entry.text)
      await rememberId(db, entry.bookId, entry.id, row.id)
      return
    }
    case 'deleteQuote':
      await cloud.deleteQuote(entry.bookId, await remoteId(entry.id))
      return
  }
}

/** Note what the cloud decided to call a row we made offline. */
async function rememberId(
  db: OutboxDB,
  bookId: BookId,
  local: string,
  remote: string,
): Promise<void> {
  if (local === remote) return
  await db.ids.put({ local, remote, bookId })
}

/** Exported for the tests, which need a clean slate between cases. */
export function forgetDrainInFlight(): void {
  draining = false
}
