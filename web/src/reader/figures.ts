/**
 * Turning a figure's stored picture into something an `<img>` can show.
 *
 * An epub's figure points at a path inside the archive
 * (`OEBPS/images/fig1.png`). That is not an address the browser can fetch —
 * the archive is long gone by reading time — so the bytes were pulled out at
 * import and stored (WP-39), and this is where they are turned back into a
 * `blob:` URL for the page currently on screen.
 *
 * Two rules, and they are the whole module:
 *
 *   - **Only what this section shows.** A book has hundreds of plates and a
 *     section has one or two. Fetching per section keeps the largest data in
 *     the app off the one screen that has to stay smooth.
 *   - **Every URL made is revoked.** `createObjectURL` pins the blob in memory
 *     until told otherwise; a reader turning through a picture book would leak
 *     the entire book that way.
 *
 * Storage-free by design, like the rest of `reader/`: the caller passes the
 * lookup in. That also makes it testable without a database.
 */

import { useEffect, useState } from 'react'

import type { Paragraph } from '../structure/index.ts'

/** What the reading page hands over: paths in, bytes out. */
export type LoadAssets = (paths: readonly string[]) => Promise<Map<string, Blob>>

/**
 * Whether a figure's `src` is already an address the browser understands.
 *
 * docx figures arrive as `data:` URIs and markdown ones as `http(s)` URLs —
 * both are usable as written, and looking them up in storage would find
 * nothing and blank a picture that works.
 */
export function isDirectSrc(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src)
}

/** The stored paths this section's figures need, each asked for once. */
export function imagePathsOf(paragraphs: readonly Paragraph[]): string[] {
  const paths = new Set<string>()
  for (const paragraph of paragraphs) {
    const src = paragraph.image?.src
    if (src && !isDirectSrc(src)) paths.add(src)
  }
  return [...paths]
}

/**
 * Stored path → a `blob:` URL good for as long as this section is on screen.
 *
 * Figures whose picture isn't in storage — every book imported before WP-39,
 * and any image the parser couldn't read — are simply absent from the map, and
 * `blocks.tsx` falls back to the caption alone.
 */
export function useFigureImages(
  paragraphs: readonly Paragraph[],
  load: LoadAssets | undefined,
): ReadonlyMap<string, string> {
  const paths = imagePathsOf(paragraphs)
  // The paths themselves, not the array, decide whether this is the same
  // request — `paragraphs` is a fresh array on every render, and keying the
  // effect on it would re-fetch and re-mint URLs on each one.
  const key = paths.join('\n')

  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map())

  useEffect(() => {
    const wanted = key === '' ? [] : key.split('\n')
    if (wanted.length === 0 || !load) {
      setUrls(new Map())
      return
    }

    let live = true
    const made: string[] = []

    void load(wanted)
      .then((blobs) => {
        // Arriving after the reader has turned the page: mint nothing, so
        // there is nothing to revoke and nothing left pinned.
        if (!live) return

        const next = new Map<string, string>()
        for (const [path, blob] of blobs) {
          const url = URL.createObjectURL(blob)
          made.push(url)
          next.set(path, url)
        }
        setUrls(next)
      })
      .catch(() => {
        // A picture that won't load is a caption. Never an error on the page.
        if (live) setUrls(new Map())
      })

    return () => {
      live = false
      for (const url of made) URL.revokeObjectURL(url)
    }
  }, [key, load])

  return urls
}

/** A no-op lookup, for screens and tests with no storage behind them. */
export const NO_IMAGES: ReadonlyMap<string, string> = new Map()

/**
 * The `src` to render for a figure: itself when it is already an address,
 * otherwise whatever the section's pictures were resolved to.
 */
export function srcOf(src: string, images: ReadonlyMap<string, string>): string | undefined {
  if (isDirectSrc(src)) return src
  return images.get(src)
}
