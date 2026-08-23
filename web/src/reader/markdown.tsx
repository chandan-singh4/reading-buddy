/**
 * Markdown, as a tutor answer actually uses it.
 *
 * The model writes markdown whether or not anyone asked it to: `**bold**` for
 * the term being defined, a numbered list for the steps, a fenced block for a
 * formula. Printed raw, those asterisks are noise sitting exactly where the
 * emphasis was meant to be — the reader sees the punctuation and has to do the
 * formatting in their head.
 *
 * ## Why this is written here rather than installed
 *
 * A markdown library brings a parser built for documents: footnotes, tables of
 * contents, HTML pass-through, plugin pipelines. This panel needs eight
 * constructs, and one of the eight — raw HTML — is a thing it must **refuse**
 * to render, because the text comes from a model and lands in a page. Nothing
 * here ever builds HTML from a string; every element is a React node, so a
 * `<script>` in an answer is text and can only ever be text.
 *
 * ## What it renders
 *
 * Headings, paragraphs, bullet and numbered lists, blockquotes, fenced code,
 * horizontal rules, tables, and — inside all of those — bold, italic,
 * bold-italic, strikethrough, inline code, and links.
 *
 * ## Tables, which are not drawn as tables
 *
 * Models reach for a table whenever an answer has a shape — quote, meaning,
 * why it matters. In a column 110 pixels wide that is unreadable, and a table
 * that scrolls sideways inside a chat bubble is worse: the reader has to drag
 * each row into view to finish a sentence.
 *
 * So each row is stacked instead, as a `dl`: the first cell is the term, in
 * bold, and the rest are its values, indented underneath. The indent is the
 * part that does the work — it is what says "these belong to that", which a
 * grid says with a column and a flat stack does not say at all.
 *
 * A header row is not an entry. It becomes a caption above the whole stack —
 * "Cosmic element · Symbolic body part" — so the reader learns once what the
 * pairs are pairs *of*. Past two columns the header also labels each value in
 * place, because by then the reader cannot hold the column order in their head.
 *
 * Rows are taken with or without a `|---|` divider. A model that opens a table
 * with one and a model that just starts writing pipe rows meant the same thing,
 * and only the first is a table by the specification. The divider is also the
 * only way to know a header row is a header, so a table without one has none.
 *
 * ## Formulas
 *
 * `$$…$$` on its own lines is drawn as a centred formula, and `$…$` inline as
 * a formula phrase. The symbols are **not** typeset: `\frac{a}{b}` stays
 * `\frac{a}{b}`, set apart in a monospaced face rather than turned into a
 * fraction. Real typesetting means KaTeX, which is a large download for a
 * phone that is usually offline. Set apart and legible is the honest middle,
 * and it is a great deal better than the same characters buried in a
 * paragraph.
 */

import type { ReactNode } from 'react'

import styles from './markdown.module.css'

/**
 * `**bold**`, `*italic*`, `` `code` ``, `~~struck~~`, `[text](url)`, `$x$`.
 *
 * The maths case carries the one fiddly rule: a `$` must be followed by a
 * non-space and closed by a non-space. Without it, "it cost $5 and then $10"
 * reads as a formula that says "5 and then".
 */
const INLINE =
  /(\*\*\*|___)(.+?)\1|(\*\*|__)(.+?)\3|(\*|_)(.+?)\5|(~~)(.+?)\7|`([^`]+)`|\$(\S(?:[^$\n]*\S)?)\$|\[([^\]]+)\]\(([^)\s]+)\)/

/**
 * Only these open in a new tab, and only these are linked at all.
 *
 * A model can write any URL it likes, including `javascript:`. An allow-list of
 * two schemes is the whole defence, and it belongs here rather than in the
 * caller because every link on this panel comes through this function.
 */
function safeHref(url: string): string | undefined {
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined
}

/**
 * One line of text, with the emphasis turned back into emphasis.
 *
 * Left to right, one construct at a time, recursing into what it found — so
 * `**bold with *stress* in it**` nests rather than being chopped up. `key` is
 * the running index because these nodes are a list with no natural id, and
 * they never reorder.
 */
export function inlineMarkdown(text: string, keyFrom = 0): ReactNode[] {
  const out: ReactNode[] = []
  let rest = text
  let key = keyFrom

  while (rest.length > 0) {
    const found = INLINE.exec(rest)
    if (!found || found.index === undefined) break

    if (found.index > 0) out.push(rest.slice(0, found.index))
    key += 1

    const [
      whole,
      ,
      strongEm,
      ,
      strong,
      ,
      em,
      ,
      struck,
      code,
      math,
      linkText,
      linkUrl,
    ] = found

    if (strongEm !== undefined) {
      out.push(
        <strong key={key}>
          <em>{inlineMarkdown(strongEm, key * 100)}</em>
        </strong>,
      )
    } else if (strong !== undefined) {
      out.push(<strong key={key}>{inlineMarkdown(strong, key * 100)}</strong>)
    } else if (em !== undefined) {
      out.push(<em key={key}>{inlineMarkdown(em, key * 100)}</em>)
    } else if (struck !== undefined) {
      out.push(<s key={key}>{inlineMarkdown(struck, key * 100)}</s>)
    } else if (code !== undefined) {
      out.push(
        <code key={key} className={styles.code}>
          {code}
        </code>,
      )
    } else if (math !== undefined) {
      out.push(
        <span key={key} className={styles.formula}>
          {math}
        </span>,
      )
    } else if (linkText !== undefined && linkUrl !== undefined) {
      const href = safeHref(linkUrl)
      out.push(
        href ? (
          <a key={key} className={styles.link} href={href} target="_blank" rel="noreferrer noopener">
            {inlineMarkdown(linkText, key * 100)}
          </a>
        ) : (
          // Not a link the panel will open, so it is left as the words it was.
          <span key={key}>{inlineMarkdown(linkText, key * 100)}</span>
        ),
      )
    }

    rest = rest.slice(found.index + whole.length)
  }

  if (rest.length > 0) out.push(rest)
  return out
}

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/
const NUMBERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const FENCE = /^\s{0,3}(```|~~~)(.*)$/
/** A pipe-separated row. Both fences are required, so a lone `|` is prose. */
const ROW = /^\s{0,3}\|(.*)\|\s*$/
/** The `|---|:--:|` line under a header. Structure, never content. */
const DIVIDER = /^\s{0,3}\|[\s:|-]+\|\s*$/
const MATH_FENCE = /^\s{0,3}\$\$\s*$/

/**
 * A whole answer, block by block.
 *
 * Line-oriented and greedy, the same shape as the book parser in
 * `parse/markdown.ts`: a line that opens a fence, a list or a quote takes every
 * line that belongs with it, and the group becomes one element.
 *
 * A run of ordinary lines with no blank line between them is **one**
 * paragraph, with the line breaks kept. Models break lines inside a sentence,
 * and turning each of those into its own paragraph would space the answer out
 * like a poem.
 */
export function Markdown({ text, className }: { text: string; className?: string }): ReactNode {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: ReactNode[] = []
  let at = 0
  let key = 0

  const next = () => {
    key += 1
    return key
  }

  while (at < lines.length) {
    const line = lines[at] ?? ''

    if (line.trim() === '') {
      at += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const mark = fence[1]
      const body: string[] = []
      at += 1
      while (at < lines.length && !(lines[at] ?? '').trimStart().startsWith(mark!)) {
        body.push(lines[at] ?? '')
        at += 1
      }
      at += 1 // The closing fence, or the end of the text.
      out.push(
        <pre key={next()} className={styles.block}>
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }

    if (MATH_FENCE.test(line)) {
      const body: string[] = []
      at += 1
      while (at < lines.length && !MATH_FENCE.test(lines[at] ?? '')) {
        body.push(lines[at] ?? '')
        at += 1
      }
      at += 1
      out.push(
        <div key={next()} className={styles.display}>
          {body.join('\n')}
        </div>,
      )
      continue
    }

    if (RULE.test(line)) {
      out.push(<hr key={next()} className={styles.rule} />)
      at += 1
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      // Every level is drawn the same size. This is a chat bubble, not a
      // document: the answer needs a heading to read as a small title, and six
      // sizes of title inside one paragraph-long reply is a typographic joke.
      out.push(
        <p key={next()} className={styles.heading}>
          {inlineMarkdown(heading[2] ?? '')}
        </p>,
      )
      at += 1
      continue
    }

    if (QUOTE.test(line)) {
      const body: string[] = []
      while (at < lines.length && QUOTE.test(lines[at] ?? '')) {
        body.push(QUOTE.exec(lines[at] ?? '')?.[1] ?? '')
        at += 1
      }
      out.push(
        <blockquote key={next()} className={styles.quote}>
          {inlineMarkdown(body.join('\n'))}
        </blockquote>,
      )
      continue
    }

    if (ROW.test(line)) {
      const cellsOf = (row: string): string[] =>
        (ROW.exec(row)?.[1] ?? '')
          .split('|')
          .map((cell) => cell.trim())
          .filter((cell) => cell.length > 0)

      const rows: string[][] = []
      let head: string[] | undefined
      while (at < lines.length && ROW.test(lines[at] ?? '')) {
        const here = lines[at] ?? ''
        at += 1
        // The divider carries no words. What it does carry is the news that
        // the row above it was a header, which is the only way to tell one.
        if (DIVIDER.test(here)) {
          if (rows.length === 1) head = rows.shift()
          continue
        }
        rows.push(cellsOf(here))
      }

      const entries = rows.filter((cells) => cells.length > 0)
      // Labels earn their space only past two columns. At two, the pair is
      // "Mount Meru" and what Mount Meru is, and saying so twice is clutter.
      const labelled = head !== undefined && entries.some((cells) => cells.length > 2)

      out.push(
        <div key={next()} className={styles.rows}>
          {/* Either the caption or the labels, never both — they say the
              same words, and saying them twice is the clutter the labels
              were meant to avoid. */}
          {head && head.length > 0 && !labelled && (
            <p className={styles.caption}>{head.join(' · ')}</p>
          )}
          <dl className={styles.pairs}>
            {entries.map((cells, index) => (
              <div key={index} className={styles.row}>
                <dt className={styles.lead}>{inlineMarkdown(cells[0] ?? '')}</dt>
                {cells.slice(1).map((cell, cellAt) => (
                  <dd key={cellAt} className={styles.value}>
                    {labelled && head?.[cellAt + 1] && (
                      <span className={styles.label}>{head[cellAt + 1]}</span>
                    )}
                    {inlineMarkdown(cell)}
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </div>,
      )
      continue
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const numbered = NUMBERED.test(line)
      const items: string[] = []
      while (at < lines.length) {
        const item = numbered ? NUMBERED.exec(lines[at] ?? '') : BULLET.exec(lines[at] ?? '')
        if (!item) break
        items.push((numbered ? item[2] : item[1]) ?? '')
        at += 1
      }
      const list = items.map((item, index) => (
        <li key={index} className={styles.item}>
          {inlineMarkdown(item)}
        </li>
      ))
      out.push(
        numbered ? (
          <ol key={next()} className={styles.list}>
            {list}
          </ol>
        ) : (
          <ul key={next()} className={styles.list}>
            {list}
          </ul>
        ),
      )
      continue
    }

    const paragraph: string[] = []
    while (at < lines.length) {
      const here = lines[at] ?? ''
      if (
        here.trim() === '' ||
        HEADING.test(here) ||
        BULLET.test(here) ||
        NUMBERED.test(here) ||
        QUOTE.test(here) ||
        RULE.test(here) ||
        FENCE.test(here) ||
        MATH_FENCE.test(here) ||
        ROW.test(here)
      ) {
        break
      }
      paragraph.push(here)
      at += 1
    }
    out.push(
      <p key={next()} className={styles.paragraph}>
        {inlineMarkdown(paragraph.join('\n'))}
      </p>,
    )
  }

  // The marker is for the tests as much as for anything: a rendered answer is
  // full of `<p>` elements now, and the panel's other paragraphs — the reader's
  // question, the model's name — have to stay tellable apart from them.
  return (
    <div className={className} data-markdown="true">
      {out}
    </div>
  )
}
