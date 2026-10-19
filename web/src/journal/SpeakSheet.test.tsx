// @vitest-environment jsdom
//
// Speaking a thought, and correcting it before it is kept.
//
// The dictation hook is mocked: the browser's recogniser is not in jsdom, and
// what this file is about is the other half — that the words become the
// reader's to change the moment the recogniser stops, and that what they typed
// is what gets saved.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../storage/db.ts'
import type { Dictation } from './useDictation.ts'
import SpeakSheet from './SpeakSheet.tsx'

const heard = vi.hoisted(() => ({
  settled: '',
  guess: '',
  listening: false,
  supported: true,
  fault: null as Dictation['fault'],
  start: vi.fn(),
  stop: vi.fn(),
  replace: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('./useDictation.ts', () => ({ useDictation: () => heard }))
vi.mock('./useWakeLock.ts', () => ({ useWakeLock: () => {} }))

afterEach(cleanup)

beforeEach(async () => {
  await db.entries.clear()
  heard.settled = ''
  heard.guess = ''
  heard.listening = false
  heard.fault = null
  heard.start.mockReset()
  heard.stop.mockReset()
  heard.replace.mockReset()
})

function openSheet() {
  return render(<SpeakSheet open onClose={() => {}} />)
}

const LINK = {
  bookId: 'book-1' as never,
  anchor: 'c1/p4' as never,
  quote: 'The map is not the territory.',
}

describe('SpeakSheet', () => {
  it('offers a box to type in before anything has been spoken', () => {
    openSheet()

    const box = screen.getByLabelText('Your words')
    expect(box.getAttribute('placeholder')).toContain('type here')
  })

  it('does not offer the box while the recogniser is working', () => {
    heard.listening = true
    heard.settled = 'okay trying this again'
    openSheet()

    expect(screen.queryByLabelText('Your words')).toBeNull()
    expect(screen.getByText(/okay trying this again/)).toBeTruthy()
  })

  it('keeps what the reader typed, not what was misheard', async () => {
    heard.settled = 'trying to say the word umm'
    openSheet()

    const box = screen.getByLabelText('Your words')
    fireEvent.change(box, { target: { value: 'trying to say the word Om' } })
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))

    await waitFor(async () => {
      expect(await db.entries.count()).toBe(1)
    })
    const [row] = await db.entries.toArray()
    expect(row?.raw).toBe('trying to say the word Om')
  })

  it('hands the correction over before it listens again', () => {
    heard.settled = 'the word umm'
    openSheet()

    fireEvent.change(screen.getByLabelText('Your words'), {
      target: { value: 'the word Om' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start listening' }))

    // The order is the point: the next sentence must be added to the
    // correction, not to the recogniser's own older copy of it.
    expect(heard.replace).toHaveBeenCalledWith('the word Om')
    expect(heard.start).toHaveBeenCalled()
  })

  it('will not keep an entry that has no words', () => {
    openSheet()

    expect(screen.getByRole('button', { name: 'Keep' }).hasAttribute('disabled')).toBe(true)
  })

  // WP-63 — the same sheet, told to the Scribe from a page.
  describe('from a book', () => {
    it('shows the passage, so the reader can see what they are answering', () => {
      render(<SpeakSheet open onClose={() => {}} link={LINK} />)

      // The sheet covers the page the passage is on. Without this the reader
      // is speaking about a sentence they can no longer see.
      expect(screen.getByText('The map is not the territory.')).toBeTruthy()
      expect(screen.getByRole('dialog', { name: 'Tell the Scribe' })).toBeTruthy()
    })

    it('ties the saved entry to the passage', async () => {
      heard.settled = 'this is the thing i keep forgetting'
      render(<SpeakSheet open onClose={() => {}} link={LINK} />)

      fireEvent.click(screen.getByRole('button', { name: 'Keep' }))

      await waitFor(async () => {
        expect(await db.entries.count()).toBe(1)
      })
      const [row] = await db.entries.toArray()
      expect(row?.raw).toBe('this is the thing i keep forgetting')
      // The book's own words, copied — a re-parse moves offsets and does not
      // move words.
      expect(row?.link).toEqual(LINK)
    })

    it('keeps an entry spoken from the journal free of a book', async () => {
      heard.settled = 'a thought from nowhere'
      openSheet()

      fireEvent.click(screen.getByRole('button', { name: 'Keep' }))

      await waitFor(async () => {
        expect(await db.entries.count()).toBe(1)
      })
      const [row] = await db.entries.toArray()
      // Absent, not present-and-empty: `link.bookId` is an index, and a row
      // whose indexed field holds nothing is a row in that index.
      expect(row && 'link' in row).toBe(false)
    })
  })
})
