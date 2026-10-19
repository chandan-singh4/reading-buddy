// @vitest-environment jsdom
//
// One entry.
//
// The decision this screen carries is that the raw transcript is canonical and
// a shape never replaces it. So the test that matters most is the one that
// fails if the reader's own words ever become unreachable — and the one that
// fails if a single press can delete them.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type EntryShaped } from '../storage/db.ts'
import { shapeEntry } from '../journal/shape.ts'
import { entryStore } from '../storage/index.ts'
import Entry from './Entry.tsx'

vi.mock('../journal/shape.ts', async () => {
  const real = await vi.importActual<typeof import('../journal/shape.ts')>('../journal/shape.ts')
  return { ...real, shapeEntry: vi.fn() }
})

const asked = vi.mocked(shapeEntry)

afterEach(cleanup)

beforeEach(async () => {
  await db.entries.clear()
  asked.mockReset()
})

const TIDY: EntryShaped = {
  level: 'tidy',
  model: 'a-free-model',
  at: '2026-10-18T10:00:00.000Z',
  text: 'So the thing is, I was thinking.',
}

function openEntry(entryId: string) {
  return render(
    <MemoryRouter initialEntries={[`/journal/${entryId}`]}>
      <Routes>
        <Route path="/journal/:entryId" element={<Entry />} />
        <Route path="/journal" element={<p>the stream</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Entry', () => {
  it('shows the raw words, and offers no switch, when nothing has shaped them', async () => {
    const entry = await entryStore.addEntry({ raw: 'um so the thing is i was thinking' })

    openEntry(entry.id)

    expect(await screen.findByText('um so the thing is i was thinking')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'How to read this entry' })).toBeNull()
    expect(screen.getByText(/Exactly what the microphone heard/)).toBeTruthy()
  })

  it('opens on the shaped copy, and keeps the raw words one press away', async () => {
    const entry = await entryStore.addEntry({ raw: 'um so the thing is i was thinking' })
    await db.entries.update(entry.id, { shaped: TIDY })

    openEntry(entry.id)

    expect(await screen.findByText('So the thing is, I was thinking.')).toBeTruthy()
    expect(screen.getByText(/Written by a-free-model/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Your words' }))

    expect(screen.getByText('um so the thing is i was thinking')).toBeTruthy()
    expect(screen.getByText(/Exactly what the microphone heard/)).toBeTruthy()
  })

  it('does not delete on one press', async () => {
    const entry = await entryStore.addEntry({ raw: 'a thought worth keeping' })

    openEntry(entry.id)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete this entry' }))

    // Asked, not done.
    expect(screen.getByRole('button', { name: 'Delete for good' })).toBeTruthy()
    expect(await db.entries.get(entry.id)).toBeTruthy()
  })

  it('deletes on the second press, and goes back to the stream', async () => {
    const entry = await entryStore.addEntry({ raw: 'a thought to let go of' })

    openEntry(entry.id)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete this entry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }))

    expect(await screen.findByText('the stream')).toBeTruthy()
    expect(await db.entries.get(entry.id)).toBeUndefined()
  })

  it('backs out of the question without deleting', async () => {
    const entry = await entryStore.addEntry({ raw: 'a thought worth keeping' })

    openEntry(entry.id)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete this entry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(screen.getByRole('button', { name: 'Delete this entry' })).toBeTruthy()
    expect(await db.entries.get(entry.id)).toBeTruthy()
  })

  it('says so when the entry is not there', async () => {
    openEntry('an-id-that-was-never-written')

    expect(await screen.findByText('That entry is gone')).toBeTruthy()
  })

  it('offers the three shapes, and stores the one the reader picks', async () => {
    const entry = await entryStore.addEntry({ raw: 'um so the thing is i was thinking' })
    asked.mockResolvedValue({ text: 'So the thing is, I was thinking.', model: 'a-free-model' })

    openEntry(entry.id)

    fireEvent.click(await screen.findByRole('button', { name: /Tidy/ }))

    await waitFor(async () => {
      expect((await db.entries.get(entry.id))?.shaped?.level).toBe('tidy')
    })
    expect(asked).toHaveBeenCalledWith('tidy', 'um so the thing is i was thinking')
    expect(await screen.findByText('So the thing is, I was thinking.')).toBeTruthy()
  })

  it('never writes over the reader’s own words', async () => {
    const entry = await entryStore.addEntry({ raw: 'um so the thing is i was thinking' })
    asked.mockResolvedValue({
      text: 'So the thing is, I was thinking.',
      model: 'a-free-model',
      title: 'A thought',
    })

    openEntry(entry.id)
    fireEvent.click(await screen.findByRole('button', { name: /Shape/ }))

    await waitFor(async () => {
      expect((await db.entries.get(entry.id))?.shaped).toBeTruthy()
    })
    // The whole promise of the feature, in one assertion.
    expect((await db.entries.get(entry.id))?.raw).toBe('um so the thing is i was thinking')
    expect((await db.entries.get(entry.id))?.title).toBe('A thought')
  })

  it('keeps the words when the model will not answer', async () => {
    const entry = await entryStore.addEntry({ raw: 'a thought to shape' })
    asked.mockRejectedValue(new Error('The free models are busy. Try again in a minute.'))

    openEntry(entry.id)
    fireEvent.click(await screen.findByRole('button', { name: /Unpack/ }))

    expect(await screen.findByText(/The free models are busy/)).toBeTruthy()
    expect((await db.entries.get(entry.id))?.shaped).toBeUndefined()
    expect((await db.entries.get(entry.id))?.raw).toBe('a thought to shape')
  })

  it('removes a shape without touching the words', async () => {
    const entry = await entryStore.addEntry({ raw: 'a thought to shape' })
    await db.entries.update(entry.id, { shaped: TIDY, title: 'A thought' })

    openEntry(entry.id)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the shape' }))

    await waitFor(async () => {
      expect((await db.entries.get(entry.id))?.shaped).toBeUndefined()
    })
    expect((await db.entries.get(entry.id))?.raw).toBe('a thought to shape')
    expect(screen.getByText('a thought to shape')).toBeTruthy()
  })
})
