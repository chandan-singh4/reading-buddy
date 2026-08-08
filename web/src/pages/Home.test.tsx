// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../App.tsx'
import { forgetLibraryMemory, readLibraryMemory } from '../app/libraryMemory.ts'
import { forgetShelfMemory } from '../app/shelfMemory.ts'
import { forgetTabHistory } from '../app/tabHistory.ts'
import { forgetCovers } from '../app/useCovers.ts'
import { repository } from '../storage/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'

function bookOf(id: string, title: string, author: string): BookMeta {
  return {
    id: id as BookId,
    title,
    author,
    source: 'epub',
    type: 'dense-technical',
    shelf: 'book',
    importedAt: `2026-08-0${id.length}T00:00:00.000Z`,
  }
}

const BOOKS: BookMeta[] = [
  bookOf('home-a', 'The Wind in the Willows', 'Kenneth Grahame'),
  bookOf('home-b', 'Breath', 'James Nestor'),
]

beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

beforeEach(async () => {
  // The caches are module-level by design — they have to outlive a component.
  // That makes clearing them between cases the test's job, or one case's shelf
  // would satisfy the next case's assertions without the code doing anything.
  forgetShelfMemory()
  forgetLibraryMemory()
  forgetCovers()
  // The history memory is module-level for the same reason and with the same
  // hazard — left over, it reads a fresh render as a Back press and retraces a
  // move the previous test made.
  forgetTabHistory()
  for (const book of BOOKS) await repository.saveBook(book)
})

afterEach(async () => {
  cleanup()
  for (const book of BOOKS) await repository.deleteBook(book.id)
})

function swipe(dx: number) {
  const at = (fraction: number) => ({
    pointerId: 1,
    pointerType: 'touch' as const,
    clientX: 200 + dx * fraction,
    clientY: 300,
  })
  fireEvent.pointerDown(document, at(0))
  fireEvent.pointerMove(document, at(0.5))
  fireEvent.pointerMove(document, at(1))
  fireEvent.pointerUp(document, at(1))
}

/**
 * Queries scoped to the screen actually on show.
 *
 * Every screen the reader has visited stays mounted — that is the fix these
 * tests exist for, and it means a book's title is in the document twice once
 * both Home and the library have been opened. `screen.getByText` would find
 * both, so asking "is it on screen" now has to mean the visible one.
 */
function shown() {
  const active = document.querySelector<HTMLElement>('[data-active="true"]')
  if (!active) throw new Error('no screen is active')
  return within(active)
}

/** Waits for that screen to be the one on show, not merely present in the DOM. */
async function arrivedAt(text: string) {
  await waitFor(() => {
    expect(shown().getByText(text)).toBeDefined()
  })
}

describe('coming back to Home', () => {
  it('still has the books on it, with no reload in between', async () => {
    // The reader's report, as directly as it can be written down: "the covers
    // flash, it looks like the Home page is refreshing". One cause of several:
    // Home restarting at `loading` on every return, so for one read's worth of
    // time the shelf genuinely was empty and the word "Loading…" genuinely was
    // where the books had been.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByText('The Wind in the Willows')).toBeDefined()

    swipe(-150)
    await arrivedAt('All books')

    swipe(150)

    // Synchronously, on the very first render after coming back — not after a
    // `findBy` has waited for a fetch to answer. That distinction is the whole
    // fix: `findBy` would pass against the old code too, a moment later, which
    // is exactly the moment the reader was seeing.
    expect(shown().getByText('The Wind in the Willows')).toBeDefined()
    expect(shown().queryByText('Loading…')).toBeNull()
  })

  it('keeps showing the books while the background re-read is in flight', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Breath')).toBeDefined()

    swipe(-150)
    await arrivedAt('All books')
    swipe(150)

    // The re-read does still happen — the shelf is allowed to be a moment stale,
    // never permanently so. Nothing may blink while it runs.
    expect(shown().getByText('Breath')).toBeDefined()
    await waitFor(() => {
      expect(shown().getByText('Breath')).toBeDefined()
    })
  })

  it('opens the library with its books already on it, first visit of the session', async () => {
    // The reader's report: "the first time I go from home to all books I see
    // that refresh flash, and then back to home and again to all books and I
    // don't see it." The first visit was the one that still flashed, because
    // the library began every mount at "Loading…" and only a warm database was
    // hiding it on later visits.
    //
    // Home warms the library's data in idle time, so by the time a swipe can
    // reach it the answer is already waiting.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Breath')).toBeDefined()

    // The warm is deliberately deferred to an idle moment — this is that moment
    // arriving, not the test reaching past the code to make it pass.
    await waitFor(() => {
      expect(readLibraryMemory()).not.toBeNull()
    })

    swipe(-150)

    // Synchronously, on the library's first frame. `findBy` would pass against
    // the old code a moment later, which is exactly the moment being complained
    // about.
    expect(shown().getByText('All books')).toBeDefined()
    expect(shown().getByText('The Wind in the Willows')).toBeDefined()
    expect(shown().queryByText('Loading…')).toBeNull()
  })

  it('comes back to the very same DOM, not a rebuilt copy of it', async () => {
    /*
     * The root cause, asserted directly — and the one thing three rounds of
     * caching could not reach.
     *
     * The shelf used to be keyed on the path, so every tab change destroyed the
     * screen and built a new one. The caches made the *data* instant, but every
     * `<img>` was still a brand-new element the browser had to decode again
     * before it could paint, and that decode is asynchronous: a frame of empty
     * boxes where the covers were, on every single return. Which is the report,
     * every time — "the covers flash, it looks like the page is refreshing".
     *
     * Element identity is the whole test. If this node is the same object it was
     * before the round trip, nothing was torn down, nothing is re-decoded, and
     * there is nothing left that could flash.
     */
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    const tile = await screen.findByText('The Wind in the Willows')

    swipe(-150)
    await arrivedAt('All books')
    swipe(150)

    expect(shown().getByText('The Wind in the Willows')).toBe(tile)
  })

  it('leaves the library’s floating “+” behind when the reader leaves the library', async () => {
    // Kept-alive screens hide their own DOM, but a portal is a child of <body>
    // and knows nothing about the wrapper it was written inside. Without the
    // check in `Portal`, the library's "+" would follow the reader onto Home.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await screen.findByText('The Wind in the Willows')

    swipe(-150)
    expect(await screen.findByLabelText('Add to your library')).toBeDefined()

    swipe(150)
    await waitFor(() => {
      expect(screen.queryByLabelText('Add to your library')).toBeNull()
    })
  })

  it('picks up a book removed while the reader was elsewhere', async () => {
    // The other side of the bargain, and the one keeping screens alive puts at
    // risk: a shelf that never refreshes would be a worse bug than the flash it
    // replaced. Mounting is no longer the same event as arriving, so arriving is
    // what the re-read hangs off now — see `app/screenActive.tsx`.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Breath')).toBeDefined()

    swipe(-150)
    await arrivedAt('All books')
    await repository.deleteBook(BOOKS[1]!.id)
    swipe(150)

    await waitFor(() => {
      expect(shown().queryByText('Breath')).toBeNull()
    })
    expect(shown().getByText('The Wind in the Willows')).toBeDefined()
  })
})
