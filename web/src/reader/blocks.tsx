/**
 * One block on the page.
 *
 * Every block gets its anchor as a DOM `id`, verbatim and without the brackets
 * (`ch02-s03-p013`). That is what makes WP-15 able to scroll back to a position
 * and WP-17 able to say *which* paragraph was selected, both without a second
 * pass over the text.
 *
 * The rule for kinds: `text` is always present and always safe to render, so an
 * unrecognised kind falls through to a paragraph rather than to nothing. Richer
 * fields (`rows`, `image`) are used when they're there and never required —
 * a table whose grid didn't survive parsing still shows its flattened text.
 */

import type { Paragraph } from '../structure/index.ts'
import styles from './blocks.module.css'

/** `[ch02-s03-p013]` → `ch02-s03-p013`. Anchors are bracketed; ids aren't. */
export function elementIdOf(anchor: string): string {
  return anchor.replace(/^\[|\]$/g, '')
}

function Figure({ block }: { block: Paragraph }) {
  // No image, or one whose path can't be resolved until WP-39, degrades to the
  // caption. A caption alone is readable; a broken-image icon is not.
  return (
    <figure className={styles.figure}>
      {block.image && (
        <img
          className={styles.image}
          src={block.image.src}
          alt={block.image.alt ?? block.text}
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      )}
      {block.text && <figcaption className={styles.caption}>{block.text}</figcaption>}
    </figure>
  )
}

function Table({ block }: { block: Paragraph }) {
  if (!block.rows || block.rows.length === 0) {
    return <p className={styles.prose}>{block.text}</p>
  }

  const [head, ...body] = block.rows

  return (
    // Wrapped because a wide table must scroll inside itself — a page that
    // scrolls sideways is unusable on a phone, and tables are the one block
    // that reliably causes it.
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {head?.map((cell, index) => <th key={index}>{cell}</th>)}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function List({ block }: { block: Paragraph }) {
  // The parser keeps a list as one block, so its items live in `text`, one per
  // line — see WP-38. Splitting here keeps that decision in the parser.
  const items = block.text.split('\n').filter((line) => line.trim() !== '')

  return (
    <ul className={styles.list}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

export function Block({ block }: { block: Paragraph }) {
  const id = elementIdOf(block.anchor)

  switch (block.kind) {
    case 'heading':
      // Always h3: the section's own title is the h2 above it, and a book's
      // internal heading levels are not the page's document outline.
      return (
        <h3 id={id} className={styles.heading}>
          {block.text}
        </h3>
      )

    case 'quote':
      return (
        <blockquote id={id} className={styles.quote}>
          {block.text}
        </blockquote>
      )

    case 'code':
      return (
        <pre id={id} className={styles.code}>
          <code>{block.text}</code>
        </pre>
      )

    case 'formula':
      // Rendered as-is, centred. Real maths typesetting is a later question;
      // showing the source is honest and never wrong.
      return (
        <p id={id} className={styles.formula}>
          {block.text}
        </p>
      )

    case 'note':
      return (
        <aside id={id} className={styles.note}>
          {block.text}
        </aside>
      )

    case 'figure':
      return (
        <div id={id}>
          <Figure block={block} />
        </div>
      )

    case 'table':
      return (
        <div id={id}>
          <Table block={block} />
        </div>
      )

    case 'list':
      return (
        <div id={id}>
          <List block={block} />
        </div>
      )

    // `furniture` is dropped before anchors are assigned and never stored, so
    // it cannot arrive here. It shares the default with `prose` and with any
    // kind added later, which is the point: new kinds read as plain text
    // rather than vanishing.
    default:
      return (
        <p id={id} className={styles.prose}>
          {block.text}
        </p>
      )
  }
}
