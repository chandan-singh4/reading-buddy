/**
 * The highlights: which rows to paint, and in which style.
 *
 * ## Why the browser no longer paints them
 *
 * This used to hand the ranges to the CSS custom highlight API and let the
 * browser paint the colour under the words. On a page that only ever moves, that
 * is the better model — a range is part of the document, so the colour goes
 * where the words go, in the same frame, with nothing to measure.
 *
 * This page does not only move. It *turns*, and a turn lays a **copy** of the
 * page over the real one and flips the copy. A range holds text nodes, and the
 * copy has its own; so the browser went on faithfully painting the colour on the
 * page underneath while the reader was looking at the copy, and the highlight
 * appeared to vanish the instant a finger moved. Registering the copies as well
 * only moved the problem: there are several copies of the page alive at once —
 * the live strip, two understudies, and the turn's sheets — and any scheme that
 * has to keep a registry in step with which one is showing gets it wrong at some
 * moment.
 *
 * Ink that is *elements inside the paragraph* has none of that. Whatever copies
 * the paragraph copies the ink with it, by construction, for every mechanism
 * this reader has or will have. So both styles are drawn by `HandDrawn` now —
 * one with the marker's filters, one as a flat wash — and this component is only
 * the fork between them.
 *
 * ## The old note, still true
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
 *
 * ## Two styles, one set of rows
 *
 * All of the above is the *clean* style, and it is the default. The reader can
 * ask instead for *hand-drawn*, which cannot use this mechanism at all —
 * `::highlight()` takes a colour and refuses filters, masks and blend modes, and
 * a marker stroke is made of those. So this component became the fork: it owns
 * the clean path itself, and hands the same rows to `HandDrawn` for the other.
 *
 * The rows do not change either way. A highlight stores which words and which
 * colour, never how it looks, so switching style is a re-render and never a
 * write. See `highlightStyle.ts`.
 */

import { useMemo } from 'react'

import type { Anchor } from '../structure/index.ts'
import { HandDrawn } from './HandDrawn.tsx'
import {
  colourOfKey,
  keyOfColour,
  seedOf,
  type HighlighterStyle,
  type PaintedHighlight,
} from './highlightStyle.ts'

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
  /** How to paint them. Clean unless the reader asked otherwise. */
  style?: HighlighterStyle
}

/**
 * A stored row as a renderer wants it.
 *
 * The only interesting part is the colour. Rows written before highlights had
 * keys hold a CSS value, so the key is recovered from the value where it is one
 * of ours and left `null` where it is not — an old custom colour off the colour
 * wheel still paints, it simply has no key to compare against.
 */
export function paintable(highlights: readonly HighlightLike[]): PaintedHighlight[] {
  const ready: PaintedHighlight[] = []
  for (const highlight of highlights) {
    if (!highlight.quote || !highlight.colour) continue
    const colourKey = keyOfColour(highlight.colour)
    ready.push({
      id: highlight.id,
      anchor: highlight.anchor,
      quote: highlight.quote,
      colourKey,
      colour: colourKey ? colourOfKey(colourKey) : highlight.colour,
      seed: seedOf(highlight.id),
    })
  }
  return ready
}

/** Whether this browser paints custom highlights. Chrome 105, Safari 17.2. */
export function canPaintHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
}

export function Highlights({ highlights, root, watch, style = 'clean' }: HighlightsProps) {
  const rows = useMemo(() => paintable(highlights), [highlights])
  // One painter for both styles. See `HandDrawn`'s `marker` prop for why the
  // browser's own highlight API had to go.
  return <HandDrawn highlights={rows} root={root} watch={watch} marker={style === 'handdrawn'} />
}

