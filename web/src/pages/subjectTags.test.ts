// The subject chips on the book's own page. The rule is small, but it runs on
// headings written by somebody else, so the odd shapes are the point.

import { describe, expect, it } from 'vitest'

import { subjectTags } from './BookInfo.tsx'

describe('subjectTags', () => {
  it('cuts a path into its own terms', () => {
    expect(subjectTags(['Body, Mind & Spirit / Mindfulness & Meditation'])).toEqual([
      'Body, Mind & Spirit',
      'Mindfulness & Meditation',
    ])
  })

  // The fault the reader reported: one card said Philosophy four times.
  it('says a repeated term once', () => {
    expect(
      subjectTags(['Philosophy / Hindu', 'Philosophy / Eastern', 'Philosophy / Mind & Body']),
    ).toEqual(['Philosophy', 'Hindu', 'Eastern', 'Mind & Body'])
  })

  it('treats a difference of case as the same term and keeps the first spelling', () => {
    expect(subjectTags(['Philosophy / Hindu', 'PHILOSOPHY / Zen'])).toEqual([
      'Philosophy',
      'Hindu',
      'Zen',
    ])
  })

  it('drops the filler at the end of a path', () => {
    expect(subjectTags(['Self-Help / Personal Growth / General', 'Body, Mind & Spirit / General'])).toEqual([
      'Self-Help',
      'Personal Growth',
      'Body, Mind & Spirit',
    ])
  })

  it('keeps a comma, which separates nothing', () => {
    expect(subjectTags(['Body, Mind & Spirit'])).toEqual(['Body, Mind & Spirit'])
  })

  it('survives empty parts and stray spacing', () => {
    expect(subjectTags(['  Philosophy //  Hindu  ', '', '   '])).toEqual(['Philosophy', 'Hindu'])
  })

  it('gives nothing back for nothing', () => {
    expect(subjectTags([])).toEqual([])
  })
})
