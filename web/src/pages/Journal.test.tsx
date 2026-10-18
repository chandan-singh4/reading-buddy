// @vitest-environment jsdom
//
// The journal stream.
//
// The claims this screen makes are about *order and honesty*: newest first,
// cut by the day the reader spoke on, and every card saying plainly whether
// the words on it are the reader's own or a model's. Those are what is tested
// here, because those are what the design promised.
import 'fake-indexeddb/auto'

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../storage/db.ts'
import { entryStore } from '../storage/index.ts'
import Journal from './Journal.tsx'

afterEach(cleanup)

beforeEach(async () => {
  await db.entries.clear()
})

/** A date at a fixed hour, `daysBack` days before today, in local time. */
function dayBefore(daysBack: number, hour = 9): Date {
  const at = new Date()
  at.setDate(at.getDate() - daysBack)
  at.setHours(hour, 15, 0, 0)
  return at
}

function openJournal() {
  return render(
    <MemoryRouter initialEntries={['/journal']}>
      <Routes>
        <Route path="/journal" element={<Journal />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Journal', () => {
  it('says so plainly when there is nothing yet', async () => {
    openJournal()
    expect(await screen.findByText('Nothing yet')).toBeTruthy()
  })

  it('cuts the stream by the day the reader spoke on', async () => {
    await entryStore.addEntry({ raw: 'a thought from this morning', at: dayBefore(0) })
    await entryStore.addEntry({ raw: 'a thought from last night', at: dayBefore(1, 22) })
    await entryStore.addEntry({ raw: 'a thought from the week before', at: dayBefore(9) })

    openJournal()

    expect(await screen.findByText('Today')).toBeTruthy()
    expect(screen.getByText('Yesterday')).toBeTruthy()
    // The third is older than both, so it gets a written date rather than a
    // word. Which date depends on the locale, so the test only claims there
    // are three day marks and that the two nearest ones are named.
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3)
  })

  it('puts the newest entry first', async () => {
    await entryStore.addEntry({ raw: 'spoken first', at: dayBefore(0, 8) })
    await entryStore.addEntry({ raw: 'spoken second', at: dayBefore(0, 20) })

    openJournal()

    await screen.findByText('spoken second')
    // Only the entry cards: "← Reading" is a link on this screen too.
    const cards = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/journal/'))
      .map((link) => link.textContent ?? '')
    expect(cards[0]).toContain('spoken second')
    expect(cards[1]).toContain('spoken first')
  })

  it('marks an unshaped entry as raw, and links to it', async () => {
    const entry = await entryStore.addEntry({ raw: 'nothing has touched these words' })

    openJournal()

    const card = await screen.findByRole('link', { name: /nothing has touched these words/ })
    expect(card.getAttribute('href')).toBe(`/journal/${entry.id}`)
    expect(card.textContent).toContain('Raw')
  })

  it('shows the shaped words on the card, and says they are shaped', async () => {
    const entry = await entryStore.addEntry({ raw: 'um so the thing is i was thinking' })
    await db.entries.update(entry.id, {
      shaped: {
        level: 'tidy',
        model: 'a-free-model',
        at: new Date().toISOString(),
        text: 'So the thing is, I was thinking.',
      },
    })

    openJournal()

    const card = await screen.findByRole('link', { name: /So the thing is/ })
    expect(card.textContent).toContain('Tidied')
    // The raw words are not on the stream — but they are not gone either, and
    // the entry screen is where both are kept.
    expect(screen.queryByText('um so the thing is i was thinking')).toBeNull()
  })
})
