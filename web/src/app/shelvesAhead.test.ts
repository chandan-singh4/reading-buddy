// @vitest-environment jsdom
//
// Rearranging the shelves out of sight. The visible result — a shelf that is
// already right when the book closes — is a property of Home and Library
// reading these memories, and they have their own tests. What is asserted here
// is the two things this module alone is responsible for: that both memories
// end up holding the new arrangement, and that a page turn does not drag four
// table reads behind it.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listBooks = vi.fn()
const booksWithSource = vi.fn()
const listPositions = vi.fn()
const listFolders = vi.fn()
const unavailableBooks = vi.fn()

vi.mock('../storage/index.ts', () => ({
  repository: {
    get listBooks() {
      return listBooks
    },
    get booksWithSource() {
      return booksWithSource
    },
    get listPositions() {
      return listPositions
    },
    get listFolders() {
      return listFolders
    },
  },
  unavailableBooks: (...args: unknown[]) => unavailableBooks(...args) as unknown,
}))

const { noteReading, resetReadingNote } = await import('./shelvesAhead.ts')
const { forgetLibraryMemory, readLibraryMemory } = await import('./libraryMemory.ts')
const { forgetShelfMemory, readShelfMemory } = await import('./shelfMemory.ts')

import type { BookId, BookMeta } from '../structure/index.ts'

const A = 'a' as BookId
const B = 'b' as BookId

function book(id: BookId, title: string): BookMeta {
  return { id, title, addedAt: '2026-01-01T00:00:00.000Z' } as unknown as BookMeta
}

/** Let the chained rebuild — four reads, then one more — run to completion. */
async function settle() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve()
}

beforeEach(() => {
  resetReadingNote()
  // Both memories are module-level and outlive a test. Left over, the last case
  // here would pass on the previous case's shelves.
  forgetShelfMemory()
  forgetLibraryMemory()
  vi.clearAllMocks()
  listBooks.mockResolvedValue([book(A, 'Anna'), book(B, 'Bede')])
  booksWithSource.mockResolvedValue(new Set([A, B]))
  listPositions.mockResolvedValue([
    { bookId: A, anchor: '[ch01-s01-p001]', percent: 12, at: '2026-08-11T10:00:00.000Z' },
  ])
  listFolders.mockResolvedValue([])
  unavailableBooks.mockResolvedValue(new Set())
})

describe('telling the shelves a book has been read', () => {
  it('fills both memories from one round of reads', async () => {
    noteReading(A, 12)
    await settle()

    // One round, not two. Home and the library want overlapping facts, and
    // reading them separately would cost two trips for one answer — over the
    // network, on the cloud backend.
    expect(listBooks).toHaveBeenCalledTimes(1)
    expect(listPositions).toHaveBeenCalledTimes(1)

    // The point of the whole module: the book just read is on Current Reading
    // *before* the reader can look at the shelf, so there is nothing to move
    // when they do.
    expect(readShelfMemory()?.shelves.currentlyReading?.book.id).toBe(A)
    expect(readShelfMemory()?.total).toBe(2)
    expect(readLibraryMemory()?.books).toHaveLength(2)
  })

  it('stays quiet while the same book is read on', async () => {
    noteReading(A, 12)
    await settle()
    noteReading(A, 13)
    noteReading(A, 40)
    await settle()

    // A position is written roughly once per paragraph. Rebuilding on each one
    // would put four table reads behind every page turn to produce, every time,
    // the arrangement already in the memory.
    expect(listBooks).toHaveBeenCalledTimes(1)
  })

  it('rebuilds again when another book is opened', async () => {
    noteReading(A, 12)
    await settle()
    noteReading(B, 4)
    await settle()

    expect(listBooks).toHaveBeenCalledTimes(2)
  })

  it('rebuilds again when the book is finished', async () => {
    noteReading(A, 99)
    await settle()
    // Reaching the end changes which shelf the book belongs on, and it is the
    // one change that happens without the reader leaving the book.
    noteReading(A, 100)
    await settle()

    expect(listBooks).toHaveBeenCalledTimes(2)
  })

  it('leaves the memories alone when the store refuses', async () => {
    listBooks.mockRejectedValue(new Error('offline'))

    noteReading(A, 12)
    await settle()

    // Not a failure worth surfacing: both screens re-read on arrival and
    // `moveBooks` turns the correction they compute into a glide. This is an
    // optimisation, and it has to degrade to the behaviour without it.
    expect(readShelfMemory()).toBeNull()
    expect(readLibraryMemory()).toBeNull()
  })
})
