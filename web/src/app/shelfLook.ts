/**
 * How each book *sits* on the shelf: how tall it is, how thick, and whether it
 * leans a little.
 *
 * A shelf of identical rectangles reads as a grid of thumbnails no matter how
 * much wood is drawn behind it — real books differ in height and thickness, and
 * one in a handful is never quite upright. So each book gets its own small
 * deviation from the shelf's base size.
 *
 * Deterministic from the book's id, the same way `cover.ts` picks a placeholder
 * swatch: a book must not change height when the shelf re-renders, when it
 * moves between shelves, or when the app reloads. Nothing is stored — the id is
 * the seed, and the same id always produces the same book.
 *
 * The lean is deliberately tiny (at most ~1.4°) and pivots about the book's
 * *bottom* edge. That is what keeps it compatible with the standing rule that a
 * shelf tile must not be rotated: the rule exists because a rotated element
 * used to break the row's alignment, and a rotation about the foot of a
 * bottom-aligned book cannot move the line its feet stand on. It is also a
 * `transform`, so it takes no width with it and no neighbour moves.
 */

/** What one book looks like standing on a plank. */
export interface BookLook {
  /** Multiplier on the shelf's base book height. Roughly 0.88 – 1.08. */
  height: number
  /** Lean in degrees about the bottom edge. Zero for most books. */
  lean: number
  /** How many leaves of page-edge show past the fore edge — 4 to 7. */
  thickness: number
}

/** The heights a book can be, as a fraction of the shelf's base height. */
const HEIGHTS = [1, 0.93, 1.06, 0.97, 0.89, 1.03, 0.95, 1.08]

/**
 * The leans. Mostly zero on purpose: books that *all* tilt look like a
 * cartoon, and the effect only reads as "real" when it is the exception.
 */
const LEANS = [0, 0, 0, -1.1, 0, 0, 1.4, 0, -0.7, 0, 0, 0.9]

/** Page-block depths, in hairlines. */
const THICKNESSES = [5, 4, 6, 5, 7, 4, 6, 5]

/** A stable 32-bit hash of a string — the same one `cover.ts` uses. */
function hashOf(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * The look of one book. `seed` is the book's id.
 *
 * The three traits are read off *different* mixes of the hash so they don't
 * move together — otherwise every tall book would also be the thickest one,
 * which is a pattern the eye picks up immediately.
 */
export function bookLook(seed: string): BookLook {
  const hash = hashOf(seed)
  return {
    height: HEIGHTS[hash % HEIGHTS.length],
    lean: LEANS[(hash >>> 3) % LEANS.length],
    thickness: THICKNESSES[(hash >>> 7) % THICKNESSES.length],
  }
}
