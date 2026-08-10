// Must come first: installs a real IndexedDB implementation onto globals.
//
// These are the queue's own rules, tested against a real database and a real
// repository standing in for the cloud. `cached.test.ts` covers the same ground
// from the reader's side — a bookmark made in a tunnel; this file covers the
// bookkeeping underneath it, where the awkward cases live.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { formatAnchor } from '../../structure/index.ts'
import type { Anchor, BookId } from '../../structure/index.ts'
import { CloudError } from './client.ts'
import { createDb, type ReadingBuddyDB } from '../db.ts'
import { createRepository, type Repository } from '../repository.ts'
import {
  createOutboxDb,
  drainOutbox,
  enqueue,
  forgetDrainInFlight,
  forgetQueued,
  pendingCount,
  pendingWrites,
  type OutboxDB,
} from './outbox.ts'

let counter = 0
let cloudDb: ReadingBuddyDB
let cloud: Repository
let outbox: OutboxDB

const book = 'book-1' as BookId
const at = (chapter: number, paragraph: number): Anchor =>
  formatAnchor({ chapter, section: 1, paragraph })

beforeEach(async () => {
  counter += 1
  cloudDb = createDb(`outbox-cloud-${counter}`)
  cloud = createRepository(cloudDb)
  outbox = createOutboxDb(`outbox-${counter}`)
  forgetDrainInFlight()
  await cloud.saveBook({
    id: book,
    title: 'A book',
    source: 'epub',
    type: 'dense-technical',
    importedAt: '2026-08-01T10:00:00.000Z',
  })
})

afterEach(async () => {
  await Promise.all([cloudDb.delete(), outbox.delete()])
})

// --- The line ----------------------------------------------------------------

describe('the queue', () => {
  it('drains in the order the reader did things', async () => {
    await enqueue({ kind: 'addBookmark', bookId: book, id: 'local-1', anchor: at(1, 1), label: 'First' }, outbox)
    await enqueue({ kind: 'renameBookmark', bookId: book, id: 'local-1', label: 'Renamed' }, outbox)

    const result = await drainOutbox(cloud, outbox)

    expect(result).toMatchObject({ sent: 2, dropped: 0, stopped: false })
    expect((await cloud.listBookmarks(book))[0]?.label).toBe('Renamed')
    expect(await pendingCount(outbox)).toBe(0)
  })

  it('replaces a pending page turn rather than stacking them up', async () => {
    for (const percent of [10, 20, 30]) {
      await enqueue(
        { kind: 'savePosition', bookId: book, anchor: at(1, percent), percent, at: '2026-08-10T09:00:00.000Z' },
        outbox,
      )
    }

    expect(await pendingCount(outbox)).toBe(1)
    await drainOutbox(cloud, outbox)
    expect((await cloud.getPosition(book))?.percent).toBe(30)
  })

  it('keeps one pending page turn per book', async () => {
    const other = 'book-2' as BookId
    const stamp = '2026-08-10T09:00:00.000Z'
    await enqueue({ kind: 'savePosition', bookId: book, anchor: at(1, 1), at: stamp }, outbox)
    await enqueue({ kind: 'savePosition', bookId: other, anchor: at(1, 1), at: stamp }, outbox)

    expect(await pendingCount(outbox)).toBe(2)
  })

  it('sends the moment the page was turned, not the moment it drained', async () => {
    const stamp = '2026-08-10T09:00:00.000Z'
    await enqueue({ kind: 'savePosition', bookId: book, anchor: at(2, 1), percent: 40, at: stamp }, outbox)

    await drainOutbox(cloud, outbox)

    expect((await cloud.getPosition(book))?.at).toBe(stamp)
  })
})

// --- Ids the cloud invents ---------------------------------------------------

describe('a row deleted before it was ever sent', () => {
  it('cancels the add instead of queueing a delete', async () => {
    await enqueue({ kind: 'addBookmark', bookId: book, id: 'local-1', anchor: at(1, 1), label: 'First' }, outbox)
    const queued = await enqueue({ kind: 'deleteBookmark', bookId: book, id: 'local-1' }, outbox)

    expect(queued).toBe(false)
    expect(await pendingWrites(outbox)).toEqual([])

    await drainOutbox(cloud, outbox)
    expect(await cloud.listBookmarks(book)).toEqual([])
  })

  it('drops a rename that was waiting on it too', async () => {
    await enqueue({ kind: 'addBookmark', bookId: book, id: 'local-1', anchor: at(1, 1), label: 'First' }, outbox)
    await enqueue({ kind: 'renameBookmark', bookId: book, id: 'local-1', label: 'Renamed' }, outbox)
    await enqueue({ kind: 'deleteBookmark', bookId: book, id: 'local-1' }, outbox)

    expect(await pendingWrites(outbox)).toEqual([])
  })

  it('does the same for a saved passage', async () => {
    await enqueue({ kind: 'addQuote', bookId: book, id: 'local-q', text: 'A line.' }, outbox)
    await enqueue({ kind: 'deleteQuote', bookId: book, id: 'local-q' }, outbox)

    await drainOutbox(cloud, outbox)
    expect(await cloud.listQuotes(book)).toEqual([])
  })

  it('still queues a delete for a row that came from the cloud', async () => {
    const existing = await cloud.addBookmark(book, at(1, 1), 'From the laptop')

    const queued = await enqueue({ kind: 'deleteBookmark', bookId: book, id: existing.id }, outbox)
    expect(queued).toBe(true)

    await drainOutbox(cloud, outbox)
    expect(await cloud.listBookmarks(book)).toEqual([])
  })
})

describe('once an add has drained', () => {
  it('sends a later delete to the row the cloud actually made', async () => {
    await enqueue({ kind: 'addBookmark', bookId: book, id: 'local-1', anchor: at(1, 1), label: 'First' }, outbox)
    await drainOutbox(cloud, outbox)
    expect((await cloud.listBookmarks(book))[0]!.id).not.toBe('local-1')

    // A later tunnel. The copy still calls the row `local-1`, because that is
    // the row the reader is looking at — so that is the name that gets queued.
    await enqueue({ kind: 'deleteBookmark', bookId: book, id: 'local-1' }, outbox)
    await drainOutbox(cloud, outbox)

    expect(await cloud.listBookmarks(book)).toEqual([])
  })

  it('does the same for a saved passage', async () => {
    await enqueue({ kind: 'addQuote', bookId: book, id: 'local-q', text: 'A line.' }, outbox)
    await drainOutbox(cloud, outbox)

    await enqueue({ kind: 'deleteQuote', bookId: book, id: 'local-q' }, outbox)
    await drainOutbox(cloud, outbox)

    expect(await cloud.listQuotes(book)).toEqual([])
  })

  it('forgets the pairing when the book goes', async () => {
    await enqueue({ kind: 'addQuote', bookId: book, id: 'local-q', text: 'A line.' }, outbox)
    await drainOutbox(cloud, outbox)

    await forgetQueued([book], outbox)

    expect(await outbox.ids.count()).toBe(0)
  })
})

// --- Refused, versus unreachable ---------------------------------------------

describe('a write the cloud refuses', () => {
  it('is dropped, so the queue cannot fill up with the impossible', async () => {
    await enqueue({ kind: 'addBookmark', bookId: book, id: 'local-1', anchor: at(1, 1), label: 'First' }, outbox)
    await enqueue({ kind: 'addQuote', bookId: book, id: 'local-q', text: 'A line.' }, outbox)

    const refusing: Repository = {
      ...cloud,
      async addBookmark(): Promise<never> {
        throw new CloudError('That book is no longer in your library.')
      },
    }
    const result = await drainOutbox(refusing, outbox)

    // The refused one is gone; the one behind it still went.
    expect(result).toMatchObject({ sent: 1, dropped: 1, stopped: false })
    expect(await pendingCount(outbox)).toBe(0)
    expect(await cloud.listQuotes(book)).toHaveLength(1)
  })
})

describe('a signal that goes again mid-drain', () => {
  it('stops where it is and keeps the rest in order', async () => {
    await enqueue({ kind: 'addQuote', bookId: book, id: 'q1', text: 'First' }, outbox)
    await enqueue({ kind: 'addQuote', bookId: book, id: 'q2', text: 'Second' }, outbox)
    await enqueue({ kind: 'addQuote', bookId: book, id: 'q3', text: 'Third' }, outbox)

    let sent = 0
    const flaky: Repository = {
      ...cloud,
      async addQuote(id, text) {
        sent += 1
        if (sent > 1) {
          throw new CloudError('Couldn’t reach your library.', {
            cause: new TypeError('Failed to fetch'),
          })
        }
        return cloud.addQuote(id, text)
      },
    }
    const result = await drainOutbox(flaky, outbox)

    expect(result).toMatchObject({ sent: 1, dropped: 0, stopped: true })
    const left = await pendingWrites(outbox)
    expect(left.map((entry) => ('text' in entry ? entry.text : ''))).toEqual(['Second', 'Third'])
  })

  it('sends the rest on the next attempt', async () => {
    await enqueue({ kind: 'addQuote', bookId: book, id: 'q1', text: 'First' }, outbox)
    await enqueue({ kind: 'addQuote', bookId: book, id: 'q2', text: 'Second' }, outbox)

    let up = false
    const returning: Repository = {
      ...cloud,
      async addQuote(id, text) {
        if (!up) {
          throw new CloudError('Couldn’t reach your library.', {
            cause: new TypeError('Failed to fetch'),
          })
        }
        return cloud.addQuote(id, text)
      },
    }

    expect(await drainOutbox(returning, outbox)).toMatchObject({ sent: 0, stopped: true })
    up = true
    expect(await drainOutbox(returning, outbox)).toMatchObject({ sent: 2, stopped: false })
    expect(await cloud.listQuotes(book)).toHaveLength(2)
  })
})

// --- Housekeeping ------------------------------------------------------------

describe('forgetting a book', () => {
  it('drops what was queued for it and leaves other books alone', async () => {
    const other = 'book-2' as BookId
    await enqueue({ kind: 'addQuote', bookId: book, id: 'q1', text: 'First' }, outbox)
    await enqueue({ kind: 'addQuote', bookId: other, id: 'q2', text: 'Second' }, outbox)

    await forgetQueued([book], outbox)

    const left = await pendingWrites(outbox)
    expect(left.map((entry) => entry.bookId)).toEqual([other])
  })
})
