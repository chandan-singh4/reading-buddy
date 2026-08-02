/**
 * Turning a drop into a flat list of files.
 *
 * A drop is not a file list. Dropping a *folder* gives you one item that has to
 * be walked, one directory at a time, through the old callback-based
 * `webkitGetAsEntry` API — the only way any browser exposes a dropped folder.
 * `dataTransfer.files` alone would silently yield nothing for it, which is
 * exactly the kind of "I dropped my books and nothing happened" that this
 * module exists to prevent.
 */

// The FileSystem entry API is only partly in TypeScript's DOM lib, and its
// shape is fixed by history rather than by us. These are the parts we use.
interface FsEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
}

interface FsFileEntry extends FsEntry {
  file(onSuccess: (file: File) => void, onError: (error: unknown) => void): void
}

interface FsDirectoryEntry extends FsEntry {
  createReader(): {
    readEntries(onSuccess: (entries: FsEntry[]) => void, onError: (error: unknown) => void): void
  }
}

/** Skip the invisible things every OS and cloud drive scatters through a folder. */
function isHidden(name: string): boolean {
  return name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini'
}

function readFile(entry: FsFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null), // An unreadable entry is skipped, not fatal to the drop.
    )
  })
}

/**
 * `readEntries` returns at most ~100 entries per call and signals the end with
 * an empty batch — so a large folder needs calling until it runs dry. Forget
 * this and a 300-book folder quietly imports the first hundred.
 */
function readAllEntries(directory: FsDirectoryEntry): Promise<FsEntry[]> {
  return new Promise((resolve) => {
    const reader = directory.createReader()
    const all: FsEntry[] = []

    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all)
          return
        }
        all.push(...batch)
        readBatch()
      }, () => resolve(all))
    }

    readBatch()
  })
}

async function collectEntry(entry: FsEntry, into: File[], depth: number): Promise<void> {
  if (isHidden(entry.name)) return

  if (entry.isFile) {
    const file = await readFile(entry as FsFileEntry)
    if (file) into.push(file)
    return
  }

  // A guard against a pathological nest — books live one or two levels deep,
  // and a symlink loop would otherwise spin forever.
  if (entry.isDirectory && depth < 8) {
    const children = await readAllEntries(entry as FsDirectoryEntry)
    for (const child of children) await collectEntry(child, into, depth + 1)
  }
}

/**
 * Every file in a drop, including everything inside any dropped folders.
 * Falls back to `dataTransfer.files` when the entry API isn't available.
 */
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? [])

  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) =>
      'webkitGetAsEntry' in item
        ? (item.webkitGetAsEntry() as unknown as FsEntry | null)
        : null,
    )
    .filter((entry): entry is FsEntry => entry !== null)

  if (entries.length === 0) {
    return Array.from(dataTransfer.files).filter((file) => !isHidden(file.name))
  }

  const files: File[] = []
  for (const entry of entries) await collectEntry(entry, files, 0)
  return files
}

/** True when the drop contains at least one folder — the UI wording changes. */
export function dropHasDirectory(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.items ?? []).some((item) => {
    if (item.kind !== 'file' || !('webkitGetAsEntry' in item)) return false
    const entry = item.webkitGetAsEntry() as unknown as FsEntry | null
    return entry?.isDirectory === true
  })
}
