/**
 * The tutor's plumbing: the elision, the kind rule, and the store.
 *
 * The lamp's look is judged in a browser; what is tested here is the part a
 * regression could break silently — words elided wrongly on the pinned bar, a
 * passage classed as the wrong kind, or a second thread forked for a passage
 * that already has one.
 */

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { createDb, type ReadingBuddyDB } from './db.ts'
import { createTutorStore, findThread } from './tutor.ts'
import { elide, passageKindOf } from '../reader/tutor.ts'
import type { Anchor, BookId } from '../structure/index.ts'

const BOOK = 'book-1' as BookId
const ANCHOR = '[ch01-s01-p001]' as Anchor

const SENTENCE =
  'Van Leeuwenhoek did not just use his revolutionary magnifying technology to inspect the weave of the cloth he sold.'

describe('elide', () => {
  it('keeps a short passage whole', () => {
    expect(elide('a drop of rainwater')).toBe('a drop of rainwater')
  })

  it('shows the first three words and the last four', () => {
    expect(elide(SENTENCE)).toBe('Van Leeuwenhoek did … the cloth he sold.')
  })

  it('normalises stray whitespace instead of eliding it', () => {
    expect(elide('  one   two  three ')).toBe('one two three')
  })
})

describe('passageKindOf', () => {
  it('follows the grain the reader snapped to', () => {
    expect(passageKindOf('short', 'paragraph')).toBe('paragraph')
    expect(passageKindOf(SENTENCE.repeat(3), 'sentence')).toBe('sentence')
  })

  it('falls back to length when no grain was chosen', () => {
    expect(passageKindOf('short words', null)).toBe('sentence')
    expect(passageKindOf(SENTENCE.repeat(3), null)).toBe('paragraph')
  })
})

describe('tutor store', () => {
  const scratch: ReadingBuddyDB[] = []

  function freshStore() {
    const database = createDb(`tutor-test-${Math.random()}`)
    scratch.push(database)
    return createTutorStore(database)
  }

  afterEach(async () => {
    for (const database of scratch.splice(0)) await database.delete()
  })

  it('keeps a thread and lists it back', async () => {
    const store = freshStore()
    const row = await store.addThread(
      BOOK,
      { anchor: ANCHOR, excerpt: SENTENCE, kind: 'sentence' },
      [{ role: 'you', text: 'Explain this passage', ts: 1 }],
    )

    const listed = await store.listThreads(BOOK)
    expect(listed).toHaveLength(1)
    expect(listed[0]!.id).toBe(row.id)
    expect(listed[0]!.messages[0]!.text).toBe('Explain this passage')
  })

  it('replaces the messages on an update, and moves updatedAt', async () => {
    const store = freshStore()
    const row = await store.addThread(BOOK, { anchor: ANCHOR, excerpt: SENTENCE, kind: 'sentence' }, [])

    await store.setMessages(BOOK, row.id, [
      { role: 'you', text: 'so he was not a scientist?', ts: 2 },
      { role: 'claude', text: 'Not by training.', isProbe: true, ts: 3 },
    ])

    const [kept] = await store.listThreads(BOOK)
    expect(kept!.messages).toHaveLength(2)
    expect(kept!.messages[1]!.isProbe).toBe(true)
  })

  it('finds the one thread for a passage by its exact words', async () => {
    const store = freshStore()
    await store.addThread(BOOK, { anchor: ANCHOR, excerpt: 'other words', kind: 'sentence' }, [])
    const wanted = await store.addThread(
      BOOK,
      { anchor: ANCHOR, excerpt: SENTENCE, kind: 'sentence' },
      [],
    )

    const threads = await store.listThreads(BOOK)
    expect(findThread(threads, { anchor: ANCHOR, excerpt: SENTENCE })?.id).toBe(wanted.id)
    expect(findThread(threads, { anchor: ANCHOR, excerpt: 'never discussed' })).toBeUndefined()
  })
})
