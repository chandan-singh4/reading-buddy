// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../App.tsx'
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

describe('coming back to Home', () => {
  it('still has the books on it, with no reload in between', async () => {
    // The reader's report, as directly as it can be written down: "the covers
    // flash, it looks like the Home page is refreshing". The cause was not the
    // transition — it was Home restarting at `loading` on every return, so for
    // one read's worth of time the shelf genuinely was empty and the word
    // "Loading…" genuinely was where the books had been.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByText('The Wind in the Willows')).toBeDefined()

    swipe(-150)
    expect(await screen.findByText('All books')).toBeDefined()

    swipe(150)

    // Synchronously, on the very first render after coming back — not after a
    // `findBy` has waited for a fetch to answer. That distinction is the whole
    // fix: `findBy` would pass against the old code too, a moment later, which
    // is exactly the moment the reader was seeing.
    expect(screen.getByText('The Wind in the Willows')).toBeDefined()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('keeps showing the books while the background re-read is in flight', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Breath')).toBeDefined()

    swipe(-150)
    await screen.findByText('All books')
    swipe(150)

    // The re-read does still happen — the shelf is allowed to be a moment stale,
    // never permanently so. Nothing may blink while it runs.
    expect(screen.getByText('Breath')).toBeDefined()
    await waitFor(() => {
      expect(screen.getByText('Breath')).toBeDefined()
    })
  })

  it('picks up a book removed while the reader was elsewhere', async () => {
    // The other side of the bargain. A remembered shelf that never refreshed
    // would be a worse bug than the flash it replaced.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Breath')).toBeDefined()

    swipe(-150)
    await screen.findByText('All books')
    await repository.deleteBook(BOOKS[1]!.id)
    swipe(150)

    await waitFor(() => {
      expect(screen.queryByText('Breath')).toBeNull()
    })
    expect(screen.getByText('The Wind in the Willows')).toBeDefined()
  })
})
