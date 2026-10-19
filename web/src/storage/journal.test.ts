// @vitest-environment jsdom
//
// The journal store.
//
// One rule is worth a test of its own: correcting the words must mark a
// model's reading as stale, and must not quietly throw it away or quietly
// leave it looking current. A shape is remade automatically; an opinion is
// not, because remaking it spends a model call the reader did not ask for.
import 'fake-indexeddb/auto'

import { beforeEach, expect, it } from 'vitest'

import { db } from './db.ts'
import { entryStore } from './index.ts'

beforeEach(async () => {
  await db.entries.clear()
})

const READING = {
  angle: 'A decision already made, looking for permission',
  model: 'a/b:free',
  at: '2026-10-19T10:00:00.000Z',
  text: 'You are rehearsing a defence of it.',
}

it('marks a reading stale when the reader corrects the words', async () => {
  const entry = await entryStore.addEntry({ raw: 'i already booked it' })
  await entryStore.setCounsel(entry.id, READING)

  await entryStore.setRaw(entry.id, 'i already booked it and i keep thinking about it')

  const row = await db.entries.get(entry.id)
  expect(row?.raw).toBe('i already booked it and i keep thinking about it')
  // Kept, and marked. Throwing it away would lose something the reader asked
  // for; leaving it unmarked would let an opinion on words that no longer
  // exist read as current.
  expect(row?.counsel?.stale).toBe(true)
  expect(row?.counsel?.text).toBe(READING.text)
})

it('clears the mark when a new reading is made', async () => {
  const entry = await entryStore.addEntry({ raw: 'i already booked it' })
  await entryStore.setCounsel(entry.id, { ...READING, stale: true })

  await entryStore.setCounsel(entry.id, READING)

  expect((await db.entries.get(entry.id))?.counsel?.stale).toBeUndefined()
})

it('leaves an entry with no reading alone', async () => {
  const entry = await entryStore.addEntry({ raw: 'a thought' })

  await entryStore.setRaw(entry.id, 'a corrected thought')

  const row = await db.entries.get(entry.id)
  expect(row?.counsel).toBeUndefined()
  expect(row?.editedAt).toBeTruthy()
})

it('removes a reading without touching the words or the shape', async () => {
  const entry = await entryStore.addEntry({ raw: 'i already booked it' })
  await entryStore.setShaped(entry.id, {
    level: 'tidy',
    model: 'a/b:free',
    at: '2026-10-19T09:00:00.000Z',
    text: 'I already booked it.',
  })
  await entryStore.setCounsel(entry.id, READING)

  await entryStore.clearCounsel(entry.id)

  const row = await db.entries.get(entry.id)
  expect(row?.counsel).toBeUndefined()
  expect(row?.raw).toBe('i already booked it')
  expect(row?.shaped?.text).toBe('I already booked it.')
})
