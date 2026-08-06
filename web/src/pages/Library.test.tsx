// @vitest-environment jsdom
//
// The library screen, against a real (fake-indexeddb) database. This is the one
// screen that destroys things, and the books cannot be recovered — the original
// files were never kept — so the selecting and deleting paths carry most of the
// weight here. The ordering and filtering rules themselves are tested without a
// DOM in `library/filter.test.ts`; what is checked here is that the screen wires
// them up and that the destructive controls behave.
import 'fake-indexeddb/auto'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  // The view mode and filters persist too, for the same reason and with the
  // same hazard: a test that switched to grid would decide the next one's view.
  window.localStorage.clear()
  for (const id of IDS) await repository.deleteBook(id as BookId)
  for (const folder of await repository.listFolders()) await repository.deleteFolder(folder.id)
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

/**
 * Press and hold a book, the way a finger does.
 *
 * Fake timers only for the hold itself — held any longer they would also freeze
 * the promises the screen is waiting on, and every `findBy` after this would
 * hang rather than fail.
 */
function pressAndHold(title: string | RegExp) {
  const card = screen.getByRole('link', { name: title }).closest('li')
  expect(card).toBeTruthy()

  vi.useFakeTimers()
  try {
    fireEvent.pointerDown(card!, { clientX: 10, clientY: 10 })
    act(() => {
      vi.advanceTimersByTime(600)
    })
  } finally {
    vi.useRealTimers()
  }
}

/** Enter selection mode, waiting for the shelf to be there first. */
async function startSelecting() {
  openLibrary()
  await screen.findByText('Aion')
  pressAndHold(/Aion/)
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

  it('offers no selection controls until asked', async () => {
    // A shelf permanently covered in ticks is a worse default for the thing
    // people do most, which is open a book.
    openLibrary()
    await screen.findByText('Aion')

    expect(screen.queryByText(/selected/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('shows how far a book has been read, once it has a position', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      42,
    )
    openLibrary()

    expect(await screen.findByText('42% read')).toBeTruthy()
  })

  it('says a finished book is finished rather than showing 100%', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      100,
    )
    openLibrary()

    expect(await screen.findByText(/Finished/)).toBeTruthy()
  })

  it('says nothing about progress for a book with no position yet', async () => {
    openLibrary()
    await screen.findByText('Aion')

    expect(screen.queryByText(/% read/)).toBeNull()
  })
})

describe('selecting several books', () => {
  it('starts selecting on a long press, with that book already ticked', async () => {
    await startSelecting()

    // Holding a book to select it must not also open it — the tap the browser
    // fires afterwards is swallowed.
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('does not start selecting on an ordinary tap', async () => {
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.pointerDown(screen.getByRole('link', { name: /Aion/ }), { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(screen.getByRole('link', { name: /Aion/ }))

    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('does not start selecting when the finger was scrolling', async () => {
    // A finger resting on a book while the list moves under it must not select
    // anything, or flicking through a long shelf ticks books at random.
    openLibrary()
    await screen.findByText('Aion')
    const card = screen.getByRole('link', { name: /Aion/ }).closest('li')!

    vi.useFakeTimers()
    try {
      fireEvent.pointerDown(card, { clientX: 10, clientY: 10 })
      fireEvent.pointerMove(card, { clientX: 10, clientY: 90 })
      act(() => {
        vi.advanceTimersByTime(600)
      })
    } finally {
      vi.useRealTimers()
    }

    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('ticks and unticks another book', async () => {
    await startSelecting()
    const other = screen.getByRole('button', { name: /Answer to Job/ })

    fireEvent.click(other)
    expect(screen.getByText('2 selected')).toBeTruthy()

    fireEvent.click(other)
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('ticks everything, then unticks everything, from one control', async () => {
    await startSelecting()

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('3 selected')).toBeTruthy()

    // Once everything is ticked the only thing left to want is to untick it.
    fireEvent.click(screen.getByRole('button', { name: 'Select none' }))
    expect(screen.getByText('Select books')).toBeTruthy()
  })

  it('ticks a book when its card is tapped, rather than opening it', async () => {
    // Half a screen of tappable title that opens a book, sitting beside ticks
    // that select one, is how a reader loses a shelf by accident.
    await startSelecting()

    expect(screen.queryByRole('link', { name: /Aion/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Aion/ })).toBeTruthy()
  })

  it('hides the add button while selecting', async () => {
    // The "+" adds books and the bar acts on the ones already there; both at
    // once is a screen with two answers to "what happens if I tap".
    await startSelecting()

    expect(screen.queryByRole('button', { name: 'Add to your library' })).toBeNull()
  })

  it('leaves selection alone when cancelled', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel selection' }))

    expect(screen.queryByText(/selected/)).toBeNull()
    expect(await screen.findByText('Aion')).toBeTruthy()
  })
})

describe('removing what is selected', () => {
  it('asks first, naming how many', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    // There is no undo, so the number has to be in front of the reader.
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Remove 3 books for good/)).toBeTruthy()
  })

  it('keeps them when the confirmation is declined', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))

    expect(screen.getByText('Aion')).toBeTruthy()
    expect(await repository.listBooks()).toHaveLength(3)
  })

  it('removes only what was ticked', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: /Red Book/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete 3' }))

    expect(await screen.findByText('No books yet')).toBeTruthy()
    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('offers nothing to act on while nothing is ticked', async () => {
    await startSelecting()
    // The long press ticked one book; ticking everything and then untickng it
    // is the route back to a bar with nothing selected.
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select none' }))

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Change type' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Move to folder' })).toHaveProperty('disabled', true)
  })
})

describe('changing what a book is', () => {
  it('refiles every ticked book as a research paper', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change type' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Research paper' }))

    await waitFor(async () => {
      const books = await repository.listBooks()
      expect(books.every((book) => book.shelf === 'paper')).toBe(true)
    })
    // Recorded as the reader's own decision, so no later guess overrules it.
    const books = await repository.listBooks()
    expect(books.every((book) => book.shelfOverridden)).toBe(true)
  })
})

describe('folders', () => {
  it('makes a folder and moves the ticked books into it', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Move to folder' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ New folder…' }))

    fireEvent.change(await screen.findByLabelText('Folder name'), {
      target: { value: 'Philosophy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(async () => {
      expect(await repository.listFolders()).toHaveLength(1)
    })
    const [folder] = await repository.listFolders()
    const books = await repository.listBooks()
    expect(books.filter((book) => book.folderId === folder!.id)).toHaveLength(1)
  })

  it('turns a filed book loose again', async () => {
    const folder = await repository.createFolder('Philosophy')
    await repository.moveBooksToFolder(['a' as BookId], folder!.id)

    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Move to folder' }))
    fireEvent.click(await screen.findByRole('button', { name: 'No folder' }))

    await waitFor(async () => {
      const book = await repository.getBook('a' as BookId)
      expect(book?.folderId).toBeUndefined()
    })
  })

  it('deleting a folder keeps the books that were in it', async () => {
    // A folder is a label on a shelf, not a box with a bottom.
    const folder = await repository.createFolder('Philosophy')
    await repository.moveBooksToFolder(['a' as BookId, 'bb' as BookId], folder!.id)

    await repository.deleteFolder(folder!.id)

    expect(await repository.listBooks()).toHaveLength(3)
    expect((await repository.getBook('a' as BookId))?.folderId).toBeUndefined()
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

describe('searching the library', () => {
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
    fireEvent.change(screen.getByLabelText('Search your library'), { target: { value: text } })
  }

  it('narrows the library to what matches the title', async () => {
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

  it('searches folder names', async () => {
    const folder = await repository.createFolder('Analytical psychology')
    await repository.moveBooksToFolder(['s0' as BookId], folder!.id)

    await search('analytical')

    expect(screen.getByText('The Red Book')).toBeTruthy()
    expect(screen.queryByText('Filler 3')).toBeNull()
  })

  it('says so when nothing matches, rather than looking like an empty shelf', async () => {
    await search('zzzzz')

    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
    expect(screen.queryByText('No books yet')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show every book' }))
    expect(screen.getByText('The Red Book')).toBeTruthy()
  })

  it('selects only what the search is showing', async () => {
    // The worst bug this screen could have: ticking books the reader cannot
    // see, and then deleting them.
    // 'jung' matches exactly one book, by its author.
    await search('jung')
    pressAndHold(/The Red Book/)
    // One book is showing and it is already ticked, so the control reads
    // "Select none" — untick, then select all, and it must still be just one.
    fireEvent.click(screen.getByRole('button', { name: 'Select none' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))

    expect(screen.getByText('1 selected')).toBeTruthy()
  })
})

describe('the view and filter menu', () => {
  it('remembers the chosen view between visits', async () => {
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'Filter and sort' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Grid' }))
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveProperty('ariaPressed', 'true')

    cleanup()
    openLibrary()
    await screen.findByText('Aion')
    fireEvent.click(screen.getByRole('button', { name: 'Filter and sort' }))

    expect(screen.getByRole('button', { name: 'Grid' })).toHaveProperty('ariaPressed', 'true')
  })

  it('filters to one reading status', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      42,
    )
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'Filter and sort' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Currently reading' }))

    expect(screen.getByText('Aion')).toBeTruthy()
    expect(screen.queryByText('Red Book')).toBeNull()
  })

  it('says what is being hidden, and offers one tap to stop hiding it', async () => {
    // A filter left on from a previous session is otherwise indistinguishable
    // from books having gone missing.
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'Filter and sort' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Unread' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByText('Showing 3 of 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.queryByText(/Showing/)).toBeNull()
  })

  it('sorts by title', async () => {
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'Filter and sort' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Title Z → A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    const titles = screen.getAllByRole('link').map((link) => link.textContent)
    expect(titles[0]).toContain('Red Book')
  })
})
