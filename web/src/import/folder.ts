/**
 * The folder the reader imported from, remembered.
 *
 * ## Why this is a button and not a watcher
 *
 * A reader with a folder of books wants new files in it to appear on the shelf.
 * They cannot, and no amount of code here changes that: a web app runs only
 * while it is open, and it is never allowed to look at the disk unprompted.
 * The File System Access API gets us the *next* best thing — the app may keep a
 * handle to a folder the reader once pointed at, and open it again later
 * without asking a second time. So the reader presses a button and we answer in
 * a second, instead of making them find the folder again.
 *
 * ## Two paths, because the browsers do not agree
 *
 * `showDirectoryPicker` is in Chrome, Edge and Android Chrome. Firefox and iOS
 * Safari have neither it nor any substitute — and iOS Safari is the reader's
 * own platform, so the fallback is not an edge case, it is half the users.
 * Where there is no handle to keep, the same button opens the ordinary
 * `webkitdirectory` file input the first import already uses: the reader picks
 * the folder again, and everything after that is identical.
 *
 * `canRememberFolder()` is what the UI asks to decide which of those two it is
 * offering. It must never show a button that cannot do anything.
 *
 * ## Permission expires, quietly
 *
 * A stored handle is not a standing permission. The browser drops read access
 * on its own — a new tab is usually enough — and the handle then still exists,
 * still has its name, and throws the moment it is read. `openFolder()` asks for
 * permission again first, which shows the reader a prompt they can refuse.
 * Refusal is not an error: it is a "no", and the caller falls back to picking.
 */

import { handleStore } from '../storage/index.ts'

/*
 * The parts of the File System Access API we use.
 *
 * TypeScript's DOM lib has `FileSystemDirectoryHandle`, but not
 * `showDirectoryPicker` and not the permission pair — those are still on the
 * standards track, and the lib version is not ours to choose. Declared narrowly
 * here rather than globally, so nothing outside this file starts assuming they
 * exist.
 */
type PermissionAnswer = 'granted' | 'denied' | 'prompt'

interface HandleWithPermission extends FileSystemDirectoryHandle {
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionAnswer>
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionAnswer>
}

/*
 * `values()` is how a directory is walked, and TypeScript's DOM lib does not
 * have it either — the lib models a directory handle as the bare base type.
 */
interface WalkableDirectory extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | WalkableDirectory>
}

interface PickerWindow {
  showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<
    FileSystemDirectoryHandle
  >
}

/** A folder we can open again without asking. */
export interface RememberedFolder {
  handle: FileSystemDirectoryHandle
  /** The last part of the path — all a handle ever knows about where it is. */
  name: string
  /** ISO 8601, when it was last read. */
  at: string
}

/*
 * "Has this reader ever imported a folder?"
 *
 * A flag of its own, in `localStorage`, and not a handle — because on iOS there
 * is no handle to keep and the button still has to appear. It is the only thing
 * that survives a folder import on that path, and losing it costs the reader
 * one menu item until their next folder import.
 */
const EVER_KEY = 'reading-buddy:imported-a-folder'

export function rememberFolderImport(): void {
  try {
    globalThis.localStorage?.setItem(EVER_KEY, '1')
  } catch {
    /* Then the menu item stays hidden. Nothing else breaks. */
  }
}

export function hasImportedFolder(): boolean {
  try {
    return globalThis.localStorage?.getItem(EVER_KEY) === '1'
  } catch {
    return false
  }
}

/** True where the app can keep a folder and open it again on its own. */
export function canRememberFolder(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function'
}

/** The folder we kept, or nothing. Never throws — a missing store is a "no". */
export async function rememberedFolder(): Promise<RememberedFolder | undefined> {
  try {
    const row = await handleStore.importFolder()
    if (!row) return undefined
    return { handle: row.handle, name: row.name, at: row.at }
  } catch {
    return undefined
  }
}

export async function forgetFolder(): Promise<void> {
  try {
    await handleStore.forgetImportFolder()
  } catch {
    // Forgetting something that was never there is the state we wanted anyway.
  }
}

/**
 * Ask the reader for a folder and keep it.
 *
 * `undefined` means the reader closed the picker. That is the ordinary way out
 * of a picker, not a failure, so it must not be reported as one.
 */
export async function chooseFolder(): Promise<RememberedFolder | undefined> {
  const pick = (window as PickerWindow).showDirectoryPicker
  if (!pick) return undefined

  let handle: FileSystemDirectoryHandle
  try {
    // A stable `id` asks the browser to reopen the picker where it was last
    // time, which for this app is nearly always the right folder.
    handle = await pick({ id: 'reading-buddy-books', mode: 'read' })
  } catch {
    return undefined
  }

  await handleStore.rememberImportFolder(handle)
  return { handle, name: handle.name, at: new Date().toISOString() }
}

/**
 * Make sure we may still read the folder, asking the reader if we may not.
 *
 * Returns false for a refusal *and* for a handle whose folder has been moved or
 * deleted. The caller cannot tell those apart and does not need to: both mean
 * "this handle is no longer a way into a folder".
 */
export async function allowedToRead(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const asking = handle as HandleWithPermission
  try {
    if (await asking.queryPermission?.({ mode: 'read' }) === 'granted') return true
    return (await asking.requestPermission?.({ mode: 'read' })) === 'granted'
  } catch {
    return false
  }
}

/** Skip the invisible things every OS and cloud drive scatters through a folder. */
function isHidden(name: string): boolean {
  return name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini'
}

/**
 * Every file in the folder, and in the folders inside it.
 *
 * Depth-first and unbounded, to match what the `webkitdirectory` input hands
 * over — a reader who files books in `Philosophy/` and `History/` under one
 * folder imported both the first time, and would rightly call it a bug if the
 * re-scan only saw the loose ones.
 *
 * Nothing is filtered by extension here. `importBooks` is given
 * `skipUnsupported`, so it already drops everything that is not a book, and it
 * is the one place that knows what a book is.
 */
export async function filesInFolder(handle: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = []

  async function walk(directory: FileSystemDirectoryHandle): Promise<void> {
    for await (const entry of (directory as WalkableDirectory).values()) {
      if (isHidden(entry.name)) continue
      if (entry.kind === 'file') {
        try {
          files.push(await entry.getFile())
        } catch {
          // One unreadable file must not lose the reader the other ninety-nine.
        }
      } else {
        await walk(entry)
      }
    }
  }

  await walk(handle)
  return files
}

/**
 * The whole re-scan, in one call: check we may read, read, and write down that
 * we did.
 *
 * `undefined` says the handle is no longer usable, and the caller should fall
 * back to the picker. It also forgets the handle, because a button that keeps
 * offering a folder it cannot open is worse than no button.
 */
export async function readRememberedFolder(): Promise<File[] | undefined> {
  const folder = await rememberedFolder()
  if (!folder) return undefined

  if (!(await allowedToRead(folder.handle))) {
    await forgetFolder()
    return undefined
  }

  try {
    const files = await filesInFolder(folder.handle)
    // Re-put the same handle, which refreshes `at` for the "last checked" line.
    await handleStore.rememberImportFolder(folder.handle)
    return files
  } catch {
    await forgetFolder()
    return undefined
  }
}
