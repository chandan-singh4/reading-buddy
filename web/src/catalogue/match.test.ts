/**
 * The guard, argued from the reader's own library.
 *
 * Every case below is a real book on the real shelf and a real result the live
 * Google Books API returned for it. The two that matter most are the refusals:
 * `Vedanta Voice of Freedom` matching plain `Vedanta`, and `Kundalini` — a book
 * with no author recorded — matching a stranger's. Both are wrong answers that
 * look exactly like right ones once stored.
 */
import { describe, expect, it } from 'vitest'

import { fold, judge, sharesAuthor, titleCoverage, tokens } from './match.ts'

describe('fold', () => {
  // The whole reason folding exists: the file and the catalogue spell this name
  // two different ways, and a plain comparison calls the right book a stranger.
  it('strips the accents that make one name look like two', () => {
    expect(fold('Thích Nhất Hạnh')).toBe('thich nhat hanh')
  })

  it('flattens punctuation and case', () => {
    expect(fold('C. G. Jung’s')).toBe('c  g  jung s')
  })
})

describe('tokens', () => {
  it('drops the words that carry no evidence', () => {
    expect([...tokens('The Myth of Sisyphus')]).toEqual(['myth', 'sisyphus'])
  })

  it('drops initials, which match everything and mean nothing', () => {
    expect([...tokens('C. G. Jung')]).toEqual(['jung'])
  })
})

describe('sharesAuthor', () => {
  // Real: the file records four names in citation order, Google records one.
  it('sees through a reversed, comma-mangled author list', () => {
    expect(sharesAuthor('Shamdasani, Sonu, Jung, C. G.', ['C. G. Jung'])).toBe(true)
  })

  it('sees through a differently spelled name', () => {
    expect(sharesAuthor('Thich Nhat Hanh', ['Nhat Hanh (Thich.)'])).toBe(true)
  })

  it('refuses two different people', () => {
    expect(sharesAuthor('Jon Krakauer', ['Walter Bonatti'])).toBe(false)
  })

  // Unknown is not the same as fine. Two blanks have agreed on nothing, and
  // treating that as a pass is how an unattributed book matches anything.
  it('says unknown when either side has no author', () => {
    expect(sharesAuthor(undefined, ['Anyone'])).toBeUndefined()
    expect(sharesAuthor('', ['Anyone'])).toBeUndefined()
    expect(sharesAuthor('Someone', [])).toBeUndefined()
    expect(sharesAuthor('Someone', undefined)).toBeUndefined()
  })
})

describe('titleCoverage', () => {
  // Measured one way round on purpose: our titles carry subtitles the catalogue
  // drops, so asking "is theirs contained in ours?" is the right question.
  it('accepts a catalogue title that is the short form of ours', () => {
    expect(
      titleCoverage('Determined A Science of Life Without Free Will', 'Determined'),
    ).toBe(1)
  })

  // And this is the cost of that direction, which is why the author check
  // exists: `Vedanta` is entirely contained in `Vedanta Voice of Freedom`.
  it('scores a too-short catalogue title as a full match on its own', () => {
    expect(titleCoverage('Vedanta Voice of Freedom', 'Vedanta')).toBe(1)
  })

  it('scores a partial overlap as a fraction', () => {
    expect(titleCoverage('The Quantum and the Lotus', 'The Quantum and the Rose')).toBe(0.5)
  })

  it('gives nothing for an empty catalogue title', () => {
    expect(titleCoverage('Breath', '')).toBe(0)
  })
})

describe('judge', () => {
  it('accepts the ordinary good match', () => {
    const verdict = judge('Breath', 'James Nestor', {
      title: 'Breath',
      authors: ['James Nestor'],
      printType: 'BOOK',
    })

    expect(verdict.accepted).toBe(true)
  })

  it('accepts a catalogue entry that dropped our subtitle', () => {
    expect(
      judge('Determined A Science of Life Without Free Will', 'Robert M. Sapolsky', {
        title: 'Determined',
        authors: ['Robert M. Sapolsky'],
      }).accepted,
    ).toBe(true)
  })

  it('accepts the differently spelled author', () => {
    expect(
      judge('The miracle of mindfulness a manual on meditation', 'Thich Nhat Hanh', {
        title: 'The Miracle of Mindfulness',
        authors: ['Nhat Hanh (Thich.)'],
      }).accepted,
    ).toBe(true)
  })

  it('refuses a book by somebody else', () => {
    const verdict = judge('The Mountains of My Life', 'Walter Bonatti', {
      title: 'The Mountains of My Life',
      authors: ['Someone Else'],
    })

    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toBe('different author')
  })

  // The measured near-miss. A one-word catalogue title is fully covered by our
  // longer one, so coverage alone would have accepted a different book; the
  // author is what refuses it.
  it('refuses Vedanta standing in for Vedanta Voice of Freedom', () => {
    expect(
      judge('Vedanta Voice of Freedom', 'Swami Vivekananada', {
        title: 'Vedanta',
        authors: ['Bithika Mukerji'],
      }).accepted,
    ).toBe(false)
  })

  // The other measured near-miss, and the reason the bar moves. This book is on
  // the shelf with no author at all, so nothing corroborates the title.
  it('refuses a one-word title when there is no author to check', () => {
    const verdict = judge('Kundalini', undefined, {
      title: 'Kundalini Yoga for the West',
      authors: ['Anyone At All'],
    })

    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toContain('no author to check')
  })

  it('still accepts an unattributed book whose title matches almost exactly', () => {
    expect(judge('An Immense World', undefined, { title: 'An Immense World' }).accepted).toBe(true)
  })

  // Study guides and audiobooks share titles with the real thing, and a study
  // guide's page count is not the book's.
  it('refuses anything that is not a book', () => {
    const verdict = judge('Breath', 'James Nestor', {
      title: 'Breath',
      authors: ['James Nestor'],
      printType: 'MAGAZINE',
    })

    expect(verdict.accepted).toBe(false)
    expect(verdict.reason).toContain('not a book')
  })

  it('treats a missing printType as a book, which is what it always is', () => {
    expect(judge('Breath', 'James Nestor', { title: 'Breath', authors: ['James Nestor'] }).accepted).toBe(
      true,
    )
  })

  it('explains itself in the reason, for the day one of these is wrong', () => {
    expect(judge('Breath', 'James Nestor', { title: 'Breath', authors: ['James Nestor'] }).reason).toBe(
      'author agrees; title coverage 1.00 of 0.50 needed',
    )
  })
})
