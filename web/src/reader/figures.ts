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

import { useEffect, useRef, useState } from 'react'

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

  /**
   * Every URL this hook currently owns, by the path it was minted for.
   *
   * ## Why the URLs are held per path and not per request
   *
   * This used to treat the whole list as one request: any change to it revoked
   * everything and fetched everything again. That was survivable while the list
   * was one section, and it stopped being survivable when the reading page
   * started asking for the two neighbouring sections as well — because then the
   * list changes on *every* page turn, even when the picture on screen is the
   * same picture.
   *
   * Two faults came out of that, and both were reported:
   *
   *   - **The picture vanished.** Revoking happens at once; the replacement
   *     arrives an `await` later. In between, `urls` still held the old URLs and
   *     they were already dead, so every figure on screen fell back to its
   *     caption. Turning back to a page with a plate on it showed the word
   *     "Figure" and no plate.
   *   - **The words moved.** A neighbour whose pictures are mid-fetch draws them
   *     at no height and breaks its columns in the wrong places. The reader
   *     landed on that page and then watched the text drop as the real pictures
   *     arrived.
   *
   * Holding them per path fixes both at once, and the second one properly: a
   * picture fetched while its section was a neighbour is *still fetched* when
   * that section becomes the page, so it arrives already laid out. Nothing is
   * fetched twice, and nothing wanted is ever revoked.
   */
  const held = useRef(new Map<string, string>())

  /** Which book's paths `held` holds. Paths are only unique within one. */
  const heldFor = useRef(load)

  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map())

  useEffect(() => {
    const wanted = new Set(key === '' ? [] : key.split('\n'))

    // A different book. Its paths mean different bytes, so none of what is held
    // can be matched against the new list — it is all let go, unconditionally.
    if (heldFor.current !== load) {
      for (const url of held.current.values()) URL.revokeObjectURL(url)
      held.current.clear()
      heldFor.current = load
    }

    // Let go of what has fallen out of reach — a section that is no longer the
    // page or either of its neighbours. This is the promise the whole module is
    // here to keep: a reader going through a picture book must not accumulate it.
    for (const [path, url] of held.current) {
      if (wanted.has(path)) continue
      URL.revokeObjectURL(url)
      held.current.delete(path)
    }

    const missing = [...wanted].filter((path) => !held.current.has(path))
    if (missing.length === 0 || !load) {
      setUrls(new Map(held.current))
      return
    }

    let live = true

    void load(missing)
      .then((blobs) => {
        // Arriving after the reader has moved on: mint nothing, so there is
        // nothing to revoke and nothing left pinned.
        if (!live) return

        for (const [path, blob] of blobs) {
          if (held.current.has(path)) continue
          held.current.set(path, URL.createObjectURL(blob))
        }
        setUrls(new Map(held.current))
      })
      .catch(() => {
        // A picture that won't load is a caption. Never an error on the page.
        // What is already held still stands: one unreadable picture is no
        // reason to take away the ones that did read.
        if (live) setUrls(new Map(held.current))
      })

    return () => {
      live = false
    }
  }, [key, load])

  /*
   * The last word on the promise above. Held URLs outlive any one page now, so
   * the page being left is no longer the moment they are given up — leaving the
   * reader is. Separate from the effect above on purpose: this must run once, on
   * the way out, and never when the list changes.
   */
  const store = held.current
  useEffect(
    () => () => {
      for (const url of store.values()) URL.revokeObjectURL(url)
      store.clear()
    },
    [store],
  )

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
