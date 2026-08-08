/**
 * Real cover art for a set of books, as loadable object URLs — and, crucially,
 * the *same* object URLs the last screen used.
 *
 * ## The flash this exists to stop
 *
 * Leaving Home for Library and coming back made the shelf visibly refresh: the
 * covers vanished, the generated placeholders appeared in their place, and then
 * the real art faded back in. It reads as the page reloading, and it happened on
 * every single return.
 *
 * Nothing about it was an animation, which is why no amount of tuning the page
 * transition touched it. It was three resets stacked on top of each other, and
 * the third one was here:
 *
 * 1. `AppShell` keys its content on the path, so leaving Home **unmounts** it.
 * 2. Home's own state therefore restarts at `loading`, so the shelf is empty
 *    for as long as one indexed read takes.
 * 3. This hook restarted at an empty map — so even once the books were back,
 *    every tile rendered its placeholder until a *second* round of reads had
 *    fetched each blob and minted a fresh object URL for it.
 *
 * Step 3 is the one that flashes, because a placeholder is not a blank space:
 * it is a coloured rectangle with a letter in it, so the eye sees the cover
 * *replaced* and then replaced back.
 *
 * ## Why a cache rather than keeping the screen mounted
 *
 * Because the screen being unmounted is correct and worth keeping — one shelf
 * in memory at a time, rather than four screens all holding their own blobs.
 * What was wrong was throwing away the cheap part (a handful of strings) along
 * with the expensive part.
 *
 * So the URLs outlive the component now. Two things follow, and both matter:
 *
 * - A remount paints the real covers **synchronously**, on the first frame,
 *   because the map is built from the cache during `useState`'s initialiser
 *   rather than after an effect has run.
 * - The `src` string is *identical* to the one the `<img>` had last time, so
 *   the browser serves it from its own decoded-image cache and never repaints
 *   the element at all. A fresh URL for the same blob would look identical to
 *   us and like a brand-new image to it — which is the flash again, one layer
 *   down.
 *
 * ## What it costs, and the bound on it
 *
 * An object URL pins its blob in memory until it is revoked, so this is a real
 * cost and not a free win — it is the cost the previous version was avoiding by
 * paying a flash on every navigation. It is bounded rather than avoided: the
 * cache holds the most recently used `LIMIT` covers and revokes anything older,
 * so a library of thousands still only ever pins a shelf's worth.
 */
import { useEffect, useState } from 'react'

import type { BookId } from '../structure/index.ts'
import { COVER_ASSET_PATH, repository } from '../storage/index.ts'

/**
 * How many covers stay resident. Comfortably more than a screen holds, so
 * ordinary browsing never evicts anything the reader can still see, and far
 * short of a whole library.
 */
const LIMIT = 120

/**
 * Book → object URL, most recently used last.
 *
 * A plain `Map` is the LRU: it iterates in insertion order, and re-inserting a
 * key moves it to the end. That is the whole eviction policy.
 */
const covers = new Map<BookId, string>()

/**
 * Books already known to have no cover asset.
 *
 * Without this, the common case — and it is the common case, since PDF, docx
 * and plain text have no cover step at all — would re-read the same absent
 * asset from storage on every single visit to the shelf, which is the reads
 * this cache was meant to stop.
 */
const uncovered = new Set<BookId>()

/** Marks a book as most recently used, so eviction reaches for it last. */
function touch(bookId: BookId): string | undefined {
  const url = covers.get(bookId)
  if (url === undefined) return undefined
  covers.delete(bookId)
  covers.set(bookId, url)
  return url
}

function remember(bookId: BookId, url: string): void {
  covers.set(bookId, url)

  while (covers.size > LIMIT) {
    // First key is the least recently used — see the note on `covers`.
    const oldest = covers.keys().next()
    if (oldest.done) break
    const stale = covers.get(oldest.value)
    covers.delete(oldest.value)
    if (stale) URL.revokeObjectURL(stale)
  }
}

/**
 * Drop what is remembered about these books.
 *
 * **Any code that changes a book's cover, or removes the book, must call this.**
 * A cache that is never invalidated is how a re-imported book keeps showing the
 * art it was imported with the first time — and the reader has no way to tell
 * that from the parser simply not having worked.
 *
 * Called with no argument it forgets everything, which is the right response to
 * a change too broad to enumerate.
 */
export function forgetCovers(bookIds?: readonly BookId[]): void {
  const ids = bookIds ?? [...covers.keys(), ...uncovered]

  for (const bookId of ids) {
    const url = covers.get(bookId)
    if (url) URL.revokeObjectURL(url)
    covers.delete(bookId)
    uncovered.delete(bookId)
  }
}

/**
 * Fetch covers nobody has asked for yet, so the screen that will ask is already
 * answered when it opens.
 *
 * ## Why the cache alone wasn't enough
 *
 * Caching removed the flash from every visit *after* the first. The first visit
 * to the library still showed a shelf of placeholders resolving into artwork,
 * because that was the first time anything had asked for those particular
 * covers — Home only shows a curated handful, and the library shows everything.
 * So the reader met the flash exactly once per screen per session, which is
 * still every session.
 *
 * Home already reads the whole book list to work out its shelves, so by the time
 * it has rendered, the ids of every book the library will show are known — a
 * screen or two before the reader can possibly get there. That is the moment to
 * do the reading, and it costs nothing visible because there is nothing on
 * screen waiting for it.
 *
 * Deliberately fire-and-forget: it resolves into the shared cache and tells
 * nobody. A screen that mounts mid-warm finds whatever is ready and fetches the
 * rest itself, which is the behaviour it had anyway.
 */
export function warmCovers(bookIds: readonly BookId[]): void {
  // Never more than the cache can hold: warming past the limit would evict the
  // covers warmed a moment earlier and finish having achieved nothing.
  const wanted = bookIds
    .filter((bookId) => !covers.has(bookId) && !uncovered.has(bookId))
    .slice(0, LIMIT)
  if (wanted.length === 0) return

  const run = () => {
    void Promise.all(
      wanted.map(async (bookId) => {
        // Re-checked: a screen may have fetched this one while we waited for
        // an idle moment, and a second object URL for the same blob is both a
        // leak and — if it reached an `<img>` — a flash of its own.
        if (covers.has(bookId) || uncovered.has(bookId)) return
        try {
          const assets = await repository.getAssets(bookId, [COVER_ASSET_PATH])
          const blob = assets.get(COVER_ASSET_PATH)
          if (!blob) {
            uncovered.add(bookId)
            return
          }
          if (covers.has(bookId)) return
          remember(bookId, URL.createObjectURL(blob))
        } catch {
          // A cover that can't be read is a placeholder, which is a complete
          // and working outcome. Nothing here is worth surfacing.
        }
      }),
    )
  }

  // After the screen that triggered this has finished painting. `requestIdleCallback`
  // where it exists (not in Safari, not in jsdom), a timeout otherwise — the
  // point is only "not in the frame the reader is waiting on".
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback
  if (typeof idle === 'function') idle(run)
  else window.setTimeout(run, 200)
}

/** What the cache can answer for these books right now, without any reading. */
function known(bookIds: readonly BookId[]): ReadonlyMap<BookId, string> {
  const found = new Map<BookId, string>()
  for (const bookId of bookIds) {
    const url = touch(bookId)
    if (url) found.set(bookId, url)
  }
  return found
}

export function useCovers(bookIds: readonly BookId[]): ReadonlyMap<BookId, string> {
  // A plain array as a dependency would re-run every render — a new array, same
  // ids. Joined ids change only when the actual set of books does.
  const key = bookIds.join(',')

  /*
   * Seeded from the cache, not empty. This single line is what removes the
   * flash: the first frame after a remount already has the covers on it, so
   * there is no moment where a placeholder stands in for one.
   *
   * A lazy initialiser rather than a plain value — it must run on mount only,
   * or every later render would rebuild the map and hand `<img>` a new prop.
   */
  const [urls, setUrls] = useState<ReadonlyMap<BookId, string>>(() => known(bookIds))

  useEffect(() => {
    let cancelled = false

    const wanted = bookIds.filter((bookId) => !covers.has(bookId) && !uncovered.has(bookId))

    // Everything already answered. Re-seeding here rather than returning early
    // covers the case where the ids changed but every one of them was cached —
    // moving between two screens that show overlapping shelves.
    if (wanted.length === 0) {
      setUrls(known(bookIds))
      return
    }

    void Promise.all(
      wanted.map(async (bookId) => {
        const assets = await repository.getAssets(bookId, [COVER_ASSET_PATH])
        const blob = assets.get(COVER_ASSET_PATH)
        if (!blob) {
          uncovered.add(bookId)
          return
        }
        remember(bookId, URL.createObjectURL(blob))
      }),
    ).then(() => {
      // Nothing to undo if this screen has gone: the URLs belong to the cache
      // now, not to this component, and the next screen to want them will find
      // them already made. That is the point.
      if (!cancelled) setUrls(known(bookIds))
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return urls
}
