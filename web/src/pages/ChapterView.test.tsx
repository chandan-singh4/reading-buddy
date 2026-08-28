// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../App.tsx'
import { approve } from '../summary/engine.ts'

/*
 * The engine is mocked for the watching tests below, and only there.
 *
 * Everything it does — the relay, the two prompts, the stores — is tested in
 * `engine.test.ts` against its own fakes. What this file has to prove is what
 * the reader sees while it runs, and that needs a call whose timing the test
 * controls rather than a real one.
 */
vi.mock('../summary/engine.ts', async (real) => ({
  ...(await real<typeof import('../summary/engine.ts')>()),
  approve: vi.fn(),
}))
import { repository } from '../storage/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import { forgetModels, rememberRoster, storedSummaryPick } from '../reader/models.ts'
import { setSummaryData } from '../summary/dataSource.ts'
import { fixtureDataSource } from '../summary/fixture.ts'

/*
 * The page is reached by book *id* but reads its summaries by book *title*, so
 * a real book has to exist in storage for it to find anything. That lookup is
 * the one seam worth guarding: get it wrong and the page silently shows an
 * empty chapter list rather than failing.
 */

const JUNG = 'jung-mdr' as BookId
const OTHER = 'nothing-summarised' as BookId

function bookOf(id: BookId, title: string): BookMeta {
  return {
    id,
    title,
    author: 'C. G. Jung',
    source: 'epub',
    type: 'dense-technical',
    shelf: 'book',
    importedAt: '2026-08-27T00:00:00.000Z',
  }
}

beforeEach(async () => {
  // The data source is module-level by design — it has to outlive a component.
  // Any case that swaps it must therefore hand it back, or the next case
  // inherits it.
  setSummaryData(fixtureDataSource)
  await repository.saveBook(bookOf(JUNG, 'Memories, Dreams, Reflections'))
  await repository.saveBook(bookOf(OTHER, 'A Book Nobody Summarised'))
})

afterEach(() => {
  cleanup()
  // The roster and the picks live in localStorage, which outlives a render.
  forgetModels()
  localStorage.clear()
})

function open(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('the chapter summary page', () => {
  it('shows both sections, and the tags under the first one', async () => {
    open(`/book/${JUNG}/chapters?chapter=4`)

    // The heading comes straight from the URL and is on screen at once; both
    // summaries arrive a tick later, so they are what the wait is for.
    expect(await screen.findByRole('heading', { name: 'Chapter 4' })).toBeTruthy()
    expect(await screen.findByText('On the function of dreams')).toBeTruthy()

    expect(screen.getByText('The chapter, in plain words')).toBeTruthy()
    expect(screen.getByText(/star example/)).toBeTruthy()

    expect(screen.getByText('What we worked through')).toBeTruthy()
    expect(screen.getByText(/storage-closet analogy/)).toBeTruthy()

    expect(screen.getByText('dreams')).toBeTruthy()
  })

  it('does not make a tag a link', async () => {
    // A tag says what the chapter is about. There is no page behind it, and a
    // tappable chip would promise one.
    open(`/book/${JUNG}/chapters?chapter=4`)
    const tag = await screen.findByText('alchemy')
    expect(tag.closest('a')).toBeNull()
  })

  it('opens on the first chapter with something in it, not on chapter 1', async () => {
    // What the reader sees when they arrive from the button on their book's
    // details page. Chapters 1 to 3 have no summary; landing on one of them
    // would show an empty page and read as a broken feature.
    open(`/book/${JUNG}/chapters`)
    expect(await screen.findByRole('heading', { name: 'Chapter 4' })).toBeTruthy()
  })

  it('still lists the unsummarised chapters in the rail', async () => {
    // The reader needs to see the whole book, not only the done parts.
    open(`/book/${JUNG}/chapters`)
    expect(await screen.findByRole('button', { name: '1 · First Years' })).toBeTruthy()
  })

  it('switches chapters when the rail is tapped', async () => {
    open(`/book/${JUNG}/chapters?chapter=4`)
    // The rail is filled from the chapter list, which lands after the first
    // paint — so wait for the rail itself, not for the heading.
    fireEvent.click(await screen.findByRole('button', { name: '6 · The Tower' }))

    expect(await screen.findByRole('heading', { name: 'Chapter 6' })).toBeTruthy()
    expect(screen.getByText(/has no summary yet/)).toBeTruthy()
  })

  it('says so plainly for a book with nothing summarised at all', async () => {
    /*
     * The fixture answers with its sample chapters for every book, so a source
     * that genuinely knows nothing has to be installed to reach this state.
     * It is worth reaching, and it is a *different* fact from "not summarised
     * yet": the book itself is not on this device. The two used to share one
     * sentence, so a reader met "it appears here once you have read it" for a
     * book they had finished, and the only clue was an empty chapter strip.
     */
    setSummaryData({
      ...fixtureDataSource,
      async getChapterList() {
        return []
      },
      async getChapter() {
        return undefined
      },
    })

    open(`/book/${OTHER}/chapters`)
    expect(await screen.findByText(/no chapters saved on this device/)).toBeTruthy()
    // And it must not blame the reader for not having finished it.
    expect(screen.queryByText(/once you have finished reading it/)).toBeNull()
  })

  it('renders emphasis in a summary as emphasis', async () => {
    open(`/book/${JUNG}/chapters?chapter=4`)
    const word = await screen.findByText('forward')
    expect(word.tagName).toBe('EM')
  })
})

describe('a chapter the reader is still inside', () => {
  /*
   * The screen the reader kept sending back. PART 1 of Man and His Symbols has
   * six named parts and they were four parts in. The chapter is not finished,
   * so it has no recap and the page said "it appears here once you have
   * finished reading it" — with nothing to do about the three parts they had
   * genuinely read.
   */
  const PART1 = 'part-one' as BookId

  beforeEach(async () => {
    await repository.saveBook(bookOf(PART1, 'Man and His Symbols'))
    await repository.saveChapterIndex(PART1, {
      chapter: 6,
      title: 'PART 1 APPROACHING THE UNCONSCIOUS',
      path: 'ch06' as never,
      sections: [
        'The importance of dreams',
        'Past and future in the unconscious',
        'The function of dreams',
        'The analysis of dreams',
      ].map((title, index) => ({
        section: index + 1,
        title,
        path: `ch06-s0${index + 1}` as never,
      })),
    })
    await repository.savePosition(PART1, '[ch06-s04-p012]' as never)
    setSummaryData({
      ...fixtureDataSource,
      async getChapterList() {
        return [{ chapter: 6, chapterTitle: 'PART 1', distilled: false }]
      },
      async getChapter() {
        return undefined
      },
    })
  })

  it('puts every named part in the rail, read or not', async () => {
    open(`/book/${PART1}/chapters?chapter=6`)

    // The row is built from the chapter's own parts, so it is filled from the
    // first moment — not only after a part has been summarised.
    expect(await screen.findByRole('button', { name: 'The importance of dreams' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'The function of dreams' })).toBeTruthy()
    // Including the part still in hand. It gets a tab that says to come back.
    expect(screen.getByRole('button', { name: 'The analysis of dreams' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'The whole chapter' })).toBeTruthy()
  })

  it('offers the call on a part the reader has finished', async () => {
    open(`/book/${PART1}/chapters?chapter=6`)
    fireEvent.click(await screen.findByRole('button', { name: 'The importance of dreams' }))

    expect(await screen.findByText(/You have finished this part/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Summarise this part' })).toBeTruthy()
  })

  it('says why a part the reader is still inside is empty, and offers nothing', async () => {
    // Being on the last page of a part is not having finished it. The tab is
    // still there — a reader has to see the shape of the chapter — but the
    // page under it explains itself rather than selling a call.
    open(`/book/${PART1}/chapters?chapter=6`)
    fireEvent.click(await screen.findByRole('button', { name: 'The analysis of dreams' }))

    expect(await screen.findByText(/comes when you finish reading it/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Summarise this part' })).toBeNull()
  })

  it('shows the model working, on the part that was pressed', async () => {
    // The reader watched a button go quiet for half a minute and could not
    // tell a slow model from a broken app. The dots are the answer.
    open(`/book/${PART1}/chapters?chapter=6`)
    fireEvent.click(await screen.findByRole('button', { name: 'The importance of dreams' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Summarise this part' }))

    expect(await screen.findByLabelText('Veda is reading the chapter')).toBeTruthy()
  })

  it('does not blame the reader for a chapter they are working through', async () => {
    open(`/book/${PART1}/chapters?chapter=6`)

    await screen.findByRole('button', { name: 'The importance of dreams' })
    expect(screen.queryByText(/once you have finished reading it/)).toBeNull()
  })
})

describe('the second row of the rail', () => {
  const WITH_PARTS = 'with-parts' as BookId

  beforeEach(async () => {
    await repository.saveBook(bookOf(WITH_PARTS, 'A Book With Parts'))
    setSummaryData({
      ...fixtureDataSource,
      async getChapterList() {
        return [
          { chapter: 1, chapterTitle: 'First', distilled: true },
          { chapter: 2, chapterTitle: 'Second', distilled: false },
        ]
      },
      async getChapter() {
        return {
          book: 'A Book With Parts',
          chapter: 1,
          chapterTitle: 'First',
          recapText: 'The whole chapter, in one paragraph.',
          tags: [],
          sections: [
            { section: 1, title: 'The importance of dreams', recapText: 'Part one.', tags: [] },
            { section: 2, title: 'The function of dreams', recapText: 'Part two.', tags: [] },
          ],
        }
      },
    })
  })

  it('lists the parts, with a way back to the whole chapter', async () => {
    open(`/book/${WITH_PARTS}/chapters?chapter=1`)

    expect(await screen.findByRole('button', { name: 'The importance of dreams' })).toBeTruthy()
    // Without this row a reader who opens a part has no way back to the recap.
    expect(screen.getByRole('button', { name: 'The whole chapter' })).toBeTruthy()
    // The chapter recap is what shows until a part is picked.
    expect(screen.getByText('The whole chapter, in one paragraph.')).toBeTruthy()
  })

  it('opens one part on its own when it is picked', async () => {
    open(`/book/${WITH_PARTS}/chapters?chapter=1`)

    fireEvent.click(await screen.findByRole('button', { name: 'The function of dreams' }))

    expect(await screen.findByText('Part two.')).toBeTruthy()
    // One part at a time, exactly as one chapter at a time.
    expect(screen.queryByText('Part one.')).toBeNull()
    expect(screen.queryByText('The whole chapter, in one paragraph.')).toBeNull()
  })

  it('drops the part when the reader moves to another chapter', async () => {
    // Part 2 of chapter 1 means nothing in chapter 2. Carrying the number over
    // would land the reader on a stranger's third part.
    open(`/book/${WITH_PARTS}/chapters?chapter=1`)
    fireEvent.click(await screen.findByRole('button', { name: 'The function of dreams' }))
    fireEvent.click(screen.getByRole('button', { name: '2 · Second' }))

    expect(await screen.findByText('The whole chapter, in one paragraph.')).toBeTruthy()
  })
})

describe('choosing the model that writes a summary', () => {
  /*
   * A summary is a paid call, and the reader asked to say who writes it where
   * they spend it — not in a screen two taps away. The button opens the lamp's
   * own picker, and the picker starts the work.
   */
  const PART1 = 'part-one' as BookId

  function roster() {
    return [
      { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', description: '', contextLength: 128_000, source: 'gemini' as const },
      { id: 'x/big', name: 'Big Model', description: '', contextLength: 128_000, source: 'openrouter' as const },
    ]
  }

  beforeEach(async () => {
    await repository.saveBook(bookOf(PART1, 'Man and His Symbols'))
    await repository.saveChapterIndex(PART1, {
      chapter: 6,
      title: 'PART 1 APPROACHING THE UNCONSCIOUS',
      path: 'ch06' as never,
      sections: ['The importance of dreams', 'Past and future in the unconscious'].map(
        (title, index) => ({
          section: index + 1,
          title,
          path: `ch06-s0${index + 1}` as never,
        }),
      ),
    })
    await repository.savePosition(PART1, '[ch06-s02-p012]' as never)
    setSummaryData({
      ...fixtureDataSource,
      async getChapterList() {
        return [{ chapter: 6, chapterTitle: 'PART 1', distilled: false }]
      },
      async getChapter() {
        return undefined
      },
    })
  })

  it('opens the picker before it spends the call', async () => {
    rememberRoster(roster())
    open(`/book/${PART1}/chapters?chapter=6`)
    fireEvent.click(await screen.findByRole('button', { name: 'The importance of dreams' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Summarise this part' }))

    // The lamp's own picker, so the three columns are already familiar.
    expect(await screen.findByText('Which model answers')).toBeTruthy()
    expect(screen.getByText('Google')).toBeTruthy()
    expect(screen.getByText('OpenRouter')).toBeTruthy()
  })

  it('remembers the pick, so Settings and the sheet agree', async () => {
    rememberRoster(roster())
    open(`/book/${PART1}/chapters?chapter=6`)
    fireEvent.click(await screen.findByRole('button', { name: 'The importance of dreams' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Summarise this part' }))
    fireEvent.click(await screen.findByRole('button', { name: /Big Model/ }))

    expect(storedSummaryPick()).toBe('x/big')
    // And the call starts on the way out of the sheet.
    expect(await screen.findByLabelText('Veda is reading the chapter')).toBeTruthy()
  })

  it('spends the call straight away when there is no roster to pick from', async () => {
    // A reader who has never opened the lamp has no models. An empty sheet
    // would be a button that appears to do nothing.
    open(`/book/${PART1}/chapters?chapter=6`)
    fireEvent.click(await screen.findByRole('button', { name: 'The importance of dreams' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Summarise this part' }))

    expect(await screen.findByLabelText('Veda is reading the chapter')).toBeTruthy()
    expect(screen.queryByText('Which model answers')).toBeNull()
  })
})

describe('leaving the chapter page', () => {
  /*
   * The back gesture would not let the reader go.
   *
   * The way out was a pushed link, so the page they came from sat in the
   * history twice with the chapter page between them. One back swipe returned
   * to the chapters, the next returned to the page they had just left, and
   * round again. Leaving now replaces, so there is one step out and it is out.
   *
   * Measured in real history entries rather than in rendered pages, because
   * the fault was never visible on screen — both routes rendered correctly.
   */
  it('does not leave itself in the history behind the reader', async () => {
    const exit = `/book/${JUNG}/info`
    window.history.pushState({}, '', '/library')
    window.history.pushState({}, '', exit)
    window.history.pushState(
      {},
      '',
      `/book/${JUNG}/chapters?chapter=4&from=${encodeURIComponent(exit)}`,
    )
    const depth = window.history.length

    render(
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>,
    )
    fireEvent.click(await screen.findByRole('link', { name: /Book details/ }))

    await waitFor(() => expect(window.location.pathname).toBe(exit))
    // The chapter page stood aside rather than stacking on top of the exit.
    expect(window.history.length).toBe(depth)
  })
})

describe('watching a summary being written', () => {
  const WATCHED = 'watched-book' as BookId

  /** A summary that already exists, so Redo has something to protect. */
  const written = {
    book: 'A Watched Book',
    chapter: 1,
    chapterTitle: 'First',
    recapText: 'The summary you already had.',
    tags: [],
    qaText: 'What you and Veda worked through.',
  }

  beforeEach(async () => {
    vi.mocked(approve).mockReset()
    await repository.saveBook(bookOf(WATCHED, 'A Watched Book'))
    setSummaryData({
      ...fixtureDataSource,
      async getChapterList() {
        return [
          { chapter: 1, chapterTitle: 'First', distilled: true },
          { chapter: 2, chapterTitle: 'Second', distilled: false },
        ]
      },
      async getChapter() {
        return written
      },
    })
  })

  it('shows the dots first, then the words as they arrive', async () => {
    let write: ((soFar: string) => void) | undefined
    vi.mocked(approve).mockImplementation(async (_book, _chapter, _part, watch) => {
      write = watch?.onWriting
      // Never settles: the point of this case is the middle of the call.
      await new Promise(() => {})
    })

    open(`/book/${WATCHED}/chapters?chapter=1`)
    fireEvent.click(await screen.findByRole('button', { name: 'Redo the chapter summary' }))

    // A model may think for ten seconds before its first word.
    expect(await screen.findByLabelText('Veda is reading the chapter')).toBeTruthy()

    act(() => write?.('Jung reads'))
    expect(await screen.findByText(/Jung reads/)).toBeTruthy()
    act(() => write?.('Jung reads a dream as a letter.'))
    expect(await screen.findByText(/a letter/)).toBeTruthy()
  })

  it('asks which model, then rewrites', async () => {
    rememberRoster([
      {
        id: 'x/big',
        name: 'Big Model',
        description: '',
        contextLength: 128_000,
        source: 'openrouter' as const,
      },
    ])
    vi.mocked(approve).mockResolvedValue(undefined)

    open(`/book/${WATCHED}/chapters?chapter=1`)
    fireEvent.click(await screen.findByRole('button', { name: 'Redo the chapter summary' }))
    fireEvent.click(await screen.findByRole('button', { name: /Big Model/ }))

    await waitFor(() => expect(vi.mocked(approve)).toHaveBeenCalled())
    // `force`, or the engine would answer "nothing has changed" and do nothing.
    const [, , , watch] = vi.mocked(approve).mock.calls[0]
    expect(watch?.force).toBe(true)
  })

  it('keeps the summary the reader had when the model does not answer', async () => {
    vi.mocked(approve).mockRejectedValue(new Error('the model did not send readable JSON'))

    open(`/book/${WATCHED}/chapters?chapter=1`)
    expect(await screen.findByText('The summary you already had.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Redo the chapter summary' }))

    // The reason is shown as it came, not flattened to "did not answer".
    expect(await screen.findByText(/The model did not send readable JSON/)).toBeTruthy()
    // The words the reader had are still the words on the page.
    expect(screen.getByText('The summary you already had.')).toBeTruthy()
  })

  it('copies the summary', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    open(`/book/${WATCHED}/chapters?chapter=1`)
    fireEvent.click(await screen.findByRole('button', { name: 'Copy the chapter summary' }))

    expect(writeText).toHaveBeenCalledWith('The summary you already had.')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('writes the recap in its own place and leaves the other half standing', async () => {
    // The two halves are two jobs. A redo of the chapter recap must not blank
    // the conversation summary, which nothing is rewriting.
    vi.mocked(approve).mockImplementation(async () => {
      await new Promise(() => {})
    })

    open(`/book/${WATCHED}/chapters?chapter=1`)
    expect(await screen.findByText('What you and Veda worked through.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Redo the chapter summary' }))

    await screen.findByLabelText('Veda is reading the chapter')
    // The old recap is gone; the conversation summary below it stays.
    expect(screen.queryByText('The summary you already had.')).toBeNull()
    expect(screen.getByText('What we worked through')).toBeTruthy()
    expect(screen.getByText('What you and Veda worked through.')).toBeTruthy()
  })

  it('rewrites the conversation summary on its own, keeping the recap', async () => {
    /*
     * Two prompts, two jobs, two buttons. The Librarian reads the chapter and
     * the Scribe reads the conversation about it; wanting one written again is
     * not wanting both, and paying for both to get one is money for an answer
     * nobody asked for.
     */
    vi.mocked(approve).mockImplementation(async () => {
      await new Promise(() => {})
    })

    open(`/book/${WATCHED}/chapters?chapter=1`)
    fireEvent.click(await screen.findByRole('button', { name: 'Redo the conversation summary' }))

    await waitFor(() => expect(vi.mocked(approve)).toHaveBeenCalled())
    const [, , , watch] = vi.mocked(approve).mock.calls[0]
    expect(watch?.only).toBe('items')

    // The recap above is still true, so it stays on the page.
    expect(screen.getByText('The summary you already had.')).toBeTruthy()
    expect(screen.getByLabelText('Veda is reading the chapter')).toBeTruthy()
  })

  it('leaves the failure behind when the reader moves on', async () => {
    // The line accused models in chapters that had never been asked anything.
    vi.mocked(approve).mockRejectedValue(new Error('the free model is busy'))

    open(`/book/${WATCHED}/chapters?chapter=1`)
    fireEvent.click(await screen.findByRole('button', { name: 'Redo the chapter summary' }))
    expect(await screen.findByText(/The free model is busy/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Second/ }))
    await waitFor(() => expect(screen.queryByText(/The free model is busy/)).toBeNull())
  })
})
