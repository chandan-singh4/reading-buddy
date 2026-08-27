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
 * The Chapter View is reached by book *id* but reads its summaries by book
 * *title*, so a real book has to exist in storage for the page to find
 * anything. That lookup is the one seam in this page worth guarding: get it
 * wrong and the page silently shows an empty chapter list rather than failing.
 */

const JUNG = 'jung-mdr' as BookId
const OTHER = 'nothing-distilled' as BookId

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
  await repository.saveBook(bookOf(OTHER, 'A Book Nobody Distilled'))
})

afterEach(cleanup)

function open(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('the Chapter View', () => {
  it('shows the chapter recap in plain words, above the items', async () => {
    open(`/book/${JUNG}/chapters?chapter=4`)

    // The heading comes straight from the URL and is on screen at once; the
    // recap arrives a tick later, so it is what the wait is for.
    expect(await screen.findByRole('heading', { name: 'Chapter 4' })).toBeTruthy()
    expect(await screen.findByText('On the function of dreams')).toBeTruthy()
    expect(screen.getByText(/In plain words/)).toBeTruthy()
    expect(screen.getByText(/star example/)).toBeTruthy()
    expect(screen.getByText(/Veda, in her own words/)).toBeTruthy()
  })

  it('opens on the first chapter with something in it, not on chapter 1', async () => {
    // What the reader sees when they arrive from the button on their book's
    // details page. Chapters 1 to 3 are undistilled; landing on one of them
    // would show an empty page and read as a broken feature.
    open(`/book/${JUNG}/chapters`)
    expect(await screen.findByRole('heading', { name: 'Chapter 4' })).toBeTruthy()
  })

  it('still lists the undistilled chapters in the rail', async () => {
    // The reader needs to see the whole book, not only the done parts.
    open(`/book/${JUNG}/chapters`)
    expect(await screen.findByRole('button', { name: '1 · First Years' })).toBeTruthy()
  })

  it('footnotes each item with its passage anchor and its concept', async () => {
    open(`/book/${JUNG}/chapters?chapter=4`)

    expect(await screen.findByText('the annex-dream passage')).toBeTruthy()
    expect(screen.getByText('the storage-closet analogy')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'the unconscious' })).toBeTruthy()
  })

  it('shows a candidate concept as pending, and does not make it a link', async () => {
    // The chip must not promise a heading that does not exist yet.
    open(`/book/${JUNG}/chapters?chapter=4`)

    const chip = await screen.findByText('survivorship in dream interpretation')
    expect(chip.tagName).not.toBe('A')
    expect(chip.closest('a')).toBeNull()
    expect(screen.getByText('awaiting Librarian')).toBeTruthy()
  })

  it('crosses to the concept in the Commonplace Book, and can come back', async () => {
    // The two-lens crossing, both directions, which is the whole navigation
    // model of this feature.
    open(`/book/${JUNG}/chapters?chapter=4`)

    fireEvent.click(await screen.findByRole('link', { name: 'the unconscious' }))

    expect(await screen.findByRole('heading', { name: 'the unconscious' })).toBeTruthy()
    const back = screen.getByRole('link', { name: /Chapters/ })
    expect(back.getAttribute('href')).toContain(`/book/${JUNG}/chapters`)

    fireEvent.click(back)
    expect(await screen.findByRole('heading', { name: 'Chapter 4' })).toBeTruthy()
  })

  it('switches chapters when the rail is tapped', async () => {
    open(`/book/${JUNG}/chapters?chapter=4`)
    // The rail is filled from the chapter list, which lands after the first
    // paint — so wait for the rail itself, not for the heading.
    fireEvent.click(await screen.findByRole('button', { name: '6 · The Tower' }))

    expect(await screen.findByRole('heading', { name: 'Chapter 6' })).toBeTruthy()
    expect(screen.getByText(/Nothing has been distilled from this chapter yet/)).toBeTruthy()
  })

  it('says so plainly for a book with nothing distilled at all', async () => {
    /*
     * The fixture answers with its sample chapters for every book, so a source
     * that genuinely knows nothing has to be installed to reach this state.
     * It is worth reaching: it is what every book looks like before the engine
     * has ever run, and a page that waits forever instead of saying so is the
     * bug this case was written after finding.
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
    expect(await screen.findByText(/Nothing has been distilled/)).toBeTruthy()
  })

  it('renders emphasis in a claim as emphasis', async () => {
    open(`/book/${JUNG}/chapters?chapter=4`)
    const word = await screen.findByText('prospective')
    expect(word.tagName).toBe('EM')
  })
})
