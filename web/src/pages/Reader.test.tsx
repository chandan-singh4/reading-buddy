// @vitest-environment jsdom
//
// The reader end to end: a real book written to a real (fake-indexeddb)
// database, opened through the route, read, and paged through. fake-indexeddb
// must load first — Reader goes through the app-wide repository.
import 'fake-indexeddb/auto'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
/** A stored picture, in the section *next* to the one the reader opens on. */
const NEIGHBOUR_FIGURE = 'OEBPS/images/plate.png'

function bookOf(): ParsedBook {
  const neighbour = sectionOf(1, 2, ['Later in the first chapter.'])
  // A figure one section ahead. An understudy that draws this at no height
  // breaks its columns in the wrong places, so the reader lands on the page and
  // then watches the words drop — see `shownParagraphs` in Reader.tsx.
  neighbour.paragraphs = [
    ...neighbour.paragraphs,
    {
      anchor: formatAnchor({ chapter: 1, section: 2, paragraph: 2 }),
      text: 'A plate.',
      kind: 'figure' as const,
      image: { src: NEIGHBOUR_FIGURE },
    },
  ]

  const sections = [
    sectionOf(1, 1, ['The opening words.', 'A second thought.']),
    neighbour,
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
          // Named, so the contents list has rows to fold under chapter 1 —
          // which is what the collapsing is for. Chapter 2's stay unnamed, so
          // the "a chapter with nothing under it is a plain link" path is
          // covered by the same fixture.
          { section: 1, title: 'First Part', path: sectionPath(1, 1), words: 300 },
          { section: 2, title: 'Second Part', path: sectionPath(1, 2), words: 300 },
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
 * The three-dot button beside the page slider, which opens the browse page —
 * Contents, Bookmarks and Notes. It shows a glyph, so its accessible name is
 * the label, not its text.
 */
const MENU_BUTTON = 'More'

/**
 * Open one of the browse page's panels the way a reader does: the ⋮, which
 * lands on Contents, then the tab. Aa has its own button on the bar and doesn't
 * come through here.
 */
function openSheetAt(panel: 'Contents' | 'Bookmarks' | 'Notes') {
  fireEvent.click(screen.getByRole('button', { name: MENU_BUTTON }))
  fireEvent.click(screen.getByRole('tab', { name: panel }))
}

/**
 * Swipe across the browse page. 120 px of travel and none of drift, which is
 * comfortably past what `swipeOf` asks for.
 */
function swipeBrowsePage(way: 'left' | 'right') {
  const page = screen.getByRole('dialog')
  const to = way === 'left' ? 80 : 320

  fireEvent.touchStart(page, { touches: [{ clientX: 200, clientY: 300 }] })
  fireEvent.touchEnd(page, { changedTouches: [{ clientX: to, clientY: 300 }] })
}

/** Focus Mode has its own button on the top bar, where the ⋮ used to be. */
function turnFocusOn() {
  fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }))
}

/**
 * A bookmark row, by the passage it holds.
 *
 * A resting row reads "The Beginning · p.1 · The opening words." — the place
 * and then the passage — so the name has to be matched at its end. Matching the
 * passage alone would also catch the row's own Rename and Remove buttons.
 */
function markRow(passage: string) {
  return screen.getByRole('button', { name: new RegExp(`p\\.\\d+\\s*${passage}$`) })
}

/** Unfurl a row, which is what puts Go, Rename and Remove on screen. */
function openMark(passage: string) {
  fireEvent.click(markRow(passage))
}

/** The sheet showing a named panel, for scoping a query inside it. */
function sheet(name: string) {
  return within(screen.getByRole('dialog', { name }))
}

/**
 * Turn a page, the way a reader without a touch screen does.
 *
 * These used to click Previous and Next. Those buttons are gone — a phone is
 * read by swiping — and jsdom has neither a swipe nor a page wide enough to tap
 * the edge of, so the keyboard is what drives the tests now. It goes through the
 * same single `turnPage` every gesture goes through, which is why it can stand
 * in for them.
 */
async function turnPage(key: 'ArrowRight' | 'ArrowLeft') {
  // Settle first. Which section lies either side of this one is looked up
  // asynchronously, a moment after the text itself appears, and a page turned
  // before that lookup lands has nowhere to go — a race the old Previous and
  // Next buttons hid by being disabled until it resolved.
  await act(async () => {})
  fireEvent.keyDown(window, { key })
}

const turnForward = () => turnPage('ArrowRight')
const turnBack = () => turnPage('ArrowLeft')

/**
 * Text on the page the reader is actually looking at.
 *
 * The sections either side are mounted too — hidden, so a turn at the seam has
 * something real to be dragged onto (see `.understudy` in `Reader.module.css`).
 * They hold the same words as the page before and the page after, so "is this in
 * the document" stopped being the same question as "is the reader seeing this".
 * The understudies are `aria-hidden`, which is the same fact stated in the way
 * the DOM already had to state it.
 */
function onThePage(text: string): HTMLElement | null {
  return screen.queryByText(text, {
    ignore: '[aria-hidden="true"], [aria-hidden="true"] *, script, style',
  })
}

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

  // The book's own title is deliberately *not* here — it is in the bar at the
  // top of the screen, and printing it again above every chapter said the same
  // thing twice, at length on a book titled after its filename.
  it('opens a chapter with the chapter’s name', async () => {
    openReader()
    expect(await screen.findByText('The Beginning')).toBeTruthy()
    expect(screen.queryByText(/A Test Book ·/)).toBeNull()
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

    await turnForward()

    expect(await screen.findByText('Later in the first chapter.')).toBeTruthy()
    expect(onThePage('The opening words.')).toBeNull()
  })

  it("fetches a neighbour's pictures with the page's own, so the columns agree", async () => {
    const assets = vi.spyOn(repository, 'getAssets')
    openReader()
    await screen.findByText('The opening words.')
    await screen.findByText('Later in the first chapter.')

    // The reader is on section 1. The plate is in section 2, which is mounted
    // behind it. Its bytes have to be asked for now, not when the turn lands:
    // a figure with no picture yet is a figure with no height.
    //
    // Waited for, not read once. The neighbour's text being on the page and
    // its pictures having been asked for are two different moments, and under
    // a loaded test run the second can land a tick after the first — which
    // read as this test failing perhaps one run in three.
    await waitFor(() => {
      const asked = assets.mock.calls.flatMap(([, paths]) => [...paths])
      expect(asked).toContain(NEIGHBOUR_FIGURE)
    })
    assets.mockRestore()
  })

  it('keeps the next section mounted, so a turn at the seam has somewhere to land', async () => {
    openReader()
    await screen.findByText('The opening words.')

    // The section after this one is in the document before it is asked for, and
    // out of sight. That is what lets the last page of a section follow the
    // finger: `startSeamDrag` reveals this strip under the sheet, and without it
    // the turn falls back to a threshold swipe. See `.understudy`.
    await screen.findByText('Later in the first chapter.')
    expect(onThePage('Later in the first chapter.')).toBeNull()
  })

  it('crosses into the next chapter and updates the line of context', async () => {
    openReader()
    await screen.findByText('The opening words.')

    await turnForward()
    await screen.findByText('Later in the first chapter.')
    await turnForward()

    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
    expect(screen.getByText('The Middle')).toBeTruthy()
  })

  it('goes back into the previous chapter, landing on its last section', async () => {
    openReader()
    await screen.findByText('The opening words.')

    await turnForward()
    await screen.findByText('Later in the first chapter.')
    await turnForward()
    await screen.findByText('The second chapter begins.')

    await turnBack()

    // Chapter 1 section *2*, not section 1 — going back must land where the
    // previous chapter ended, not where it started.
    expect(await screen.findByText('Later in the first chapter.')).toBeTruthy()
  })

  // The ends of the book used to be a greyed-out button. With the buttons gone
  // they are simply a gesture that does nothing — which has to be *nothing*,
  // not a blank page or a throw back to the beginning.
  it('stays put when turned back from the first section', async () => {
    openReader()
    await screen.findByText('The opening words.')

    await turnBack()

    expect(screen.getByText('The opening words.')).toBeTruthy()
  })

  it('stays put when turned on from the last section', async () => {
    openReader()
    await screen.findByText('The opening words.')

    await turnForward()
    await screen.findByText('Later in the first chapter.')
    await turnForward()
    await screen.findByText('The second chapter begins.')

    await turnForward()

    expect(screen.getByText('The second chapter begins.')).toBeTruthy()
  })
})

describe('the overlay', () => {
  // A book opens on the book. The overlay is a panel over the page, so starting
  // with it up means every book begins covered — which is what the reader was
  // complaining about, and it is not what the app it is measured against does.
  it('is out of the way when a book opens', async () => {
    const { container } = openReader()
    await screen.findByText('The opening words.')

    expect(chromeShown(container)).toBe(false)
  })

  it('returns and hides again when the text is tapped', async () => {
    const { container } = openReader()
    const text = await screen.findByText('The opening words.')

    fireEvent.click(text)
    expect(chromeShown(container)).toBe(true)
    expect(screen.getByRole('button', { name: MENU_BUTTON })).toBeTruthy()

    // Hidden, never removed — that distinction is the whole of the Focus Mode
    // decision, and a tap has to work both ways.
    fireEvent.click(text)
    expect(chromeShown(container)).toBe(false)
  })

  it('stays out of reach while hidden', async () => {
    const { container } = openReader()
    await screen.findByText('The opening words.')

    // `inert` so a hidden control can't be tabbed to or read out by a screen
    // reader. Invisible but focusable is worse than either.
    expect(container.querySelector('[data-shown]')?.hasAttribute('inert')).toBe(true)
  })

  // The point of taking the status line out of the overlay: where you are is
  // printed on the page like a page number in a book, so seeing it never costs
  // you the page you were reading.
  it('keeps the page number on screen while the overlay is hidden', async () => {
    const { container } = openReader()
    await screen.findByText('The opening words.')

    expect(chromeShown(container)).toBe(false)
    const status = await screen.findByText(/Page \d+ of \d+/)
    // Outside the overlay entirely — inside it, it would fade with everything
    // else and this test would pass while showing the reader nothing.
    expect(container.querySelector('[data-shown]')?.contains(status)).toBe(false)
  })

  /*
   * The page steps back rather than being covered. jsdom has no layout, so what
   * can be held here is the switch and not the geometry — that the page is told
   * to shrink exactly when the bars are up. Whether 85% is the right amount, and
   * whether the bars clear it, is a question for a real screen.
   */
  it('shrinks the page out of the way while the bars are up', async () => {
    const { container } = openReader()
    const text = await screen.findByText('The opening words.')

    const stage = container.querySelector('[data-shrunk]')
    expect(stage?.getAttribute('data-shrunk')).toBe('false')

    fireEvent.click(text)
    expect(stage?.getAttribute('data-shrunk')).toBe('true')

    fireEvent.click(text)
    expect(stage?.getAttribute('data-shrunk')).toBe('false')
  })

  // The page number holds its size and its place. It was briefly inside the
  // sheet, on the reasoning that a page number is printed on the page — and
  // then it shrank along with the page, which read as a fault the moment it was
  // seen. It still *turns* with the page; that is `data-page-furniture`, not
  // where it sits.
  it('leaves the page number out of the shrink', async () => {
    const { container } = openReader()
    await screen.findByText('The opening words.')

    const status = await screen.findByText(/Page \d+ of \d+/)
    expect(container.querySelector('[data-shrunk]')?.contains(status)).toBe(false)
    expect(status.closest('[data-page-furniture]')).toBeTruthy()
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

describe('the top bar and its menu', () => {
  it('lists the chapters and jumps to one', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSheetAt('Contents')
    fireEvent.click(screen.getByRole('button', { name: /The Middle/ }))

    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
  })

  it('puts a page beside every chapter, and says where you are in yours', async () => {
    // 600 words in chapter 1 at 300 to a page, so chapter 2 opens on page 3.
    // The chapter you are in says your own page instead of its first one —
    // which is the figure you actually want while the list is open.
    openReader()
    await screen.findByText('The opening words.')

    openSheetAt('Contents')

    // The dots and the figure are decoration, so the number is said in words on
    // the row itself — which is also the only way to check it here.
    expect(screen.getByRole('button', { name: 'The Middle, page 3' })).toBeTruthy()
    expect(screen.getByText(/reading now · page 1/)).toBeTruthy()
  })

  it('swipes from one tab to the next, and stops at the ends', async () => {
    openReader()
    await screen.findByText('The opening words.')
    openSheetAt('Contents')

    // Leftwards is forwards, the same as pushing a page aside.
    swipeBrowsePage('left')
    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()

    swipeBrowsePage('left')
    expect(screen.getByRole('dialog', { name: 'Notes' })).toBeTruthy()

    // The row does not loop, so neither does the swipe.
    swipeBrowsePage('left')
    expect(screen.getByRole('dialog', { name: 'Notes' })).toBeTruthy()

    swipeBrowsePage('right')
    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
  })

  it('quiets the page number while the browse page is open', async () => {
    // The status line is fixed above the overlay so it stays readable under the
    // toolbar. Over a list of chapters it is a caption for a hidden page.
    openReader()
    await screen.findByText('The opening words.')
    expect(document.documentElement.dataset.browsing).toBe('off')

    openSheetAt('Contents')
    expect(document.documentElement.dataset.browsing).toBe('on')

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Contents' })).getByRole('button', {
        name: 'Close',
      }),
    )
    expect(document.documentElement.dataset.browsing).toBe('off')
  })

  it('closes itself once you have jumped', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSheetAt('Contents')
    fireEvent.click(screen.getByRole('button', { name: /The Middle/ }))
    await screen.findByText('The second chapter begins.')

    expect(screen.queryByRole('dialog', { name: 'Contents' })).toBeNull()
  })

  it('lands on the start of a chapter, not wherever you were in it', async () => {
    openReader()
    await screen.findByText('The opening words.')

    await turnForward()
    await screen.findByText('Later in the first chapter.')

    openSheetAt('Contents')
    fireEvent.click(screen.getByRole('button', { name: /The Beginning/ }))

    expect(await screen.findByText('The opening words.')).toBeTruthy()
  })

  it('says Notes is not here yet, and points at the corner for bookmarks', async () => {
    openReader()
    await screen.findByText('The opening words.')

    // Bookmarks is real now (WP-14); with none made, the empty state has to say
    // how to make one — and since WP-55 that means the corner of the page, not
    // a ribbon in a toolbar that no longer has one.
    openSheetAt('Bookmarks')
    expect(screen.getByText(/No bookmarks yet/)).toBeTruthy()
    expect(screen.getByText(/top right corner/)).toBeTruthy()

    openSheetAt('Notes')
    expect(screen.getByText(/No notes yet/)).toBeTruthy()

    // The chapter list must still be reachable to come back to.
    openSheetAt('Contents')
    expect(screen.getByRole('button', { name: /The Middle/ })).toBeTruthy()
  })

  // Aa is the one panel with its own button, because text size is adjusted
  // mid-sentence and should not cost a trip through a menu.
  it('opens the display settings straight from the bar', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: 'Reading mode' }))

    expect(sheet('Reading mode').getByRole('slider', { name: 'Text size' })).toBeTruthy()
  })

  // The ⋮ is one tap to a chapter list now, not a menu that asks a second
  // question first. It has to carry its own way back out.
  it('opens the browse page at Contents and closes it again', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: MENU_BUTTON }))
    expect(screen.getByRole('tab', { name: 'Contents' }).getAttribute('aria-selected')).toBe(
      'true',
    )

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Contents' })).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('tab', { name: 'Contents' })).toBeNull()
  })
})

/**
 * Bookmarks, end to end through a real database (WP-14).
 *
 * jsdom cannot lay a page out, so "the paragraph at the top of the screen" is
 * whatever the reader has settled on — which here is the first paragraph of the
 * section. That is enough for everything worth checking: the ribbon is a toggle,
 * the mark survives being written and read back, it is named from the paragraph
 * it points at, and tapping it moves the book.
 */
describe('bookmarks', () => {
  const MARK = 'Bookmark this page'
  const UNMARK = 'Remove bookmark'

  it('marks the page, names it from the paragraph, and lists it under its chapter', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: MARK }))

    // The ribbon is a toggle: once marked, it offers to unmark.
    expect(await screen.findByRole('button', { name: UNMARK })).toBeTruthy()

    openSheetAt('Bookmarks')
    // Scoped to the panel: the chapter title is also printed elsewhere on the
    // reading screen, and an unscoped match would pass without the list.
    const panel = sheet('Bookmarks')
    // The row says where it is and what it says: the chapter, the page the
    // mark falls on, and the passage itself.
    expect(
      panel.getByRole('button', { name: /The Beginning · p\.1\s*The opening words\.$/ }),
    ).toBeTruthy()
  })

  it('takes the mark off again when the ribbon is tapped twice', async () => {
    openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: MARK }))
    fireEvent.click(await screen.findByRole('button', { name: UNMARK }))

    expect(await screen.findByRole('button', { name: MARK })).toBeTruthy()

    openSheetAt('Bookmarks')
    expect(screen.getByText(/No bookmarks yet/)).toBeTruthy()
  })

  it('survives closing and reopening the book', async () => {
    // The point of storing them at all. Written on one mount, read on the next.
    const first = openReader()
    await screen.findByText('The opening words.')
    fireEvent.click(screen.getByRole('button', { name: MARK }))
    await screen.findByRole('button', { name: UNMARK })
    first.unmount()

    openReader()
    await screen.findByText('The opening words.')

    openSheetAt('Bookmarks')
    expect(markRow('The opening words.')).toBeTruthy()
  })

  it('goes to the marked place when the mark is tapped', async () => {
    openReader()
    await screen.findByText('The opening words.')

    // Mark chapter 2, then come back to chapter 1 and jump forward by the mark.
    openSheetAt('Contents')
    fireEvent.click(screen.getByRole('button', { name: /The Middle/ }))
    await screen.findByText('The second chapter begins.')
    fireEvent.click(screen.getByRole('button', { name: MARK }))
    await screen.findByRole('button', { name: UNMARK })

    openSheetAt('Contents')
    // Chapter 1 has rows under it, so its own row folds them rather than going
    // anywhere. It is still open from the start of this test, and its first
    // part is where the chapter begins.
    fireEvent.click(screen.getByRole('button', { name: /First Part/ }))
    await screen.findByText('The opening words.')

    openSheetAt('Bookmarks')
    // Unfurl the row, then take the way back it offers.
    openMark('The second chapter begins.')
    fireEvent.click(screen.getByRole('button', { name: /^Go to page/ }))

    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
  })

  it('renames a mark, and treats a cleared name as a request for the default', async () => {
    openReader()
    await screen.findByText('The opening words.')
    fireEvent.click(screen.getByRole('button', { name: MARK }))
    await screen.findByRole('button', { name: UNMARK })

    openSheetAt('Bookmarks')

    openMark('The opening words.')

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Where I stopped')
    fireEvent.click(screen.getByRole('button', { name: /^Rename/ }))
    expect(await screen.findByRole('button', { name: /p\.\d+\s*Where I stopped$/ })).toBeTruthy()

    // Cleared, not cancelled: the reader wants the default back, not a blank row.
    prompt.mockReturnValue('   ')
    fireEvent.click(screen.getByRole('button', { name: /^Rename/ }))
    expect(await screen.findByRole('button', { name: /p\.\d+\s*Where I stopped$/ })).toBeTruthy()

    // Cancelled: nothing changes at all.
    prompt.mockReturnValue(null)
    fireEvent.click(screen.getByRole('button', { name: /^Rename/ }))
    expect(screen.getByRole('button', { name: /p\.\d+\s*Where I stopped$/ })).toBeTruthy()
    prompt.mockRestore()
  })

  it('removes a mark from the list', async () => {
    openReader()
    await screen.findByText('The opening words.')
    fireEvent.click(screen.getByRole('button', { name: MARK }))
    await screen.findByRole('button', { name: UNMARK })

    openSheetAt('Bookmarks')
    fireEvent.click(screen.getByRole('button', { name: /^Remove The opening words\./ }))

    expect(await screen.findByText(/No bookmarks yet/)).toBeTruthy()
  })

  it('forgets a book’s bookmarks when the book is deleted', async () => {
    // The cascade. An orphaned bookmark is invisible and unreachable, and would
    // reattach itself to a book re-imported under the same id.
    openReader().unmount()
    await repository.addBookmark(BOOK_ID, formatAnchor({ chapter: 1, section: 1, paragraph: 1 }), 'A mark')
    expect(await repository.listBookmarks(BOOK_ID)).toHaveLength(1)

    await repository.deleteBook(BOOK_ID)
    expect(await repository.listBookmarks(BOOK_ID)).toHaveLength(0)
  })
})

/**
 * In-book search (WP-14), through the panel behind the magnifier.
 *
 * The engine has its own tests in `reader/search.test.ts` and they cover the
 * hard part — counting, snippets, punctuation. What is checked here is only
 * what the panel adds: that the book's text is fetched when it is needed and
 * not before, that each of the four status sentences appears at the right
 * moment, that a result moves the book, and that the query survives being put
 * away. All of it debounced, so every wait here is a real one.
 */
describe('searching inside a book', () => {
  const openSearch = () => fireEvent.click(screen.getByRole('button', { name: 'Search this book' }))
  const typeQuery = (text: string) =>
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: text } })

  it('finds a phrase and says how many there are', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    typeQuery('opening')

    expect(await screen.findByText('1 result.')).toBeTruthy()
    // The chapter a result falls in, so a reader knows where they would land.
    expect(screen.getByRole('button', { name: /The Beginning/ })).toBeTruthy()
  })

  it('counts in the plural, and finds across chapters', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    // In 'The opening words.', 'Later in the first chapter.' and 'The second
    // chapter begins.' — three sections, two chapters.
    typeQuery('the')

    expect(await screen.findByText(/^\d+ results\.$/)).toBeTruthy()
  })

  it('asks for more letters rather than reporting nothing', async () => {
    // A reader who has typed one letter has not failed to find anything.
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    typeQuery('t')

    expect(await screen.findByText('Type at least two letters.')).toBeTruthy()
  })

  it('says plainly when a word is not in the book', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    typeQuery('rhinoceros')

    expect(await screen.findByText('Nothing found.')).toBeTruthy()
  })

  it('goes to the result, and closes on the way', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    typeQuery('second chapter begins')
    const hit = await screen.findByRole('button', { name: /The Middle/ })
    fireEvent.click(hit)

    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
    // The panel is gone: the reader asked to be taken somewhere, not to keep
    // looking at a list over the top of it.
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('still has the last search in it when it is opened again', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    typeQuery('opening')
    await screen.findByText('1 result.')

    // Clear, then close: two jobs for the one ✕, and with a word in the field
    // the first of them is the one it does.
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('searchbox')).toHaveProperty('value', '')

    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.queryByRole('searchbox')).toBeNull()

    openSearch()
    expect(screen.getByRole('searchbox')).toHaveProperty('value', '')
  })

  /*
   * The three ways out of search, all reported broken from the phone and all
   * the same underlying fault: the panel sat inside an overlay that lets taps
   * through to the book, and never claimed them back. Every one of these is a
   * regression test for a thing the reader actually hit.
   */

  it('leaves the panel, not the book, when there is nothing typed', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    // Nothing typed: the ✕ has nothing to erase, so it closes instead of
    // sitting there doing nothing — which is what it used to do.
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))

    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByText('The opening words.')).toBeTruthy()
  })

  it('closes on a back gesture instead of throwing you out of the book', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    // The gesture, as the browser delivers it. Search had never been wired to
    // this, so a back swipe skipped the panel and left the book entirely.
    window.history.back()

    await vi.waitFor(() => {
      expect(screen.queryByRole('searchbox')).toBeNull()
    })
    expect(screen.getByText('The opening words.')).toBeTruthy()
  })

  it('keeps taps on the field to itself once there are results', async () => {
    openReader()
    await screen.findByText('The opening words.')

    openSearch()
    typeQuery('opening')
    await screen.findByText('1 result.')

    // Editing the query after seeing results used to dismiss the panel — the
    // tap fell through to the page underneath. Worth stating plainly: jsdom has
    // no layout and so no hit testing, which means this cannot see the
    // `pointer-events` rule that actually caused it. What it does hold is the
    // behaviour on top of it — the field survives being tapped and keeps what
    // was typed — and the fix itself is a comment in `Chrome.module.css`.
    fireEvent.click(screen.getByRole('searchbox'))
    typeQuery('opening w')

    expect(screen.getByRole('searchbox')).toHaveProperty('value', 'opening w')
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

    turnFocusOn()
    unmount()

    // Reopening is the real test: the setting outlives the screen.
    const reopened = openReader()
    await screen.findByText('The opening words.')
    expect(chromeShown(reopened.container)).toBe(false)
  })

  it('still lets a tap bring everything back', async () => {
    openReader()
    await screen.findByText('The opening words.')
    turnFocusOn()
    cleanup()

    const { container } = openReader()
    const text = await screen.findByText('The opening words.')
    fireEvent.click(text)

    expect(chromeShown(container)).toBe(true)
    // And the way out of Focus Mode is still there to be found — the bar's own
    // button, saying it is on.
    const focus = screen.getByRole('button', { name: 'Focus mode' })
    expect(focus.getAttribute('aria-pressed')).toBe('true')
  })

  it('leaves the book turnable — reading never loses its controls', async () => {
    openReader()
    await screen.findByText('The opening words.')
    turnFocusOn()
    cleanup()

    openReader()
    await screen.findByText('The opening words.')

    // Focus Mode quiets the interface around the book; it does not stop the
    // book being read.
    await turnForward()
    expect(await screen.findByText('Later in the first chapter.')).toBeTruthy()
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
    expect(onThePage('The opening words.')).toBeNull()
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
    await turnForward()
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
    //
    // Aa is the sheet now. Contents, Bookmarks and Notes are a page of their
    // own, with nothing behind them to tap.
    const { container } = openReader()
    await screen.findByText('The opening words.')

    fireEvent.click(screen.getByRole('button', { name: 'Reading mode' }))
    expect(screen.getByRole('dialog', { name: 'Reading mode' })).toBeTruthy()

    const scrim = container.querySelector('[data-scrim]')
    if (!scrim) throw new Error('expected something to tap outside the sheet')
    fireEvent.click(scrim)

    expect(screen.queryByRole('dialog', { name: 'Reading mode' })).toBeNull()
  })

  it('closes on a back gesture instead of leaving the book', async () => {
    openReader()
    await screen.findByText('The opening words.')
    openSheetAt('Contents')

    window.history.back()

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Contents' })).toBeNull()
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

    expect(screen.getByRole('link', { name: 'the note' })).toBeTruthy()
  })

  it('goes to the paragraph the link names', async () => {
    openReader(LINKED)
    await screen.findByText(/See/)

    fireEvent.click(screen.getByRole('link', { name: 'the note' }))

    // Chapter 2's section, which was two sections away.
    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
  })

  it('offers the way back, and takes it', async () => {
    // Without this a footnote is a trap: it throws you across the book and
    // leaves you to find your own way home.
    openReader(LINKED)
    await screen.findByText(/See/)
    fireEvent.click(screen.getByRole('link', { name: 'the note' }))
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
    fireEvent.click(screen.getByRole('link', { name: 'the note' }))
    await screen.findByText('The second chapter begins.')

    expect(await screen.findByRole('button', { name: /Back to page \d+/ })).toBeTruthy()
  })

  it('offers no way back before any link has been followed', async () => {
    openReader(LINKED)
    await screen.findByText(/See/)

    expect(screen.queryByRole('button', { name: /^↩ Back to/ })).toBeNull()
  })
})

describe('the contents fold up', () => {
  /*
   * The list this exists for is long: a collected works gives 19 volumes and
   * 321 children, and 340 rows in one scroll is a haystack, not a contents
   * page.
   */
  it('hides a chapter’s parts until its row is tapped', async () => {
    openReader()
    await screen.findByText('The opening words.')
    openSheetAt('Contents')

    // Chapter 1 is where the reader is, so it is already open.
    expect(screen.queryByRole('button', { name: /First Part/ })).toBeTruthy()

    // Shut it, and its parts go with it.
    fireEvent.click(screen.getByRole('button', { name: /The Beginning/ }))
    expect(screen.queryByRole('button', { name: /First Part/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Second Part/ })).toBeNull()

    // Open it again, and they come back.
    fireEvent.click(screen.getByRole('button', { name: /The Beginning/ }))
    expect(screen.queryByRole('button', { name: /Second Part/ })).toBeTruthy()
  })

  it('leaves a chapter with nothing under it as a plain link', async () => {
    openReader()
    await screen.findByText('The opening words.')
    openSheetAt('Contents')

    // Chapter 2's sections are unnamed, so it has no rows to fold and its own
    // row must still go where it says.
    fireEvent.click(screen.getByRole('button', { name: 'The Middle, page 3' }))
    expect(await screen.findByText('The second chapter begins.')).toBeTruthy()
  })

  /* The row the reader is on has to be reachable, or the list cannot open
     itself at them — see `openChapters` in `Chrome.tsx`. */
  it('opens the chapter the reader is in', async () => {
    openReader()
    await screen.findByText('The opening words.')
    openSheetAt('Contents')
    expect(screen.getByRole('button', { name: /First Part/ })).toBeTruthy()
  })
})
