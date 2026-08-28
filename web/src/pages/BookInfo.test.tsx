// @vitest-environment jsdom
//
// The book detail page (WP-47), against a real (fake-indexeddb) database.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PARSER_VERSION } from '../parse/version.ts'
import { repository, type ParsedBook } from '../storage/index.ts'
import { chapterPath, formatAnchor, sectionPath, type BookId } from '../structure/index.ts'
import BookInfo from './BookInfo.tsx'

afterEach(cleanup)

/**
 * The catalogue, held at arm's length.
 *
 * Only the Refresh button reaches it, and only the tests at the bottom of this
 * file press that button. Everything above runs against the real database with
 * this stub sitting unused.
 */
const catalogue = vi.hoisted(() => ({
  answer: async (): Promise<{ status: string; reason?: string }> => ({ status: 'unmatched' }),
}))

vi.mock('../catalogue/index.ts', () => ({
  catalogueDeps: () => ({}),
  refreshBook: () => catalogue.answer(),
}))

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
    expect(screen.getByRole('link', { name: 'Continue reading' })).toBeTruthy()
  })

  it('shows progress and offers to continue once reading has begun', async () => {
    await repository.saveParsedBook(bookOf())
    await repository.savePosition(BOOK_ID, formatAnchor({ chapter: 1, section: 1, paragraph: 1 }), 42)
    openInfo()

    expect(await screen.findByText('Reading · 42%')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue reading' })).toBeTruthy()
  })

  /*
   * The two states of this screen, and the one rule that binds them: the
   * chapter summaries are one door, so they appear in exactly one place.
   */
  describe('a book the reader has finished', () => {
    async function finish() {
      await repository.saveParsedBook(bookOf())
      await repository.savePosition(
        BOOK_ID,
        formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
        100,
      )
    }

    it('offers to start it again, and dates the finish', async () => {
      await finish()
      openInfo()

      expect(await screen.findByRole('button', { name: 'Start again' })).toBeTruthy()
      expect(screen.getByText(/^Finished · /)).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Continue reading' })).toBeNull()
    })

    it('moves the summaries into the recap slot and folds Veda’s block away', async () => {
      await finish()
      openInfo()

      expect(await screen.findByRole('link', { name: 'Read chapter summaries' })).toBeTruthy()
      // The block below is gone, so the same door is never on screen twice.
      expect(screen.queryByText('study companion')).toBeNull()
      expect(screen.queryByRole('link', { name: /Chapter summaries/ })).toBeNull()
    })

    it('puts the reader back at the first paragraph, keeping the book read', async () => {
      await finish()
      openInfo()

      fireEvent.click(await screen.findByRole('button', { name: 'Start again' }))

      await waitFor(async () => {
        expect((await repository.getPosition(BOOK_ID))?.percent).toBe(0)
      })
      // The position moved; it was not deleted. Reading a book twice does not
      // un-read it the first time.
      expect(await repository.getPosition(BOOK_ID)).toBeTruthy()
    })
  })

  it('sends an unfinished book to the summaries through Veda’s block', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    const study = await screen.findByRole('link', { name: /Chapter summaries/ })
    expect(study.getAttribute('href')).toContain(`/book/${BOOK_ID}/chapters`)
    expect(screen.getByRole('link', { name: 'Coming back to it' }).getAttribute('href')).toBe(
      `/book/${BOOK_ID}/last-time`,
    )
  })

  it('says a book is missing rather than showing a blank page', async () => {
    openInfo('does-not-exist')
    expect(await screen.findByText(/isn.t on your shelf/)).toBeTruthy()
  })

  it('sets a rating on tap, and clears it on a second tap of the same star', async () => {
    await repository.saveParsedBook(bookOf())
    openInfo()

    const overall = within(await screen.findByRole('group', { name: 'Your rating' }))
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

    const overall = within(await screen.findByRole('group', { name: 'Your rating' }))
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
      // One line, not three cells: genre, format, length and year together.
      expect(screen.getByText(/372 pp/)).toBeTruthy()
      expect(screen.getByText('Non-fiction')).toBeTruthy()
      expect(screen.getByText(/1995/)).toBeTruthy()
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

    it('lists the subject headings Google returned, cut into single terms', async () => {
      await repository.saveParsedBook(
        bookOf({ subjects: ['Philosophy / Buddhist', 'Religion / Eastern'] }),
      )
      openInfo()

      expect(await screen.findByText('Philosophy')).toBeTruthy()
      expect(screen.getByText('Buddhist')).toBeTruthy()
      expect(screen.getByText('Religion')).toBeTruthy()
      expect(screen.getByText('Eastern')).toBeTruthy()
      expect(screen.queryByText('Philosophy / Buddhist')).toBeNull()
    })

    it('says nothing about subjects when none survive the cut', async () => {
      await repository.saveParsedBook(bookOf({ subjects: ['General'] }))
      openInfo()

      expect(await screen.findByText('The Fundamental Wisdom')).toBeTruthy()
      expect(screen.queryByText('Subjects')).toBeNull()
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
    it('clamps the description, and opens it on Read more', async () => {
      await repository.saveParsedBook(bookOf({ description: 'A breathtaking contemporary epic.' }))
      openInfo()

      expect(await screen.findByText('A breathtaking contemporary epic.')).toBeTruthy()
      const toggle = screen.getByRole('button', { name: /Read more/ })
      expect(toggle.getAttribute('aria-expanded')).toBe('false')

      fireEvent.click(toggle)
      expect(screen.getByRole('button', { name: /Read less/ }).getAttribute('aria-expanded')).toBe(
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

  /**
   * The button that would not stop saying "Looking…".
   *
   * A lookup reports a network failure as a value rather than by throwing, so
   * the page only ever left `busy` when a value came back. Anything that threw
   * instead — an expired session, a failed save, a request to a server that
   * accepted the connection and then went quiet — left the button spinning for
   * ever, and nothing on the page ever said why.
   */
  describe('refreshing from Google Books', () => {
    afterEach(() => {
      catalogue.answer = async () => ({ status: 'unmatched' })
    })

    async function press() {
      await repository.saveParsedBook(bookOf())
      openInfo()
      await screen.findByText('The Fundamental Wisdom')
      fireEvent.click(screen.getByRole('button', { name: 'Refresh from Google Books' }))
    }

    it('comes back and says why when the lookup throws', async () => {
      catalogue.answer = async () => {
        throw new Error('you’re signed out')
      }
      await press()

      expect(await screen.findByText(/you’re signed out/)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Refresh from Google Books' })).toBeTruthy()
    })

    it('never leaves the button stuck, whatever was thrown', async () => {
      catalogue.answer = async () => {
        throw 'not even an error'
      }
      await press()

      // The words do not matter here. That the button is offered again does.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Refresh from Google Books' })).toBeTruthy()
      })
    })

    it('says so plainly when Google has no record', async () => {
      await press()
      expect(
        await screen.findByText(/Google Books has no record of this one\. Nothing/),
      ).toBeTruthy()
    })
  })
})
