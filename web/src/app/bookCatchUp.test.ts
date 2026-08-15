/**
 * The catch-up runs in the background and rewrites books. Two things about it
 * are worth pinning down, because neither is visible when it goes wrong: that
 * only one re-parse ever runs at a time, and that a book which cannot be
 * rebuilt is dropped rather than retried forever.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BookMeta } from '../structure/index.ts'

const reparseBook = vi.fn<(id: string) => Promise<unknown>>()
const getBook = vi.fn<(id: string) => Promise<BookMeta | undefined>>()
const findOutdated = vi.fn<() => Promise<{ updatable: BookMeta[]; stranded: number }>>()

vi.mock('../import/index.ts', () => ({ reparseBook: (id: string) => reparseBook(id) }))
vi.mock('../storage/index.ts', () => ({
  repository: { getBook: (id: string) => getBook(id) },
}))
vi.mock('./bookUpdate.ts', () => ({ findOutdated: () => findOutdated() }))
vi.mock('./useCovers.ts', () => ({ forgetCovers: vi.fn() }))
vi.mock('./shelfMemory.ts', () => ({ forgetShelfMemory: vi.fn() }))
vi.mock('./libraryMemory.ts', () => ({ forgetLibraryMemory: vi.fn() }))

const book = (id: string): BookMeta => ({ id, title: id }) as unknown as BookMeta

/** A fresh copy of the module, so its lane and its give-up list start empty. */
async function load() {
  vi.resetModules()
  return await import('./bookCatchUp.ts')
}

beforeEach(() => {
  reparseBook.mockReset().mockResolvedValue(undefined)
  getBook.mockReset().mockImplementation(async (id) => book(id))
  findOutdated.mockReset().mockResolvedValue({ updatable: [], stranded: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('opening a book that is behind', () => {
  it('leaves a book that is already current alone', async () => {
    const { catchUpOnOpen } = await load()
    expect(await catchUpOnOpen(book('a'))).toBeNull()
    expect(reparseBook).not.toHaveBeenCalled()
  })

  it('re-reads it and hands back the newer record', async () => {
    findOutdated.mockResolvedValue({ updatable: [book('a')], stranded: 0 })
    const { catchUpOnOpen } = await load()

    const fresh = await catchUpOnOpen(book('a'))

    expect(reparseBook).toHaveBeenCalledWith('a')
    expect(fresh?.id).toBe('a')
  })

  it('never runs two re-parses at once', async () => {
    findOutdated.mockResolvedValue({ updatable: [book('a'), book('b')], stranded: 0 })

    let running = 0
    let overlapped = false
    reparseBook.mockImplementation(async () => {
      running += 1
      if (running > 1) overlapped = true
      await Promise.resolve()
      running -= 1
    })

    const { catchUpOnOpen } = await load()
    await Promise.all([catchUpOnOpen(book('a')), catchUpOnOpen(book('b'))])

    expect(overlapped).toBe(false)
    expect(reparseBook).toHaveBeenCalledTimes(2)
  })

  it('gives up on a book whose re-read fails, and does not damage it', async () => {
    findOutdated.mockResolvedValue({ updatable: [book('a')], stranded: 0 })
    reparseBook.mockRejectedValue(new Error('no source'))
    const { catchUpOnOpen } = await load()

    // Falling back to the record the caller already had is what keeps the book
    // readable: a failed re-parse leaves the old parse in place.
    expect(await catchUpOnOpen(book('a'))).toBeNull()

    // And it is not tried again for the rest of the session.
    await catchUpOnOpen(book('a'))
    expect(reparseBook).toHaveBeenCalledTimes(1)
  })
})

describe('the background trickle', () => {
  it('takes one book, rests, then takes the next', async () => {
    vi.useFakeTimers()
    findOutdated.mockResolvedValue({ updatable: [book('a'), book('b')], stranded: 0 })

    const { startCatchUp } = await load()
    const stop = startCatchUp(true)

    await vi.advanceTimersByTimeAsync(0)
    expect(reparseBook).toHaveBeenCalledTimes(1)

    // Nothing more until the rest between books has passed.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(reparseBook).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(reparseBook).toHaveBeenCalledTimes(2)

    stop()
  })

  it('stops when told to, and starts nothing new', async () => {
    vi.useFakeTimers()
    findOutdated.mockResolvedValue({ updatable: [book('a')], stranded: 0 })

    const { startCatchUp } = await load()
    startCatchUp()()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(reparseBook).not.toHaveBeenCalled()
  })

  it('does nothing at all when the shelf is caught up', async () => {
    vi.useFakeTimers()
    const { startCatchUp } = await load()
    const stop = startCatchUp(true)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(reparseBook).not.toHaveBeenCalled()

    stop()
  })
})
