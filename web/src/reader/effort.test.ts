// @vitest-environment jsdom
//
// The effort preference: what it defaults to, what it accepts, and what it
// does when storage is not there.
//
// The default is the one worth pinning down. It is `high` on purpose — every
// model offered is free, so the usual reason to ration thinking is absent —
// and it is the kind of value a later change lowers by accident.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_EFFORT,
  EFFORTS,
  effortLabel,
  isEffort,
  rememberEffort,
  storedEffort,
} from './effort.ts'

beforeEach(() => {
  localStorage.clear()
})

describe('the effort setting', () => {
  it('thinks as hard as it can, by default', () => {
    expect(DEFAULT_EFFORT).toBe('high')
    expect(storedEffort()).toBe('high')
  })

  it('offers the three levels least-first', () => {
    expect([...EFFORTS]).toEqual(['low', 'medium', 'high'])
  })

  it('remembers what the reader chose', () => {
    rememberEffort('low')
    expect(storedEffort()).toBe('low')
  })

  it('ignores a stored value that is not a level', () => {
    localStorage.setItem('reading-buddy:tutor-effort', 'maximum')
    expect(storedEffort()).toBe(DEFAULT_EFFORT)
  })

  it('accepts only the three words', () => {
    expect(isEffort('high')).toBe(true)
    expect(isEffort('max')).toBe(false)
    expect(isEffort(undefined)).toBe(false)
  })

  it('falls back to the default when storage throws', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    expect(storedEffort()).toBe(DEFAULT_EFFORT)
    expect(() => rememberEffort('low')).not.toThrow()
    read.mockRestore()
    write.mockRestore()
  })

  it('writes the level as a word the composer can show', () => {
    expect(effortLabel('medium')).toBe('Medium')
  })
})
