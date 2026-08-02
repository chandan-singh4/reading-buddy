import { describe, expect, it } from 'vitest'

import {
  AnchorError,
  chapterPath,
  formatAnchor,
  isAnchor,
  parseAnchor,
  sectionPath,
  sectionPathOf,
  tryParseAnchor,
} from './anchor.ts'

describe('formatAnchor', () => {
  it('pads each coordinate to its canonical width', () => {
    expect(formatAnchor({ chapter: 2, section: 3, paragraph: 13 })).toBe(
      '[ch02-s03-p013]',
    )
  })

  it('keeps the first location readable', () => {
    expect(formatAnchor({ chapter: 1, section: 1, paragraph: 1 })).toBe(
      '[ch01-s01-p001]',
    )
  })

  it('grows past the pad width instead of truncating', () => {
    // A 100+ chapter reference work must not collide with chapter 00.
    expect(formatAnchor({ chapter: 120, section: 4, paragraph: 2500 })).toBe(
      '[ch120-s04-p2500]',
    )
  })

  it.each([
    ['zero', { chapter: 0, section: 1, paragraph: 1 }],
    ['negative', { chapter: 1, section: -3, paragraph: 1 }],
    ['fractional', { chapter: 1, section: 1, paragraph: 1.5 }],
    ['NaN', { chapter: 1, section: 1, paragraph: Number.NaN }],
    ['Infinity', { chapter: Number.POSITIVE_INFINITY, section: 1, paragraph: 1 }],
  ])('rejects a %s coordinate rather than emitting a wrong anchor', (_, parts) => {
    expect(() => formatAnchor(parts)).toThrow(AnchorError)
  })
})

describe('parseAnchor', () => {
  it('reads the three coordinates back out', () => {
    expect(parseAnchor('[ch02-s03-p013]')).toEqual({
      chapter: 2,
      section: 3,
      paragraph: 13,
    })
  })

  it('round-trips any valid location', () => {
    const cases = [
      { chapter: 1, section: 1, paragraph: 1 },
      { chapter: 7, section: 12, paragraph: 999 },
      { chapter: 120, section: 4, paragraph: 2500 },
    ]
    for (const parts of cases) {
      expect(parseAnchor(formatAnchor(parts))).toEqual(parts)
    }
  })

  it.each([
    ['under-padded', '[ch2-s3-p13]'],
    ['unbracketed', 'ch02-s03-p013'],
    ['upper-case', '[CH02-S03-P013]'],
    ['surrounding whitespace', ' [ch02-s03-p013] '],
    ['embedded in prose', 'see [ch02-s03-p013] above'],
    ['missing paragraph', '[ch02-s03]'],
    ['wrong separators', '[ch02_s03_p013]'],
    ['zeroed chapter', '[ch00-s03-p013]'],
    ['zeroed paragraph', '[ch02-s03-p000]'],
    ['empty', ''],
  ])('rejects an %s anchor', (_, value) => {
    expect(() => parseAnchor(value)).toThrow(AnchorError)
    expect(tryParseAnchor(value)).toBeNull()
    expect(isAnchor(value)).toBe(false)
  })
})

describe('isAnchor', () => {
  it('accepts a canonical anchor', () => {
    expect(isAnchor('[ch02-s03-p013]')).toBe(true)
  })
})

describe('addresses', () => {
  it('builds the chapter address', () => {
    expect(chapterPath(2)).toBe('ch02')
    expect(chapterPath(120)).toBe('ch120')
  })

  it('builds the section address used as the storage key', () => {
    expect(sectionPath(2, 3)).toBe('ch02/s03')
  })

  it('derives the section to load from an anchor', () => {
    expect(sectionPathOf('[ch02-s03-p013]')).toBe('ch02/s03')
  })

  it('refuses to build an address from a malformed anchor', () => {
    expect(() => sectionPathOf('[ch2-s3-p13]')).toThrow(AnchorError)
  })

  it('rejects invalid coordinates', () => {
    expect(() => chapterPath(0)).toThrow(AnchorError)
    expect(() => sectionPath(1, 0)).toThrow(AnchorError)
  })
})
