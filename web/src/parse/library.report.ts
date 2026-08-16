/**
 * A one-line report on every epub in a local folder, run by hand.
 *
 * Not a test and not shipped. It exists because judging the parser one book at
 * a time is how book-specific workarounds get written: a rule that rescues the
 * book in front of you and quietly damages the other seven. This prints the
 * same nine numbers for every book on the shelf, so a change can be judged
 * against the whole library before and after.
 *
 * What the numbers mean, and which way is better:
 *
 * - `ch` / `sec` / `para` — how many divisions and paragraphs the book has.
 *   A *drop* in these is the signature of content being fused or swallowed.
 * - `longest` / `slabs` — the longest paragraph, and how many run past 3,000
 *   characters. A real paragraph rarely does. A slab is usually a whole chapter
 *   that arrived as one block.
 * - `subhead` — headings the page carried that are not division titles.
 * - `italicPara` — paragraphs set entirely in italic. A sudden jump here means
 *   a style rule is matching far more widely than the book intended.
 * - `marked` — paragraphs carrying inline marks (italic, bold, links).
 * - `pageNo` — paragraphs that know the printed page they open.
 * - `breaks` — paragraphs that begin a new page of the original.
 *
 * Run it:
 *
 *   npx tsx src/parse/library.report.ts "C:/path/to/books"
 *
 * It needs a DOM. Run it through vitest's jsdom environment if `tsx` alone has
 * no `DOMParser` — see the scratchpad probes this was distilled from.
 */

import { readFileSync, readdirSync } from 'node:fs'

import type { BookId, BookMeta } from '../structure/types.ts'
import { parseEpub } from './epub.ts'

function metaFor(name: string): BookMeta {
  return {
    id: 'report' as BookId,
    title: name,
    source: 'epub',
    type: 'dense-technical',
    importedAt: '1970-01-01',
  }
}

export async function reportOn(directory: string): Promise<string[]> {
  const lines: string[] = []

  for (const file of readdirSync(directory).sort()) {
    if (!file.toLowerCase().endsWith('.epub')) continue

    const book = await parseEpub(new Uint8Array(readFileSync(`${directory}/${file}`)), metaFor(file))
    const paragraphs = book.sections.flatMap((section) => section.paragraphs)
    const lengths = paragraphs.map((paragraph) => paragraph.text.length).sort((a, b) => b - a)

    const count = (test: (paragraph: (typeof paragraphs)[number]) => boolean) =>
      paragraphs.filter(test).length

    lines.push(
      [
        `ch=${String(book.chapters.length).padStart(3)}`,
        `sec=${String(book.sections.length).padStart(3)}`,
        `para=${String(paragraphs.length).padStart(5)}`,
        `longest=${String(lengths[0] ?? 0).padStart(6)}`,
        `slabs=${String(lengths.filter((n) => n > 3000).length).padStart(3)}`,
        `subhead=${String(count((p) => p.label === 'subheading')).padStart(4)}`,
        `italicPara=${String(count((p) => p.appearance?.italic === true)).padStart(4)}`,
        `marked=${String(count((p) => (p.marks?.length ?? 0) > 0)).padStart(5)}`,
        `pageNo=${String(count((p) => p.printedPage !== undefined)).padStart(4)}`,
        `breaks=${String(count((p) => p.startsPage === true)).padStart(3)}`,
        file.slice(0, 40),
      ].join(' '),
    )
  }

  return lines
}
