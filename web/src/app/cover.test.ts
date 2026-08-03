import { describe, expect, it } from 'vitest'

import { coverInitial, coverSwatch } from './cover.ts'

describe('coverSwatch', () => {
  it('gives the same title the same swatch every time', () => {
    expect(coverSwatch('The Red Book')).toBe(coverSwatch('The Red Book'))
  })

  it('is one of the theme tokens', () => {
    expect(coverSwatch('Anything')).toMatch(/^var\(--cover-[1-6]\)$/)
  })
})

describe('coverInitial', () => {
  it('takes the first letter of the title, uppercased', () => {
    expect(coverInitial('the seven husbands')).toBe('T')
  })

  it('skips a leading quote or punctuation to find a real letter', () => {
    expect(coverInitial('"Emma"')).toBe('E')
  })

  it('falls back to a question mark for a title with no letters at all', () => {
    expect(coverInitial('- - -')).toBe('?')
  })
})
