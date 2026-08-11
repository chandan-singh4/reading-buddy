import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dropStoredCovers, readStoredCovers, storeCover } from './coverStore.ts'
import type { BookId } from '../structure/index.ts'

const id = (name: string) => name as BookId

function blobOf(text: string): Blob {
  return new Blob([text], { type: 'image/png' })
}

beforeEach(async () => {
  await dropStoredCovers()
})

describe('the cover store', () => {
  it('hands back a cover it was given', async () => {
    await storeCover(id('a'), blobOf('art'))

    const found = await readStoredCovers([id('a')])

    expect(await found.get(id('a'))?.text()).toBe('art')
  })

  it('tells "no cover" apart from "never asked"', async () => {
    // The whole point of the `null` row: a PDF has no cover, and without a
    // record of that the shelf would re-ask the network about it every launch.
    await storeCover(id('pdf'), null)

    const found = await readStoredCovers([id('pdf'), id('unknown')])

    expect(found.has(id('pdf'))).toBe(true)
    expect(found.get(id('pdf'))).toBeNull()
    expect(found.has(id('unknown'))).toBe(false)
  })

  it('reads a whole shelf in one go', async () => {
    await storeCover(id('a'), blobOf('a'))
    await storeCover(id('b'), blobOf('b'))

    const found = await readStoredCovers([id('a'), id('b'), id('c')])

    expect([...found.keys()]).toEqual([id('a'), id('b')])
  })

  it('drops named books and leaves the rest', async () => {
    await storeCover(id('a'), blobOf('a'))
    await storeCover(id('b'), blobOf('b'))

    await dropStoredCovers([id('a')])

    const found = await readStoredCovers([id('a'), id('b')])
    expect(found.has(id('a'))).toBe(false)
    expect(found.has(id('b'))).toBe(true)
  })

  it('drops everything when called bare', async () => {
    await storeCover(id('a'), blobOf('a'))
    await storeCover(id('b'), null)

    await dropStoredCovers()

    expect((await readStoredCovers([id('a'), id('b')])).size).toBe(0)
  })

  it('asks for nothing when given nothing', async () => {
    expect((await readStoredCovers([])).size).toBe(0)
  })

  it('survives a store that refuses to read', async () => {
    // Private mode, an evicted database, a browser that declines. Failing here
    // must degrade to "fetch it the old way", never throw at the shelf.
    await storeCover(id('a'), blobOf('a'))
    const structured = vi
      .spyOn(IDBFactory.prototype, 'open')
      .mockImplementation(() => {
        throw new Error('no storage')
      })

    try {
      await expect(readStoredCovers([id('a')])).resolves.toBeInstanceOf(Map)
    } finally {
      structured.mockRestore()
    }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
