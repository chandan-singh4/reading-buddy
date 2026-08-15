/**
 * How dark the two blocks of paper are drawn, and the sums behind the gesture
 * that sets it.
 *
 * ## What this is not
 *
 * It is not the brightness of the page. The page has themes for that. This
 * changes one thing only: how strongly the stacked-sheet lines at the two side
 * edges are drawn — the tactile progress indicator described in
 * `PageDecks.tsx`.
 *
 * ## Why it is worth a gesture
 *
 * The decks are ambient information. They work in the corner of the eye, and
 * how loud they should be is a matter of taste, of the theme, and of the light
 * in the room. Too faint and the book has no thickness; too strong and there is
 * a striped border shouting beside the paragraph you are reading. That is a
 * dial, and a dial with no right answer belongs under the reader's thumb rather
 * than in a settings sheet.
 *
 * So the control is the thing it controls. Drag up on the right-hand deck and
 * the lines darken; drag down and they fade. Both decks move together — they
 * are one indicator seen from two sides, and a book with a dark block on the
 * right and a pale one on the left is not a book.
 *
 * ## Why the reachable zone is wider than the deck
 *
 * The deck's channel is `--page-deck`, which is 11 px. That is a fine thing to
 * *see* and an impossible thing to hit. `DECK_ZONE` is the band along the right
 * edge that listens, and it is sized for a thumb, not for the drawing.
 */

/**
 * The range the deck's ink is allowed to take, as a brightness multiplier: 1 is
 * exactly what the theme asks for, below 1 is darker, above 1 is paler.
 *
 * Neither end is allowed to erase the decks. At `DECK_MIN` they are a firm
 * block of lines and at `DECK_MAX` they are a hint of one, but a reader who
 * drags to an end and puts the phone down must not find the book has lost its
 * edges.
 */
export const DECK_MIN = 0.35
export const DECK_MAX = 1.85

/** What the decks are drawn at until the reader says otherwise: the theme's own value. */
export const DECK_DEFAULT = 1

/** The band along the right edge that answers the gesture, in CSS pixels. */
export const DECK_ZONE = 44

/**
 * How far a finger moves before the gesture is the deck one.
 *
 * Larger than the page turn's own eight pixels, deliberately. The zone sits
 * where a thumb rests, and the cost of being wrong is not symmetrical: a page
 * turn that needs a second try is a shrug, decks that darken under a resting
 * thumb are the app misbehaving.
 */
export const DECK_FROM = 14

/**
 * The share of the screen's height that covers the whole range.
 *
 * Less than the full height, so both ends are reachable without starting the
 * stroke at the very edge of the screen.
 */
export const DECK_TRAVEL = 0.55

/** Hold a value inside the range the setting is allowed to take. */
export function clampDeck(value: number): number {
  if (!Number.isFinite(value)) return DECK_DEFAULT
  return Math.min(DECK_MAX, Math.max(DECK_MIN, value))
}

/**
 * The deck's new shade after a drag.
 *
 * `up` is how far the finger has travelled upwards from where the gesture was
 * claimed, in CSS pixels — negative when it has gone down. Up darkens, so up
 * *lowers* the multiplier. `height` is the screen's height, so the same stroke
 * does the same thing on a small phone and on a tablet.
 *
 * Reckoned from `start` and the whole travel rather than accumulated move by
 * move: a finger that goes up, changes its mind and comes back down again ends
 * exactly where it began, which is what a physical control does.
 */
export function deckAfterDrag(start: number, up: number, height: number): number {
  if (height <= 0) return clampDeck(start)
  const span = DECK_MAX - DECK_MIN
  return clampDeck(start - (up / (height * DECK_TRAVEL)) * span)
}

/** Whether a touch at `x` is on the deck's band, given the screen's width. */
export function inDeckZone(x: number, width: number): boolean {
  return width - x <= DECK_ZONE
}
