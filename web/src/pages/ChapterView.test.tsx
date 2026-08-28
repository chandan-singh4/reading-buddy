// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AppRoutes } from '../App.tsx'
import { repository } from '../storage/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
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

afterEach(cleanup)

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

  it('offers the parts already read, and not the one in hand', async () => {
    open(`/book/${PART1}/chapters?chapter=6`)

    expect(await screen.findByText('Parts you have finished')).toBeTruthy()
    expect(screen.getByText('The importance of dreams')).toBeTruthy()
    expect(screen.getByText('The function of dreams')).toBeTruthy()
    // Being on the last page of a part is not having finished it.
    expect(screen.queryByText('The analysis of dreams')).toBeNull()
  })

  it('does not blame the reader for a chapter they are working through', async () => {
    open(`/book/${PART1}/chapters?chapter=6`)

    await screen.findByText('Parts you have finished')
    expect(screen.queryByText(/once you have finished reading it/)).toBeNull()
  })
})
