// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import type { BookMeta } from '../structure/index.ts'
import type { BookId } from '../structure/index.ts'
import type { StoredAlert, StoredChapterSummary } from '../storage/db.ts'
import { clearOldSummaries, keeps, type CleanupStores } from './cleanup.ts'

const JUNG = 'jung' as BookId
const OTHER = 'other' as BookId

function book(id: BookId, title: string): BookMeta {
  return { id, title, author: 'Someone', importedAt: '2026-08-01T00:00:00.000Z' } as BookMeta
}

function summary(bookId: BookId, chapterId: string): StoredChapterSummary {
  return { bookId, chapterId } as StoredChapterSummary
}

function alert(bookId: BookId, kind: StoredAlert['kind'], id: string): StoredAlert {
  return { id, kind, bookId } as StoredAlert
}

let summaries: StoredChapterSummary[]
let alerts: StoredAlert[]
let stores: CleanupStores

beforeEach(() => {
  localStorage.clear()
  summaries = [summary(JUNG, 'ch1'), summary(OTHER, 'ch1'), summary(OTHER, 'ch2')]
  alerts = [
    alert(JUNG, 'ready', 'keep-ready'),
    alert(OTHER, 'ready', 'drop-ready'),
    alert(OTHER, 'approval', 'keep-question'),
    alert(OTHER, 'pending', 'keep-yes'),
  ]
  stores = {
    listBooks: async () => [book(JUNG, 'Man and His Symbols'), book(OTHER, 'Aion')],
    summaries: {
      all: async () => summaries,
      remove: async (bookId, chapterId) => {
        summaries = summaries.filter((r) => !(r.bookId === bookId && r.chapterId === chapterId))
      },
    },
    alerts: {
      list: async () => alerts,
      remove: async (id) => {
        alerts = alerts.filter((row) => row.id !== id)
      },
    },
  }
})

describe('the one-time clearing of old summaries', () => {
  it('keeps the one book and drops the rest', async () => {
    await clearOldSummaries(stores)
    expect(summaries.map((row) => row.bookId)).toEqual([JUNG])
  })

  it('drops the ready lines that now point at nothing', async () => {
    await clearOldSummaries(stores)
    expect(alerts.map((row) => row.id)).toEqual(['keep-ready', 'keep-question', 'keep-yes'])
  })

  it('runs once and never again', async () => {
    await clearOldSummaries(stores)
    summaries.push(summary(OTHER, 'ch9'))
    await clearOldSummaries(stores)
    expect(summaries.map((row) => row.chapterId)).toContain('ch9')
  })

  it('matches the kept book however its title was written', () => {
    expect(keeps('Man and His Symbols')).toBe(true)
    expect(keeps('man and his symbols (illustrated)')).toBe(true)
    expect(keeps('C. G. Jung — Man and His Symbols')).toBe(true)
    expect(keeps('Memories, Dreams, Reflections')).toBe(false)
  })
})
