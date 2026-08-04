/**
 * Real cover art for a set of books, as loadable object URLs.
 *
 * Blob → object URL rather than handing the blob to an `<img>` directly,
 * because that is the only form a plain `src` attribute accepts. URLs are
 * revoked when the book list changes or the screen unmounts — an object URL
 * pins its blob in memory until released, and a shelf holding thirty of them
 * indefinitely is exactly the kind of leak a phone notices.
 *
 * A book with no cover asset — the common case today, since most books
 * predate cover extraction or simply have none — is left out of the returned
 * map entirely, and its tile falls back to the generated placeholder.
 */
import { useEffect, useState } from 'react'

import type { BookId } from '../structure/index.ts'
import { COVER_ASSET_PATH, repository } from '../storage/index.ts'

export function useCovers(bookIds: readonly BookId[]): ReadonlyMap<BookId, string> {
  const [urls, setUrls] = useState<ReadonlyMap<BookId, string>>(new Map())
  // A plain array as a dependency would re-run every render — a new array,
  // same ids. Joined ids change only when the actual set of books does.
  const key = bookIds.join(',')

  useEffect(() => {
    let cancelled = false
    const created: string[] = []

    Promise.all(
      bookIds.map(async (bookId) => {
        const assets = await repository.getAssets(bookId, [COVER_ASSET_PATH])
        const blob = assets.get(COVER_ASSET_PATH)
        if (!blob) return undefined
        const url = URL.createObjectURL(blob)
        created.push(url)
        return [bookId, url] as const
      }),
    ).then((entries) => {
      if (cancelled) {
        for (const url of created) URL.revokeObjectURL(url)
        return
      }
      setUrls(new Map(entries.filter((entry) => entry !== undefined)))
    })

    return () => {
      cancelled = true
      for (const url of created) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return urls
}
