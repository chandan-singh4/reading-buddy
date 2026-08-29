// Which addresses count as being in a book. This one parse decides whether a
// reading session runs, so the four screens of a book are pinned here — they
// are four sibling routes, and treating them as four places was the bug.

import { describe, expect, it } from 'vitest'

import { bookInPath } from './useReadingClock.ts'

describe('bookInPath', () => {
  it('is the same book on every one of its screens', () => {
    const screens = [
      '/book/abc',
      '/book/abc/info',
      '/book/abc/last-time',
      '/book/abc/chapters',
    ]
    expect(screens.map(bookInPath)).toEqual(['abc', 'abc', 'abc', 'abc'])
  })

  it('is nothing at all outside a book', () => {
    expect(bookInPath('/')).toBeUndefined()
    expect(bookInPath('/library')).toBeUndefined()
    expect(bookInPath('/stats')).toBeUndefined()
    // Not a book id — the route table has no such page, and half an address is
    // not something to start a clock on.
    expect(bookInPath('/book')).toBeUndefined()
    expect(bookInPath('/book/')).toBeUndefined()
  })

  it('tells two books apart', () => {
    expect(bookInPath('/book/one/info')).not.toBe(bookInPath('/book/two/info'))
  })

  it('reads an id that had to be escaped to fit in a URL', () => {
    expect(bookInPath('/book/a%20b/info')).toBe('a b')
  })
})
