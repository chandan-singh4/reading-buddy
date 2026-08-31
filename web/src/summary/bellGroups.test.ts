import { describe, expect, it } from 'vitest'

import type { StoredAlert } from '../storage/db.ts'
import type { BookId } from '../structure/index.ts'
import { groupApprovals, groupPending, readyAlerts } from './bellGroups.ts'

function alert(
  book: string,
  chapter: number,
  kind: StoredAlert['kind'] = 'approval',
  at = '2026-08-27T10:00:00.000Z',
): StoredAlert {
  return {
    id: `${book}:ch${chapter}`,
    kind,
    bookId: book as BookId,
    bookTitle: `Book ${book}`,
    chapterId: `ch${chapter}`,
    chapter,
    chapterTitle: `Chapter ${chapter}`,
    at,
    seen: false,
  }
}

describe('grouping the bell by book', () => {
  it('puts every waiting chapter of one book on one line', () => {
    const groups = groupApprovals([alert('a', 3), alert('a', 1), alert('a', 2)])
    expect(groups).toHaveLength(1)
    expect(groups[0].chapters.map((row) => row.chapter)).toEqual([1, 2, 3])
  })

  it('reads in the order the book does, not the order the sweep found them', () => {
    const groups = groupApprovals([alert('a', 12), alert('a', 2)])
    expect(groups[0].chapters.map((row) => row.chapter)).toEqual([2, 12])
  })

  it('shows the book asked about most recently first', () => {
    const groups = groupApprovals([
      alert('a', 1, 'approval', '2026-08-01T00:00:00.000Z'),
      alert('b', 1, 'approval', '2026-08-20T00:00:00.000Z'),
    ])
    expect(groups.map((group) => group.bookId)).toEqual(['b', 'a'])
  })

  it('leaves a finished summary alone', () => {
    // A `ready` line links straight to a chapter that is already paid for.
    // Folding it into a book would put a step in front of it for nothing.
    const rows = [alert('a', 1, 'ready'), alert('a', 2)]
    expect(groupApprovals(rows)).toHaveLength(1)
    expect(groupApprovals(rows)[0].chapters.map((row) => row.chapter)).toEqual([2])
    expect(readyAlerts(rows).map((row) => row.chapter)).toEqual([1])
  })

  it('has nothing to show when nothing is waiting', () => {
    expect(groupApprovals([])).toEqual([])
  })
})

describe('the yeses that are still waiting', () => {
  it('gathers a book that is waiting onto one line', () => {
    const groups = groupPending([alert('a', 2, 'pending'), alert('a', 1, 'pending')])
    expect(groups).toHaveLength(1)
    expect(groups[0].chapters.map((row) => row.chapter)).toEqual([1, 2])
  })

  it('keeps a waiting line out of the questions', () => {
    const alerts = [alert('a', 1, 'pending'), alert('b', 1, 'approval')]
    expect(groupPending(alerts).map((group) => group.bookId)).toEqual(['a'])
    expect(groupApprovals(alerts).map((group) => group.bookId)).toEqual(['b'])
    expect(readyAlerts(alerts)).toEqual([])
  })
})
