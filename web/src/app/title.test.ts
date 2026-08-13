import { describe, expect, it } from 'vitest'

import { fullTitle } from './title.ts'

describe('fullTitle', () => {
  it('joins the two with a colon', () => {
    expect(fullTitle('Breath', 'The New Science of a Lost Art')).toBe(
      'Breath: The New Science of a Lost Art',
    )
  })

  it('leaves a book with no subtitle exactly as it is', () => {
    expect(fullTitle('Alaska')).toBe('Alaska')
    expect(fullTitle('Alaska', '')).toBe('Alaska')
    expect(fullTitle('Alaska', '   ')).toBe('Alaska')
  })

  // Both sources hand back titles with the subtitle already baked in, and the
  // file and the catalogue disagree about which does it.
  it('does not say the subtitle twice', () => {
    expect(fullTitle('Breath: The New Science', 'The New Science')).toBe(
      'Breath: The New Science',
    )
    expect(fullTitle('Breath — the new science', 'The New Science')).toBe(
      'Breath — the new science',
    )
  })

  // "Who Are You?: A Guide" reads as a typo.
  it('does not stack punctuation on a title that already ends in some', () => {
    expect(fullTitle('Who Are You?', 'A Guide')).toBe('Who Are You? A Guide')
    expect(fullTitle('Determined:', 'A Science of Life')).toBe('Determined: A Science of Life')
  })
})
