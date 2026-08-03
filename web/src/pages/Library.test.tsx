// @vitest-environment jsdom
//
// The library screen, against a real (fake-indexeddb) database. Written for the
// bulk-delete work: this is the one screen that destroys things, and the books
// cannot be recovered — the original files were never kept.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { repository, type ParsedBook } from '../storage/index.ts'
import { chapterPath, formatAnchor, sectionPath, type BookId } from '../structure/index.ts'
import Library from './Library.tsx'

afterEach(cleanup)

function bookOf(id: string, title: string): ParsedBook {
  const bookId = id as BookId
  return {
    meta: {
      id: bookId,
      title,
      source: 'epub',
      type: 'dense-technical',
      shelf: 'book',
      importedAt: `2026-08-0${id.length}T00:00:00.000Z`,
    },
    manifest: {
      bookId,
      title,
      chapters: [{ chapter: 1, title: 'One', summary: '', words: 300 }],
    },
    chapters: [
      {
        chapter: 1,
        title: 'One',
        path: chapterPath(1),
        sections: [{ section: 1, path: sectionPath(1, 1), words: 300 }],
      },
    ],
    sections: [
      {
        chapter: 1,
        section: 1,
        path: sectionPath(1, 1),
        paragraphs: [
          {
            anchor: formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
            text: 'Some words.',
            kind: 'prose',
          },
        ],
      },
    ],
  }
}

const TITLES = ['Aion', 'Answer to Job', 'Red Book']
const IDS = ['a', 'bb', 'ccc']

beforeEach(async () => {
  // `sessionStorage` outlives a render, which is the point of it — and exactly
  // why one test's remembered row would otherwise decide the next one's.
  window.sessionStorage.clear()
  for (const id of IDS) await repository.deleteBook(id as BookId)
  for (const [index, id] of IDS.entries()) {
    await repository.saveParsedBook(bookOf(id, TITLES[index]))
  }
})

function openLibrary() {
  return render(
    <MemoryRouter>
      <Library />
    </MemoryRouter>,
  )
}

/** Enter selection mode and wait for the shelf to be there first. */
async function startSelecting() {
  openLibrary()
  await screen.findByText('Aion')
  fireEvent.click(screen.getByRole('button', { name: 'Select' }))
}

describe('the shelf', () => {
  it('lists what has been imported', async () => {
    openLibrary()
    expect(await screen.findByText('Aion')).toBeTruthy()
    expect(screen.getByText('Red Book')).toBeTruthy()
  })

  it('opens a book when it is tapped', async () => {
    openLibrary()
    const link = await screen.findByRole('link', { name: /Aion/ })

    expect(link.getAttribute('href')).toBe('/book/a')
  })

  it('offers no checkboxes until asked', async () => {
    // A shelf permanently covered in checkboxes is a worse default for the
    // thing people do most, which is open a book.
    openLibrary()
    await screen.findByText('Aion')

    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows how far a book has been read, once it has a position', async () => {
    await repository.savePosition('a' as BookId, formatAnchor({ chapter: 1, section: 1, paragraph: 1 }), 42)
    openLibrary()

    expect(await screen.findByText('42% read')).toBeTruthy()
  })

  it('says nothing about progress for a book with no position yet', async () => {
    openLibrary()
    await screen.findByText('Aion')

    expect(screen.queryByText(/% read/)).toBeNull()
  })
})

describe('selecting several books', () => {
  it('ticks and unticks one', async () => {
    await startSelecting()
    const tick = screen.getByRole('checkbox', { name: 'Select Aion' })

    fireEvent.click(tick)
    expect(screen.getByText('1 selected')).toBeTruthy()

    fireEvent.click(tick)
    expect(screen.getByText('0 selected')).toBeTruthy()
  })

  it('ticks everything, then unticks everything, from one control', async () => {
    await startSelecting()

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('3 selected')).toBeTruthy()

    // Once everything is ticked the only thing left to want is to untick it.
    fireEvent.click(screen.getByRole('button', { name: 'Select none' }))
    expect(screen.getByText('0 selected')).toBeTruthy()
  })

  it('ticks a book when its title is tapped, rather than opening it', async () => {
    // Half a screen of tappable title that opens a book, sitting beside
    // checkboxes that select one, is how a reader loses a shelf by accident.
    await startSelecting()

    expect(screen.queryByRole('link', { name: /Aion/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Aion/ }))

    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('hides the per-book Remove while selecting', async () => {
    // Two ways to delete on one row, one of them for a different set of books.
    await startSelecting()

    expect(screen.queryByRole('button', { name: 'Remove Aion' })).toBeNull()
  })

  it('leaves selection alone when cancelled', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(await screen.findByText('Aion')).toBeTruthy()
  })
})

describe('removing what is selected', () => {
  it('asks first, naming how many', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    // There is no undo, so the number has to be in front of the reader.
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Remove 3 books for good/)).toBeTruthy()
  })

  it('keeps them when the confirmation is declined', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))

    expect(screen.getByText('Aion')).toBeTruthy()
    expect(await repository.listBooks()).toHaveLength(3)
  })

  it('removes only what was ticked', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Aion' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Red Book' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete 2' }))

    // Waiting on the books that *went* — "Answer to Job" was on screen before
    // the delete too, so awaiting it would wait for nothing and assert against
    // the shelf as it was.
    await waitFor(() => {
      expect(screen.queryByText('Aion')).toBeNull()
    })
    expect(screen.queryByText('Red Book')).toBeNull()
    expect(screen.getByText('Answer to Job')).toBeTruthy()
  })

  it('leaves selection mode once they are gone', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete 3' }))

    expect(await screen.findByText('No books yet')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('offers nothing to remove while nothing is ticked', async () => {
    await startSelecting()

    const bar = screen.getByText('0 selected').parentElement
    expect(bar).toBeTruthy()
    expect(
      within(bar as HTMLElement).getByRole('button', { name: 'Remove' }),
    ).toHaveProperty('disabled', true)
  })
})

describe('coming back to the shelf', () => {
  it('remembers which book was opened, not how far down the page was', async () => {
    // A pixel offset is only meaningful against the page it was measured on.
    // Restoring one while the list was still short kept landing at the bottom
    // of the shelf, or somewhere arbitrary once a book had been removed.
    openLibrary()
    const link = await screen.findByRole('link', { name: /Red Book/ })

    fireEvent.click(link)

    expect(window.sessionStorage.getItem('library-row')).toBe('ccc')
  })

  it('scrolls that book into view when the shelf comes back', async () => {
    window.sessionStorage.setItem('library-row', 'ccc')
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id)
    }

    openLibrary()
    await screen.findByText('Red Book')

    await waitFor(() => {
      expect(scrolled).toContain('shelf-row-ccc')
    })
  })

  it('stays put when the remembered book is no longer there', async () => {
    // Deleted since, most likely. The top of the shelf is a fine place to be;
    // an arbitrary offset is not.
    window.sessionStorage.setItem('library-row', 'gone')
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id)
    }

    openLibrary()
    await screen.findByText('Aion')

    expect(scrolled).toEqual([])
  })
})

describe('searching the shelf', () => {
  // The box only appears once finding a book is actually a job — below that the
  // whole shelf is on screen already.
  const MANY = Array.from({ length: 10 }, (_, index) => ({
    id: `s${index}`,
    title: index === 0 ? 'The Red Book' : `Filler ${index}`,
  }))

  beforeEach(async () => {
    for (const book of MANY) {
      const parsed = bookOf(book.id, book.title)
      if (book.id === 's0') parsed.meta.author = 'Carl Jung'
      await repository.saveParsedBook(parsed)
    }
  })

  afterEach(async () => {
    for (const book of MANY) await repository.deleteBook(book.id as BookId)
  })

  async function search(text: string) {
    openLibrary()
    await screen.findByText('The Red Book')
    fireEvent.change(screen.getByLabelText('Search your shelf'), { target: { value: text } })
  }

  it('offers no search box for a shelf small enough to read', async () => {
    for (const book of MANY) await repository.deleteBook(book.id as BookId)
    openLibrary()
    await screen.findByText('Aion')

    expect(screen.queryByLabelText('Search your shelf')).toBeNull()
  })

  it('narrows the shelf to what matches the title', async () => {
    await search('the red')

    expect(screen.getByText('The Red Book')).toBeTruthy()
    expect(screen.queryByText('Filler 3')).toBeNull()
  })

  it('matches the author too', async () => {
    await search('jung')

    expect(screen.getByText('The Red Book')).toBeTruthy()
    expect(screen.queryByText('Filler 3')).toBeNull()
  })

  it('matches each word separately, in either field', async () => {
    // "jung red" is how someone actually looks for a book they half remember.
    await search('jung red')

    expect(screen.getByText('The Red Book')).toBeTruthy()
  })

  it('says so when nothing matches, rather than looking like an empty shelf', async () => {
    await search('zzzzz')

    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
    expect(screen.queryByText('No books yet')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clear the search' }))
    expect(screen.getByText('The Red Book')).toBeTruthy()
  })

  it('selects only what the search is showing', async () => {
    // The worst bug this screen could have: ticking books the reader cannot
    // see, and then deleting them.
    // 'jung' matches exactly one book, by its author.
    await search('jung')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))

    expect(screen.getByText('1 selected')).toBeTruthy()
  })
})
