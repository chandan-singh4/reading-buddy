import { describe, expect, it } from 'vitest'

import { cleanTitle } from './cleanTitle.ts'

/**
 * The four titles the reader photographed off their own shelf, which is what
 * this round of rules was written against. Kept verbatim — a paraphrase would
 * quietly drop whichever oddity made the case worth having.
 */
describe('cleanTitle — the reader’s own shelf', () => {
  it('rescues the Garfield title from author, nulls, year and publisher', () => {
    expect(
      cleanTitle(
        "The Fundamental Wisdom of the Middle Way Nagarjuna's Nagarjuna & Jay L Garfield null, null, 1995 Oxford University Press",
        'Nagarjuna',
      ),
    ).toBe('The Fundamental Wisdom of the Middle Way')
  })

  it('cuts a run-together subtitle', () => {
    expect(
      cleanTitle('The Quantum and the Lotus A Journey to the Frontiers Where', 'Matthieu Ricard'),
    ).toBe('The Quantum and the Lotus')
  })

  it('drops an edition bracket, the binding, the year and the publisher', () => {
    expect(
      cleanTitle(
        'The Perennial Way (Expanded Edition) New English Versions Bart Marshall Paperback, 2016 Realface Press',
        'Bart Marshall',
      ),
    ).toBe('The Perennial Way')
  })

  it('cuts at a capitalised “The” that starts the subtitle', () => {
    expect(
      cleanTitle(
        'Be As You Are The Teachings of Sri Ramana Maharshi (Arkana Sri Ramana',
        'Sri Ramana Maharshi, David Godman',
      ),
    ).toBe('Be As You Are')
  })
})

/**
 * The second round off the same shelf: every one of these ended in a lone open
 * bracket, because a cut had landed inside a bracket and taken its partner.
 */
describe('cleanTitle — orphaned brackets', () => {
  it.each([
    ['On Love (', 'On Love'],
    ['How to Speak Whale (', 'How to Speak Whale'],
    ['Alaska (', 'Alaska'],
    ['The World As Will And Representation (volume 1) (', 'The World As Will And Representation'],
    [
      'The Gay Science With a Prelude in Rhymes and an Appendix of Songs (',
      'The Gay Science',
    ],
  ])('%s → %s', (raw, expected) => {
    expect(cleanTitle(raw, undefined)).toBe(expected)
  })

  it('keeps a bracket that is genuinely closed and not an edition marker', () => {
    expect(cleanTitle('Frankenstein (Or, The Modern Prometheus)', undefined)).toBe(
      'Frankenstein (Or, The Modern Prometheus)',
    )
  })
})

/**
 * `With` opens as many titles as subtitles, so it is only allowed to cut when
 * what follows is long enough to be a subtitle.
 */
describe('cleanTitle — “With” cuts only on a long tail', () => {
  it.each([
    'A Room With a View',
    'Conversations With God',
    'Gone With the Wind',
    'Tuesdays With Morrie',
  ])('leaves %s alone', (title) => {
    expect(cleanTitle(title, undefined)).toBe(title)
  })
})

/**
 * The other half of the bargain. The reader accepted that cutting subtitles is
 * a guess; these are the cases where it must not fire, because each one would
 * be a real title cut in half.
 */
describe('cleanTitle — what must survive intact', () => {
  it.each([
    ['The Fundamental Wisdom of the Middle Way', undefined],
    ['The Man Who Mistook His Wife for a Hat', 'Oliver Sacks'],
    ['The Lion, the Witch and the Wardrobe', 'C. S. Lewis'],
    ['A Brief History of Time', 'Stephen Hawking'],
    ['The Rise and Fall of the Third Reich', 'William Shirer'],
    ['Death of a Salesman', 'Arthur Miller'],
    ['Alice’s Adventures in Wonderland', 'Lewis Carroll'],
    ['1984', 'George Orwell'],
    ['Fahrenheit 451', 'Ray Bradbury'],
  ])('leaves %s alone', (title, author) => {
    expect(cleanTitle(title, author)).toBe(title)
  })

  it('keeps a title whose lowercase article is genuinely mid-phrase', () => {
    // `the Third Reich` — English title case leaves it lowercase, which is
    // exactly the signal the subtitle rule leans on.
    expect(cleanTitle('The Rise and Fall of the Third Reich A History of Nazi Germany', undefined))
      .toBe('The Rise and Fall of the Third Reich')
  })

  it('does not cut at an author’s name that is part of the title', () => {
    expect(cleanTitle('The Autobiography of Malcolm X', 'Malcolm X')).toBe(
      'The Autobiography of Malcolm X',
    )
    expect(cleanTitle('Conversations with Ramana Maharshi', 'Ramana Maharshi')).toBe(
      'Conversations with Ramana Maharshi',
    )
  })

  it('does not cut a comma-separated run of capitalised articles', () => {
    expect(cleanTitle('The Good, The Bad and The Ugly', undefined)).toBe(
      'The Good, The Bad and The Ugly',
    )
  })

  it('never returns an empty title, whatever it is handed', () => {
    // A title made entirely of markers still has to leave the reader something
    // to tap — a blank row on the shelf is worse than an ugly one.
    expect(cleanTitle('1984', 'Orwell')).toBe('1984')
    expect(cleanTitle('Paperback Writer', undefined)).toBe('Paperback Writer')
    expect(cleanTitle('   ', undefined)).toBeUndefined()
    expect(cleanTitle(undefined, undefined)).toBeUndefined()
  })
})

describe('cleanTitle — the heal pass runs it again over its own output', () => {
  // `storage/repository.ts` re-cleans every stored title at boot, so a second
  // pass over an already-cleaned title must not shorten it further. Without
  // this, a title would erode a little on every launch.
  it.each([
    ["The Fundamental Wisdom of the Middle Way Nagarjuna's Nagarjuna & Jay L Garfield null, null, 1995 Oxford University Press", 'Nagarjuna'],
    ['The Quantum and the Lotus A Journey to the Frontiers Where', 'Matthieu Ricard'],
    ['The Perennial Way (Expanded Edition) New English Versions Bart Marshall Paperback, 2016 Realface Press', 'Bart Marshall'],
    ['Be As You Are The Teachings of Sri Ramana Maharshi (Arkana Sri Ramana', 'Sri Ramana Maharshi'],
  ])('is stable on a second pass over %s', (raw, author) => {
    const once = cleanTitle(raw, author)
    expect(cleanTitle(once, author)).toBe(once)
  })
})
