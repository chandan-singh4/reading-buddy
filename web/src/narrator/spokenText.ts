/**
 * Markdown, said out loud.
 *
 * Veda answers in markdown and the summaries are written in it. Handed to a
 * speech model unchanged, `**the shadow**` is read as "asterisk asterisk the
 * shadow asterisk asterisk", a bullet is read as "hyphen", and a heading is
 * read with its hashes. The marks are punctuation for the eye; there is no way
 * to pronounce them.
 *
 * ## Why this is not the markdown renderer
 *
 * `markdown.tsx` turns the same text into React elements, and it would be
 * possible to render and then read the text back out of the DOM. That would tie
 * saying something to having drawn it — so a summary could not be spoken from a
 * screen that had not laid it out, and the speech would change whenever the
 * rendering did.
 *
 * ## What is dropped rather than spoken
 *
 * A code block, a table row and a link's URL. Read out, a URL is a minute of
 * punctuation and a table is a run of unrelated words. The link's *text* stays,
 * because that is the part the author wrote as a sentence.
 *
 * This is the same judgement `readAloud.ts` makes about the book itself, where
 * tables and figures are skipped and headings are kept.
 */

/** One space between words, and no leading or trailing space. */
function tidy(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
}

export function spokenText(markdown: string): string {
  let text = markdown

  // Fenced code, whole. Nothing inside is prose.
  text = text.replace(/```[\s\S]*?```/g, ' ')

  // A link becomes what it was called. `[the shadow](https://…)` → `the shadow`.
  // An image loses everything: its alt text is a description for somebody who
  // cannot see it, not a sentence in the paragraph.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

  // Inline code keeps its words. `anima` is a word Veda means to say.
  text = text.replace(/`([^`]*)`/g, '$1')

  const lines = text.split('\n')
  const kept: string[] = []

  for (const raw of lines) {
    const line = raw.trim()

    // A table row, and the rule under a table's head. Both are unreadable.
    if (/^\|/.test(line)) continue
    // A horizontal rule is a pause on the page and silence out loud.
    if (/^([-*_])\s*(\1\s*){2,}$/.test(line)) continue

    let out = line
    // A heading keeps its words. It is what the author called the next part,
    // and hearing it is how a listener knows they have arrived at one.
    out = out.replace(/^#{1,6}\s+/, '')
    // A bullet or a quote mark. The number of an ordered list is kept: "one",
    // "two" is how the author meant it to be counted.
    out = out.replace(/^[-*+]\s+/, '')
    out = out.replace(/^>\s?/, '')

    kept.push(out)
  }

  text = kept.join('\n')

  // Emphasis, strong, and strikethrough. The words inside are the sentence.
  text = text.replace(/(\*\*\*|___)(.+?)\1/g, '$2')
  text = text.replace(/(\*\*|__)(.+?)\1/g, '$2')
  text = text.replace(/(\*|_)(.+?)\1/g, '$2')
  text = text.replace(/~~(.+?)~~/g, '$1')

  /*
   * A line that is not a sentence gets a full stop.
   *
   * Not decoration. The sentence splitter cuts on terminal punctuation, so a
   * heading or a bullet with no stop is glued to the line after it and the two
   * are spoken as one breath. A full stop is what the eye gets from the line
   * break; this gives the ear the same thing.
   */
  const spoken = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[.!?…:;]$/.test(line) ? line : `${line}.`))
    .join(' ')

  return tidy(spoken)
}
