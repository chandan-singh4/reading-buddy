import { describe, expect, it } from 'vitest'

import type { StoredTutorThread } from '../storage/db.ts'
import { exchangesIn } from './engine.ts'

function thread(...roles: ('you' | 'claude')[]): StoredTutorThread {
  return {
    bookId: 'b' as StoredTutorThread['bookId'],
    id: 'one',
    anchor: 'c1.p1' as StoredTutorThread['anchor'],
    excerpt: 'A paragraph.',
    kind: 'paragraph',
    messages: roles.map((role) => ({ role, text: 'said', ts: 0 })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('how much talking a summary has to cover', () => {
  it('counts the reader’s questions, not the passages they were about', () => {
    // One passage, three questions. Counted by thread this reads as "one
    // conversation" however long the reader stays, and the follow-ups were
    // never sent to the Scribe.
    expect(exchangesIn([thread('you', 'claude', 'you', 'claude', 'you', 'claude')])).toBe(3)
  })

  it('adds the questions across every thread in the chapter', () => {
    expect(exchangesIn([thread('you', 'claude'), thread('you', 'claude', 'you', 'claude')])).toBe(3)
  })

  it('counts nothing when nobody has asked anything', () => {
    expect(exchangesIn([])).toBe(0)
  })
})
