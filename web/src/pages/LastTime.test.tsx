// @vitest-environment jsdom
//
// "Last time on…" — the return screen.
//
// The claim this page makes is that coming back costs nothing: every word was
// written earlier and stored. So the sharpest test here is the one that fails
// if the page ever reaches for the network.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { digestStore } from '../storage/digests.ts'
import { repository, type ParsedBook } from '../storage/index.ts'
import { recapsOn, setRecapsOn } from '../tutor/refresh.ts'
import { chapterPath, formatAnchor, sectionPath, type BookId } from '../structure/index.ts'
import LastTime from './LastTime.tsx'
import type { StoredDigest } from '../storage/db.ts'

afterEach(cleanup)

const BOOK_ID = 'book-1' as BookId

function bookOf(): ParsedBook {
  const chapters = [1, 2, 3]
  return {
    meta: {
      id: BOOK_ID,
      title: 'The Fabric of the Cosmos',
      author: 'Brian Greene',
      source: 'epub' as const,
      type: 'dense-technical' as const,
      importedAt: '2026-08-01T00:00:00.000Z',
    },
    manifest: {
      bookId: BOOK_ID,
      title: 'The Fabric of the Cosmos',
      chapters: chapters.map((chapter) => ({
        chapter,
        title: `Chapter ${chapter}`,
        summary: '',
        words: 900,
      })),
    },
    chapters: chapters.map((chapter) => ({
      chapter,
      title: chapter === 1 ? 'Roads to Reality' : `Chapter ${chapter}`,
      path: chapterPath(chapter),
      sections: [{ section: 1, path: sectionPath(chapter, 1), words: 900 }],
    })),
    sections: chapters.map((chapter) => ({
      chapter,
      section: 1,
      path: sectionPath(chapter, 1),
      paragraphs: [
        {
          anchor: formatAnchor({ chapter, section: 1, paragraph: 1 }),
          text: 'x',
          kind: 'prose' as const,
        },
      ],
    })),
  }
}

function digest(chapter: number, over: Partial<StoredDigest> = {}): StoredDigest {
  return {
    bookId: BOOK_ID,
    chapterId: chapterPath(chapter),
    blocks: [`block of ${chapter}`],
    contentRecap: `What happened in chapter ${chapter}.`,
    conversationDigest: '',
    coversNConversations: 0,
    coversThroughSection: 1,
    generatedAt: '2026-08-10T00:00:00.000Z',
    ...over,
  }
}

function openLastTime() {
  return render(
    <MemoryRouter initialEntries={[`/book/${BOOK_ID}/last-time`]}>
      <Routes>
        <Route path="/book/:bookId/last-time" element={<LastTime />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await repository.deleteBook(BOOK_ID)
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('the return screen must not call anything')
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LastTime', () => {
  it('shows the stored recaps without calling a model', async () => {
    await repository.saveParsedBook(bookOf())
    await digestStore.save(digest(1))
    await repository.savePosition(BOOK_ID, formatAnchor({ chapter: 2, section: 1, paragraph: 1 }), 40)

    openLastTime()

    expect(await screen.findByText('The Fabric of the Cosmos')).toBeTruthy()
    expect(screen.getByText('Roads to Reality')).toBeTruthy()
    expect(screen.getByText('What happened in chapter 1.')).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('says where the words came from', async () => {
    await repository.saveParsedBook(bookOf())
    await digestStore.save(digest(1))
    await repository.savePosition(BOOK_ID, formatAnchor({ chapter: 2, section: 1, paragraph: 1 }), 40)

    openLastTime()
    expect(
      await screen.findByText('assembled from 1 stored chapter digest · no page was re-read'),
    ).toBeTruthy()
  })

  it('never shows a chapter the reader has not reached', async () => {
    await repository.saveParsedBook(bookOf())
    await digestStore.save(digest(1))
    // A digest for chapter 3 should be impossible; if one ever lands, the
    // screen must still not spoil it for a reader sitting in chapter 2.
    await digestStore.save(digest(3, { contentRecap: 'The ending, given away.' }))
    await repository.savePosition(BOOK_ID, formatAnchor({ chapter: 2, section: 1, paragraph: 1 }), 40)

    openLastTime()
    await screen.findByText('What happened in chapter 1.')
    expect(screen.queryByText('The ending, given away.')).toBeNull()
  })

  it('lists the confusions one line each', async () => {
    await repository.saveParsedBook(bookOf())
    await digestStore.save(
      digest(1, {
        conversationDigest: '- entropy → it counts arrangements\n- spacetime → one fabric',
        coversNConversations: 2,
      }),
    )
    await repository.savePosition(BOOK_ID, formatAnchor({ chapter: 1, section: 1, paragraph: 1 }), 10)

    openLastTime()
    expect(await screen.findByText('entropy → it counts arrangements')).toBeTruthy()
    expect(screen.getByText('spacetime → one fabric')).toBeTruthy()
  })

  it('says plainly when nothing has been recapped yet', async () => {
    await repository.saveParsedBook(bookOf())
    await repository.savePosition(BOOK_ID, formatAnchor({ chapter: 1, section: 1, paragraph: 1 }), 10)

    openLastTime()
    expect(await screen.findByText(/No chapter has been recapped yet/)).toBeTruthy()
    expect(screen.getByText('nothing stored yet · no page was re-read')).toBeTruthy()
  })

  it('leaves recaps switched off until the reader asks for them', async () => {
    await repository.saveParsedBook(bookOf())
    openLastTime()

    const box = (await screen.findByLabelText(/Write recaps as I read/)) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(recapsOn()).toBe(false)

    fireEvent.click(box)
    expect(recapsOn()).toBe(true)
    setRecapsOn(false)
  })

  it('says so when the book is not on the device', async () => {
    openLastTime()
    expect(await screen.findByText('That book is not on this device.')).toBeTruthy()
  })
})
