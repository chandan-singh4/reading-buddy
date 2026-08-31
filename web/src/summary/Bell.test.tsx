// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The bell, and the one line on it that matters most.
 *
 * Reading Buddy asks before it updates itself. A reader who misses that panel
 * has no other way to take the update, and their phone then runs old code
 * however many times we ship. That has already happened once, for days. This
 * file guards the second door.
 */

const updates = vi.hoisted(() => {
  let listener: (() => void) | undefined
  return {
    applied: 0,
    /** Fire the "a build is waiting" event the real module fires. */
    announce: () => listener?.(),
    reset() {
      listener = undefined
      this.applied = 0
    },
    onUpdateReady: (fn: () => void) => {
      listener = fn
      return () => {
        listener = undefined
      }
    },
  }
})

vi.mock('../app/updates.ts', () => ({
  onUpdateReady: (fn: () => void) => updates.onUpdateReady(fn),
  applyUpdate: () => {
    updates.applied += 1
  },
}))

const { Bell } = await import('./Bell.tsx')
const { alertStore } = await import('../storage/summaries.ts')
const { db } = await import('../storage/db.ts')

beforeEach(async () => {
  updates.reset()
  // One fake IndexedDB is shared by every case in the file, so a row left by
  // the last one is a row this one did not ask for.
  await db.alerts.clear()
})

afterEach(cleanup)

function show() {
  return render(
    <MemoryRouter>
      <Bell />
    </MemoryRouter>,
  )
}

/** One waiting question, of the kind the sweep raises for a book not in hand. */
function approval(book: string, chapterId: string, chapter: number, title: string) {
  return {
    id: `${book}:${chapterId}`,
    kind: 'approval' as const,
    bookId: book as never,
    bookTitle: 'The Beginning of Infinity',
    chapterId,
    chapter,
    chapterTitle: title,
    at: `2026-08-27T1${chapter}:00:00.000Z`,
    seen: false,
  }
}

describe('the bell', () => {
  it('says there is nothing before anything has happened', async () => {
    show()
    ;(await screen.findByRole('button', { name: 'Notifications' })).click()
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy()
  })

  it('offers the update when a build is waiting', async () => {
    show()
    updates.announce()

    // The badge counts it, so a reader who never opens the panel still sees it.
    const bell = await screen.findByRole('button', { name: /Notifications, 1 new/ })
    bell.click()

    const button = await screen.findByRole('button', { name: 'Update now' })
    button.click()
    expect(updates.applied).toBe(1)
  })

  it('keeps counting the update after the bell has been read', async () => {
    /*
     * The load-bearing case. Every other line is marked seen the moment the
     * reader looks. This one must not be: the badge is the only thing between a
     * missed panel and a phone that never updates again.
     */
    show()
    updates.announce()

    const bell = await screen.findByRole('button', { name: /1 new/ })
    bell.click()
    await screen.findByText('A new version is ready')
    bell.click()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Notifications, 1 new/ })).toBeTruthy(),
    )
  })

  it('shows a finished summary, and links to the chapter', async () => {
    await alertStore.save({
      id: 'b1:ch04',
      kind: 'ready',
      bookId: 'b1' as never,
      bookTitle: 'Memories, Dreams, Reflections',
      chapterId: 'ch04',
      chapter: 4,
      chapterTitle: 'On Dreams',
      at: '2026-08-27T15:00:00.000Z',
      seen: false,
    })

    show()
    ;(await screen.findByRole('button', { name: /Notifications/ })).click()

    const link = await screen.findByRole('link', { name: 'Read the summary' })
    expect(link.getAttribute('href')).toContain('/book/b1/chapters?chapter=4')
  })

  it('asks before spending anything on a book the reader is not in', async () => {
    // The reader's own rule. Only the book they opened last runs unasked.
    await alertStore.save(approval('b2', 'ch02', 2, 'Closer to Reality'))

    show()
    ;(await screen.findByRole('button', { name: /Notifications/ })).click()

    // One waiting chapter needs no picker. A "pick which" step in front of a
    // single choice is a step for nothing.
    expect(await screen.findByRole('button', { name: 'Summarise it' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pick chapters' })).toBeNull()
    // Nothing was spent by merely showing it.
    expect(screen.queryByRole('link', { name: 'Read the summary' })).toBeNull()
  })

  it('asks once for a book, not once for every chapter of it', async () => {
    /*
     * The reason this grouping exists. Three finished chapters used to be three
     * near-identical rows and three separate yeses.
     */
    await alertStore.save(approval('b2', 'ch02', 2, 'Closer to Reality'))
    await alertStore.save(approval('b2', 'ch04', 4, 'Creation'))
    await alertStore.save(approval('b2', 'ch05', 5, 'The Reality of Abstractions'))

    show()
    ;(await screen.findByRole('button', { name: /Notifications/ })).click()

    expect(await screen.findByText('The Beginning of Infinity')).toBeTruthy()
    expect(await screen.findByText(/3 finished chapters/)).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Summarise the book' })).toBeTruthy()
  })

  it('opens the chapters of a book, in reading order', async () => {
    await alertStore.save(approval('b2', 'ch05', 5, 'The Reality of Abstractions'))
    await alertStore.save(approval('b2', 'ch02', 2, 'Closer to Reality'))

    show()
    ;(await screen.findByRole('button', { name: /Notifications/ })).click()
    ;(await screen.findByRole('button', { name: 'Pick chapters' })).click()

    const rows = await screen.findAllByRole('button', { name: 'Summarise' })
    expect(rows).toHaveLength(2)
    // Chapter 2 was saved second and must still be listed first.
    expect(screen.getByText('2 · Closer to Reality')).toBeTruthy()
    const names = screen.getAllByText(/· /).map((node) => node.textContent)
    expect(names.indexOf('2 · Closer to Reality')).toBeLessThan(
      names.indexOf('5 · The Reality of Abstractions'),
    )
  })
})

describe('a yes that is still waiting', () => {
  it('says so, and asks the reader for nothing more', async () => {
    await alertStore.save({ ...approval('b2', 'ch02', 2, 'Closer to Reality'), kind: 'pending' })
    show()
    ;(await screen.findByRole('button', { name: 'Notifications' })).click()

    expect(await screen.findByText(/Waiting for a model/)).toBeTruthy()
    // The approve button belongs to a question. This is not one any more.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Summarise/i })).toBeNull()
    })
  })
})
