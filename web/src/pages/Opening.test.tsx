// @vitest-environment jsdom
//
// The cover a book opens on. The fade is the browser's business; the *timing*
// is this component's, and it is where the bugs are — a cover that flashes is
// the fault this was built to remove, and a cover that never leaves is worse
// than the wait it replaced.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real one reads blobs out of IndexedDB. Nothing here is about cover art —
// the placeholder path is the one that matters, since it is what a book with no
// artwork shows and what every book shows for the first few milliseconds.
vi.mock('../app/useCovers.ts', () => ({
  useCovers: () => new Map<string, string>(),
}))

const { Opening } = await import('./Opening.tsx')

import type { BookId, BookMeta } from '../structure/index.ts'

const ID = 'b1' as BookId
const BOOK = { id: ID, title: 'Anna Karenina', author: 'Tolstoy' } as unknown as BookMeta

/** The plate is `aria-hidden`, so it is found by text rather than by role. */
function coverShown(): boolean {
  return screen.queryByText('Anna Karenina') !== null
}

/**
 * Get past the fade.
 *
 * The class is asserted before the clock is advanced, on purpose: a cover that
 * vanished without ever having started to leave would otherwise pass every one
 * of these, and "it went away" is only half of what is being claimed.
 */
function endTheFade() {
  const plate = screen.getByText('Anna Karenina').parentElement
  expect(plate?.parentElement?.className).toMatch(/leaving/)
  act(() => {
    vi.advanceTimersByTime(1500)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  // By hand: without `globals` the auto-cleanup never registers, and each
  // render would stack another cover in the same document — which is how a
  // passing "the cover is gone" assertion could be reading the *previous*
  // test's cover.
  cleanup()
  vi.useRealTimers()
})

describe('the cover a book opens on', () => {
  it('stays up while there is no page underneath', () => {
    render(<Opening id={ID} book={BOOK} ready={false} abandon={false} />)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    // Three seconds in with nothing to show: the cover is the screen. Anything
    // else here is the reader watching an empty page wondering if it took.
    expect(coverShown()).toBe(true)
  })

  it('holds its minimum even when the page is ready at once', () => {
    const { rerender } = render(<Opening id={ID} book={BOOK} ready={true} abandon={false} />)

    act(() => {
      vi.advanceTimersByTime(400)
    })
    // The whole point of the floor: a warm cache would otherwise show this for
    // a frame, which is a flash, which is the bug.
    expect(coverShown()).toBe(true)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender(<Opening id={ID} book={BOOK} ready={true} abandon={false} />)
    endTheFade()
    expect(coverShown()).toBe(false)
  })

  it('leaves the instant the page arrives, if the wait was already long enough', () => {
    const { rerender } = render(<Opening id={ID} book={BOOK} ready={false} abandon={false} />)

    act(() => {
      vi.advanceTimersByTime(900)
    })
    // The clock runs from the open, not from the text arriving. A slow section
    // has already served the hold, and adding another half-second on top would
    // punish exactly the openings that were slowest.
    rerender(<Opening id={ID} book={BOOK} ready={true} abandon={false} />)
    endTheFade()
    expect(coverShown()).toBe(false)
  })

  it('gets out of the way at once when the book will not open', () => {
    render(<Opening id={ID} book={BOOK} ready={false} abandon={true} />)

    // No hold and no fade. The error and the way back are underneath, and
    // half a second of cover in front of them is half a second of the reader
    // being told nothing.
    expect(coverShown()).toBe(false)
  })

  it('gives up rather than trapping the reader behind itself', () => {
    render(<Opening id={ID} book={BOOK} ready={false} abandon={false} />)

    act(() => {
      vi.advanceTimersByTime(11_000)
    })
    endTheFade()
    // It is opaque and it covers the ← Library link, so a book that neither
    // resolves nor fails would be a dead end. It isn't one.
    expect(coverShown()).toBe(false)
  })

  it('draws a cover for a book it knows nothing about yet', () => {
    // A deep link on a cold start: no shelf memory to look the title up in. The
    // cover is still the right screen — blank is a book not yet identified,
    // where "Opening…" was the app talking about itself.
    render(<Opening id={ID} book={undefined} ready={false} abandon={false} />)

    expect(screen.queryByText('Anna Karenina')).toBeNull()
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
