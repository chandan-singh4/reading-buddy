// @vitest-environment jsdom
//
// The reader end to end: a real book written to a real (fake-indexeddb)
// database, opened through the route, read, and paged through. fake-indexeddb
// must load first — Reader goes through the app-wide repository.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { repository, type ParsedBook } from '../storage/index.ts'
import {
  chapterPath,
  formatAnchor,
  sectionPath,
  type BookId,
  type Section,
} from '../structure/index.ts'
import Reader from './Reader.tsx'

afterEach(cleanup)

beforeAll(() => {
  // jsdom has no layout, so neither of these exists. Every browser has both.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Element.prototype.scrollIntoView = vi.fn()
})

const BOOK_ID = 'book-1' as BookId

/** One section whose paragraphs are numbered, so each is identifiable on screen. */
function sectionOf(chapter: number, section: number, texts: string[]): Section {
  return {
    chapter,
    section,
    path: sectionPath(chapter, section),
    title: `Section ${chapter}.${section}`,
    paragraphs: texts.map((text, index) => ({
      anchor: formatAnchor({ chapter, section, paragraph: index + 1 }),
      text,
      kind: 'prose' as const,
    })),
  }
}

/**
 * Two chapters, the first with two sections and the second with one — enough
 * to cross a chapter boundary in both directions, which is the case that
 * navigation actually has to think about.
 */
function bookOf(): ParsedBook {
  const sections = [
    sectionOf(1, 1, ['The opening words.', 'A second thought.']),
    sectionOf(1, 2, ['Later in the first chapter.']),
    sectionOf(2, 1, ['The second chapter begins.']),
  ]

  return {
    meta: {
      id: BOOK_ID,
      title: 'A Test Book',
      author: 'A. Writer',
      source: 'epub',
      type: 'dense-technical',
      shelf: 'book',
      importedAt: '2026-08-02T00:00:00.000Z',
    },
    manifest: {
      bookId: BOOK_ID,
      title: 'A Test Book',
      // Word counts are round multiples of WORDS_PER_PAGE (300) so the page
      // arithmetic is checkable by hand: three sections, three pages, and each
      // section starts exactly on a page boundary.
      chapters: [
        { chapter: 1, title: 'The Beginning', summary: '', words: 600 },
        { chapter: 2, title: 'The Middle', summary: '', words: 300 },
      ],
    },
    chapters: [
      {
        chapter: 1,
        title: 'The Beginning',
        path: chapterPath(1),
        sections: [
          { section: 1, path: sectionPath(1, 1), words: 300 },
          { section: 2, path: sectionPath(1, 2), words: 300 },
        ],
      },
      {
        chapter: 2,
        title: 'The Middle',
        path: chapterPath(2),
        sections: [{ section: 1, path: sectionPath(2, 1), words: 300 }],
      },
    ],
    sections,
  }
}

function openReader(id: string = BOOK_ID) {
  return render(
    <MemoryRouter initialEntries={[`/book/${id}`]}>
      <Routes>
        <Route path="/book/:bookId" element={<Reader />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  // Focus Mode is remembered between sessions, so it leaks between tests too.
  window.localStorage.clear()
  await repository.deleteBook(BOOK_ID)
  await repository.saveParsedBook(bookOf())
})

/**
 * The hamburger that opens the Contents / Bookmarks / Notes sheet. It shows an
 * icon, so its accessible name is the label, not its text.
 */
const SHEET_BUTTON = 'Contents, bookmarks and notes'

/** Whether the overlay is on screen. It stays mounted, so presence isn't the test. */
function chromeShown(container: HTMLElement): boolean {
  return container.querySelector('[data-shown]')?.getAttribute('data-shown') === 'true'
}

describe('opening a book', () => {
  it('shows the first section', async () => {
    openReader()
    expect(await screen.findByText('The opening words.')).toBeTruthy()
    expect(screen.getByText('A second thought.')).toBeTruthy()
  })

  it('names the book and the chapter you are in', async () => {
    openReader()
    expect(await screen.findByText(/A Test Book · The Beginning/)).toBeTruthy()
  })

  it('gives every paragraph its anchor as an element id', async () => {
    const { container } = openReader()
    await screen.findByText('The opening words.')

    // The contract WP-15 and WP-17 both rely on.
    expect(container.querySelector('#ch01-s01-p001')?.textContent).toBe('The opening words.')
    expect(container.querySelector('#ch01-s01-p002')?.textContent).toBe('A second thought.')
  })

  it('says so plainly when the book is not there', async () => {
    openReader('no-such-book')
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

describe('moving through the book', () => {
  it('goes to the next section', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Later in the first chapter.')).toBeTruthy()
    expect(screen.queryByText('The opening words.')).toBeNull()
  })

  it('crosses into the next chapter and updates the line of context', async () => {
    openReader()
    await screen.findByText('The opening words.')

    const next = screen.getByRole('button', { name: 'Next' })
    fireEvent.click(next)
    await screen.findByText('Later in the first chapter.')
    fireEvent.click(next)

    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
    expect(screen.getByText(/A Test Book · The Middle/)).toBeTruthy()
  })

  it('goes back into the previous chapter, landing on its last section', async () => {
    openReader()
    await screen.findByText('The opening words.')

    const next = screen.getByRole('button', { name: 'Next' })
    fireEvent.click(next)
    await screen.findByText('Later in the first chapter.')
    fireEvent.click(next)
    await screen.findByText('The second chapter begins.')

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))

    // Chapter 1 section *2*, not section 1 — going back must land where the
    // previous chapter ended, not where it started.
    expect(await screen.findByText('Later in the first chapter.')).toBeTruthy()
  })

  it('offers no way back from the first section', async () => {
    openReader()
    await screen.findByText('The opening words.')

    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false)
  })

  it('offers no way on from the last section', async () => {
    openReader()
    await screen.findByText('The opening words.')

    const next = screen.getByRole('button', { name: 'Next' })
    fireEvent.click(next)
    await screen.findByText('Later in the first chapter.')
    fireEvent.click(next)
    await screen.findByText('The second chapter begins.')

    // Disabled rather than hidden: the end of a book should feel like an end,
    // not like a control that disappeared.
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true)
  })
})

describe('the overlay', () => {
  it('is showing when Focus Mode is off', async () => {
    const { container } = openReader()
    await screen.findByText('The opening words.')

    expect(chromeShown(container)).toBe(true)
    expect(screen.getByRole('button', { name: SHEET_BUTTON })).toBeTruthy()
  })

  it('hides and returns when the text is tapped', async () => {
    const { container } = openReader()
    const text = await screen.findByText('The opening words.')

    fireEvent.click(text)
    expect(chromeShown(container)).toBe(false)

    // Hidden, never removed — that distinction is the whole of the Focus Mode
    // decision, and a tap has to bring everything straight back.
    fireEvent.click(text)
    expect(chromeShown(container)).toBe(true)
  })

  it('stays out of reach while hidden', async () => {
    const { container } = openReader()
    fireEvent.click(await screen.findByText('The opening words.'))

    // `inert` so a hidden control can't be tabbed to or read out by a screen
    // reader. Invisible but focusable is worse than either.
    expect(container.querySelector('[data-shown]')?.hasAttribute('inert')).toBe(true)
  })

  it('says where you are as a page, counted in words', async () => {
    openReader()
    await screen.findByText('The opening words.')

    // 900 words at 300 to a page. Standing at the very start is page 1 of 3,
    // and 0% — not 1%, and not "page 0".
    expect(await screen.findByText('Page 1 of 3')).toBeTruthy()
    expect(screen.getByText('0%')).toBeTruthy()
  })
})

describe('the bottom bar', () => {
  /** The status line is itself the control that cycles the bar. */
  function statusButton(): HTMLElement {
    return screen.getByRole('button', { name: /Page \d+ of \d+|page[s]? left|Show where you are/ })
  }

  it('cycles page → pages left in chapter → nothing, and back', async () => {
    openReader()
    await screen.findByText('The opening words.')
    await screen.findByText('Page 1 of 3')

    fireEvent.click(statusButton())
    // Chapter 1 is two sections of 300 words, and we're at the start of it.
    expect(screen.getByText('2 pages left in this chapter')).toBeTruthy()

    fireEvent.click(statusButton())
    expect(screen.queryByText(/Page 1 of 3|pages left/)).toBeNull()

    // Three taps returns you to where you started — the cycle has to close, or
    // the bare state would be a trap.
    fireEvent.click(statusButton())
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
  })

  it('takes the percentage away with the bare state, and brings it back', async () => {
    openReader()
    await screen.findByText('The opening words.')
    await screen.findByText('Page 1 of 3')

    expect(screen.getByText('0%')).toBeTruthy()

    fireEvent.click(statusButton())
    expect(screen.getByText('0%')).toBeTruthy()

    fireEvent.click(statusButton())
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('says "1 page" rather than "1 pages"', async () => {
    openReader()
    await screen.findByText('The opening words.')

    // Chapter 2 is a single 300-word section, so exactly one page is left.
    fireEvent.change(screen.getByRole('slider', { name: 'Move through the book' }), {
      target: { value: '3' },
    })
    await screen.findByText('The second chapter begins.')

    fireEvent.click(statusButton())
    expect(screen.getByText('1 page left in this chapter')).toBeTruthy()
  })
})

describe('the navigation sheet', () => {
  it('lists the chapters and jumps to one', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: SHEET_BUTTON }))
    fireEvent.click(screen.getByRole('button', { name: /The Middle/ }))

    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
  })

  it('closes itself once you have jumped', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: SHEET_BUTTON }))
    fireEvent.click(screen.getByRole('button', { name: /The Middle/ }))
    await screen.findByText('The second chapter begins.')

    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('lands on the start of a chapter, not wherever you were in it', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Later in the first chapter.')

    fireEvent.click(screen.getByRole('button', { name: SHEET_BUTTON }))
    fireEvent.click(screen.getByRole('button', { name: /The Beginning/ }))

    expect(await screen.findByText('The opening words.')).toBeTruthy()
  })

  it('offers Bookmarks and Notes as tabs, saying they are not here yet', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: SHEET_BUTTON }))

    fireEvent.click(screen.getByRole('tab', { name: 'Bookmarks' }))
    expect(screen.getByText(/Bookmarks arrive/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    expect(screen.getByText(/Notes and highlights arrive/)).toBeTruthy()

    // The chapter list must still be there to come back to.
    fireEvent.click(screen.getByRole('tab', { name: 'Contents' }))
    expect(screen.getByRole('button', { name: /The Middle/ })).toBeTruthy()
  })
})

describe('the slider', () => {
  it('moves one page at a time', async () => {
    openReader()
    await screen.findByText('The opening words.')

    const slider = screen.getByRole('slider', { name: 'Move through the book' })
    expect(slider).toHaveProperty('max', '3')

    fireEvent.change(slider, { target: { value: '2' } })
    expect(await screen.findByText('Later in the first chapter.')).toBeTruthy()

    fireEvent.change(slider, { target: { value: '3' } })
    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
  })
})

describe('Focus Mode', () => {
  it('starts with the overlay hidden once turned on', async () => {
    const { unmount } = openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: 'Focus off' }))
    unmount()

    // Reopening is the real test: the setting outlives the screen.
    const reopened = openReader()
    await screen.findByText('The opening words.')
    expect(chromeShown(reopened.container)).toBe(false)
  })

  it('still lets a tap bring everything back', async () => {
    openReader()
    await screen.findByText('The opening words.')
    fireEvent.click(screen.getByRole('button', { name: 'Focus off' }))
    cleanup()

    const { container } = openReader()
    const text = await screen.findByText('The opening words.')
    fireEvent.click(text)

    expect(chromeShown(container)).toBe(true)
    expect(screen.getByRole('button', { name: 'Focus on' })).toBeTruthy()
  })

  it('leaves Previous and Next alone — reading never loses its controls', async () => {
    openReader()
    await screen.findByText('The opening words.')
    fireEvent.click(screen.getByRole('button', { name: 'Focus off' }))
    cleanup()

    openReader()
    await screen.findByText('The opening words.')

    // Focus Mode quiets the interface around the book; it does not take away
    // the two controls the book is actually read with.
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
  })
})

describe('reopening where you left off', () => {
  const IN_CHAPTER_ONE_SECTION_TWO = formatAnchor({ chapter: 1, section: 2, paragraph: 1 })

  it('opens at the saved section rather than at the beginning', async () => {
    await repository.savePosition(BOOK_ID, IN_CHAPTER_ONE_SECTION_TWO)
    openReader()

    expect(await screen.findByText('Later in the first chapter.')).toBeTruthy()
    // And never showed the first page on the way — the whole point of waiting
    // for the lookup before fetching a section.
    expect(screen.queryByText('The opening words.')).toBeNull()
  })

  it('reports the restored place, not the start of the book', async () => {
    // Asserts the outcome rather than the mechanism. Landing used to call
    // `scrollIntoView`; with pages it sets the column instead, and a test tied
    // to either one only proves that the code is the code. The page number is
    // what the reader actually sees, and it is derived from the restored
    // position — section 1.2 is page 2 of this fixture's three.
    await repository.savePosition(BOOK_ID, IN_CHAPTER_ONE_SECTION_TWO)
    openReader()
    await screen.findByText('Later in the first chapter.')

    expect(await screen.findByText('Page 2 of 3')).toBeTruthy()
  })

  it('starts at the beginning when nothing was saved', async () => {
    openReader()
    expect(await screen.findByText('The opening words.')).toBeTruthy()
  })

  it('starts at the beginning when the book no longer has that chapter', async () => {
    // A stale place from before the book was re-imported by a better parser.
    await repository.savePosition(BOOK_ID, formatAnchor({ chapter: 9, section: 1, paragraph: 1 }))
    openReader()

    expect(await screen.findByText('The opening words.')).toBeTruthy()
  })

  it('says nothing about a place saved moments ago', async () => {
    // Whether a place counts as old is `isFresh`'s decision and is tested
    // there; what matters here is that the common case — closing a book and
    // reopening it straight away — is silent.
    await repository.savePosition(BOOK_ID, IN_CHAPTER_ONE_SECTION_TWO)
    openReader()

    await screen.findByText('Later in the first chapter.')
    expect(screen.queryByText(/Picked up where you left off/)).toBeNull()
  })

  it('writes the place down as you read', async () => {
    openReader()
    await screen.findByText('The opening words.')

    await vi.waitFor(
      async () => {
        const saved = await repository.getPosition(BOOK_ID)
        expect(saved?.anchor).toBe(formatAnchor({ chapter: 1, section: 1, paragraph: 1 }))
      },
      { timeout: 3000 },
    )
  })

  it('remembers moving on to the next section', async () => {
    openReader()
    await screen.findByText('The opening words.')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Later in the first chapter.')

    await vi.waitFor(
      async () => {
        const saved = await repository.getPosition(BOOK_ID)
        expect(saved?.anchor).toBe(IN_CHAPTER_ONE_SECTION_TWO)
      },
      { timeout: 3000 },
    )
  })
})

describe('closing the navigation sheet', () => {
  it('closes when the space above it is tapped', async () => {
    // Found on a real phone: the sheet filled everything between the two bars,
    // so there was nowhere to tap to mean "no thanks" and the only way out was
    // to find the hamburger again.
    const { container } = openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: SHEET_BUTTON }))
    expect(screen.getByRole('tab', { name: 'Contents' })).toBeTruthy()

    const scrim = container.querySelector('[data-scrim]')
    if (!scrim) throw new Error('expected something to tap outside the sheet')
    fireEvent.click(scrim)

    expect(screen.queryByRole('tab', { name: 'Contents' })).toBeNull()
  })

  it('closes on a back gesture instead of leaving the book', async () => {
    openReader()
    await screen.findByText('The opening words.')
    fireEvent.click(screen.getByRole('button', { name: SHEET_BUTTON }))

    window.history.back()

    await vi.waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Contents' })).toBeNull()
    })
    // Still in the book — the whole point. Swiping back used to land the
    // reader on the shelf.
    expect(screen.getByText('The opening words.')).toBeTruthy()
  })
})

describe('following a link in the text', () => {
  const LINKED = 'book-linked' as BookId

  /** A cross-reference in chapter 1 pointing at a paragraph in chapter 2. */
  function linkedBook(): ParsedBook {
    const book = bookOf()
    const target = formatAnchor({ chapter: 2, section: 1, paragraph: 1 })
    const [first, ...rest] = book.sections

    return {
      ...book,
      meta: { ...book.meta, id: LINKED },
      manifest: { ...book.manifest, bookId: LINKED },
      sections: [
        {
          ...first,
          paragraphs: [
            {
              ...first.paragraphs[0],
              text: 'See the note for more.',
              links: [{ start: 4, end: 12, anchor: target }],
            },
            ...first.paragraphs.slice(1),
          ],
        },
        ...rest,
      ],
    }
  }

  beforeEach(async () => {
    await repository.deleteBook(LINKED)
    await repository.saveParsedBook(linkedBook())
  })

  it('renders the linked words as something to tap', async () => {
    openReader(LINKED)
    await screen.findByText(/See/)

    expect(screen.getByRole('button', { name: 'the note' })).toBeTruthy()
  })

  it('goes to the paragraph the link names', async () => {
    openReader(LINKED)
    await screen.findByText(/See/)

    fireEvent.click(screen.getByRole('button', { name: 'the note' }))

    // Chapter 2's section, which was two sections away.
    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
  })

  it('offers the way back, and takes it', async () => {
    // Without this a footnote is a trap: it throws you across the book and
    // leaves you to find your own way home.
    openReader(LINKED)
    await screen.findByText(/See/)
    fireEvent.click(screen.getByRole('button', { name: 'the note' }))
    await screen.findByText('The second chapter begins.')

    fireEvent.click(screen.getByRole('button', { name: /^↩ Back to/ }))

    expect(await screen.findByText(/See/)).toBeTruthy()
  })

  it('names the page it will take you back to', async () => {
    // "Back to where you were" is a promise you have to trust; "back to page 3"
    // is one you can check — and after a jump, knowing the page you left is
    // most of knowing where the jump put you.
    openReader(LINKED)
    await screen.findByText(/See/)
    fireEvent.click(screen.getByRole('button', { name: 'the note' }))
    await screen.findByText('The second chapter begins.')

    expect(await screen.findByRole('button', { name: /Back to page \d+/ })).toBeTruthy()
  })

  it('offers no way back before any link has been followed', async () => {
    openReader(LINKED)
    await screen.findByText(/See/)

    expect(screen.queryByRole('button', { name: /^↩ Back to/ })).toBeNull()
  })
})
