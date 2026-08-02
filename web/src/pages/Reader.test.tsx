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
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
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
      chapters: [
        { chapter: 1, title: 'The Beginning', summary: '' },
        { chapter: 2, title: 'The Middle', summary: '' },
      ],
    },
    chapters: [
      {
        chapter: 1,
        title: 'The Beginning',
        path: chapterPath(1),
        sections: [
          { section: 1, path: sectionPath(1, 1) },
          { section: 2, path: sectionPath(1, 2) },
        ],
      },
      {
        chapter: 2,
        title: 'The Middle',
        path: chapterPath(2),
        sections: [{ section: 1, path: sectionPath(2, 1) }],
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
  await repository.deleteBook(BOOK_ID)
  await repository.saveParsedBook(bookOf())
})

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
