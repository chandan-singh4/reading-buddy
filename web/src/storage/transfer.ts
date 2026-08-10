/**
 * Copying a library from one backend to the other.
 *
 * An import writes to whichever library is switched on and only that one, so
 * without this the only way to have a book in both places is to import the file
 * twice. This is the "push my shelf to the cloud" button, and its reverse.
 *
 * ## Why this is written against `Repository` and not against either backend
 *
 * Both libraries are just objects satisfying the same interface, so the copy
 * never learns which direction it is going. `copyLibrary(device, cloud)` and
 * `copyLibrary(cloud, device)` are the same code path — which is also what
 * makes the whole thing testable without a network or a browser database.
 *
 * ## Book by book, and safe to run twice
 *
 * A shelf of thirty books over a phone connection is minutes, not seconds, and
 * the connection will drop. So each book is copied on its own and a failure is
 * recorded rather than thrown: one bad book costs you that book, not the run.
 * Books already on the far side are skipped, which means **re-running after a
 * failure resumes** rather than starting again. That is the whole recovery
 * story, and it is why `saveParsedBook` is handed the original `id` — the same
 * book copied twice is one book, not two.
 *
 * ## What survives the trip, and what doesn't
 *
 * The book, its text, its pictures, the file it came from, where you had got
 * to, your folders, your quotes and your bookmarks. **Quote and bookmark dates
 * do not survive** — the repository interface only offers `addQuote` and
 * `addBookmark`, which stamp *now*, and widening it for this is a change to
 * both backends and their schemas. Their text, their labels and what they point
 * at all come across intact; only "added on" resets to the day you copied.
 */

import type { BookMeta } from '../structure/index.ts'
import type { Repository } from './repository.ts'

/** How far along the copy is. Emitted after each book, not during one. */
export interface CopyProgress {
  /** Books dealt with so far — copied and skipped both count. */
  done: number
  /** How many there were to begin with. */
  total: number
  /** The book just finished, so the screen can say something specific. */
  title: string
}

/** One book that didn't make it, kept so the screen can name names. */
export interface CopyFailure {
  title: string
  reason: string
}

export interface CopyResult {
  copied: number
  /** Already on the far side. Not an error — this is what makes a re-run cheap. */
  skipped: number
  failed: CopyFailure[]
  /** True when the reader stopped it part-way. The books already copied stay. */
  cancelled: boolean
}

export interface CopyOptions {
  onProgress?: (progress: CopyProgress) => void
  /** Checked between books, never mid-book — a half-copied book helps nobody. */
  signal?: AbortSignal
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Make sure every folder on the source exists on the target, and say which
 * folder over there corresponds to which folder over here.
 *
 * The ids can't simply be carried across: `createFolder` mints its own, and
 * both backends refuse a second folder with the same name (case-insensitively),
 * which is the behaviour we want — copying twice must not leave two
 * "Philosophy" folders. So folders are matched **by name**, and a book's
 * `folderIds` are rewritten through this map on the way over.
 */
export async function copyFolders(from: Repository, to: Repository): Promise<Map<string, string>> {
  const mapping = new Map<string, string>()
  const source = await from.listFolders()
  if (source.length === 0) return mapping

  for (const folder of source) {
    // Returns undefined when one of that name is already there, which is a
    // success for our purposes — the `listFolders` below finds it either way.
    await to.createFolder(folder.name)
  }

  const byName = new Map((await to.listFolders()).map((f) => [f.name.toLowerCase(), f.id]))
  for (const folder of source) {
    const id = byName.get(folder.name.toLowerCase())
    if (id) mapping.set(folder.id, id)
  }
  return mapping
}

/** The same book, with its folder memberships pointing at the target's folders. */
function withMappedFolders(meta: BookMeta, folders: Map<string, string>): BookMeta {
  const ids = meta.folderIds
  if (!ids || ids.length === 0) return meta

  const mapped = ids.map((id) => folders.get(id)).filter((id): id is string => id !== undefined)
  // An empty list and no list mean the same thing to the library, and only one
  // of them is what the device stores — see `unfiled()` in repository.ts.
  if (mapped.length === 0) {
    const { folderIds: _dropped, ...rest } = meta
    return rest
  }
  return { ...meta, folderIds: mapped }
}

/**
 * One whole book, in the order the far side can survive being interrupted in.
 *
 * The book itself goes first because everything else is hung off it — in
 * Postgres literally, by foreign key. Then the heavy parts, then the reader's
 * own additions, which are the cheapest to lose and the cheapest to redo.
 */
export async function copyBook(
  from: Repository,
  to: Repository,
  meta: BookMeta,
  folders: Map<string, string>,
): Promise<void> {
  const id = meta.id
  const [manifest, chapters, sections] = await Promise.all([
    from.getManifest(id),
    from.listChapterIndexes(id),
    from.listSections(id),
  ])
  if (!manifest) {
    throw new Error('This book has no contents page — it may not have finished importing.')
  }

  await to.saveParsedBook({
    meta: withMappedFolders(meta, folders),
    manifest,
    chapters,
    sections,
  })

  const paths = await from.listAssetPaths(id)
  if (paths.length > 0) {
    const found = await from.getAssets(id, paths)
    const assets = [...found].map(([path, data]) => ({ path, data }))
    if (assets.length > 0) await to.saveAssets(id, assets)
  }

  // Deliberately last of the heavy three and allowed to fail on its own: the
  // book matters and the file is a convenience, exactly as `saveSource` says.
  // A phone that runs out of room on a 60 MB epub should still get the book.
  const source = await from.getSource(id)
  if (source) {
    try {
      await to.saveSource(id, source.file, source.filename)
    } catch {
      // Losing this costs the ability to re-parse without finding the file
      // again — which is where the reader was before that table existed.
    }
  }

  const [position, quotes, bookmarks] = await Promise.all([
    from.getPosition(id),
    from.listQuotes(id),
    from.listBookmarks(id),
  ])
  if (position) await to.savePosition(id, position.anchor, position.percent)
  for (const quote of quotes) await to.addQuote(id, quote.text)
  for (const bookmark of bookmarks) await to.addBookmark(id, bookmark.anchor, bookmark.label)
}

/**
 * Copy every book the source has and the target hasn't.
 *
 * Nothing is deleted, on either side, ever — this adds, and that is all it
 * does. A book is "already there" if the target has one with the same id (the
 * normal case, because a copied book keeps its id) or the same `contentHash`
 * (the case where the same file was imported separately on both sides).
 */
export async function copyLibrary(
  from: Repository,
  to: Repository,
  options: CopyOptions = {},
): Promise<CopyResult> {
  const { onProgress, signal } = options

  const [books, existing] = await Promise.all([from.listBooks(), to.listBooks()])
  const ids = new Set<string>(existing.map((book) => book.id))
  const hashes = new Set(
    existing.map((book) => book.contentHash).filter((hash): hash is string => Boolean(hash)),
  )

  const result: CopyResult = { copied: 0, skipped: 0, failed: [], cancelled: false }
  if (books.length === 0) return result

  // Once, up front rather than per book: folders are few, and a book saved
  // before its folder exists would land loose on the shelf.
  const folders = await copyFolders(from, to)

  let done = 0
  for (const meta of books) {
    if (signal?.aborted) {
      result.cancelled = true
      return result
    }

    if (ids.has(meta.id) || (meta.contentHash && hashes.has(meta.contentHash))) {
      result.skipped += 1
    } else {
      try {
        await copyBook(from, to, meta, folders)
        result.copied += 1
        // So a re-run inside the same session doesn't copy it twice, and so a
        // shelf holding the same file under two ids only sends it once.
        ids.add(meta.id)
        if (meta.contentHash) hashes.add(meta.contentHash)
      } catch (error) {
        result.failed.push({ title: meta.title, reason: reasonFrom(error) })
      }
    }

    done += 1
    onProgress?.({ done, total: books.length, title: meta.title })
  }

  return result
}

/** How many books are on the source and not yet on the target. */
export async function countBooksToCopy(from: Repository, to: Repository): Promise<number> {
  const [books, existing] = await Promise.all([from.listBooks(), to.listBooks()])
  const ids = new Set<string>(existing.map((book) => book.id))
  const hashes = new Set(
    existing.map((book) => book.contentHash).filter((hash): hash is string => Boolean(hash)),
  )
  return books.filter(
    (book) => !ids.has(book.id) && !(book.contentHash && hashes.has(book.contentHash)),
  ).length
}
