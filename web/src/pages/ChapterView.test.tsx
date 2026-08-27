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
    expect(screen.getByText(/has not been summarised yet/)).toBeTruthy()
  })

  it('says so plainly for a book with nothing summarised at all', async () => {
    /*
     * The fixture answers with its sample chapters for every book, so a source
     * that genuinely knows nothing has to be installed to reach this state.
     * It is worth reaching: it is what every book looks like before either
     * model has ever run, and a page that waits forever instead of saying so
     * is the bug this case was written after finding.
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
    expect(await screen.findByText(/has not been summarised yet/)).toBeTruthy()
  })

  it('renders emphasis in a summary as emphasis', async () => {
    open(`/book/${JUNG}/chapters?chapter=4`)
    const word = await screen.findByText('forward')
    expect(word.tagName).toBe('EM')
  })
})
