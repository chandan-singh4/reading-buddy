import { describe, expect, it } from 'vitest'

import { coverUrlOf, genreOf, plainDescription, recordOf } from './volume.ts'

describe('genreOf', () => {
  // The measured failure of "take the first category": Google returned 17 for
  // Breath, led by Education, for a book about respiratory science.
  it('finds a Fiction heading anywhere in the list, not just at the front', () => {
    expect(
      genreOf(['Education / Teaching / General', 'Fiction / Literary', 'Science / Life Sciences']),
    ).toBe('Fiction')
  })

  it('keeps the coarse label verbatim, subdivisions and all', () => {
    expect(genreOf(['Juvenile Fiction / Animals'])).toBe('Juvenile Fiction')
    expect(genreOf(['Juvenile Nonfiction / Science'])).toBe('Juvenile Nonfiction')
  })

  it('calls everything else non-fiction', () => {
    expect(genreOf(['Science / Life Sciences / Human Anatomy & Physiology'])).toBe('Non-fiction')
    expect(genreOf(['Cooking / Regional & Ethnic / Indian'])).toBe('Non-fiction')
  })

  // Two books on the shelf came back with no categories. A guess here is a
  // wrong shelf, and nothing later would question it.
  it('gives nothing for a volume with no categories', () => {
    expect(genreOf(undefined)).toBeUndefined()
    expect(genreOf([])).toBeUndefined()
  })
})

describe('plainDescription', () => {
  // Verbatim from the live record for Breath. `description` is documented as a
  // string and arrives as marketing HTML.
  it('strips the markup Google sends inside a plain-text field', () => {
    expect(
      plainDescription('<b>A <i>New York Times </i>Bestseller<br><br>A great book.'),
    ).toBe('A New York Times Bestseller A great book.')
  })

  it('unescapes the entities left behind', () => {
    expect(plainDescription('Tooth &amp; Claw &#39;93')).toBe("Tooth & Claw '93")
  })

  it('gives nothing for markup that contained no words', () => {
    expect(plainDescription('<br><br>')).toBeUndefined()
    expect(plainDescription(undefined)).toBeUndefined()
  })

  it('cuts an essay down to a jacket', () => {
    const long = plainDescription('word '.repeat(1000))
    expect(long!.length).toBeLessThanOrEqual(2001)
    expect(long!.endsWith('…')).toBe(true)
  })
})

describe('coverUrlOf', () => {
  it('takes the biggest picture offered', () => {
    expect(
      coverUrlOf({
        smallThumbnail: 'https://books.google.com/small',
        thumbnail: 'https://books.google.com/thumb',
        large: 'https://books.google.com/large',
      }),
    ).toBe('https://books.google.com/large')
  })

  // A fake page-curl shadow down the right edge. Fine in a search result, wrong
  // beside real covers on a shelf.
  it('removes the fake page curl', () => {
    expect(coverUrlOf({ thumbnail: 'https://books.google.com/x?zoom=1&edge=curl' })).toBe(
      'https://books.google.com/x?zoom=1',
    )
  })

  // Google still hands out http links; fetching one from an https page is a
  // mixed-content block, which shows up as a book that mysteriously has no cover.
  it('upgrades an http link', () => {
    expect(coverUrlOf({ thumbnail: 'http://books.google.com/x' })).toBe('https://books.google.com/x')
  })

  it('gives nothing when the volume has no pictures', () => {
    expect(coverUrlOf(undefined)).toBeUndefined()
    expect(coverUrlOf({})).toBeUndefined()
  })
})

describe('recordOf', () => {
  it('takes everything worth keeping off a full volume', () => {
    const { fields, coverUrl } = recordOf('3_LsDwAAQBAJ', {
      title: 'Breath',
      subtitle: 'The New Science of a Lost Art',
      authors: ['James Nestor'],
      publisher: 'Penguin',
      publishedDate: '2020-05-26',
      description: '<b>A bestseller.</b>',
      pageCount: 304,
      printedPageCount: 306,
      categories: ['Science / Life Sciences'],
      averageRating: 4.5,
      ratingsCount: 2,
      industryIdentifiers: [
        { type: 'ISBN_10', identifier: '0735213615' },
        { type: 'ISBN_13', identifier: '9780735213616' },
      ],
      imageLinks: { thumbnail: 'https://books.google.com/art' },
      dimensions: { height: '24.00 cm', width: '16.40 cm', thickness: '2.80 cm' },
    })

    expect(fields).toEqual({
      googleVolumeId: '3_LsDwAAQBAJ',
      subtitle: 'The New Science of a Lost Art',
      author: 'James Nestor',
      publisher: 'Penguin',
      published: '2020-05-26',
      description: 'A bestseller.',
      pageCount: 304,
      printedPageCount: 306,
      genre: 'Non-fiction',
      subjects: ['Science / Life Sciences'],
      averageRating: 4.5,
      ratingsCount: 2,
      googleIsbn13: '9780735213616',
      googleIsbn10: '0735213615',
      heightMm: 240,
      widthMm: 164,
      thicknessMm: 28,
    })
    expect(coverUrl).toBe('https://books.google.com/art')
  })

  // The measured shape of a thin record: the search endpoint returns pageCount
  // 0, and 0 pages written over a real number is worse than no number.
  it('keeps a bare volume bare, and never writes a zero page count', () => {
    const { fields, coverUrl } = recordOf('abc', { title: 'A Book', pageCount: 0 })

    expect(fields).toEqual({ googleVolumeId: 'abc' })
    expect(coverUrl).toBeUndefined()
  })

  it('joins co-authors the way the rest of the app spells them', () => {
    expect(recordOf('abc', { authors: ['Sonu Shamdasani', 'C. G. Jung'] }).fields.author).toBe(
      'Sonu Shamdasani; C. G. Jung',
    )
  })
})
