// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  leadingOf,
  measureOf,
  readReaderSettings,
  textSizeOf,
  writeReaderSettings,
  type ReaderSettings,
} from './readerSettings.ts'

afterEach(() => {
  localStorage.clear()
})

describe('readReaderSettings', () => {
  it('returns the defaults when nothing has been saved', () => {
    expect(readReaderSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips a saved value', () => {
    const settings: ReaderSettings = {
      theme: 'sepia',
      font: 'sans',
      textStep: 4,
      spacing: 'relaxed',
      margins: 'wide',
    }
    writeReaderSettings(settings)
    expect(readReaderSettings()).toEqual(settings)
  })

  it('falls back field-by-field when storage holds something malformed', () => {
    localStorage.setItem(
      'reading-buddy:reader-settings',
      JSON.stringify({ theme: 'purple', font: 'sans', textStep: 99 }),
    )
    expect(readReaderSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      font: 'sans',
    })
  })

  it('falls back to defaults on unparsable storage', () => {
    localStorage.setItem('reading-buddy:reader-settings', '{not json')
    expect(readReaderSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('textSizeOf', () => {
  it('matches the reading page default at the middle step', () => {
    expect(textSizeOf(3)).toBe('1.125rem')
  })

  it('clamps out-of-range steps to the ends', () => {
    expect(textSizeOf(0)).toBe(textSizeOf(1))
    expect(textSizeOf(99)).toBe(textSizeOf(5))
  })
})

describe('leadingOf', () => {
  it('matches the reading page default for normal spacing', () => {
    expect(leadingOf('normal')).toBe('1.7')
  })
})

describe('measureOf', () => {
  it('matches the reading page default for normal margins', () => {
    expect(measureOf('normal')).toBe('34rem')
  })
})
