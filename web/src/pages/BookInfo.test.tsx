// @vitest-environment jsdom
//
// The book detail page (WP-47), against a real (fake-indexeddb) database.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { repository, type ParsedBook } from '../storage/index.ts'
import { chapterPath, formatAnchor, sectionPath, type BookId } from '../structure/index.ts'
import BookInfo from './BookInfo.tsx'

afterEach(cleanup)

const BOOK_ID = 'book-1' as BookId

function bookOf(overrides: Partial<ParsedBook['meta']> = {}): ParsedBook {
  const meta = {
    id: BOOK_ID,
    title: 'The Fundamental Wisdom',
    author: 'Nagarjuna',
    source: 'epub' as const,
    type: 'dense-technical' as const,
    importedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
  return {
    meta,
    manifest: {
      bookId: BOOK_ID,
      title: meta.title,
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
        paragraphs: [{ anchor: formatAnchor({ chapter: 1, section: 1, paragraph: 1 }), text: 'x', kind: 'prose' }],
      },
    ],
  }
}

function openInfo(id: string = BOOK_ID) {
  return render(
    <MemoryRouter initialEntries={[`/book/${id}/info`]}>
      <Routes>
        <Route path="/book/:bookId/info" element={<BookInfo />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await repository.deleteBook(BOOK_ID)
})

describe('BookInfo', () => {
  it('shows title, author and format', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    expect(await screen.findByText('The Fundamental Wisdom')).toBeTruthy()
    expect(screen.getByText('Nagarjuna')).toBeTruthy()
    expect(screen.getByText('EPUB')).toBeTruthy()
  })

  it('says a book has not been started when there is no reading position', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    expect(await screen.findByText('Not started')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start reading' })).toBeTruthy()
  })

  it('shows progress and offers to continue once reading has begun', async () => {
    await repository.saveParsedBook(bookOf())
    await repository.savePosition(BOOK_ID, formatAnchor({ chapter: 1, section: 1, paragraph: 1 }), 42)
    openInfo()

    expect(await screen.findByText('Reading — 42%')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue reading' })).toBeTruthy()
  })

  it('says a book is missing rather than showing a blank page', async () => {
    openInfo('does-not-exist')
    expect(await screen.findByText(/isn.t on your shelf/)).toBeTruthy()
  })

  it('sets a rating on tap, and clears it on a second tap of the same star', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    const overall = within(await screen.findByRole('group', { name: 'Overall' }))
    const fourthStar = overall.getByRole('button', { name: '4 stars' })
    fireEvent.click(fourthStar)

    await waitFor(async () => {
      expect((await repository.getBook(BOOK_ID))?.rating).toBe(4)
    })
    expect(fourthStar.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(fourthStar)
    await waitFor(async () => {
      expect((await repository.getBook(BOOK_ID))?.rating).toBeUndefined()
    })
  })

  it('rates a secondary axis independently of the overall rating', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    const pacing = within(await screen.findByRole('group', { name: 'Pacing' }))
    fireEvent.click(pacing.getByRole('button', { name: '3 stars' }))

    await waitFor(async () => {
      expect((await repository.getBook(BOOK_ID))?.secondaryRatings).toEqual({ pacing: 3 })
    })
    expect((await repository.getBook(BOOK_ID))?.rating).toBeUndefined()
  })

  it('toggles a mood tag on and off', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    const cozy = await screen.findByRole('button', { name: 'Cozy' })
    fireEvent.click(cozy)
    await waitFor(async () => {
      expect((await repository.getBook(BOOK_ID))?.moods).toEqual(['Cozy'])
    })

    fireEvent.click(cozy)
    await waitFor(async () => {
      expect((await repository.getBook(BOOK_ID))?.moods).toBeUndefined()
    })
  })

  it('saves notes on blur', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    const notes = await screen.findByPlaceholderText('What did you take away from this book?')
    fireEvent.change(notes, { target: { value: 'Changed how I think about emptiness.' } })
    fireEvent.blur(notes)

    await waitFor(async () => {
      expect((await repository.getBook(BOOK_ID))?.notes).toBe('Changed how I think about emptiness.')
    })
  })

  it('saves a typed quote and lists it', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    const input = await screen.findByPlaceholderText('Add a passage worth remembering…')
    fireEvent.change(input, { target: { value: 'A line worth keeping.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save quote' }))

    expect(await screen.findByText('“A line worth keeping.”')).toBeTruthy()
    await waitFor(async () => {
      expect((await repository.listQuotes(BOOK_ID)).map((q) => q.text)).toEqual([
        'A line worth keeping.',
      ])
    })
  })

  it('removes a saved quote', async () => {
    await repository.saveParsedBook(bookOf())
    await repository.addQuote(BOOK_ID, 'Take this one away.')
    openInfo()

    await screen.findByText('“Take this one away.”')
    fireEvent.click(screen.getByRole('button', { name: 'Remove this quote' }))

    await waitFor(() => {
      expect(screen.queryByText('“Take this one away.”')).toBeNull()
    })
    expect(await repository.listQuotes(BOOK_ID)).toEqual([])
  })
})
