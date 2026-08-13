/**
 * A Google Books volume, turned into the fields this app stores.
 *
 * Everything here is shaped by what the live API actually returned for the
 * reader's own 32 books, not by the documentation. The awkward parts —
 * categories in arbitrary order, marketing HTML inside a plain-text field,
 * `edge=curl` on every cover — are each commented where they bite.
 */
import type { BookMeta } from '../structure/index.ts'
import { dimensionsOf, type VolumeDimensions } from './dimensions.ts'

export interface IndustryIdentifier {
  type?: string
  identifier?: string
}

/** Only the parts of `volumeInfo` this app reads. */
export interface VolumeInfo {
  title?: string
  subtitle?: string
  authors?: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  pageCount?: number
  printedPageCount?: number
  printType?: string
  categories?: string[]
  averageRating?: number
  ratingsCount?: number
  industryIdentifiers?: IndustryIdentifier[]
  imageLinks?: Record<string, string>
  dimensions?: VolumeDimensions
  language?: string
}

/** The coarse headings kept verbatim, in the reader's words: genre. */
const FICTION_HEADINGS = ['Fiction', 'Juvenile Fiction', 'Juvenile Nonfiction']

/**
 * The genre, from *any* category rather than the first one.
 *
 * Google returns categories in no useful order. *Breath* came back with 17 of
 * them led by `Education / Teaching / …`, so "take the first" would have filed a
 * book about respiratory science under Education. Anything with no Fiction
 * heading anywhere is non-fiction, and a book with no categories at all gets
 * nothing — a guess here is a wrong shelf.
 */
export function genreOf(categories: readonly string[] | undefined): string | undefined {
  if (!categories?.length) return undefined

  for (const category of categories) {
    const heading = category.split('/')[0].trim()
    if (FICTION_HEADINGS.includes(heading)) return heading
  }
  return 'Non-fiction'
}

/** Enough for a BISAC set and a few strays — the same ceiling the epub reader uses. */
const MAX_SUBJECTS = 16

/** How much blurb is worth keeping. Long enough for a jacket, short of an essay. */
const MAX_DESCRIPTION = 2000

/**
 * The blurb as plain text.
 *
 * `description` is documented as a string and arrives full of marketing HTML —
 * the real *Breath* record opens `<b>A <i>New York Times </i>Bestseller<br><br>`.
 * Stripped rather than rendered: this goes on the detail page as a sentence or
 * two, and it came off the internet, so treating it as markup would be both
 * wrong-looking and the one place a remote server's bytes reach the DOM as
 * elements.
 */
export function plainDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined

  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined

  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION).trimEnd()}…` : text
}

/** Biggest first — the plate on the opening screen is most of a phone wide. */
const IMAGE_SIZES = ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail']

/**
 * The best cover the volume offers, as a URL to fetch bytes from.
 *
 * Two fixes to the URL Google hands over, both visible in the picture:
 *
 * - **`edge=curl` is removed.** It draws a fake page-curl shadow down the right
 *   side of the image. Charming in a search result, wrong under a real cover on
 *   a shelf of real covers.
 * - **`http:` is upgraded to `https:`.** Google still hands out plain-http image
 *   links; fetching one from an https page is a mixed-content block.
 */
export function coverUrlOf(imageLinks: Record<string, string> | undefined): string | undefined {
  if (!imageLinks) return undefined

  const found = IMAGE_SIZES.map((size) => imageLinks[size]).find(Boolean)
  if (!found) return undefined

  return found.replace(/^http:/, 'https:').replace(/&edge=curl/g, '')
}

function identifier(volume: VolumeInfo, type: string): string | undefined {
  const found = volume.industryIdentifiers?.find((entry) => entry.type === type)
  return found?.identifier || undefined
}

export interface CatalogueRecord {
  /** The fields to merge onto the book. */
  fields: Partial<BookMeta>
  /** Where to fetch the cover bytes from, when the volume offers one. */
  coverUrl?: string
}

/**
 * Everything worth keeping from one volume.
 *
 * Absent stays absent — a volume that reports no page count must not write
 * `pageCount: undefined` over a number that was already there.
 */
export function recordOf(volumeId: string, volume: VolumeInfo): CatalogueRecord {
  const fields: Partial<BookMeta> = { googleVolumeId: volumeId }

  const set = <K extends keyof BookMeta>(field: K, value: BookMeta[K] | undefined) => {
    if (value !== undefined && value !== null && value !== '') fields[field] = value
  }

  set('subtitle', volume.subtitle)
  set('publisher', volume.publisher)
  set('published', volume.publishedDate)
  set('description', plainDescription(volume.description))
  set('pageCount', volume.pageCount || undefined)
  set('printedPageCount', volume.printedPageCount || undefined)
  set('genre', genreOf(volume.categories))
  set('averageRating', volume.averageRating)
  set('ratingsCount', volume.ratingsCount)
  set('googleIsbn13', identifier(volume, 'ISBN_13'))
  set('googleIsbn10', identifier(volume, 'ISBN_10'))

  // The reader's own author column is filled only where it is empty — that
  // merge belongs to the caller, which knows what is already there.
  if (volume.authors?.length) fields.author = volume.authors.join('; ')

  if (volume.categories?.length) {
    fields.subjects = [...new Set(volume.categories)].slice(0, MAX_SUBJECTS)
  }

  const { heightMm, widthMm, thicknessMm } = dimensionsOf(volume.dimensions)
  set('heightMm', heightMm)
  set('widthMm', widthMm)
  set('thicknessMm', thicknessMm)

  return { fields, coverUrl: coverUrlOf(volume.imageLinks) }
}
