// @vitest-environment jsdom
//
// The book detail page (WP-47), against a real (fake-indexeddb) database.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PARSER_VERSION } from '../parse/version.ts'
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

function openInfo(id: string = BOOK_ID, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/book/${id}/info`, state }]}>
      <Routes>
        <Route path="/book/:bookId/info" element={<BookInfo />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * The whole trail a reader leaves: shelf, then the book, then its About page.
 *
 * Needed to prove the Back arrow *pops* rather than pushes. A pushed entry
 * leaves the phone's own back gesture bouncing between the book and About for
 * ever, which is exactly the fault this guards.
 */
function openInfoFromReader() {
  return render(
    <MemoryRouter
      initialEntries={['/', `/book/${BOOK_ID}`, { pathname: `/book/${BOOK_ID}/info`, state: { fromReader: true } }]}
      initialIndex={2}
    >
      <Routes>
        <Route path="/" element={<p>The shelf</p>} />
        <Route path="/book/:bookId" element={<GoBack />} />
        <Route path="/book/:bookId/info" element={<BookInfo />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Stands in for the reading page, and offers the phone's back gesture. */
function GoBack() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      The book
    </button>
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

  // Reached from the shelf this page is a destination, so the way out is home.
  // Reached from inside the book it is a detour, and a home icon would throw
  // away the page the reader was on.
  it('goes home from the shelf and back to the book from the reader', async () => {
    await repository.saveParsedBook(bookOf())

    openInfo()
    expect((await screen.findByRole('link', { name: 'Home' })).getAttribute('href')).toBe('/')
    cleanup()

    openInfo(BOOK_ID, { fromReader: true })
    const back = await screen.findByRole('link', { name: 'Back to the book' })
    expect(back.getAttribute('href')).toBe(`/book/${BOOK_ID}`)
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
  })

  // The arrow must unwind the detour, not add to it. Pushing a third entry
  // leaves the reader's own back gesture walking between the book and this page
  // and never reaching the shelf.
  it('pops the detour rather than pushing the book on top of it', async () => {
    await repository.saveParsedBook(bookOf())
    openInfoFromReader()

    fireEvent.click(await screen.findByRole('link', { name: 'Back to the book' }))
    // The book, where the reader was.
    const book = await screen.findByRole('button', { name: 'The book' })

    // And now their next back gesture reaches the shelf, which is the fault.
    fireEvent.click(book)
    expect(await screen.findByText('The shelf')).toBeTruthy()
  })

  it('says a book has not been started when there is no reading position', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    expect(await screen.findByText('Not started')).toBeTruthy()
    // "Read", not "Start reading": the button is the shortest true thing it
    // could say, and the line under it already says where it lands.
    expect(screen.getByRole('link', { name: 'Read' })).toBeTruthy()
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

  it('rates in halves, from the left half of a star', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    const overall = within(await screen.findByRole('group', { name: 'Overall' }))
    fireEvent.click(overall.getByRole('button', { name: '3.5 stars' }))

    await waitFor(async () => {
      expect((await repository.getBook(BOOK_ID))?.rating).toBe(3.5)
    })

    // The half is pressed and the whole star it sits in is not — the two
    // targets inside one glyph have to stay distinguishable, which is the
    // whole risk of drawing them on top of each other.
    expect(overall.getByRole('button', { name: '3.5 stars' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(overall.getByRole('button', { name: '4 stars' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('shows the title and its subtitle as one line', async () => {
    await repository.saveParsedBook(
      bookOf({ title: 'Breath', subtitle: 'The New Science of a Lost Art' }),
    )
    openInfo()

    expect(await screen.findByText('Breath: The New Science of a Lost Art')).toBeTruthy()
  })

  it('shows a book with no subtitle under its bare title', async () => {
    await repository.saveParsedBook(bookOf({ title: 'Alaska' }))
    openInfo()

    expect(await screen.findByText('Alaska')).toBeTruthy()
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

  /*
   * The whole-shelf update lives at launch now. This page is where a book that
   * the sweep left behind gets a second chance — and, when there is no second
   * chance to offer, where it says so instead of showing a button that does
   * nothing.
   */
  describe('a book an older parser made', () => {
    it('offers to re-read it when the original file is still kept', async () => {
      await repository.saveParsedBook(bookOf({ parserVersion: 0 }))
      await repository.saveSource(BOOK_ID, new Blob(['epub bytes']), 'wisdom.epub')
      openInfo()

      expect(await screen.findByText('This book can be improved')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Update this book' })).toBeTruthy()
    })

    it('says why there is nothing to press when the file is gone', async () => {
      await repository.saveParsedBook(bookOf({ parserVersion: 0 }))
      openInfo()

      expect(await screen.findByText('This book can be improved')).toBeTruthy()
      expect(screen.getByText(/import the file again/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Update this book' })).toBeNull()
    })

    it('says nothing at all about a book that is already current', async () => {
      await repository.saveParsedBook(bookOf({ parserVersion: PARSER_VERSION }))
      openInfo()

      await screen.findByText('The Fundamental Wisdom')
      expect(screen.queryByText('This book can be improved')).toBeNull()
    })
  })

  describe('what the catalogue said', () => {
    it('shows the details a lookup filled in', async () => {
      await repository.saveParsedBook(
        bookOf({
          googleVolumeId: 'v1',
          publisher: 'Oxford University Press',
          published: '1995',
          pageCount: 372,
          genre: 'Non-fiction',
        }),
      )
      openInfo()

      await screen.findByText('The Fundamental Wisdom')
      expect(screen.getByText('Oxford University Press')).toBeTruthy()
      expect(screen.getByText('372')).toBeTruthy()
      expect(screen.getByText('Non-fiction')).toBeTruthy()
    })

    // An average resting on two votes, shown as a verdict, is a lie of omission.
    it('never shows an average rating without the count beside it', async () => {
      await repository.saveParsedBook(bookOf({ averageRating: 4.5, ratingsCount: 2 }))
      openInfo()

      await screen.findByText('The Fundamental Wisdom')
      expect(screen.getByText('4.50 out of 5 · 2 ratings')).toBeTruthy()
    })

    it('leaves the average out entirely when nobody has rated it', async () => {
      await repository.saveParsedBook(bookOf({ averageRating: 4.5 }))
      openInfo()

      await screen.findByText('The Fundamental Wisdom')
      expect(screen.queryByText(/out of 5/)).toBeNull()
    })

    // The three states have to read differently, because only one of them means
    // "pressing this again might help".
    it('says a book has never been looked up', async () => {
      await repository.saveParsedBook(bookOf())
      openInfo()

      expect(await screen.findByText('Nothing has been looked up for this book yet.')).toBeTruthy()
    })

    it('says a book was looked up and genuinely isn’t in the catalogue', async () => {
      await repository.saveParsedBook(bookOf({ metadataFetchedAt: '2026-08-12T10:00:00.000Z' }))
      openInfo()

      expect(await screen.findByText('Google Books has no record of this one.')).toBeTruthy()
    })

    it('lists the subject headings Google returned', async () => {
      await repository.saveParsedBook(
        bookOf({ subjects: ['Philosophy / Buddhist', 'Religion / Eastern'] }),
      )
      openInfo()

      expect(await screen.findByText('Philosophy / Buddhist')).toBeTruthy()
      expect(screen.getByText('Religion / Eastern')).toBeTruthy()
    })

    // The file's edition, not the one Google matched — they disagree often.
    it('prefers the file’s own ISBN over the catalogue’s', async () => {
      await repository.saveParsedBook(bookOf({ isbn: '9780195093360', googleIsbn13: '9781234567897' }))
      openInfo()

      expect(await screen.findByText('9780195093360')).toBeTruthy()
      expect(screen.queryByText('9781234567897')).toBeNull()
    })

    it('falls back to the catalogue’s ISBN when the file carried none', async () => {
      await repository.saveParsedBook(bookOf({ googleIsbn13: '9781234567897' }))
      openInfo()

      expect(await screen.findByText('9781234567897')).toBeTruthy()
    })

    // The blurb is somebody else's marketing copy; folded, it can't push the
    // reader's own notes and quotes off the bottom of the screen.
    it('folds the description, and opens it on the chevron', async () => {
      await repository.saveParsedBook(bookOf({ description: 'A breathtaking contemporary epic.' }))
      openInfo()

      expect(await screen.findByText('A breathtaking contemporary epic.')).toBeTruthy()
      const toggle = screen.getByRole('button', { name: 'Show more' })
      expect(toggle.getAttribute('aria-expanded')).toBe('false')

      fireEvent.click(toggle)
      expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe(
        'true',
      )
    })

    it('offers to ask again', async () => {
      await repository.saveParsedBook(bookOf())
      openInfo()

      await screen.findByText('The Fundamental Wisdom')
      expect(screen.getByRole('button', { name: 'Refresh from Google Books' })).toBeTruthy()
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
