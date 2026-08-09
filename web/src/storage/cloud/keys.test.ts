import { describe, expect, it } from 'vitest'

import { assetKey, bookPrefix, safePath, sourceKey, userPrefix } from './keys.ts'

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const BOOK = '11111111-2222-3333-4444-555555555555'

describe('the prefix everything hangs off', () => {
  it('puts a reader’s files under their own id', () => {
    expect(userPrefix(USER)).toBe(`users/${USER}/`)
    expect(bookPrefix(USER, BOOK)).toBe(`users/${USER}/books/${BOOK}/`)
  })
})

describe('safePath', () => {
  it('keeps an ordinary archive path intact', () => {
    expect(safePath('OEBPS/images/fig1.png')).toBe('OEBPS/images/fig1.png')
  })

  it('folds Windows separators, so a path stays a path', () => {
    expect(safePath('OEBPS\\images\\fig1.png')).toBe('OEBPS/images/fig1.png')
  })

  it('drops empty segments left by doubled slashes', () => {
    expect(safePath('OEBPS//images///fig1.png')).toBe('OEBPS/images/fig1.png')
  })

  // The security-relevant one. `..` survives a `startsWith` check on the raw
  // key and is then normalised away by the URL constructor at signing time, so
  // it has to die here.
  it('drops traversal segments', () => {
    expect(safePath('../../etc/passwd')).toBe('etc/passwd')
    expect(safePath('OEBPS/../../images/fig1.png')).toBe('OEBPS/images/fig1.png')
    expect(safePath('./fig1.png')).toBe('fig1.png')
  })

  it('has no answer for a path made entirely of traversal', () => {
    expect(safePath('../..')).toBeUndefined()
    expect(safePath('')).toBeUndefined()
    expect(safePath('///')).toBeUndefined()
  })
})

describe('sourceKey', () => {
  it('keeps the filename, so the bucket can be read by eye', () => {
    expect(sourceKey(USER, BOOK, 'Beyond Mindfulness.epub')).toBe(
      `users/${USER}/books/${BOOK}/source/Beyond Mindfulness.epub`,
    )
  })

  it('never lets a filename become a path', () => {
    expect(sourceKey(USER, BOOK, 'a/b.epub')).toBe(
      `users/${USER}/books/${BOOK}/source/a_b.epub`,
    )
  })

  it('still produces a key when the filename is nothing but traversal', () => {
    expect(sourceKey(USER, BOOK, '../..')).toBe(`users/${USER}/books/${BOOK}/source/source`)
  })
})

describe('assetKey', () => {
  it('addresses a picture by the archive path its figure carries', () => {
    expect(assetKey(USER, BOOK, 'OEBPS/images/fig1.png')).toBe(
      `users/${USER}/books/${BOOK}/assets/OEBPS/images/fig1.png`,
    )
  })

  it('cannot be walked out of the reader’s own prefix', () => {
    const key = assetKey(USER, BOOK, '../../../users/someone-else/books/x/assets/y.png')
    expect(key).toBe(
      `users/${USER}/books/${BOOK}/assets/users/someone-else/books/x/assets/y.png`,
    )
    expect(key?.startsWith(userPrefix(USER))).toBe(true)
  })

  it('handles the reserved cover path', () => {
    expect(assetKey(USER, BOOK, '__cover__')).toBe(
      `users/${USER}/books/${BOOK}/assets/__cover__`,
    )
  })

  // Not a key of its own: two such assets would collide at the book's root and
  // the second would silently overwrite the first.
  it('refuses an asset with no usable path', () => {
    expect(assetKey(USER, BOOK, '')).toBeUndefined()
    expect(assetKey(USER, BOOK, '../..')).toBeUndefined()
  })
})
