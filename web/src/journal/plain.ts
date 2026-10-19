/**
 * Markdown read back as plain words.
 *
 * A card on the journal list has three lines to say what an entry is about,
 * and the shaped copy of an entry is markdown. Printed as it stands, those
 * three lines open with `## Dream recollection` — the reader is shown the
 * notation instead of the thought.
 *
 * This is not a parser and must not become one. `reader/markdown.tsx` renders
 * markdown properly wherever there is room to render it. This strips the marks
 * off, for the one place where there is room only for words.
 *
 * ## Why headings are dropped rather than flattened
 *
 * A heading is a label for the words under it. In a three-line preview the
 * label costs a third of the space and says less than the sentence it labels,
 * so the first real sentence wins. A entry that is nothing but headings keeps
 * them — something is always better than an empty card.
 */

/** One run of prose, with every mark taken off and the headings dropped. */
export function plainWords(markdown: string): string {
  const lines = markdown.split('\n')
  const prose: string[] = []
  const headings: string[] = []

  for (const line of lines) {
    const text = bare(line)
    if (!text) continue
    if (/^#{1,6}\s/.test(line.trim())) headings.push(text)
    else prose.push(text)
  }

  const said = prose.length > 0 ? prose : headings
  return said.join(' ').replace(/\s+/g, ' ').trim()
}

/** One line, with its marks removed and its text kept. */
function bare(line: string): string {
  return (
    line
      // Fences and the divider row of a table say nothing out loud.
      .replace(/^\s*(?:```+.*|~~~+.*|\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?)\s*$/, '')
      // A heading's hashes, a quote's angle, a bullet, a number, a rule.
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+[.)]\s+/, '')
      .replace(/^\s*(?:\*\s*){3,}$|^\s*(?:-\s*){3,}$|^\s*(?:_\s*){3,}$/, '')
      // A link keeps what it said, not where it pointed.
      .replace(/!?\[([^\]]*)\]\([^)\s]*\)/g, '$1')
      // Emphasis, strike, and inline code.
      .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(\*|_)(.+?)\1/g, '$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      // A table row, said as its cells.
      .replace(/^\s*\|(.+)\|\s*$/, (_whole, cells: string) =>
        cells
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(' · '),
      )
      .trim()
  )
}
