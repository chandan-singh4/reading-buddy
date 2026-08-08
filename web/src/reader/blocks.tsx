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

import { useState } from 'react'

import type { Anchor, Paragraph } from '../structure/index.ts'
import { NO_IMAGES, srcOf } from './figures.ts'
import { cellRunsOf, lineRunsOf, runsOf, type Run } from './linkRuns.ts'
import styles from './blocks.module.css'

/** Told where a tapped link goes. Absent while nothing can follow one. */
export type FollowLink = (anchor: Anchor) => void

/**
 * A dedication or an epigraph, set apart the way print sets it apart —
 * centred, with room around it — rather than run on as body text.
 *
 * Driven by the `label` the parser recorded, so the reading screen needs no
 * opinion about which parts of a book these are.
 */
function display(block: Paragraph): string {
  if (block.label === 'dedication') return ` ${styles.dedication}`
  if (block.label === 'epigraph') return ` ${styles.epigraph}`
  return ''
}

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
          const follow = () => onFollow?.(target)
          return (
            <span
              key={index}
              className={styles.link}
              // A `<span>`, not a `<button>`, and the reason is layout rather
              // than semantics — `role` and the key handling below give back
              // everything the element loses.
              //
              // A `<button>` is a *box*, and no amount of `display: inline`
              // changes that: measured in Chrome, a button holding a long
              // contents entry reports one line box where the same text in a
              // span reports two. A box cannot be broken across a line or a
              // column, so it is laid out whole, at whatever width its contents
              // want, and the column edge cuts off whatever hangs past it. Real
              // inline text has no such minimum: it breaks wherever the line
              // runs out, like every other word on the page.
              role="link"
              tabIndex={0}
              onClick={(event) => {
                // The reading page uses taps for turning pages and showing the
                // overlay. A tap meant for a link is neither.
                event.stopPropagation()
                follow()
              }}
              onKeyDown={(event) => {
                // What the browser gave for free with a `<button>`. Both keys,
                // because the role is a link but the thing under a reader's
                // thumb is still a control.
                if (event.key !== 'Enter' && event.key !== ' ') return
                // Space scrolls the page if it is left alone.
                event.preventDefault()
                event.stopPropagation()
                follow()
              }}
            >
              {run.text}
            </span>
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
  // is not. State, not just a check at render, because a picture that *does*
  // have a src can still fail to load once the browser tries it.
  const [broken, setBroken] = useState(false)
  const src = block.image ? srcOf(block.image.src, images) : undefined
  const showsImage = Boolean(block.image && src) && !broken

  // `block.text` is the parser's placeholder — `[Figure: caption]` or
  // `[Figure]` — written so something readable exists before an image can be
  // shown at all. Once a picture is actually on the page, showing that
  // placeholder underneath it just repeats "[Figure]" next to a plate that
  // needs no introduction; the real figcaption (`label`), if the book had
  // one, is what belongs there instead.
  const caption = showsImage ? block.label : block.text

  return (
    <figure className={styles.figure}>
      {showsImage && (
        <img
          className={styles.image}
          src={src}
          alt={block.image!.alt ?? block.label ?? block.text}
          onError={() => setBroken(true)}
        />
      )}
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
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
    // The wrapper carries the spacing above the table. It used to make the
    // table scroll sideways too, which is what stopped a long one from being
    // split over two pages — see `.tableScroll` in the stylesheet.
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

  // The source divided here — a new epub spine document — so the page does too.
  // Carried on the outermost element of every kind, because that is the one the
  // column box sees; a class on a wrapped child would be a break instruction
  // inside a block the browser has already decided not to split.
  const opens = block.startsPage ? ` ${styles.startsPage}` : ''

  switch (block.kind) {
    case 'heading':
      // Always h3: the section's own title is the h2 above it, and a book's
      // internal heading levels are not the page's document outline.
      return (
        <h3 id={id} className={styles.heading + opens}>
          {text}
        </h3>
      )

    case 'quote':
      return (
        <blockquote id={id} className={styles.quote + opens}>
          {text}
        </blockquote>
      )

    case 'code':
      return (
        <pre id={id} className={styles.code + opens}>
          <code>{block.text}</code>
        </pre>
      )

    case 'formula':
      // Rendered as-is, centred. Real maths typesetting is a later question;
      // showing the source is honest and never wrong.
      return (
        <p id={id} className={styles.formula + opens}>
          {block.text}
        </p>
      )

    case 'note':
      return (
        <aside id={id} className={styles.note + opens}>
          {text}
        </aside>
      )

    case 'figure':
      return (
        <div id={id} className={opens}>
          <Figure block={block} images={images} />
        </div>
      )

    case 'table':
      return (
        <div id={id} className={opens}>
          <Table block={block} onFollow={onFollowLink} />
        </div>
      )

    case 'list':
      return (
        <div id={id} className={opens}>
          <List block={block} onFollow={onFollowLink} />
        </div>
      )

    // `furniture` is dropped before anchors are assigned and never stored, so
    // it cannot arrive here. It shares the default with `prose` and with any
    // kind added later, which is the point: new kinds read as plain text
    // rather than vanishing.
    default:
      return (
        <p id={id} className={styles.prose + opens + display(block)}>
          {text}
        </p>
      )
  }
}
