/**
 * The highlights, painted into the page by the browser.
 *
 * The first version of this drew a coloured box over each line, measured in
 * screen coordinates. That is the wrong model, and it showed: every time the
 * page moved — the overlay shrinking the stage, a font changed, a page turned —
 * the colour had to chase the words, and you could see it arrive. A highlight
 * in a real book is ink on the paper. It does not chase anything.
 *
 * So the browser paints it instead, through the CSS custom highlight API: a
 * `Highlight` holds live ranges, `::highlight(name)` says what colour to paint
 * them, and the text is painted with that colour underneath it for the rest of
 * its life on screen. Reflow, rescale, re-layout — the range is part of the
 * document, so the colour goes where the words go, in the same frame. There is
 * nothing to measure and nothing to keep in step.
 *
 * One rule is registered per colour in use, written into a stylesheet of this
 * module's own, because a reader's custom colour is not something a static
 * stylesheet can know in advance.
 */

import { useCallback, useEffect } from 'react'

import type { Anchor } from '../structure/index.ts'
import { rangeOfQuote } from './selection.ts'

/** One stored highlight: enough to find it and enough to paint it. */
export interface HighlightLike {
  id: string
  anchor: Anchor
  quote?: string
  colour?: string
}

export interface HighlightsProps {
  highlights: readonly HighlightLike[]
  /** The reading column. Nothing is painted until it exists. */
  root: HTMLElement | null
  /**
   * Anything that replaces the words on the page — the section, the font.
   *
   * Not the things that merely *move* them: the browser handles those on its
   * own now. This is only about ranges going stale because the text nodes they
   * point into have been thrown away.
   */
  watch?: unknown
}

/** Whether this browser paints custom highlights. Chrome 105, Safari 17.2. */
export function canPaintHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
}

/** A CSS ident per colour, and the stylesheet that gives each one its rule. */
const NAMES = new Map<string, string>()
let sheet: HTMLStyleElement | null = null

function nameFor(colour: string): string {
  const known = NAMES.get(colour)
  if (known) return known

  const name = `rb-highlight-${NAMES.size}`
  NAMES.set(colour, name)

  if (!sheet) {
    sheet = document.createElement('style')
    sheet.dataset.reason = 'reader highlights'
    document.head.append(sheet)
  }
  // `::highlight` takes background-color and colour and little else, which is
  // all a highlight needs. The ink is left alone deliberately: recolouring the
  // text as well is what makes a highlighted passage harder to read, not
  // easier.
  sheet.append(document.createTextNode(`::highlight(${name}){background-color:${colour};}`))
  return name
}

export function Highlights({ highlights, root, watch }: HighlightsProps) {
  const paint = useCallback(() => {
    if (!root || !canPaintHighlights()) return () => {}

    const ranges = new Map<string, Range[]>()
    for (const highlight of highlights) {
      if (!highlight.quote || !highlight.colour) continue
      const range = rangeOfQuote(highlight.anchor, highlight.quote)
      if (!range || !root.contains(range.commonAncestorContainer)) continue

      const found = ranges.get(highlight.colour)
      if (found) found.push(range)
      else ranges.set(highlight.colour, [range])
    }

    const painted: string[] = []
    for (const [colour, group] of ranges) {
      const name = nameFor(colour)
      CSS.highlights.set(name, new Highlight(...group))
      painted.push(name)
    }

    return () => {
      for (const name of painted) CSS.highlights.delete(name)
    }
  }, [highlights, root])

  useEffect(() => {
    if (!root) return

    let drop = paint()

    /*
     * The one thing a live range cannot survive: the words themselves being
     * replaced.
     *
     * A range holds text nodes, not text. React throws those nodes away and
     * makes new ones whenever the page is re-rendered — a section change, a new
     * font, a re-parse — and a range left holding the old ones points at
     * nothing and paints nothing. Movement is fine, and is why this component
     * exists in this shape; replacement is not, and this is the watch for it.
     *
     * Nothing here is measured, so this waits on a timer rather than on a
     * frame: a re-render's worth of mutations still folds into one pass, and it
     * still runs in a tab that is painting no frames at all.
     */
    let pending = 0
    const soon = () => {
      if (pending) return
      pending = window.setTimeout(() => {
        pending = 0
        drop()
        drop = paint()
      }, 0)
    }

    const changes =
      typeof MutationObserver === 'function' ? new MutationObserver(soon) : null
    changes?.observe(root, { childList: true, subtree: true, characterData: true })

    return () => {
      if (pending) window.clearTimeout(pending)
      changes?.disconnect()
      drop()
    }
  }, [paint, root, watch])

  // Nothing to render. The page carries the colour itself.
  return null
}
