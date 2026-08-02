import { describe, expect, it } from 'vitest'

import { advanceBar, barLabel, showsPercent, type BarState } from './bar.ts'
import type { Pages } from './progress.ts'

const PAGES: Pages = { page: 250, pageCount: 338, percent: 74, leftInChapter: 20 }

describe('cycling the bar', () => {
  it('goes page → left → bare', () => {
    expect(advanceBar('pages')).toBe('left')
    expect(advanceBar('left')).toBe('bare')
    expect(advanceBar('bare')).toBe('pages')
  })

  it('closes, so the bare state is never a trap', () => {
    let state: BarState = 'pages'
    for (let i = 0; i < 3; i += 1) state = advanceBar(state)
    expect(state).toBe('pages')
  })
})

describe('what the bar says', () => {
  it('shows where you are', () => {
    expect(barLabel('pages', PAGES, 'Chapter 5 of 12')).toBe('Page 250 of 338')
  })

  it('shows what is left of the chapter', () => {
    expect(barLabel('left', PAGES, 'Chapter 5 of 12')).toBe('20 pages left in this chapter')
  })

  it('says nothing at all in the bare state', () => {
    expect(barLabel('bare', PAGES, 'Chapter 5 of 12')).toBeNull()
  })

  it('agrees with itself about the percentage', () => {
    expect(showsPercent('pages')).toBe(true)
    expect(showsPercent('left')).toBe(true)
    expect(showsPercent('bare')).toBe(false)
  })

  it('counts one page as a page', () => {
    expect(barLabel('left', { ...PAGES, leftInChapter: 1 }, 'x')).toBe(
      '1 page left in this chapter',
    )
  })
})

describe('a book with no word counts yet', () => {
  it('shows the chapter rather than an invented page number', () => {
    // Imported before word counts existed and not yet backfilled. A blank bar
    // or a made-up figure would both be worse than the honest fallback.
    expect(barLabel('pages', null, 'Chapter 5 of 12')).toBe('Chapter 5 of 12')
    expect(barLabel('left', null, 'Chapter 5 of 12')).toBe('Chapter 5 of 12')
  })

  it('still gets a bare state', () => {
    expect(barLabel('bare', null, 'Chapter 5 of 12')).toBeNull()
  })
})
