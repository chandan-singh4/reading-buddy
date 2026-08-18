/**
 * What a highlight *is*, kept apart from what it *looks like*.
 *
 * A highlight is stored as data and nothing else: which words, which colour key,
 * when. How it is painted — a tidy translucent rectangle, or a marker stroke
 * with a wet tail — is decided at render time by a setting the reader can change
 * whenever they like. Switching style rewrites nothing and cannot lose a mark.
 *
 * That split is the whole point of this module, and it is worth stating why it
 * is not over-engineering. The alternative is baking the look into the row, and
 * then a reader who tries the hand-drawn style has permanently changed every
 * highlight they made under it. A look is a preference. A preference does not
 * belong in a record.
 *
 * ## The colour is a key, and it used to be a hex string
 *
 * Rows written before this module stored the CSS value — `#f2df6b`, not
 * `yellow`. Those rows are real and on the reader's phone, so nothing here
 * rewrites them: `keyOfColour` maps a known value back to its key on the way in,
 * and a value we do not recognise (an old custom colour off the colour wheel)
 * survives as a literal colour with no key. Both styles can paint either.
 */

import type { Anchor } from '../structure/index.ts'
import type { Theme } from './readerSettings.ts'

/** The four standing colours. Ids are stored, so they must never change. */
export type ColourKey = 'yellow' | 'green' | 'blue' | 'purple'

/** A highlight colour the reader can pick without opening a colour wheel. */
export interface HighlightColour {
  /** Stored on the note, so it must never change once shipped. */
  id: ColourKey
  label: string
  /** The swatch, and the ink. */
  value: string
}

/**
 * The four, in the order the panel shows them.
 *
 * Named rather than numbered because the colour carries meaning the reader put
 * there — yellow for important, blue for look this up — and a re-themed palette
 * must not rewrite what they meant.
 */
export const HIGHLIGHT_COLOURS: readonly HighlightColour[] = [
  { id: 'yellow', label: 'Yellow', value: '#f2df6b' },
  { id: 'green', label: 'Green', value: '#a8d5a2' },
  { id: 'blue', label: 'Blue', value: '#a9c7f0' },
  { id: 'purple', label: 'Purple', value: '#d8b6ec' },
]

/** The CSS value for a key. */
export function colourOfKey(key: ColourKey): string {
  return HIGHLIGHT_COLOURS.find((colour) => colour.id === key)?.value ?? HIGHLIGHT_COLOURS[0]!.value
}

/**
 * The key a stored CSS value came from, if it is one of ours.
 *
 * `null` for anything else, which is not an error: a highlight made with the
 * old custom colour wheel is still a highlight, it simply has no key.
 */
export function keyOfColour(value: string | undefined): ColourKey | null {
  if (!value) return null
  const wanted = value.trim().toLowerCase()
  return HIGHLIGHT_COLOURS.find((colour) => colour.value.toLowerCase() === wanted)?.id ?? null
}

/* --- The two styles -------------------------------------------------------- */

/** How highlights are painted. Render-only; never stored on a highlight. */
export type HighlighterStyle = 'clean' | 'handdrawn'

/**
 * What the reader chose. `auto` means "whatever suits the page I am on".
 *
 * `auto` is no longer offered: the reader asked for the two real looks and
 * nothing else. It stays in the type because it is still what a book that was
 * never set reads back as, and because it is on phones already. So it is the
 * unset state now, not a third option — see `HIGHLIGHTER_CHOICES`.
 */
export type HighlighterChoice = 'auto' | HighlighterStyle

/**
 * The two the picker offers.
 *
 * A book nobody has set is `auto`, which resolves through the theme, so the
 * picker shows whichever of these two the reader is actually looking at. The
 * first tap on either one settles it for that book for good.
 */
export const HIGHLIGHTER_CHOICES: readonly { value: HighlighterStyle; label: string }[] = [
  { value: 'handdrawn', label: 'Hand-drawn' },
  { value: 'clean', label: 'Clean' },
]

/**
 * The style a theme asks for when the reader has not said.
 *
 * The three paper themes are already pretending to be paper — grain, foxing, a
 * binding — so a marker stroke belongs there. The flat themes are screens, and
 * on a screen a wobbly ink pool is a costume. This is a default, never an
 * override: see `resolveHighlighter`.
 */
export function styleForTheme(theme: Theme): HighlighterStyle {
  return theme === 'paper' || theme === 'vintage' || theme === 'paperback' || theme === 'sepia'
    ? 'handdrawn'
    : 'clean'
}

/** The style to paint in. An explicit choice always wins. */
export function resolveHighlighter(choice: HighlighterChoice, theme: Theme): HighlighterStyle {
  return choice === 'auto' ? styleForTheme(theme) : choice
}

/* --- Where the choice is kept ---------------------------------------------- */

/*
 * Per book, not per app.
 *
 * The reader asked for this and it is right: a devotional read on paper and a
 * technical book read on a dark screen want different marks, and the choice is
 * made while looking at one of them. It is a preference, so `localStorage`
 * rather than the database — the same place the theme and the font live — and a
 * failure to write it is never worth failing to open a book over.
 */
const KEY = 'reading-buddy:highlighter'

function isChoice(value: unknown): value is HighlighterChoice {
  return value === 'auto' || value === 'clean' || value === 'handdrawn'
}

function readAll(): Record<string, HighlighterChoice> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    const kept: Record<string, HighlighterChoice> = {}
    for (const [book, choice] of Object.entries(parsed as Record<string, unknown>)) {
      if (isChoice(choice)) kept[book] = choice
    }
    return kept
  } catch {
    return {}
  }
}

/** What this book was last set to. `auto` for a book never set. */
export function readHighlighter(bookId: string | undefined): HighlighterChoice {
  if (!bookId) return 'auto'
  return readAll()[bookId] ?? 'auto'
}

export function writeHighlighter(bookId: string | undefined, choice: HighlighterChoice): void {
  if (!bookId) return
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...readAll(), [bookId]: choice }))
  } catch {
    /* The setting simply won't persist. Same as `readerSettings.ts`. */
  }
}

/* --- The seed --------------------------------------------------------------- */

/**
 * A number in [0, 1) that is always the same for the same highlight.
 *
 * The hand-drawn style needs randomness — no two marker strokes are identical —
 * but it must not be *fresh* randomness, or every scroll, every re-render and
 * every page turn would redraw the same mark as a different mark. So the seed is
 * derived from the highlight's own id: stable for its whole life, different from
 * its neighbour's, and nothing extra to store.
 *
 * FNV-1a, because it is four lines and spreads short strings well. Nothing here
 * needs a real hash.
 */
export function seedOf(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash / 0x100000000
}

/* --- The renderer's input ---------------------------------------------------- */

/** One stored highlight, as a renderer receives it. */
export interface PaintedHighlight {
  id: string
  /** The paragraph it belongs to. */
  anchor: Anchor
  /** The words. A highlight with none cannot be found again, so it is dropped. */
  quote: string
  /** One of ours, where the stored colour is one of ours. */
  colourKey: ColourKey | null
  /** The CSS value to paint, whether or not it has a key. */
  colour: string
  /** Stable per highlight. See `seedOf`. */
  seed: number
}

/**
 * The contract both styles satisfy.
 *
 * Deliberately not a plugin system — there are two implementations and there is
 * no third coming. It exists so `Highlights.tsx` can hand the same rows to
 * either one, and so a future style cannot quietly acquire the power to write.
 */
export interface HighlightRenderer {
  highlights: readonly PaintedHighlight[]
  /** The reading column. Nothing is painted until it exists. */
  root: HTMLElement | null
  /** Anything that replaces the words on the page — the section, the font. */
  watch?: unknown
}
