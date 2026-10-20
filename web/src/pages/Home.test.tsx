// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../App.tsx'
import { forgetLibraryMemory, readLibraryMemory } from '../app/libraryMemory.ts'
import { forgetShelfMemory } from '../app/shelfMemory.ts'
import { forgetStreak } from '../app/readingStreak.ts'
import { forgetTabHistory } from '../app/tabHistory.ts'
import { forgetCovers } from '../app/useCovers.ts'
import { entryStore, noteStore, repository } from '../storage/index.ts'
import { dayKey, sessionStore } from '../stats/sessions.ts'
import { db } from '../storage/db.ts'
import type { BookId, BookMeta } from '../structure/index.ts'

function bookOf(id: string, title: string, author: string): BookMeta {
  return {
    id: id as BookId,
    title,
    author,
    source: 'epub',
    type: 'dense-technical',
    shelf: 'book',
    importedAt: `2026-08-0${id.length}T00:00:00.000Z`,
  }
}

const BOOKS: BookMeta[] = [
  bookOf('home-a', 'The Wind in the Willows', 'Kenneth Grahame'),
  bookOf('home-b', 'Breath', 'James Nestor'),
]

beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

beforeEach(async () => {
  // The caches are module-level by design — they have to outlive a component.
  // That makes clearing them between cases the test's job, or one case's shelf
  // would satisfy the next case's assertions without the code doing anything.
  forgetShelfMemory()
  forgetLibraryMemory()
  // The streak the top bar shows is module-level for the same reason, and left
  // over it would answer the next case's assertion without the door doing
  // anything.
  forgetStreak()
  forgetCovers()
  // The history memory is module-level for the same reason and with the same
  // hazard — left over, it reads a fresh render as a Back press and retraces a
  // move the previous test made.
  forgetTabHistory()
  for (const book of BOOKS) await repository.saveBook(book)
})

afterEach(async () => {
  cleanup()
  for (const book of BOOKS) await repository.deleteBook(book.id)
})

function swipe(dx: number) {
  const at = (fraction: number) => ({
    pointerId: 1,
    pointerType: 'touch' as const,
    clientX: 200 + dx * fraction,
    clientY: 300,
  })
  fireEvent.pointerDown(document, at(0))
  fireEvent.pointerMove(document, at(0.5))
  fireEvent.pointerMove(document, at(1))
  fireEvent.pointerUp(document, at(1))
}

/**
 * Queries scoped to the screen actually on show.
 *
 * Every screen the reader has visited stays mounted — that is the fix these
 * tests exist for, and it means a book's title is in the document twice once
 * both Home and the library have been opened. `screen.getByText` would find
 * both, so asking "is it on screen" now has to mean the visible one.
 */
function shown() {
  const active = document.querySelector<HTMLElement>('[data-active="true"]')
  if (!active) throw new Error('no screen is active')
  return within(active)
}

/** Waits for that screen to be the one on show, not merely present in the DOM. */
async function arrivedAt(text: string) {
  await waitFor(() => {
    expect(shown().getByText(text)).toBeDefined()
  })
}

describe('coming back to Home', () => {
  it('still has the books on it, with no reload in between', async () => {
    // The reader's report, as directly as it can be written down: "the covers
    // flash, it looks like the Home page is refreshing". One cause of several:
    // Home restarting at `loading` on every return, so for one read's worth of
    // time the shelf genuinely was empty and the word "Loading…" genuinely was
    // where the books had been.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByText('The Wind in the Willows')).toBeDefined()

    swipe(-150)
    await arrivedAt('Library')

    swipe(150)

    // Synchronously, on the very first render after coming back — not after a
    // `findBy` has waited for a fetch to answer. That distinction is the whole
    // fix: `findBy` would pass against the old code too, a moment later, which
    // is exactly the moment the reader was seeing.
    expect(shown().getByText('The Wind in the Willows')).toBeDefined()
    expect(shown().queryByText('Loading…')).toBeNull()
  })

  it('keeps showing the books while the background re-read is in flight', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Breath')).toBeDefined()

    swipe(-150)
    await arrivedAt('Library')
    swipe(150)

    // The re-read does still happen — the shelf is allowed to be a moment stale,
    // never permanently so. Nothing may blink while it runs.
    expect(shown().getByText('Breath')).toBeDefined()
    await waitFor(() => {
      expect(shown().getByText('Breath')).toBeDefined()
    })
  })

  it('opens the library with its books already on it, first visit of the session', async () => {
    // The reader's report: "the first time I go from home to all books I see
    // that refresh flash, and then back to home and again to all books and I
    // don't see it." The first visit was the one that still flashed, because
    // the library began every mount at "Loading…" and only a warm database was
    // hiding it on later visits.
    //
    // Home warms the library's data in idle time, so by the time a swipe can
    // reach it the answer is already waiting.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Breath')).toBeDefined()

    // The warm is deliberately deferred to an idle moment — this is that moment
    // arriving, not the test reaching past the code to make it pass.
    await waitFor(() => {
      expect(readLibraryMemory()).not.toBeNull()
    })

    swipe(-150)

    // Synchronously, on the library's first frame. `findBy` would pass against
    // the old code a moment later, which is exactly the moment being complained
    // about.
    expect(shown().getByRole('heading', { name: 'Library' })).toBeDefined()
    expect(shown().getByText('The Wind in the Willows')).toBeDefined()
    expect(shown().queryByText('Loading…')).toBeNull()
  })

  it('comes back to the very same DOM, not a rebuilt copy of it', async () => {
    /*
     * The root cause, asserted directly — and the one thing three rounds of
     * caching could not reach.
     *
     * The shelf used to be keyed on the path, so every tab change destroyed the
     * screen and built a new one. The caches made the *data* instant, but every
     * `<img>` was still a brand-new element the browser had to decode again
     * before it could paint, and that decode is asynchronous: a frame of empty
     * boxes where the covers were, on every single return. Which is the report,
     * every time — "the covers flash, it looks like the page is refreshing".
     *
     * Element identity is the whole test. If this node is the same object it was
     * before the round trip, nothing was torn down, nothing is re-decoded, and
     * there is nothing left that could flash.
     */
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    const tile = await screen.findByText('The Wind in the Willows')

    swipe(-150)
    await arrivedAt('Library')
    swipe(150)

    expect(shown().getByText('The Wind in the Willows')).toBe(tile)
  })

  it('leaves the library’s floating “+” behind when the reader leaves the library', async () => {
    // Kept-alive screens hide their own DOM, but a portal is a child of <body>
    // and knows nothing about the wrapper it was written inside. Without the
    // check in `Portal`, the library's "+" would follow the reader onto Home.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await screen.findByText('The Wind in the Willows')

    swipe(-150)
    expect(await screen.findByLabelText('Add to your library')).toBeDefined()

    swipe(150)
    await waitFor(() => {
      expect(screen.queryByLabelText('Add to your library')).toBeNull()
    })
  })

  it('picks up a book removed while the reader was elsewhere', async () => {
    // The other side of the bargain, and the one keeping screens alive puts at
    // risk: a shelf that never refreshes would be a worse bug than the flash it
    // replaced. Mounting is no longer the same event as arriving, so arriving is
    // what the re-read hangs off now — see `app/screenActive.tsx`.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Breath')).toBeDefined()

    swipe(-150)
    await arrivedAt('Library')
    await repository.deleteBook(BOOKS[1]!.id)
    swipe(150)

    await waitFor(() => {
      expect(shown().queryByText('Breath')).toBeNull()
    })
    expect(shown().getByText('The Wind in the Willows')).toBeDefined()
  })
})

describe('the two halves', () => {
  it('opens with both doors, and neither folded', async () => {
    // The settled rule, asserted: an even split at every hour. The app does not
    // guess which half the reader came for.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: 'Open the reading half' })).toBeDefined()
    expect(shown().getByRole('button', { name: 'Open the journal half' })).toBeDefined()
    // Neither half is open, so neither offers to close.
    expect(shown().queryByRole('button', { name: 'Close the reading half' })).toBeNull()
    // The words "inhale" and "exhale" are gone: the idea is in the materials
    // and the two breath marks now.
    expect(shown().queryByText(/Inhale|Exhale/)).toBeNull()
  })

  it('folds the other half to a lip, and the lip brings it back', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    const surface = await screen.findByRole('button', { name: 'Open the reading half' })
    fireEvent.click(surface)

    // The journal is now a lip: it still reports, but it has no face.
    expect(shown().queryByRole('button', { name: 'Open the journal half' })).toBeNull()
    const lip = shown().getByRole('button', { name: /Journal/ })

    fireEvent.click(lip)
    expect(shown().getByRole('button', { name: 'Open the journal half' })).toBeDefined()
  })

  it('shows the shelf when there is no book on the go', async () => {
    // Neither fixture has a position, so there is nothing to resume. The door
    // must not presume a page — it shows the shelf in the face instead.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Nothing on the go')).toBeDefined()
    expect(shown().getByText('The Wind in the Willows')).toBeDefined()
    expect(shown().queryByText(/^Resume/)).toBeNull()
  })

  it('counts the library and the archive in each footer', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Library \(2\)/)).toBeDefined()
    expect(shown().getByText(/Archive \(0\)/)).toBeDefined()
  })
})

describe('what the journal half remembers', () => {
  it('names the last entry and counts the archive', async () => {
    const first = await entryStore.addEntry({
      raw: 'The bit about solitude landed harder than I expected.',
      at: new Date('2026-10-18T19:04:00.000Z'),
    })
    const second = await entryStore.addEntry({
      raw: 'Rough morning. Wrote it out and felt lighter.',
      at: new Date('2026-10-18T13:20:00.000Z'),
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    // The newest, whichever day it was written on. The journal remembers the
    // reader even on a day they have not written yet.
    expect(
      await screen.findByText('“The bit about solitude landed harder than I expected.”'),
    ).toBeDefined()
    expect(shown().getByText(/Archive \(2\)/)).toBeDefined()

    await entryStore.deleteEntry(first.id)
    await entryStore.deleteEntry(second.id)
  })
})

describe('how the day is going', () => {
  /**
   * A session of `minutes`, `daysAgo` days back.
   *
   * Anchored at midday, not at `new Date()`. `minutesByDay` spreads a sitting
   * over the days its clock actually crossed, so a fixture built from "now"
   * puts half the minutes on tomorrow whenever the suite runs near midnight.
   */
  async function read(minutes: number, daysAgo: number) {
    const now = new Date()
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12, 0, 0)
    await sessionStore.put({
      id: `s-${daysAgo}`,
      bookId: BOOKS[0]!.id,
      day: dayKey(at),
      startedAt: at.getTime(),
      endedAt: at.getTime() + minutes * 60_000,
      activeMs: minutes * 60_000,
    })
  }

  afterEach(async () => {
    await db.sessions.clear()
  })

  it('counts today against the two hours, and the days behind it', async () => {
    // The same two numbers the Statistics screen prints, from the same two
    // functions. A second copy of either could disagree with it.
    await read(45, 0)
    await read(70, 1)
    await read(30, 2)

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByText('45m / 2h')).toBeDefined()
    // The run of days is in the top bar, not in the half. The bar is outside
    // the screen, so `shown()` must not be able to see it.
    expect(await screen.findByText('3 days')).toBeDefined()
    expect(shown().queryByText('3 days')).toBeNull()
  })

  it('takes the streak out of the bar while the journal is open', async () => {
    // A reading streak over a page about writing counts the wrong thing, and
    // the journal has no streak of its own on purpose.
    await read(45, 0)
    await read(70, 1)

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    // The bar can carry the streak before the door has painted: it is one
    // read, and the shelf is another. Wait for the half itself.
    const journal = await shown().findByRole('button', { name: 'Open the journal half' })
    expect(await screen.findByText('2 days')).toBeDefined()

    fireEvent.click(journal)
    await waitFor(() => {
      expect(screen.queryByText('2 days')).toBeNull()
    })

    // Back to even, and it is back.
    fireEvent.click(shown().getByRole('button', { name: 'Close the journal half' }))
    expect(await screen.findByText('2 days')).toBeDefined()
  })

  it('says nothing about a streak there is not one of', async () => {
    // A gap before yesterday is no streak, and an empty badge would be worse
    // than none. Nothing read at all, so nothing to count back from.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await screen.findByText('0m / 2h')
    expect(screen.queryByText(/^\d+ days?$/)).toBeNull()
  })
})

describe('the question on the journal half', () => {
  it('opens the writer with the question still on screen', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    // Whichever question the hour chose — the test must not pin the words, or
    // it would fail every six hours.
    const label = await screen.findByText(/prompt$|^Late$/i)
    const question = label.parentElement?.querySelector('button')
    expect(question).not.toBeNull()
    const words = question!.textContent ?? ''
    expect(words.endsWith('?')).toBe(true)

    fireEvent.click(question!)

    const sheet = await screen.findByRole('dialog', { name: 'Speak a thought' })
    expect(within(sheet).getByText(words)).toBeDefined()
  })

  it('opens the writer from the circle as well', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Speak an entry' }))
    expect(await screen.findByRole('dialog', { name: 'Speak a thought' })).toBeDefined()
  })
})

describe('the bridge on the seam', () => {
  it('carries the last mark into a new entry', async () => {
    await repository.savePosition(
      BOOKS[0]!.id,
      { chapter: 0, block: 0 } as never,
      40,
      '2026-10-18T09:00:00.000Z',
    )
    await noteStore.addNote(BOOKS[0]!.id, {
      anchor: { chapter: 1, block: 2 } as never,
      author: 'you',
      text: '',
      quote: 'Self-knowledge is an adventure.',
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    const bridge = await screen.findByRole('button', { name: /your last mark/ })
    fireEvent.click(bridge)

    // The sheet knows it came from a book, so it is the Scribe being told
    // something — and the passage is on it.
    const sheet = await screen.findByRole('dialog', { name: 'Tell the Scribe' })
    expect(within(sheet).getByText('Self-knowledge is an adventure.')).toBeDefined()
  })

  it('is not there when nothing has been marked', async () => {
    await repository.savePosition(
      BOOKS[0]!.id,
      { chapter: 0, block: 0 } as never,
      40,
      '2026-10-18T09:00:00.000Z',
    )
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await screen.findByText('The Wind in the Willows')
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /your last mark/ })).toBeNull()
    })
  })
})

describe('opening the app', () => {
  /*
   * The launch case, which every other test here starts past.
   *
   * The reader's report survived the rebuild fix and came back narrowed: "when
   * I open the app I see the refresh on the home screen". Nothing is being
   * rebuilt any more at launch — there is nothing yet to rebuild. What was left
   * is that the very first paint of a session is the one visit where no earlier
   * screen has warmed anything, so Home used to appear in three stages: empty,
   * then a shelf of coloured placeholder letters, then the real artwork. Two
   * swaps in the space of a blink, on the screen the reader is looking at.
   *
   * These two cases pin the fix: nothing appears before it is finished.
   */
  beforeEach(() => {
    // jsdom has no object URLs. The `blob:` prefix is what the assertions read,
    // and a counter keeps each one distinct as the real thing would.
    let n = 0
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: () => `blob:test/${++n}`,
      revokeObjectURL: () => {},
    }))
  })

  it('shows the shelf with its real covers already on it, never placeholders first', async () => {
    await repository.saveAssets(BOOKS[0]!.id, [
      { path: '__cover__', data: new Blob(['art'], { type: 'image/png' }) },
    ])

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    const title = await screen.findByText('The Wind in the Willows')

    // Synchronously, in the same frame the title first appears. A `waitFor`
    // here would pass against the old code a moment later — and that moment is
    // precisely what the reader was seeing.
    const tile = title.closest('div')?.parentElement ?? document.body
    expect(tile.querySelector('img[src^="blob:"]')).not.toBeNull()

    await repository.saveAssets(BOOKS[0]!.id, [])
  })

  it('shows nothing rather than the word Loading while it waits', async () => {
    // Empty space for a frame is invisible; a word that appears and is replaced
    // is indistinguishable from a reload.
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.queryByText('Loading…')).toBeNull()
    expect(await screen.findByText('Breath')).toBeDefined()
  })
})

/**
 * The Current Reading hero, which is the one book the front door is about.
 *
 * The trajectory itself is arithmetic and is tested without a DOM in
 * `stats/trajectory.test.ts`. What is checked here is the wiring: that the
 * strip appears, that it says something honest when there is nothing to
 * forecast from, and that the fore edge is drawn only where it belongs.
 */
describe('the shelves the fold frees', () => {
  /** Puts a book in hand, then opens the reading half. */
  async function openReading() {
    await repository.savePosition(
      BOOKS[0]!.id,
      { chapter: 0, block: 0 } as never,
      28,
      '2026-08-30T09:00:00.000Z',
    )
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Open the reading half' }))
  }

  it('keeps the shelf off the even door, and names it on the open one', async () => {
    // Reported 2026-10-20. The even door shows the one book in hand. The shelf
    // is what the fold pays for, and it says what it holds.
    await repository.savePosition(
      BOOKS[1]!.id,
      { chapter: 0, block: 0 } as never,
      19,
      '2026-08-29T09:00:00.000Z',
    )
    await repository.savePosition(
      BOOKS[0]!.id,
      { chapter: 0, block: 0 } as never,
      28,
      '2026-08-30T09:00:00.000Z',
    )
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await screen.findByText('The Wind in the Willows')
    expect(shown().queryByRole('heading', { name: 'Also reading' })).toBeNull()

    fireEvent.click(shown().getByRole('button', { name: 'Open the reading half' }))
    expect(shown().getByRole('heading', { name: 'Also reading' })).toBeDefined()
    expect(shown().getByText('19% read')).toBeDefined()
  })

  it('leaves the unopened books to the Library, and prints no shelf for them', async () => {
    // Reported 2026-10-20: only the books already in progress belong here.
    // Every unopened book is one tap away in the footer, where search and
    // filters are, so a second shelf of them on the door earned nothing.
    await openReading()

    expect(shown().queryByRole('heading', { name: 'Up next' })).toBeNull()
    // Breath was never opened, so it is nowhere on the door.
    expect(shown().queryByText('Breath')).toBeNull()
    expect(shown().getByRole('link', { name: /Library \(2\)/ })).toBeDefined()
    // Nothing else is in progress either, so no shelf at all.
    expect(shown().queryByRole('heading', { name: 'Also reading' })).toBeNull()
  })
})

describe('the book in hand', () => {
  async function openHomeReading(percent: number) {
    await repository.savePosition(
      BOOKS[0]!.id,
      { chapter: 0, block: 0 } as never,
      percent,
      '2026-08-30T09:00:00.000Z',
    )
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await screen.findByText('The Wind in the Willows')
  }

  it('offers the one route the cover does not already give you', async () => {
    await openHomeReading(28)

    const summaries = await shown().findByRole('link', { name: 'Chapter summaries' })
    expect(summaries.getAttribute('href')).toBe('/book/home-a/chapters')

    // No "Continue reading" button. The cover and the title are both already
    // links to the book, so a third one taught the reader that the buttons on
    // this card are decoration.
    expect(shown().queryByRole('link', { name: 'Continue reading' })).toBeNull()
    // Filtered rather than matched by name: the ⓘ button is labelled "About The
    // Wind in the Willows", so a loose name matches two links.
    const toBook = shown()
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/book/home-a')
    expect(toBook.length).toBeGreaterThan(0)
  })

  it('says so plainly when it cannot forecast a finish yet', async () => {
    // No sessions were ever recorded against this book, so `trajectoryOf` has
    // nothing to divide by. The strip must not print a date it would take back.
    await openHomeReading(28)

    expect(
      await shown().findByText('Still learning how fast you read this one.'),
    ).toBeDefined()
  })

  it('names the author under the title, and on the shelf', async () => {
    await repository.savePosition(
      BOOKS[1]!.id,
      { chapter: 0, block: 0 } as never,
      19,
      '2026-08-29T09:00:00.000Z',
    )
    await openHomeReading(28)

    expect(await shown().findByText('Kenneth Grahame')).toBeDefined()
    // The shelf is behind the fold, so the second author arrives with it.
    expect(shown().queryByText('James Nestor')).toBeNull()
    fireEvent.click(shown().getByRole('button', { name: 'Open the reading half' }))
    expect(await shown().findByText('James Nestor')).toBeDefined()
  })

  it('names the book once, and does not repeat it on the button', async () => {
    // Reported 2026-10-19: "Keep the Title, I don't need to see Resume + Book
    // name." The title is directly above the button and the cover is beside
    // it, so naming the book a third time said nothing.
    await openHomeReading(28)

    expect(await shown().findByRole('link', { name: 'Continue reading →' })).toBeDefined()
    expect(shown().queryByText(/^Resume/)).toBeNull()
  })

  it('does not repeat the marked passage under the title', async () => {
    // The passage is on the bridge, and on the bridge only. It used to be in
    // both places, which is half of why the bridge looked like it was covering
    // something.
    await noteStore.addNote(BOOKS[0]!.id, {
      anchor: { chapter: 1, block: 2 } as never,
      author: 'you',
      text: '',
      quote: 'The symbol is a living thing.',
    })
    await openHomeReading(28)

    const shows = await shown().findAllByText('“The symbol is a living thing.”')
    expect(shows.length).toBe(1)
    expect(shows[0]!.closest('button')?.textContent).toContain('Write about your last mark')
  })

  it('draws the percent above the title, and the shelf says its own in words', async () => {
    // The book in hand has a figure and a bar. "Where you stopped" is gone:
    // four words that the bar says on its own. Reported 2026-10-20. Every
    // other book on the shelf has only the number to say it with.
    await repository.savePosition(
      BOOKS[1]!.id,
      { chapter: 0, block: 0 } as never,
      7,
      '2026-08-29T09:00:00.000Z',
    )
    await openHomeReading(28)

    expect(await shown().findByText('28% complete')).toBeDefined()
    expect(shown().queryByText(/where you stopped/i)).toBeNull()
    expect(shown().getByRole('img', { name: '28% read' })).toBeDefined()
    // The shelf is what the fold frees room for, so it is not in the face yet.
    expect(shown().queryByText('7% read')).toBeNull()

    fireEvent.click(shown().getByRole('button', { name: 'Open the reading half' }))
    expect(await shown().findByText('7% read')).toBeDefined()
  })
})
