// Reading the clock off a conversation that was never timed. The cases are the
// shapes a real thread takes: one exchange, a long back and forth, and a thread
// put down and picked up hours later.

import { describe, expect, it } from 'vitest'

import { CHAT_GAP_MS, vedaMsIn } from './vedaTime.ts'
import type { StoredTutorThread } from '../storage/db.ts'
import type { BookId } from '../structure/index.ts'

const BOOK = 'b1' as BookId
const NINE = Date.parse('2026-08-30T21:00:00.000Z')
const min = (n: number): number => n * 60_000

/** A thread whose messages land at the given minutes after nine. */
function thread(minutes: number[], bookId: BookId = BOOK): StoredTutorThread {
  return {
    bookId,
    id: `t${minutes.join('-')}`,
    anchor: '[ch01-s01-p001]' as never,
    excerpt: 'a passage',
    kind: 'paragraph',
    messages: minutes.map((m) => ({ role: 'you' as never, text: '…', ts: NINE + min(m) })),
    createdAt: '2026-08-30T21:00:00.000Z',
    updatedAt: '2026-08-30T21:00:00.000Z',
  }
}

const allNight = (threads: StoredTutorThread[]): number =>
  vedaMsIn(threads, BOOK, NINE, NINE + min(600))

describe('vedaMsIn', () => {
  it('counts a question and its answer as the minute between them', () => {
    expect(allNight([thread([0, 1])])).toBe(min(1))
  })

  it('counts a back and forth as the whole stretch', () => {
    expect(allNight([thread([0, 1, 3, 4, 6])])).toBe(min(6))
  })

  it('does not count the hours a thread was put down for', () => {
    // Nine o'clock and eleven o'clock, one thread. The two hours in between
    // were the book, or the kettle, and were not this conversation.
    expect(allNight([thread([0, 1, 120, 121])])).toBe(min(2))
  })

  it('breaks a stretch exactly at the gap', () => {
    const gap = CHAT_GAP_MS / 60_000
    expect(allNight([thread([0, gap])])).toBe(CHAT_GAP_MS)
    expect(allNight([thread([0, gap + 1])])).toBe(0)
  })

  it('counts a minute lived once only once', () => {
    // Two threads open at the same time. The reader is one person.
    expect(allNight([thread([0, 4]), thread([2, 6])])).toBe(min(6))
  })

  it('is nothing when only one message falls in the window', () => {
    expect(vedaMsIn([thread([0, 30])], BOOK, NINE, NINE + min(10))).toBe(0)
  })

  it('ignores a conversation about another book', () => {
    expect(allNight([thread([0, 5], 'b2' as BookId)])).toBe(0)
  })

  it('has nothing to say about a session with no conversation in it', () => {
    expect(allNight([])).toBe(0)
  })
})
