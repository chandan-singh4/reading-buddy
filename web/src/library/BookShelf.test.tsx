// @vitest-environment jsdom
//
// The shelf's one piece of state that isn't about the books themselves: whether
// a row can be opened at all. Offline, the library lists every book the reader
// owns but can only open the ones copied before the signal went — see
// `storage/cloud/shelf.ts` for why the listing survives when the books don't.
//
// What matters here is what the finger meets: a row that is visibly not
// available, says why in words, and is not a link to a screen that would fail.
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import type { StoredFolder } from '../storage/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import { BookShelf } from './BookShelf.tsx'

afterEach(cleanup)

const id = (value: string) => value as BookId

const BOOKS: BookMeta[] = [
  {
    id: id('here'),
    title: 'Read before the tunnel',
    source: 'epub',
    type: 'dense-technical',
    importedAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: id('away'),
    title: 'Still in the cloud',
    source: 'epub',
    type: 'dense-technical',
    importedAt: '2026-08-01T10:00:00.000Z',
  },
]

function showShelf(unavailable: ReadonlySet<BookId>) {
  return render(
    <MemoryRouter>
      <BookShelf
        books={BOOKS}
        view="list"
        progress={new Map()}
        folders={new Map<string, StoredFolder>()}
        covers={new Map()}
        selected={null}
        unavailable={unavailable}
        onLongPress={() => {}}
        onToggle={() => {}}
        onOpen={() => {}}
      />
    </MemoryRouter>,
  )
}

describe('a book that needs a signal', () => {
  it('stays on the shelf instead of disappearing from it', () => {
    showShelf(new Set([id('away')]))

    // The whole point of the change: the reader with 33 books and one copy sees
    // 33 books, not a library that appears to have lost 32 of them.
    expect(screen.getByText('Read before the tunnel')).toBeTruthy()
    expect(screen.getByText('Still in the cloud')).toBeTruthy()
  })

  it('is not a link, because there is nothing at the other end', () => {
    showShelf(new Set([id('away')]))

    expect(screen.getByRole('link', { name: /Read before the tunnel/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Still in the cloud/ })).toBeNull()
  })

  it('says why, rather than leaving the reader to read a colour', () => {
    showShelf(new Set([id('away')]))

    const rows = screen.getAllByRole('listitem')
    const away = rows.find((row) => row.textContent?.includes('Still in the cloud'))
    expect(away?.textContent).toContain('Needs a signal')

    const here = rows.find((row) => row.textContent?.includes('Read before the tunnel'))
    expect(here?.textContent).not.toContain('Needs a signal')
  })

  it('marks nothing when everything can be opened, which is almost always', () => {
    showShelf(new Set())

    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByText('Needs a signal')).toBeNull()
  })
})
