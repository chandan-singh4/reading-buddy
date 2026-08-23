/**
 * The digest store. Small, but it holds work that cost money to make.
 *
 * The one rule worth pinning is the overwrite: a saved digest replaces the old
 * row whole. A half-updated row would read as fresh and would never be rebuilt.
 */

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { createDb, type ReadingBuddyDB, type StoredDigest } from './db.ts'
import { createDigestStore } from './digests.ts'
import type { BookId } from '../structure/index.ts'

const BOOK = 'book-1' as BookId
const OTHER = 'book-2' as BookId

const scratch: ReadingBuddyDB[] = []

function freshStore() {
  const database = createDb(`digest-test-${Math.random()}`)
  scratch.push(database)
  return createDigestStore(database)
}

afterEach(async () => {
  for (const database of scratch.splice(0)) await database.delete()
})

function row(chapterId: string, over: Partial<StoredDigest> = {}): StoredDigest {
  return {
    bookId: BOOK,
    chapterId,
    blocks: ['a block'],
    contentRecap: 'the recap',
    conversationDigest: '',
    coversNConversations: 0,
    coversThroughSection: 3,
    generatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

describe('digest store', () => {
  it('gives back what it stored', async () => {
    const store = freshStore()
    await store.save(row('ch02'))
    expect((await store.get(BOOK, 'ch02'))?.contentRecap).toBe('the recap')
  })

  it('answers nothing for a chapter with no digest', async () => {
    expect(await freshStore().get(BOOK, 'ch09')).toBeUndefined()
  })

  it('replaces a chapter rather than storing it twice', async () => {
    const store = freshStore()
    await store.save(row('ch02'))
    await store.save(row('ch02', { contentRecap: 'a longer recap', blocks: ['one', 'two'] }))
    const kept = await store.list(BOOK)
    expect(kept).toHaveLength(1)
    expect(kept[0]?.contentRecap).toBe('a longer recap')
  })

  it('lists one book only, never a neighbour', async () => {
    const store = freshStore()
    await store.save(row('ch01'))
    await store.save(row('ch02'))
    await store.save(row('ch01', { bookId: OTHER }))
    expect(await store.list(BOOK)).toHaveLength(2)
    expect(await store.list(OTHER)).toHaveLength(1)
  })

  it('removes one chapter and leaves the others', async () => {
    const store = freshStore()
    await store.save(row('ch01'))
    await store.save(row('ch02'))
    await store.remove(BOOK, 'ch01')
    expect((await store.list(BOOK)).map((kept) => kept.chapterId)).toEqual(['ch02'])
  })
})
