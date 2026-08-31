import { describe, expect, it } from 'vitest'

import type { StoredAlert } from '../storage/db.ts'
import { dueForRetry } from './engine.ts'

const NOW = Date.parse('2026-08-31T12:00:00.000Z')

function pending(triedAt?: string, kind: StoredAlert['kind'] = 'pending'): StoredAlert {
  return { id: 'a', kind, triedAt } as StoredAlert
}

describe('when a waiting yes tries again', () => {
  it('leaves a first attempt alone while it is still in flight', () => {
    expect(dueForRetry(pending(undefined), NOW)).toBe(false)
  })

  it('waits the full hour', () => {
    expect(dueForRetry(pending('2026-08-31T11:30:00.000Z'), NOW)).toBe(false)
  })

  it('tries again once the hour has passed', () => {
    expect(dueForRetry(pending('2026-08-31T11:00:00.000Z'), NOW)).toBe(true)
  })

  it('never gives up, however old the last try is', () => {
    expect(dueForRetry(pending('2026-01-01T00:00:00.000Z'), NOW)).toBe(true)
  })

  it('ignores a line that is not waiting', () => {
    expect(dueForRetry(pending('2026-01-01T00:00:00.000Z', 'ready'), NOW)).toBe(false)
  })
})
