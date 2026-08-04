// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  leadingOf,
  measureOf,
  readReaderSettings,
  READING_FONTS,
  THEMES,
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

describe('the themes and faces on offer', () => {
  it('every theme can actually be saved and read back', () => {
    // The bug this rules out: adding a theme to the list the Aa tab renders,
    // but not to what `readReaderSettings` will accept — the reader taps it,
    // it applies, and it silently reverts to the default on the next launch.
    for (const theme of THEMES) {
      writeReaderSettings({ ...DEFAULT_SETTINGS, theme: theme.value })
      expect(readReaderSettings().theme).toBe(theme.value)
    }
  })

  it('every reading face can actually be saved and read back', () => {
    for (const font of READING_FONTS) {
      writeReaderSettings({ ...DEFAULT_SETTINGS, font: font.value })
      expect(readReaderSettings().font).toBe(font.value)
    }
  })

  it('keeps the settings a reader may already have saved', () => {
    // These four themes and three faces predate the rest. Dropping or renaming
    // one would quietly reset a reader's choice.
    expect(THEMES.map((t) => t.value)).toEqual(
      expect.arrayContaining(['auto', 'light', 'dark', 'sepia']),
    )
    expect(READING_FONTS.map((f) => f.value)).toEqual(
      expect.arrayContaining(['serif', 'serif-alt', 'sans']),
    )
  })

  it('still falls back to the default for a face that does not exist', () => {
    localStorage.setItem(
      'reading-buddy:reader-settings',
      JSON.stringify({ ...DEFAULT_SETTINGS, font: 'comic-sans' }),
    )
    expect(readReaderSettings().font).toBe(DEFAULT_SETTINGS.font)
  })
})
