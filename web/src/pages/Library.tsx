import { useMemo, useState } from 'react'

import {
  dropHasDirectory,
  filesFromDrop,
  importBooks,
  isOutOfDate,
  reparseBooks,
  type BatchProgress,
  type ImportOutcome,
  type ReparseOutcome,
  type ReparseProgress,
} from '../import/index.ts'
import type { BookId, BookMeta, Shelf } from '../structure/index.ts'
import { repository, type StoredFolder } from '../storage/index.ts'
import { Portal } from '../app/Portal.tsx'
import {
  forgetLibraryMemory,
  loadLibrary,
  readLibraryMemory,
  writeLibraryMemory,
} from '../app/libraryMemory.ts'
import { useOnVisit } from '../app/screenActive.tsx'
import { forgetShelfMemory } from '../app/shelfMemory.ts'
import { forgetCovers, useCovers } from '../app/useCovers.ts'
import { useRowMemory } from '../app/useRowMemory.ts'
import { AddButton } from '../library/AddButton.tsx'
import { BookShelf } from '../library/BookShelf.tsx'
import { FilterBar } from '../library/FilterBar.tsx'
import { FilterSheet } from '../library/FilterSheet.tsx'
import { SelectionBar } from '../library/SelectionBar.tsx'
import { arrange, type LibraryContext } from '../library/filter.ts'
import { folderChoices, folderIdsOf } from '../library/folders.ts'
import {
  isFiltered,
  readLibraryPrefs,
  writeLibraryPrefs,
  type LibraryPrefs,
} from '../library/prefs.ts'
import styles from './page.module.css'
import libraryStyles from './Library.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'failed'; message: string }

type ImportState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'busy'; progress: BatchProgress }
  | { status: 'done'; outcomes: ImportOutcome[] }

const STAGE_LABEL: Record<BatchProgress['stage'], string> = {
  reading: 'Reading',
  parsing: 'Parsing',
  saving: 'Saving',
}

/** Re-reading books from the files they were imported from. */
type UpdateState =
  | { status: 'idle' }
  | { status: 'busy'; progress: ReparseProgress }
  | { status: 'done'; outcomes: ReparseOutcome[] }

/**
 * The library: every book the reader owns, as a list or a grid, with the search,
 * filters and sorting that make a shelf of two hundred navigable.
 *
 * The screen itself holds state and talks to storage; everything that can be
 * *wrong* rather than merely ugly lives in `src/library/` as pure functions —
 * `filter.ts` decides what is shown and in what order, `status.ts` decides how
 * far through each book is, `prefs.ts` remembers the reader's choices. That
 * split is what lets the ordering rules be unit-tested without mounting
 * anything, which is the only way the sorting stays honest as filters are added.
 */
export default function Library() {
  /*
   * Seeded from the memory rather than started empty, so a shelf that has been
   * loaded once — or warmed from Home before it was ever opened — paints on the
   * first frame instead of showing "Loading…" where the books were. Lazy
   * initialisers: they must read on mount, not on every render.
   *
   * All four together, or none: a `ready` state over an empty book list is the
   * "No books yet" screen, which would be a far worse flash than the one this
   * removes.
   */
  const [state, setState] = useState<LoadState>(() =>
    readLibraryMemory() ? { status: 'ready' } : { status: 'loading' },
  )
  const [books, setBooks] = useState<BookMeta[]>(() => readLibraryMemory()?.books ?? [])
  const [folders, setFolders] = useState<StoredFolder[]>(() => readLibraryMemory()?.folders ?? [])

  const [importing, setImporting] = useState<ImportState>({ status: 'idle' })
  const [updating, setUpdating] = useState<UpdateState>({ status: 'idle' })
  const [dragging, setDragging] = useState(false)

  /** What has been typed into the search. Empty means "show everything". */
  const [query, setQuery] = useState('')

  /**
   * Read synchronously on the very first render rather than in an effect, so
   * the shelf paints in the reader's chosen view immediately. Loading it after
   * mount would show one frame of list before flipping to grid, which reads as
   * the app forgetting and then remembering.
   */
  const [prefs, setPrefs] = useState<LibraryPrefs>(readLibraryPrefs)
  const [filterOpen, setFilterOpen] = useState(false)

  /**
   * Which books are ticked, or `null` when not selecting at all.
   *
   * `null` rather than an empty set: "not selecting" and "selecting nothing"
   * have to look different, because the action bar only makes sense in one of
   * them and a shelf permanently covered in ticks is a worse default for the
   * thing people do most, which is read.
   */
  const [selected, setSelected] = useState<Set<BookId> | null>(null)

  /** The "name your folder" prompt, when it is showing. */
  const [naming, setNaming] = useState<null | { forSelected: boolean }>(null)

  /**
   * Which books still have the file they were imported from — asked once for
   * the whole shelf, and answered without touching a single blob.
   */
  const [withSource, setWithSource] = useState<Set<BookId>>(
    () => readLibraryMemory()?.sources ?? new Set(),
  )

  /** How far into each book the reader has got, and when they last opened it. */
  const [progress, setProgress] = useState<LibraryContext['progress']>(
    () => readLibraryMemory()?.progress ?? new Map(),
  )

  const folderMap = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  )

  /**
   * Every folder the reader can pick from — Unread and Finished first, then
   * their own. Built here and handed to both the bar and the sheet, so the two
   * can never offer different lists.
   */
  const choices = useMemo(() => folderChoices(folders), [folders])
  const context = useMemo<LibraryContext>(
    () => ({ progress, folders: folderMap }),
    [progress, folderMap],
  )

  const visible = useMemo(
    () => arrange(books, query, prefs, context),
    [books, query, prefs, context],
  )
  const allShown = visible.length > 0 && visible.every((book) => selected?.has(book.id))
  const covers = useCovers(useMemo(() => visible.map((book) => book.id), [visible]))

  // Waits for the books, because the shelf's height depends on them. Remembered
  // by book rather than by pixel offset — see the hook for why an offset kept
  // landing somewhere arbitrary.
  const rememberRow = useRowMemory('library-row', state.status === 'ready')

  function savePrefs(next: LibraryPrefs) {
    setPrefs(next)
    writeLibraryPrefs(next)
  }

  /**
   * Re-read everything the shelf shows, in one round of queries.
   *
   * `changed` says whether the books themselves were altered rather than merely
   * re-read. Only then are the cached covers dropped: `useCovers` keeps object
   * URLs alive across screens so returning to a shelf doesn't visibly reload it,
   * and a cache nobody invalidates is how a re-imported book goes on showing the
   * art the *old* parser gave it — indistinguishable, from the reader's side,
   * from the new parser having failed.
   *
   * Every path that writes to the books table comes through here, which is why
   * the invalidation lives at this one door rather than at each of them.
   */
  async function reload(changed = false) {
    if (changed) {
      forgetCovers()
      forgetShelfMemory()
      forgetLibraryMemory()
    }

    const memory = await loadLibrary()
    writeLibraryMemory(memory)
    setBooks(memory.books)
    setWithSource(memory.sources)
    setProgress(memory.progress)
    setFolders(memory.folders)
    setState({ status: 'ready' })
  }

  function failed(error: unknown, prefix?: string) {
    const message = error instanceof Error ? error.message : String(error)
    setState({ status: 'failed', message: prefix ? `${prefix} ${message}` : message })
  }

  // On arrival, not on mount — the screen is kept alive between visits now, so
  // the two stopped being the same thing. See `app/screenActive.tsx`.
  useOnVisit(() => {
    let cancelled = false

    reload().catch((error: unknown) => {
      // Surfaced rather than swallowed: on a phone, a blocked or full
      // IndexedDB is a real failure mode and a blank screen hides it.
      if (!cancelled) failed(error)
    })

    return () => {
      cancelled = true
    }
  })

  const busy =
    importing.status === 'busy' || importing.status === 'scanning' || updating.status === 'busy'

  /** Books an improved parser could do better with — see `parse/version.ts`. */
  const outdated = books.filter(isOutOfDate)
  const updatable = outdated.filter((book) => withSource.has(book.id))
  const stranded = outdated.length - updatable.length

  /**
   * Bring every book that can be updated up to the current parser. The books
   * keep their identity throughout — same id, same shelf, same place in the
   * list, same reading position.
   */
  async function runUpdate() {
    if (updatable.length === 0) return

    setUpdating({
      status: 'busy',
      progress: { index: 1, total: updatable.length, title: updatable[0]!.title, stage: 'reading' },
    })

    const outcomes = await reparseBooks(updatable, {
      onProgress: (progress) => setUpdating({ status: 'busy', progress }),
    })

    setUpdating({ status: 'done', outcomes })
    await reload(true).catch((error: unknown) => failed(error))
  }

  /**
   * `fromFolder` decides whether an unreadable file is worth reporting: a
   * hand-picked one is, a stray file swept up from a folder isn't.
   */
  async function runImport(files: File[], fromFolder: boolean) {
    if (files.length === 0) {
      setImporting({ status: 'done', outcomes: [] })
      return
    }

    setImporting({
      status: 'busy',
      progress: { index: 1, total: files.length, filename: files[0]!.name, stage: 'reading' },
    })

    const outcomes = await importBooks(files, {
      skipUnsupported: fromFolder,
      onProgress: (progress) => setImporting({ status: 'busy', progress }),
    })

    setImporting({ status: 'done', outcomes })
    await reload(true).catch((error: unknown) => failed(error))
  }

  async function onDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (busy) return

    const fromFolder = dropHasDirectory(event.dataTransfer)
    setImporting({ status: 'scanning' })
    // Walking a dropped folder is itself async, and on a big shelf it is slow
    // enough to need its own "looking through that folder…" state.
    const files = await filesFromDrop(event.dataTransfer)
    void runImport(files, fromFolder)
  }

  // --- Selection ------------------------------------------------------------

  function startSelecting(id: BookId) {
    setSelected(new Set([id]))
  }

  function toggleSelected(id: BookId) {
    setSelected((current) => {
      const next = new Set(current ?? [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const chosen = useMemo(() => [...(selected ?? [])], [selected])

  /**
   * How many of the ticked books are in each folder.
   *
   * Counted rather than answered yes/no because membership stopped being
   * one-or-nothing: with eleven of thirty ticked books already in Philosophy,
   * the bar has to be able to say so, or a tap on that row is a coin toss
   * between filing nineteen and unfiling eleven. See `SelectionBar`.
   */
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (!selected) return counts
    for (const book of books) {
      if (!selected.has(book.id)) continue
      for (const id of folderIdsOf(book)) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [books, selected])

  /**
   * Run one bulk action over the ticked books, then re-read the shelf.
   *
   * `keepSelection` exists for the folder rows and nothing else. Every other
   * action here is terminal — books deleted, types changed — and dropping the
   * ticks afterwards is the confirmation that it happened. Filing is not
   * terminal: a book can go into several folders, so the reader is usually only
   * half done, and re-ticking thirty books to finish the job is the kind of
   * thing that makes a feature not get used.
   */
  async function applyToSelected(
    work: (ids: BookId[]) => Promise<void>,
    prefix: string,
    keepSelection = false,
  ) {
    if (chosen.length === 0) return
    try {
      await work(chosen)
      if (!keepSelection) setSelected(null)
      await reload(true)
    } catch (error: unknown) {
      failed(error, prefix)
    }
  }

  /**
   * Making a folder does two different jobs depending on where it was asked
   * for: from the "+" it just creates one, and from the selection bar it
   * creates one *and moves the ticked books into it* — which is the only
   * reason to be making a folder at that moment.
   */
  async function createFolder(name: string, addSelected: boolean) {
    setNaming(null)
    try {
      const folder = await repository.createFolder(name)
      if (folder && addSelected && chosen.length > 0) {
        // Added, not moved: the ticked books keep whatever folders they were
        // already in. A book can be in several now, so making a new folder out
        // of a selection must not quietly empty the ones it came from.
        await repository.addBooksToFolder(chosen, folder.id)
        setSelected(null)
      }
      await reload()
    } catch (error: unknown) {
      failed(error, 'Couldn’t make that folder.')
    }
  }

  const selecting = selected !== null

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!busy) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        void onDrop(event)
      }}
      className={dragging ? libraryStyles.dropping : undefined}
    >
      {selecting ? (
        <SelectionBar
          count={chosen.length}
          allShown={allShown}
          folders={folders}
          onSelectAll={() => setSelected(new Set(visible.map((book) => book.id)))}
          onSelectNone={() => setSelected(new Set())}
          onCancel={() => setSelected(null)}
          onChangeType={(shelf: Shelf) => {
            void applyToSelected(
              (ids) => repository.setShelfFor(ids, shelf),
              'Couldn’t change the type.',
            )
          }}
          folderCounts={folderCounts}
          onToggleFolder={(folderId, add) => {
            void applyToSelected(
              (ids) =>
                add
                  ? repository.addBooksToFolder(ids, folderId)
                  : repository.removeBooksFromFolder(ids, folderId),
              'Couldn’t change those folders.',
              // The selection survives, unlike every other action on this bar.
              // Filing books under two folders is one job done twice, and
              // clearing the ticks after the first half would mean finding all
              // thirty books again to finish it.
              true,
            )
          }}
          onClearFolders={() => {
            void applyToSelected(
              (ids) => repository.clearFoldersFor(ids),
              'Couldn’t change those folders.',
            )
          }}
          onNewFolder={() => setNaming({ forSelected: true })}
          onDelete={() => {
            void applyToSelected(
              (ids) => repository.deleteBooks(ids),
              'Couldn’t remove those books.',
            )
          }}
        />
      ) : (
        <h1 className={styles.title}>
          {/* Looked up in `choices` rather than `folderMap`, so "Unread" and
              "Finished" title the screen the same way a folder the reader made
              does — from their side there is no difference between the two. */}
          {prefs.folderId
            ? (choices.find((choice) => choice.id === prefs.folderId)?.name ?? 'Library')
            : 'All books'}
        </h1>
      )}

      {/* The search bar and the filter button, as one control. They are the
          same job — narrowing what is on the shelf — and the reference designs
          treat them as one object for that reason. */}
      <div className={libraryStyles.searchBar}>
        <span className={libraryStyles.searchIcon} aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          className={libraryStyles.searchInput}
          value={query}
          placeholder="Search library…"
          aria-label="Search your library"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className={
            isFiltered(prefs)
              ? `${libraryStyles.filterButton} ${libraryStyles.filterButtonOn}`
              : libraryStyles.filterButton
          }
          aria-label="Filter and sort"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen(true)}
        >
          <span className={libraryStyles.filterIcon} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {/* Sort, folder, reading status and view, on the shelf rather than two
          taps and a slide away behind the icon above — which still opens the
          full set. See `FilterBar` for why they came out of the sheet. */}
      <FilterBar
        prefs={prefs}
        folders={choices}
        onChange={savePrefs}
        onOpenAll={() => setFilterOpen(true)}
      />

      {/* Says what is being hidden, and offers the one tap that stops hiding
          it. A filter left on from a previous session is otherwise
          indistinguishable from books having gone missing. */}
      {isFiltered(prefs) && (
        <div className={libraryStyles.activeFilters}>
          <span className={styles.pending}>
            Showing {visible.length} of {books.length}
          </span>
          <button
            type="button"
            className={libraryStyles.clear}
            onClick={() => savePrefs({ ...prefs, statuses: [], shelves: [], folderId: undefined })}
          >
            Clear filters
          </button>
        </div>
      )}

      {importing.status === 'scanning' && (
        <p className={styles.pending} role="status">
          Looking through that folder…
        </p>
      )}

      {importing.status === 'busy' && (
        <p className={styles.pending} role="status">
          {STAGE_LABEL[importing.progress.stage]} “{importing.progress.filename}” —{' '}
          {importing.progress.index} of {importing.progress.total}. Large books can take a few
          seconds each.
        </p>
      )}

      {importing.status === 'done' && <ImportReport outcomes={importing.outcomes} />}

      {/*
        A parsed book is a snapshot, so improving the parser does nothing for
        books already on the shelf and says nothing about itself — the reader
        sees the old behaviour and reasonably concludes the fix didn't work.
        This is the shelf telling them, and offering the one tap that fixes it.
      */}
      {state.status === 'ready' && outdated.length > 0 && (
        <div className={styles.update}>
          <p className={styles.emptyTitle}>
            {outdated.length === 1
              ? 'One book can be improved'
              : `${outdated.length} books can be improved`}
          </p>
          <p className={styles.pending}>
            {outdated.length === 1 ? 'It was' : 'They were'} read by an older version of Reading
            Buddy. Updating re-reads {outdated.length === 1 ? 'it' : 'them'} from the original file
            — links, figures and chapter breaks all improve. Your place in{' '}
            {outdated.length === 1 ? 'the book' : 'each book'} is kept.
          </p>

          {updatable.length > 0 && (
            <button
              type="button"
              className={styles.importButton}
              disabled={busy}
              onClick={() => {
                void runUpdate()
              }}
            >
              {updating.status === 'busy'
                ? 'Updating…'
                : `Update ${updatable.length} ${updatable.length === 1 ? 'book' : 'books'}`}
            </button>
          )}

          {/* Said plainly rather than left as a button that quietly does
              nothing for some rows: these predate the kept file, so the long
              way round is genuinely the only way. */}
          {stranded > 0 && (
            <p className={styles.pending}>
              {stranded === 1 ? 'One of them was' : `${stranded} of them were`} imported before
              Reading Buddy kept the original file, so {stranded === 1 ? 'it' : 'they'} can’t be
              updated in place — remove {stranded === 1 ? 'it' : 'them'} and import the{' '}
              {stranded === 1 ? 'file' : 'files'} again. That is the last time this will be needed.
            </p>
          )}

          {updating.status === 'busy' && (
            <p className={styles.pending} role="status">
              {STAGE_LABEL[updating.progress.stage]} “{updating.progress.title}” —{' '}
              {updating.progress.index} of {updating.progress.total}.
            </p>
          )}
        </div>
      )}

      {updating.status === 'done' && <UpdateReport outcomes={updating.outcomes} />}

      {state.status === 'loading' && <p className={styles.pending}>Loading…</p>}

      {state.status === 'failed' && (
        <div className={styles.error} role="alert">
          <p>Couldn’t open your library.</p>
          <p className={styles.pending}>{state.message}</p>
        </div>
      )}

      {state.status === 'ready' && books.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No books yet</p>
          <p>
            Tap <strong>+</strong> to add some, or drag files onto this page. EPUB, PDF, Markdown,
            plain text or Word (.docx) — Kindle books (.azw3, .kfx) can’t be opened, so convert one
            to EPUB first, with Calibre.
          </p>
        </div>
      )}

      {/* An empty shelf and an empty *search* are different situations, and
          "No books yet" over a shelf of 35 would be alarming nonsense. */}
      {state.status === 'ready' && books.length > 0 && visible.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {query ? `Nothing matches “${query}”` : 'Nothing matches those filters'}
          </p>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              setQuery('')
              savePrefs({ ...prefs, statuses: [], shelves: [], folderId: undefined })
            }}
          >
            Show every book
          </button>
        </div>
      )}

      {state.status === 'ready' && visible.length > 0 && (
        <BookShelf
          books={visible}
          view={prefs.view}
          progress={progress}
          folders={folderMap}
          covers={covers}
          selected={selected}
          onLongPress={startSelecting}
          onToggle={toggleSelected}
          onOpen={rememberRow}
        />
      )}

      {/* Out of the way of the selection bar: the "+" adds books and the bar
          acts on the ones already there, and both at once is a screen with two
          answers to "what happens if I tap". */}
      {!selecting && (
        <AddButton
          busy={busy}
          onPickFiles={(files) => {
            void runImport(files, false)
          }}
          onPickFolder={(files) => {
            void runImport(files, true)
          }}
          onNewFolder={() => setNaming({ forSelected: false })}
        />
      )}

      <FilterSheet
        open={filterOpen}
        prefs={prefs}
        folders={choices}
        onChange={savePrefs}
        onClose={() => setFilterOpen(false)}
      />

      {naming && (
        <NameFolder
          moving={naming.forSelected ? chosen.length : 0}
          onCancel={() => setNaming(null)}
          onName={(name) => {
            void createFolder(name, naming.forSelected)
          }}
        />
      )}
    </div>
  )
}

/**
 * "What shall we call it?"
 *
 * A form rather than `window.prompt`, which is blocked outright in an installed
 * PWA on some platforms — the one context this app is actually used in.
 */
function NameFolder({
  moving,
  onCancel,
  onName,
}: {
  moving: number
  onCancel: () => void
  onName: (name: string) => void
}) {
  const [name, setName] = useState('')

  return (
    // Portalled for the same reason as the sheet and the "+": inside the app
    // frame, `position: fixed` is fixed to the document, not the screen — so a
    // dialog opened halfway down a long shelf would appear above the fold.
    <Portal>
    <div className={libraryStyles.dialogScrim} role="dialog" aria-label="New folder" data-no-swipe="">
      <form
        className={libraryStyles.dialog}
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onName(name)
        }}
      >
        <label className={libraryStyles.dialogLabel} htmlFor="folder-name">
          Folder name
        </label>
        <input
          id="folder-name"
          className={libraryStyles.dialogInput}
          value={name}
          placeholder="Philosophy"
          // The reader opened this to type — landing anywhere else is a tap wasted.
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
        {moving > 0 && (
          <p className={styles.pending}>
            {moving} {moving === 1 ? 'book' : 'books'} will move into it.
          </p>
        )}
        <div className={libraryStyles.dialogActions}>
          <button type="button" className={styles.iconButton} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={styles.importButton} disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
    </Portal>
  )
}

/**
 * What happened to each book that was re-read.
 *
 * Named rather than counted where something went wrong: "one book couldn't be
 * updated" is not actionable, and the book that failed is still sitting on the
 * shelf reading exactly as it did before — which is the one saving grace worth
 * stating out loud.
 */
function UpdateReport({ outcomes }: { outcomes: ReparseOutcome[] }) {
  const updated = outcomes.filter((outcome) => outcome.status === 'updated')
  const failed = outcomes.filter((outcome) => outcome.status === 'failed')

  return (
    <div className={failed.length > 0 ? styles.error : undefined} role="status">
      <p>
        {updated.length > 0
          ? `Updated ${updated.length} ${updated.length === 1 ? 'book' : 'books'}.`
          : 'No books were updated.'}
        {failed.length > 0 &&
          ` ${failed.length} couldn’t be — ${
            failed.length === 1 ? 'it is' : 'they are'
          } unchanged and still readable:`}
      </p>

      {failed.length > 0 && (
        <ul className={styles.failureList}>
          {failed.map((outcome) => (
            <li key={outcome.bookId} className={styles.pending}>
              <strong>{outcome.title}</strong> — {outcome.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * What happened, per file. A batch has no single answer — "9 imported, 3
 * couldn't be opened" is the truth, and each of those three needs its own
 * reason next to its own filename.
 */
function ImportReport({ outcomes }: { outcomes: ImportOutcome[] }) {
  if (outcomes.length === 0) {
    return (
      <div className={styles.error} role="alert">
        <p>Nothing there to import.</p>
        <p className={styles.pending}>No EPUB, PDF, Markdown, text or Word files were found.</p>
      </div>
    )
  }

  const imported = outcomes.filter((outcome) => outcome.status === 'imported')
  const duplicates = outcomes.filter((outcome) => outcome.status === 'duplicate')
  const failed = outcomes.filter((outcome) => outcome.status === 'failed')

  // A single duplicate is the common case — you re-dropped one book — and it
  // deserves the plain sentence, not a one-item list under a summary.
  if (outcomes.length === 1 && duplicates.length === 1) {
    return (
      <p className={styles.pending} role="status">
        {duplicates[0]!.message}
      </p>
    )
  }

  return (
    <div className={failed.length > 0 ? styles.error : undefined} role="status">
      <p>
        {imported.length > 0
          ? `Imported ${imported.length} ${imported.length === 1 ? 'book' : 'books'}.`
          : 'Nothing new was imported.'}
        {duplicates.length > 0 && ` ${duplicates.length} already on your shelf.`}
        {failed.length > 0 && ` ${failed.length} couldn’t be opened:`}
      </p>

      {failed.length > 0 && (
        <ul className={styles.failureList}>
          {failed.map((outcome) => (
            <li key={outcome.filename} className={styles.pending}>
              <strong>{outcome.filename}</strong> — {outcome.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
