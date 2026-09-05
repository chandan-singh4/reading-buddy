// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StoredHandle } from '../storage/index.ts'

/*
 * The store is mocked rather than run against a scratch Dexie database.
 * Everything worth testing here is about handles and permissions — what a
 * browser does, not what Dexie does — and `handles.ts` is three one-line calls
 * over a table that `db.ts` already declares.
 */
let row: StoredHandle | undefined

vi.mock('../storage/index.ts', () => ({
  handleStore: {
    rememberImportFolder: vi.fn(async (handle: FileSystemDirectoryHandle) => {
      row = { id: 'importFolder', handle, name: handle.name, at: '2026-09-05T00:00:00.000Z' }
    }),
    importFolder: vi.fn(async () => row),
    forgetImportFolder: vi.fn(async () => {
      row = undefined
    }),
  },
}))

const {
  canRememberFolder,
  chooseFolder,
  filesInFolder,
  hasImportedFolder,
  readRememberedFolder,
  rememberFolderImport,
} = await import('./folder.ts')

/** A directory that answers `values()` the way the real API does. */
function directory(
  name: string,
  entries: unknown[],
  permission: 'granted' | 'denied' = 'granted',
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    values: () => entries[Symbol.iterator]() as never,
    queryPermission: async () => permission,
    requestPermission: async () => permission,
  } as unknown as FileSystemDirectoryHandle
}

function file(name: string, readable = true) {
  return {
    kind: 'file',
    name,
    getFile: async () => {
      if (!readable) throw new Error('gone')
      return new File(['x'], name)
    },
  }
}

beforeEach(() => {
  row = undefined
  globalThis.localStorage?.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('knowing which browser we are on', () => {
  it('cannot remember a folder without the picker', () => {
    // Firefox and iOS Safari. The UI has to fall back to asking every time.
    expect(canRememberFolder()).toBe(false)
  })

  it('can remember one where the picker exists', () => {
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve(directory('Books', [])))
    expect(canRememberFolder()).toBe(true)
  })
})

describe('has the reader ever imported a folder', () => {
  it('is false until one has been imported', () => {
    expect(hasImportedFolder()).toBe(false)
  })

  it('is true afterwards, on every browser', () => {
    // This flag is what makes the menu item appear on iOS, where there is no
    // handle to keep and so nothing else would ever say a folder was used.
    rememberFolderImport()
    expect(hasImportedFolder()).toBe(true)
  })
})

describe('reading a folder', () => {
  it('finds the books inside folders inside it', async () => {
    // A reader who files books under Philosophy/ and History/ imported both the
    // first time and would call anything less a bug.
    const folder = directory('Books', [
      file('aion.epub'),
      directory('Philosophy', [file('being.epub')]),
    ])

    const files = await filesInFolder(folder)

    expect(files.map((one) => one.name)).toEqual(['aion.epub', 'being.epub'])
  })

  it('skips what the operating system left behind', async () => {
    const folder = directory('Books', [
      file('.DS_Store'),
      file('Thumbs.db'),
      file('desktop.ini'),
      file('aion.epub'),
    ])

    expect(await filesInFolder(folder)).toHaveLength(1)
  })

  it('loses one unreadable file, not the other ninety-nine', async () => {
    const folder = directory('Books', [file('locked.epub', false), file('aion.epub')])

    const files = await filesInFolder(folder)

    expect(files.map((one) => one.name)).toEqual(['aion.epub'])
  })
})

describe('the folder we kept', () => {
  it('reads it again without asking', async () => {
    await chooseFolderInto(directory('Books', [file('aion.epub')]))

    const files = await readRememberedFolder()

    expect(files?.map((one) => one.name)).toEqual(['aion.epub'])
  })

  it('forgets a folder it may no longer read', async () => {
    // Permission is not permanent. A refusal must not leave a button that keeps
    // offering a folder it cannot open.
    await chooseFolderInto(directory('Books', [file('aion.epub')], 'denied'))

    expect(await readRememberedFolder()).toBeUndefined()
    expect(row).toBeUndefined()
  })

  it('has nothing to read before a folder is chosen', async () => {
    expect(await readRememberedFolder()).toBeUndefined()
  })
})

describe('choosing a folder', () => {
  it('keeps the one the reader picked', async () => {
    await chooseFolderInto(directory('Books', []))
    expect(row?.name).toBe('Books')
  })

  it('says nothing happened when the reader closes the picker', async () => {
    // Closing a picker is the ordinary way out of one. It is not a failure and
    // must not be reported as one.
    vi.stubGlobal('showDirectoryPicker', () => Promise.reject(new Error('AbortError')))

    expect(await chooseFolder()).toBeUndefined()
    expect(row).toBeUndefined()
  })

  it('comes back empty where there is no picker at all', async () => {
    expect(await chooseFolder()).toBeUndefined()
  })
})

async function chooseFolderInto(handle: FileSystemDirectoryHandle) {
  vi.stubGlobal('showDirectoryPicker', () => Promise.resolve(handle))
  return await chooseFolder()
}
