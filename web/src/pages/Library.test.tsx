// @vitest-environment jsdom
//
// The library screen, against a real (fake-indexeddb) database. This is the one
// screen that destroys things, and the books cannot be recovered — the original
// files were never kept — so the selecting and deleting paths carry most of the
// weight here. The ordering and filtering rules themselves are tested without a
// DOM in `library/filter.test.ts`; what is checked here is that the screen wires
// them up and that the destructive controls behave.
import 'fake-indexeddb/auto'

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ScreenActiveProvider } from '../app/screenActive.tsx'
import { FINISHED_FOLDER_ID } from '../library/systemFolders.ts'
import { repository, type ParsedBook } from '../storage/index.ts'
import { chapterPath, formatAnchor, sectionPath, type BookId } from '../structure/index.ts'
import Library from './Library.tsx'

afterEach(cleanup)

/**
 * The filter sheet, as a scope to query inside.
 *
 * Needed since the shelf grew its own row of filter controls: sort, folder,
 * reading status and view are now reachable in two places at once, on purpose
 * (see `library/FilterBar.tsx`), so a bare `getByRole('button', { name: 'Grid' })`
 * is genuinely ambiguous rather than merely brittle.
 */
function sheet(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Filter and sort' })
}

function inSheet() {
  return within(sheet())
}

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

    // Asked for by its exact badge text. "Finished" on its own is no longer
    // unique on this screen: it is a reading status *and* a folder, which is
    // what the reader asked for and is the sheet's own wording twice over.
    expect(await screen.findByText('✓ Finished')).toBeTruthy()
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
    expect(screen.getByRole('button', { name: 'Change folders' })).toHaveProperty('disabled', true)
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
  /** The folders a book is in, by name — the fact every test here is about. */
  async function foldersOnBook(id: string): Promise<string[]> {
    const book = await repository.getBook(id as BookId)
    const all = await repository.listFolders()
    return (book?.folderIds ?? []).map(
      (folderId) => all.find((entry) => entry.id === folderId)?.name ?? folderId,
    )
  }

  it('makes a folder and puts the ticked books into it', async () => {
    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Change folders' }))
    fireEvent.click(await screen.findByRole('button', { name: /New folder/ }))

    fireEvent.change(await screen.findByLabelText('Folder name'), {
      target: { value: 'Philosophy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(async () => {
      expect(await repository.listFolders()).toHaveLength(1)
    })
    const [folder] = await repository.listFolders()
    const books = await repository.listBooks()
    expect(books.filter((book) => (book.folderIds ?? []).includes(folder!.id))).toHaveLength(1)
  })

  it('puts a book in a second folder without taking it out of the first', async () => {
    // The whole reason membership became a list. Filing must add, never move.
    const philosophy = await repository.createFolder('Philosophy')
    const course = await repository.createFolder('For the course')
    await repository.addBooksToFolder(['a' as BookId], philosophy!.id)
    await repository.addBooksToFolder(['a' as BookId], course!.id)

    expect((await foldersOnBook('a')).sort()).toEqual(['For the course', 'Philosophy'])
  })

  it('shows a book in several folders only once on the shelf', async () => {
    // A folder narrows the library; it never multiplies it. Two folders must
    // not mean two copies of one book.
    const philosophy = await repository.createFolder('Philosophy')
    const course = await repository.createFolder('For the course')
    await repository.addBooksToFolder(['s0' as BookId], philosophy!.id)
    await repository.addBooksToFolder(['s0' as BookId], course!.id)

    openLibrary()

    expect(await screen.findAllByRole('link', { name: /Red Book/ })).toHaveLength(1)
  })

  it('takes books out of one folder, leaving the others alone', async () => {
    const philosophy = await repository.createFolder('Philosophy')
    const course = await repository.createFolder('For the course')
    await repository.addBooksToFolder(['a' as BookId], philosophy!.id)
    await repository.addBooksToFolder(['a' as BookId], course!.id)

    await repository.removeBooksFromFolder(['a' as BookId], philosophy!.id)

    expect(await foldersOnBook('a')).toEqual(['For the course'])
  })

  it('turns a filed book loose again', async () => {
    const folder = await repository.createFolder('Philosophy')
    await repository.addBooksToFolder(['a' as BookId], folder!.id)

    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Change folders' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from all folders' }))

    await waitFor(async () => {
      expect(await foldersOnBook('a')).toEqual([])
    })
  })

  it('unfiles a book by tapping the folder it is already in', async () => {
    const folder = await repository.createFolder('Philosophy')
    await repository.addBooksToFolder(['a' as BookId], folder!.id)

    await startSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Change folders' }))
    // Ticked, because every selected book is in it.
    // The row appears as soon as the folder is known; its tick waits on a
    // second read, of which books are in it. Asserting straight away reads the
    // tick before that answer arrives.
    const row = await screen.findByRole('menuitemcheckbox', { name: /Philosophy/ })
    await waitFor(() => expect(row.getAttribute('aria-checked')).toBe('true'))

    fireEvent.click(row)

    await waitFor(async () => {
      expect(await foldersOnBook('a')).toEqual([])
    })
  })

  it('refuses to file a book into Unread or Finished', async () => {
    // Those two are worked out from reading progress. An id written onto a book
    // would be a second answer to a question that already has one.
    await repository.addBooksToFolder(['a' as BookId], FINISHED_FOLDER_ID)

    expect((await repository.getBook('a' as BookId))?.folderIds).toBeUndefined()
  })

  it('deleting a folder keeps the books that were in it', async () => {
    // A folder is a label on a shelf, not a box with a bottom.
    const folder = await repository.createFolder('Philosophy')
    await repository.addBooksToFolder(['a' as BookId, 'bb' as BookId], folder!.id)

    await repository.deleteFolder(folder!.id)

    expect(await repository.listBooks()).toHaveLength(3)
    expect(await foldersOnBook('a')).toEqual([])
  })

  it('deleting one folder leaves a book in the others it was in', async () => {
    const philosophy = await repository.createFolder('Philosophy')
    const course = await repository.createFolder('For the course')
    await repository.addBooksToFolder(['a' as BookId], philosophy!.id)
    await repository.addBooksToFolder(['a' as BookId], course!.id)

    await repository.deleteFolder(philosophy!.id)

    expect(await foldersOnBook('a')).toEqual(['For the course'])
  })
})

/**
 * The controls that used to live behind the filter icon and now sit on the
 * shelf itself. The sheet is still there and still holds everything — these are
 * about the quick path, and about the two reading them from the same place.
 */
describe('the filter controls under the search bar', () => {
  /**
   * Open one of the chips that still has a panel — reading progress, folders,
   * reading status. The other four have two settings each and switch on the tap.
   */
  function openControl(name: string | RegExp) {
    fireEvent.click(screen.getByRole('button', { name, expanded: false }))
  }

  /** Tap one of the chips that switches rather than opening anything. */
  function tap(name: string | RegExp) {
    fireEvent.click(screen.getByRole('button', { name }))
  }

  it('offers sort, folders, reading status and view without opening anything', async () => {
    openLibrary()
    await screen.findByText('Aion')

    // No sheet, no slide, no second tap: they are readable where they sit, and
    // each answers its own question rather than hiding behind one "Sort by".
    expect(screen.getByRole('button', { name: 'Title' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Author' })).toBeTruthy()
    // The sort in force says which way it is pointing; the other two say only
    // their own name.
    expect(screen.getByRole('button', { name: 'Recently added' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reading progress/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Folders/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reading status/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /List/ })).toBeTruthy()
  })

  it('sorts on the first tap, and reverses on the second', async () => {
    // Two options is a switch, not a menu: nothing opens, and the chip's own
    // label is the state.
    openLibrary()
    await screen.findByText('Aion')

    tap('Title')

    // A → Z, because the shelf was not sorted by title before the tap — not
    // whichever direction this chip was left in previously.
    expect(screen.getByRole('button', { name: 'Title A → Z' })).toBeTruthy()
    expect(screen.getAllByRole('link')[0]!.textContent).toContain('Aion')

    tap('Title A → Z')

    expect(screen.getByRole('button', { name: 'Title Z → A' })).toBeTruthy()
    expect(screen.getAllByRole('link')[0]!.textContent).toContain('Red Book')
  })

  it('comes back round to where it started on the third tap', async () => {
    openLibrary()
    await screen.findByText('Aion')

    tap('Title')
    tap('Title A → Z')
    tap('Title Z → A')

    expect(screen.getByRole('button', { name: 'Title A → Z' })).toBeTruthy()
  })

  it('has no filter button left inside the search bar', async () => {
    // It opened the same sheet as the icon two inches below it. One door onto
    // a room the reader is already standing in is one door too many.
    openLibrary()
    await screen.findByText('Aion')

    const search = screen.getByRole('searchbox', { name: 'Search your library' })
    expect(within(search.parentElement!).queryByRole('button')).toBeNull()
  })

  /**
   * Which chips carry the accent.
   *
   * Read off the class rather than a `data-` attribute added for the test: the
   * accent *is* a style, and a test that watched a parallel attribute could
   * pass while the row looked wrong. CSS modules hash the name but keep it
   * legible, so `_controlOn_ab12` still says what it is.
   */
  function litChips(): string[] {
    return screen
      .getAllByRole('button')
      .filter((button) => button.className.includes('controlOn'))
      .map((button) => button.textContent ?? '')
  }

  it('lights exactly one chip, and moves it to whichever was tapped', async () => {
    // The reported fault: tapping Reading progress left the accent sitting on a
    // sort chip, so the screen answered a tap by highlighting a different
    // control. A mark that cannot move says nothing.
    openLibrary()
    await screen.findByText('Aion')

    // Before anything is touched it sits on the sort in force, so the row opens
    // saying what the order is.
    expect(litChips()).toHaveLength(1)
    expect(litChips()[0]).toContain('Recently added')

    openControl(/Reading progress/)
    expect(litChips()).toHaveLength(1)
    expect(litChips()[0]).toContain('Reading progress')

    openControl(/Folders/)
    expect(litChips()).toHaveLength(1)
    expect(litChips()[0]).toContain('Folders')

    openControl(/Reading status/)
    expect(litChips()).toHaveLength(1)
    expect(litChips()[0]).toContain('Reading status')

    // And back to a sort chip, which takes it off the filters.
    tap('Title')
    expect(litChips()).toHaveLength(1)
    expect(litChips()[0]).toContain('Title A → Z')
  })

  it('keeps the accent on a filter chip after its panel is closed', async () => {
    // The reader is still working on it. Closing the panel is not leaving it.
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Reading status/)
    fireEvent.click(await screen.findByRole('button', { name: 'Unread', pressed: false }))
    // The chip now reads "Unread" as well as the option inside it, so it is
    // named by the thing only the chip has: a panel it can close.
    fireEvent.click(screen.getByRole('button', { name: 'Unread', expanded: true }))

    expect(litChips()[0]).toContain('Unread')
  })

  it('closes an open panel when a control with no panel is tapped', async () => {
    // A panel belongs to the chip that opened it. Left standing while the
    // reader works somewhere else it pushes the shelf down with options for a
    // control nobody is on.
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Reading progress/)
    expect(screen.getByRole('button', { name: '0–25%' })).toBeTruthy()

    tap('List')

    expect(screen.queryByRole('button', { name: '0–25%' })).toBeNull()
  })

  it('closes an open panel when a sort chip is tapped', async () => {
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Reading status/)
    expect(screen.getByRole('button', { name: 'Currently reading' })).toBeTruthy()

    tap('Title')

    expect(screen.queryByRole('button', { name: 'Currently reading' })).toBeNull()
  })

  it('closes an open panel when the full sheet is opened over it', async () => {
    // The sheet holds these same options, so a panel left open behind it would
    // be the reader's choices offered twice at once.
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Folders/)
    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))

    expect(screen.queryByRole('button', { name: 'All books' })).toBeNull()
  })

  it('never lights up List/Grid, and tapping it leaves the accent alone', async () => {
    // The one control with no "off": lighting it would put a permanent mark
    // back on the row, which is what made the accent meaningless before.
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Reading progress/)
    tap('List')

    expect(litChips()).toHaveLength(1)
    expect(litChips()[0]).toContain('Reading progress')
    expect(screen.getByRole('button', { name: 'Grid' }).className).not.toContain('controlOn')
  })

  it('still says which sort is in force for a screen reader', async () => {
    // `aria-pressed` tracks the sort, not the accent — "which of these three is
    // the shelf ordered by" is a fact a screen reader needs, and "which one did
    // I last touch" is not.
    openLibrary()
    await screen.findByText('Aion')

    expect(screen.getByRole('button', { name: 'Recently added' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByRole('button', { name: 'Title' }).getAttribute('aria-pressed')).toBe('false')

    tap('Title')

    expect(screen.getByRole('button', { name: 'Title A → Z' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByRole('button', { name: 'Recently' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
    // List/Grid is not a pressed toggle at all — it has no "off" state to be in.
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBeNull()
  })

  it('sorts by author from its own chip', async () => {
    openLibrary()
    await screen.findByText('Aion')

    tap('Author')

    expect(screen.getByRole('button', { name: 'Author A → Z' })).toBeTruthy()
  })

  it('switches Recently between added and opened on the tap', async () => {
    openLibrary()
    await screen.findByText('Aion')

    tap('Recently added')

    expect(screen.getByRole('button', { name: 'Recently opened' })).toBeTruthy()
  })

  it('filters to a band of reading progress', async () => {
    // 10% and 80%: one in the bottom band, one in the top.
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      10,
    )
    await repository.savePosition(
      'bb' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      80,
    )
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Reading progress/)
    fireEvent.click(await screen.findByRole('button', { name: '0–25%' }))

    expect(screen.getByText('Aion')).toBeTruthy()
    expect(screen.queryByText('Answer to Job')).toBeNull()
    // A book never opened has no percentage, and is in no band.
    expect(screen.queryByText('Red Book')).toBeNull()
  })

  it('keeps the reading-progress panel open, so several bands can be ticked', async () => {
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Reading progress/)
    fireEvent.click(await screen.findByRole('button', { name: '0–25%' }))

    expect(screen.getByRole('button', { name: '75–100%' })).toBeTruthy()
  })

  it('filters by reading status from the row', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      42,
    )
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Reading status/)
    fireEvent.click(await screen.findByRole('button', { name: 'Currently reading' }))

    expect(screen.getByText('Aion')).toBeTruthy()
    expect(screen.queryByText('Red Book')).toBeNull()
  })

  it('keeps the status panel open, because several statuses can be on at once', async () => {
    openLibrary()
    await screen.findByText('Aion')

    openControl(/Reading status/)
    fireEvent.click(await screen.findByRole('button', { name: 'Unread' }))

    expect(screen.getByRole('button', { name: 'Currently reading' })).toBeTruthy()
  })

  it('switches view on the tap, with nothing to open', async () => {
    openLibrary()
    await screen.findByText('Aion')

    tap('List')
    expect(screen.getByRole('button', { name: 'Grid' })).toBeTruthy()

    tap('Grid')
    expect(screen.getByRole('button', { name: 'List' })).toBeTruthy()
  })

  it('still opens the full sheet, which is the only place content type lives', async () => {
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))

    expect(inSheet().getByRole('group', { name: 'Content type' })).toBeTruthy()
  })

  it('shows the same setting in the bar and the sheet, because there is one', async () => {
    openLibrary()
    await screen.findByText('Aion')

    tap('List')
    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))

    expect(
      within(inSheet().getByRole('group', { name: 'View' })).getByRole('button', { name: 'Grid' }),
    ).toHaveProperty('ariaPressed', 'true')
  })
})

describe('the Unread and Finished folders', () => {
  /** Choose a folder from the row of controls. */
  async function chooseFolder(name: string) {
    openLibrary()
    await screen.findByText('Aion')
    fireEvent.click(screen.getByRole('button', { name: /Folders/, expanded: false }))
    fireEvent.click(await screen.findByRole('button', { name }))
  }

  it('offers them even though the reader has made no folders', async () => {
    openLibrary()
    await screen.findByText('Aion')
    fireEvent.click(screen.getByRole('button', { name: /Folders/ }))

    expect(await screen.findByRole('button', { name: 'Unread' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finished' })).toBeTruthy()
  })

  it('holds the books that have never been opened', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      100,
    )

    await chooseFolder('Unread')

    expect(screen.queryByText('Aion')).toBeNull()
    expect(screen.getByText('Red Book')).toBeTruthy()
  })

  it('holds a book the moment it is finished, with nothing filed anywhere', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      100,
    )

    await chooseFolder('Finished')

    expect(screen.getByText('Aion')).toBeTruthy()
    expect(screen.queryByText('Red Book')).toBeNull()
    // The point of the whole design: membership was never written down.
    expect((await repository.getBook('a' as BookId))?.folderIds).toBeUndefined()
  })

  it('puts a book back into Unread when its place is cleared', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      100,
    )
    await repository.forgetPosition('a' as BookId)

    await chooseFolder('Unread')

    expect(screen.getByText('Aion')).toBeTruthy()
  })

  it('titles the screen with the folder, exactly as a real one does', async () => {
    await chooseFolder('Finished')

    expect(screen.getByRole('heading', { name: 'Finished' })).toBeTruthy()
  })

  it('opens a book from one of them', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      100,
    )

    await chooseFolder('Finished')

    expect(screen.getByRole('link', { name: /Aion/ }).getAttribute('href')).toBe('/book/a')
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
    await repository.addBooksToFolder(['s0' as BookId], folder!.id)

    await search('analytical')

    // `findBy`, not `getBy`: the folder list arrives on its own read, so the
    // filter can run once before it knows this book is in a folder at all.
    // Under a loaded test run that read lands after the keystroke.
    expect(await screen.findByText('The Red Book')).toBeTruthy()
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

    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Grid' }))
    expect(inSheet().getByRole('button', { name: 'Grid' })).toHaveProperty(
      'ariaPressed',
      'true',
    )

    cleanup()
    openLibrary()
    await screen.findByText('Aion')
    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))

    expect(inSheet().getByRole('button', { name: 'Grid' })).toHaveProperty(
      'ariaPressed',
      'true',
    )
  })

  it('filters to one reading status', async () => {
    await repository.savePosition(
      'a' as BookId,
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
      42,
    )
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Currently reading' }))

    expect(screen.getByText('Aion')).toBeTruthy()
    expect(screen.queryByText('Red Book')).toBeNull()
  })

  it('says what is being hidden, and offers one tap to stop hiding it', async () => {
    // A filter left on from a previous session is otherwise indistinguishable
    // from books having gone missing.
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))
    // Scoped to the group: "Unread" names a reading status *and* a folder, and
    // the sheet offers both.
    fireEvent.click(
      await within(inSheet().getByRole('group', { name: 'Reading status' })).findByRole('button', {
        name: 'Unread',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByText('Showing 3 of 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.queryByText(/Showing/)).toBeNull()
  })

  it('sorts by title', async () => {
    openLibrary()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))
    // Scoped: the row of controls offers this ordering too, on the Title chip.
    fireEvent.click(
      await within(inSheet().getByRole('group', { name: 'Sort by' })).findByRole('button', {
        name: 'Title Z → A',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    const titles = screen.getAllByRole('link').map((link) => link.textContent)
    expect(titles[0]).toContain('Red Book')
  })
})

describe('leaving the shelf and coming back', () => {
  /**
   * The shell keeps every tab mounted, so leaving is not unmounting — this is
   * what the screen sees when the reader goes to Home and comes back.
   */
  function openWithVisits() {
    const view = render(
      <ScreenActiveProvider value={true}>
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      </ScreenActiveProvider>,
    )

    return (active: boolean) =>
      view.rerender(
        <ScreenActiveProvider value={active}>
          <MemoryRouter>
            <Library />
          </MemoryRouter>
        </ScreenActiveProvider>,
      )
  }

  it('is emptied by leaving the screen, so coming back shows the whole shelf', async () => {
    const visit = openWithVisits()
    await screen.findByText('Aion')

    const field = screen.getByRole('searchbox', { name: 'Search your library' })
    fireEvent.change(field, { target: { value: 'red' } })
    expect(screen.queryByText('Aion')).toBeNull()

    // Off to Home, then back.
    act(() => visit(false))
    act(() => visit(true))

    await screen.findByText('Aion')
    expect(screen.getByRole('searchbox', { name: 'Search your library' })).toHaveProperty('value', '')
  })

  it('keeps the filters, which are a saved preference rather than a question', async () => {
    const visit = openWithVisits()
    await screen.findByText('Aion')

    fireEvent.click(screen.getByRole('button', { name: 'All filters' }))
    fireEvent.click(
      await within(inSheet().getByRole('group', { name: 'Sort by' })).findByRole('button', {
        name: 'Title Z → A',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    act(() => visit(false))
    act(() => visit(true))

    await screen.findByText('Aion')
    expect(screen.getAllByRole('link')[0]!.textContent).toContain('Red Book')
  })
})
