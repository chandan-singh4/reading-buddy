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

import type { Anchor, Paragraph } from '../structure/index.ts'
import { NO_IMAGES, srcOf } from './figures.ts'
import { cellRunsOf, lineRunsOf, runsOf, type Run } from './linkRuns.ts'
import styles from './blocks.module.css'

/** Told where a tapped link goes. Absent while nothing can follow one. */
export type FollowLink = (anchor: Anchor) => void

/**
 * A block's text with its links made tappable.
 *
 * An internal link is a `<button>`, not an `<a>`: it goes to a paragraph, not
 * to a URL, and dressing it as a link would put a meaningless address in the
 * browser's status bar and offer "open in new tab" on something that cannot be.
 * An external link is a real `<a>`, because it really is one.
 */
function Runs({ runs, onFollow }: { runs: Run[]; onFollow?: FollowLink }) {
  return (
    <>
      {runs.map((run, index) => {
        if (!run.link) return <span key={index}>{run.text}</span>

        if (run.link.anchor) {
          const target = run.link.anchor
          return (
            <button
              key={index}
              type="button"
              className={styles.link}
              onClick={(event) => {
                // The reading page uses taps for turning pages and showing the
                // overlay. A tap meant for a link is neither.
                event.stopPropagation()
                onFollow?.(target)
              }}
            >
              {run.text}
            </button>
          )
        }

        return (
          <a
            key={index}
            className={styles.link}
            href={run.link.url}
            target="_blank"
            // Leaving the book entirely, so the new tab gets no handle back on
            // this one.
            rel="noreferrer noopener"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            {run.text}
          </a>
        )
      })}
    </>
  )
}

function Text({ block, onFollow }: { block: Paragraph; onFollow?: FollowLink }) {
  const runs = runsOf(block)
  if (runs.length === 1 && !runs[0].link) return <>{block.text}</>
  return <Runs runs={runs} onFollow={onFollow} />
}

/** `[ch02-s03-p013]` → `ch02-s03-p013`. Anchors are bracketed; ids aren't. */
export function elementIdOf(anchor: string): string {
  return anchor.replace(/^\[|\]$/g, '')
}

function Figure({
  block,
  images,
}: {
  block: Paragraph
  images: ReadonlyMap<string, string>
}) {
  // A figure whose picture isn't there degrades to its caption — no image, or
  // one stored under a path this book has no bytes for, which is every book
  // imported before WP-39. A caption alone is readable; a broken-image icon
  // is not.
  const src = block.image ? srcOf(block.image.src, images) : undefined

  return (
    <figure className={styles.figure}>
      {block.image && src && (
        <img
          className={styles.image}
          src={src}
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

function Table({ block, onFollow }: { block: Paragraph; onFollow?: FollowLink }) {
  // A table with links is drawn from its runs rather than from `rows`, so the
  // links survive into the cells. A caption is skipped for this: it is
  // prepended to the flattened text as its own line, so cutting on newlines
  // would hand it back as a phantom first row.
  const linked = block.links && block.links.length > 0 && !block.label
  const cells = linked ? cellRunsOf(block) : undefined

  if (cells && cells.length > 0) {
    const [head, ...body] = cells
    return (
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {head?.map((cell, index) => (
                <th key={index}>
                  <Runs runs={cell} onFollow={onFollow} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    <Runs runs={cell} onFollow={onFollow} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

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

function List({ block, onFollow }: { block: Paragraph; onFollow?: FollowLink }) {
  // The parser keeps a list as one block, so its items live in `text`, one per
  // line — see WP-38. Splitting here keeps that decision in the parser.
  //
  // Per-item runs rather than plain text, because a book's own contents page is
  // a list of links and so is most of a notes section. Rendering the text alone
  // is how those entries came out unclickable while a footnote inside an
  // ordinary paragraph worked.
  const items = lineRunsOf(block)

  return (
    <ul className={styles.list}>
      {items.map((runs, index) => (
        <li key={index}>
          <Runs runs={runs} onFollow={onFollow} />
        </li>
      ))}
    </ul>
  )
}

export function Block({
  block,
  onFollowLink,
  images = NO_IMAGES,
}: {
  block: Paragraph
  onFollowLink?: FollowLink
  /** Stored picture paths → showable URLs, for this section's figures. */
  images?: ReadonlyMap<string, string>
}) {
  const id = elementIdOf(block.anchor)
  const text = <Text block={block} onFollow={onFollowLink} />

  switch (block.kind) {
    case 'heading':
      // Always h3: the section's own title is the h2 above it, and a book's
      // internal heading levels are not the page's document outline.
      return (
        <h3 id={id} className={styles.heading}>
          {text}
        </h3>
      )

    case 'quote':
      return (
        <blockquote id={id} className={styles.quote}>
          {text}
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
          {text}
        </aside>
      )

    case 'figure':
      return (
        <div id={id}>
          <Figure block={block} images={images} />
        </div>
      )

    case 'table':
      return (
        <div id={id}>
          <Table block={block} onFollow={onFollowLink} />
        </div>
      )

    case 'list':
      return (
        <div id={id}>
          <List block={block} onFollow={onFollowLink} />
        </div>
      )

    // `furniture` is dropped before anchors are assigned and never stored, so
    // it cannot arrive here. It shares the default with `prose` and with any
    // kind added later, which is the point: new kinds read as plain text
    // rather than vanishing.
    default:
      return (
        <p id={id} className={styles.prose}>
          {text}
        </p>
      )
  }
}
