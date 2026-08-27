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
    await alertStore.save({
      id: 'b2:ch02',
      kind: 'approval',
      bookId: 'b2' as never,
      bookTitle: 'The Beginning of Infinity',
      chapterId: 'ch02',
      chapter: 2,
      chapterTitle: 'Closer to Reality',
      at: '2026-08-27T14:00:00.000Z',
      seen: false,
    })

    show()
    ;(await screen.findByRole('button', { name: /Notifications/ })).click()

    expect(await screen.findByRole('button', { name: 'Summarise this chapter' })).toBeTruthy()
    // Nothing was spent by merely showing it.
    expect(screen.queryByRole('link', { name: 'Read the summary' })).toBeNull()
  })
})
