import { describe, expect, it } from 'vitest'

import { chapterHeadingStyle, chapterNumber, subjectTags } from './chapterHeading.ts'

describe('subject headings become tags', () => {
  it('cuts a BISAC heading at its slashes', () => {
    expect(subjectTags(['Religion / Spirituality'])).toEqual(['religion', 'spirituality'])
  })

  it('says each tag once across several headings', () => {
    expect(subjectTags(['Philosophy / Spirituality', 'Religion / Spirituality'])).toEqual([
      'philosophy',
      'spirituality',
      'religion',
    ])
  })

  it('answers with nothing when the book has no headings', () => {
    expect(subjectTags(undefined)).toEqual([])
  })
})

describe('reading a chapter number off a title', () => {
  it('reads "Chapter 6"', () => {
    expect(chapterNumber('Chapter 6')).toEqual({ label: 'Chapter', numeral: '6', rest: '' })
  })

  it('keeps the name after the number', () => {
    expect(chapterNumber('6. The Wave')).toEqual({
      label: 'Chapter',
      numeral: '6',
      rest: 'The Wave',
    })
  })

  it('reads a roman numeral', () => {
    expect(chapterNumber('Chapter IV — Return')).toEqual({
      label: 'Chapter',
      numeral: 'IV',
      rest: 'Return',
    })
  })

  it('keeps the book’s own word for a division', () => {
    expect(chapterNumber('Part 2')?.label).toBe('Part')
  })

  it('answers with nothing for a title that is purely a name', () => {
    expect(chapterNumber('The Wave')).toBeNull()
  })

  it('does not read the word "I" as a numeral', () => {
    expect(chapterNumber('I Remember')).toBeNull()
  })

  it('does read it when the book labelled it', () => {
    expect(chapterNumber('Chapter I')?.numeral).toBe('I')
  })
})

describe('choosing a chapter opening', () => {
  it('ornaments a book with a spiritual subject, numbered or not', () => {
    expect(chapterHeadingStyle(['Philosophy / Spirituality'], 'Chapter 6')).toBe('ornamental')
  })

  it('gives fiction a nameplate', () => {
    expect(chapterHeadingStyle(['Fiction / Classics'], 'Chapter 6')).toBe('nameplate')
  })

  it('puts religion ahead of fiction when a book carries both', () => {
    expect(chapterHeadingStyle(['Fiction / Religious'], 'One')).toBe('ornamental')
  })

  it('uses the oversized numeral for a numbered chapter', () => {
    expect(chapterHeadingStyle(['Science / Physics'], 'Chapter 6')).toBe('numeral')
  })

  it('falls back to the plain setting for a chapter with no number', () => {
    expect(chapterHeadingStyle(['Science / Physics'], 'The Wave')).toBe('minimal')
  })

  it('falls back to the plain setting when the book has no subjects at all', () => {
    expect(chapterHeadingStyle(undefined, 'Acknowledgements')).toBe('minimal')
  })
})
