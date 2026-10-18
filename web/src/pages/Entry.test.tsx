// @vitest-environment jsdom
//
// One entry.
//
// The decision this screen carries is that the raw transcript is canonical and
// a shape never replaces it. So the test that matters most is the one that
// fails if the reader's own words ever become unreachable — and the one that
// fails if a single press can delete them.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db, type EntryShaped } from '../storage/db.ts'
import { entryStore } from '../storage/index.ts'
import Entry from './Entry.tsx'

afterEach(cleanup)

beforeEach(async () => {
  await db.entries.clear()
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
})
