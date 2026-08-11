import { describe, expect, it } from 'vitest'

import { cleanAuthor } from './cleanAuthor.ts'

describe('cleanAuthor — the junk', () => {
  // Straight off the reader's own shelf: a one-entry list that kept its
  // separator. It read as a typo in every book row it appeared in.
  it('drops a separator stranded on the end', () => {
    expect(cleanAuthor('James Nestor;')).toBe('James Nestor')
  })

  it('leaves a clean name exactly as it found it', () => {
    expect(cleanAuthor('Albert Camus')).toBe('Albert Camus')
    expect(cleanAuthor('Alain de Botton')).toBe('Alain de Botton')
  })

  it.each(['Unknown', 'unknown', 'UNKNOWN AUTHOR', 'n/a', 'None', 'null'])(
    'reads %s as no author at all',
    (placeholder) => {
      expect(cleanAuthor(placeholder)).toBeUndefined()
    },
  )

  // `Anonymous` is the opposite case — a real attribution the library uses.
  it('keeps a deliberate anonymous attribution', () => {
    expect(cleanAuthor('Anonymous')).toBe('Anonymous')
  })

  // Also from the shelf: the book's own title sitting in the author's place.
  it('refuses a sentence as a name', () => {
    expect(cleanAuthor('Kundalini. The evolutionary energy in man')).toBeUndefined()
  })

  it('refuses a string too long to be anybody', () => {
    expect(cleanAuthor('a study guide to the collected letters of somebody else')).toBeUndefined()
  })

  it('refuses a name carrying an identifier', () => {
    expect(cleanAuthor('Nestor 9780241289129')).toBeUndefined()
  })

  it.each([undefined, null, '', '   ', ';', ' ; ; '])('has no answer for %p', (raw) => {
    expect(cleanAuthor(raw)).toBeUndefined()
  })
})

describe('cleanAuthor — the names it must not break', () => {
  it('keeps an initial', () => {
    expect(cleanAuthor('Stephen R. Bown')).toBe('Stephen R. Bown')
    expect(cleanAuthor('J. R. R. Tolkien')).toBe('J. R. R. Tolkien')
  })

  // The sentence test looks for `word. Capital`, which is exactly the shape of
  // an abbreviated honorific — and those are attached to real authors.
  it('keeps an abbreviated honorific', () => {
    expect(cleanAuthor('St. John of the Cross')).toBe('St. John of the Cross')
    expect(cleanAuthor('Dr. Seuss')).toBe('Dr. Seuss')
  })

  it('keeps a long transliterated name', () => {
    expect(cleanAuthor('Ngawang Losang Tenzin Gyatso')).toBe('Ngawang Losang Tenzin Gyatso')
  })
})

describe('cleanAuthor — catalogue order', () => {
  it('reads a surname-first name back the way people say it', () => {
    expect(cleanAuthor('Bown, Stephen R.')).toBe('Stephen R. Bown')
    expect(cleanAuthor('Ricard, Matthieu')).toBe('Matthieu Ricard')
  })

  // `King, Jr.` is not a forename and a surname, and flipping it would produce
  // `Jr. King` — a name that belongs to nobody.
  it('never mistakes a suffix for a forename', () => {
    expect(cleanAuthor('King, Jr.')).toBe('King, Jr.')
  })

  // Two commas is a shape this can't read, and a half-understood reassembly
  // would be worse than the catalogue order it started in.
  it('leaves anything more tangled than one comma alone', () => {
    expect(cleanAuthor('Smith, John, Mary')).toBe('Smith, John, Mary')
  })
})

describe('cleanAuthor — more than one of them', () => {
  it('keeps every author the file credits', () => {
    expect(cleanAuthor('James Nestor; Matthieu Ricard')).toBe('James Nestor, Matthieu Ricard')
  })

  it('puts each of them in reading order', () => {
    expect(cleanAuthor('Bown, Stephen R.; Ricard, Matthieu')).toBe(
      'Stephen R. Bown, Matthieu Ricard',
    )
  })

  it('drops only the entry that is junk', () => {
    expect(cleanAuthor('Unknown; Jon Krakauer')).toBe('Jon Krakauer')
  })

  it('does not list the same person twice', () => {
    expect(cleanAuthor('Jon Krakauer; jon krakauer')).toBe('Jon Krakauer')
  })
})
