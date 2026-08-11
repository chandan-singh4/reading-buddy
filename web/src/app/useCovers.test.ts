import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dropStoredCovers, readStoredCovers, storeCover } from './coverStore.ts'
import type { BookId } from '../structure/index.ts'

const COVER_PATH = 'cover.png'

const getAssets = vi.fn<(bookId: BookId, paths: readonly string[]) => Promise<Map<string, Blob>>>()

vi.mock('../storage/index.ts', () => ({
  COVER_ASSET_PATH: 'cover.png',
  repository: {
    getAssets: (bookId: BookId, paths: readonly string[]) => getAssets(bookId, paths),
  },
}))

const id = (name: string) => name as BookId

function blobOf(text: string): Blob {
  return new Blob([text], { type: 'image/png' })
}

/**
 * A fresh copy of the module, which is the only way to model *closing the app*.
 * The in-memory cover cache is module-level by design — it has to outlive a
 * component — so a second launch is a second module instance, and everything
 * this file is about happens in the gap between them.
 */
async function relaunch() {
  vi.resetModules()
  return import('./useCovers.ts')
}

beforeEach(async () => {
  getAssets.mockReset()
  await dropStoredCovers()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => `blob:${String((blob as Blob).size)}`,
    revokeObjectURL: () => {},
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('covers across launches', () => {
  it('keeps a fetched cover on the device', async () => {
    getAssets.mockResolvedValue(new Map([[COVER_PATH, blobOf('art')]]))
    const { loadCovers } = await relaunch()

    await loadCovers([id('a')])

    expect(await (await readStoredCovers([id('a')])).get(id('a'))?.text()).toBe('art')
  })

  it('does not go back to the repository on the next launch', async () => {
    // The whole point. Before this, every launch re-read every cover — which on
    // the cloud backend is Supabase and then R2, and is the second of
    // placeholder letters the reader sees on the shelf at every launch.
    getAssets.mockResolvedValue(new Map([[COVER_PATH, blobOf('art')]]))
    const first = await relaunch()
    await first.loadCovers([id('a')])
    expect(getAssets).toHaveBeenCalledTimes(1)

    const second = await relaunch()
    await second.loadCovers([id('a')])

    expect(getAssets).toHaveBeenCalledTimes(1)
  })

  it('remembers that a book has no cover at all', async () => {
    // The common case — PDF, docx and plain text have no cover step — and the
    // one that would otherwise ask the network the same question for ever.
    getAssets.mockResolvedValue(new Map())
    const first = await relaunch()
    await first.loadCovers([id('pdf')])

    const second = await relaunch()
    await second.loadCovers([id('pdf')])

    expect(getAssets).toHaveBeenCalledTimes(1)
  })

  it('fetches only the books the device does not already have', async () => {
    await storeCover(id('known'), blobOf('art'))
    getAssets.mockResolvedValue(new Map([[COVER_PATH, blobOf('new')]]))
    const { loadCovers } = await relaunch()

    await loadCovers([id('known'), id('fresh')])

    expect(getAssets).toHaveBeenCalledTimes(1)
    expect(getAssets).toHaveBeenCalledWith(id('fresh'), [COVER_PATH])
  })

  it('forgetting a book clears it from the device too', async () => {
    // Otherwise a re-imported book keeps showing the art it was imported with
    // the first time, and the reader cannot tell that from the parser failing.
    getAssets.mockResolvedValue(new Map([[COVER_PATH, blobOf('art')]]))
    const { loadCovers, forgetCovers } = await relaunch()
    await loadCovers([id('a')])

    forgetCovers([id('a')])
    // `forgetCovers` is synchronous for its callers and drops the stored copy in
    // the background; the assertion has to let that settle.
    await vi.waitFor(async () => {
      expect((await readStoredCovers([id('a')])).size).toBe(0)
    })
  })

  it('a bare forget clears every stored cover, not just the ones in memory', async () => {
    await storeCover(id('elsewhere'), blobOf('art'))
    const { forgetCovers } = await relaunch()

    forgetCovers()

    await vi.waitFor(async () => {
      expect((await readStoredCovers([id('elsewhere')])).size).toBe(0)
    })
  })

  it('a repository that throws leaves the shelf to its placeholders', async () => {
    getAssets.mockRejectedValue(new Error('offline'))
    const { loadCovers } = await relaunch()

    await expect(loadCovers([id('a')])).resolves.toBeUndefined()
  })
})
