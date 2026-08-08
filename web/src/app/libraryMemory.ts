/**
 * What the library screen worked out last time, kept between visits — and
 * fetched ahead of the reader the first time, before they have asked for it.
 *
 * ## Why this exists separately from `shelfMemory`
 *
 * Home got its memory first, and it fixed Home. The reader's next report was
 * exact and it was about the other direction: "the first time I go from home to
 * all books I see the refresh flash; go back and come again and there is no
 * flash". Two facts in one sentence, and together they name the cause.
 *
 * The flash on the way *to* the library was never the covers alone. `Library`
 * begins every mount at `loading`, so the shelf is replaced by the word
 * "Loading…" for as long as four indexed reads take — books, sources, positions,
 * folders. That is the same fault Home had, on a screen that was never given the
 * same fix. It faded on later visits only because a warm IndexedDB answers fast
 * enough to hide it, which is not the same thing as it not happening.
 *
 * ## Warmed, not merely cached
 *
 * A cache alone would have left the first visit exactly as it was, and the first
 * visit is the one the reader described. So `warmLibrary` runs the same four
 * reads from Home, in idle time, into this memory: by the time a swipe can
 * possibly reach the library the answer is already sitting here and the screen
 * paints complete on its first frame.
 *
 * Home is the right place to trigger it for the same reason it warms the covers
 * — it is the front door, it is a screen or two ahead of the library, and there
 * is nothing on screen waiting on the reads.
 *
 * Module-level, like `shelfMemory` and for the same reason: the component that
 * would hold it is by definition unmounted at the moment it is needed. It dies
 * on reload, which is the correct lifetime.
 */

import type { BookProgress } from '../library/status.ts'
import { progressMap } from '../library/status.ts'
import { repository, type StoredFolder } from '../storage/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'

export interface LibraryMemory {
  books: BookMeta[]
  sources: Set<BookId>
  progress: ReadonlyMap<BookId, BookProgress>
  folders: StoredFolder[]
}

let remembered: LibraryMemory | null = null

/** What the library showed last time, or `null` if nothing has filled it yet. */
export function readLibraryMemory(): LibraryMemory | null {
  return remembered
}

export function writeLibraryMemory(memory: LibraryMemory): void {
  remembered = memory
}

/**
 * Forget it.
 *
 * **Anything that adds, removes or re-parses a book must call this**, next to
 * `forgetShelfMemory` and `forgetCovers` — the three are one obligation. A shelf
 * that goes on showing a book the reader has just deleted is a worse bug than
 * the flash all of this removed.
 */
export function forgetLibraryMemory(): void {
  remembered = null
}

/** The four reads the library screen opens with, as one round. */
export async function loadLibrary(): Promise<LibraryMemory> {
  const [books, sources, positions, folders] = await Promise.all([
    repository.listBooks(),
    repository.booksWithSource(),
    repository.listPositions(),
    repository.listFolders(),
  ])
  return { books, sources, progress: progressMap(positions), folders }
}

/**
 * Fill the memory before anyone asks, so the library's first visit of a session
 * opens the way its second one does.
 *
 * Fire-and-forget, and deliberately silent: it resolves into the memory and
 * tells nobody. A library screen that mounts mid-warm simply does its own read,
 * which is the behaviour it had anyway.
 */
export function warmLibrary(): void {
  if (remembered) return

  const run = () => {
    // Re-checked: the reader may have reached the library while this waited for
    // an idle moment, in which case its own read is the fresher of the two.
    if (remembered) return
    void loadLibrary()
      .then((memory) => {
        if (!remembered) remembered = memory
      })
      .catch(() => {
        // A warm that fails costs nothing — the screen reads for itself, and
        // surfaces the failure there where the reader can see it in context.
      })
  }

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback
  if (typeof idle === 'function') idle(run)
  else window.setTimeout(run, 200)
}
