import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { claimNodes } from './claimNodes.ts'
import styles from './summary.module.css'

/**
 * The furniture both summary views share: the bound page, the thumb index,
 * the hand-drawn rule under the heading, and the claim renderer.
 *
 * Kept here rather than duplicated in each page because the two views are one
 * object seen twice — if the paper ever changes, it must change in both at
 * once or the illusion that they are two lenses on one book breaks.
 */

/**
 * The hand-drawn flourish. Not a straight rule and not a border: it is a pen
 * stroke, slightly uneven, which is what puts the "hand" in the page.
 */
export function Flourish({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={wide ? `${styles.flourish} ${styles.flourishWide}` : styles.flourish}
      aria-hidden="true"
    >
      <svg viewBox="0 0 150 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M1 8C22 3 34 3 55 7C74 10.6 92 10.6 112 6C126 2.7 138 2.7 149 6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

export interface RailItem {
  /** What the tab says. */
  label: string
  /** What identifies it to the page — a concept name, or a chapter number. */
  key: string
}

/**
 * The thumb index down the left edge — the headings of a commonplace book, or
 * the chapters of one book. Sideways-scrolling strip under 640px.
 */
export function Rail({
  label,
  note,
  items,
  current,
  onPick,
}: {
  label: string
  note: string
  items: RailItem[]
  current: string
  onPick: (key: string) => void
}) {
  return (
    <nav className={styles.rail} aria-label={label}>
      <div className={styles.railLabel}>{label}</div>
      {items.map((item) => {
        const on = item.key === current
        return (
          <button
            key={item.key}
            type="button"
            className={on ? `${styles.tab} ${styles.on}` : styles.tab}
            /* Not `aria-selected`: these are buttons, not tabs in the ARIA
               sense — there is no tabpanel and no roving focus. `current`
               says the same thing in a way a screen reader will read here. */
            aria-current={on ? 'true' : undefined}
            onClick={() => onPick(item.key)}
          >
            {item.label}
          </button>
        )
      })}
      <p className={styles.railNote}>{note}</p>
    </nav>
  )
}

/**
 * A claim, with its inline emphasis and its inline concept links rendered as
 * real elements. See `claimNodes.ts` for why this is parsed rather than set as
 * HTML.
 *
 * `onLink` is optional. Where it is missing — inside the Commonplace Book,
 * whose own heading a link might name — the concept still reads as a concept
 * but does nothing, rather than reloading the page you are already on.
 */
export function Claim({
  claim,
  className,
  onLink,
}: {
  claim: string
  className: string
  onLink?: (concept: string) => void
}) {
  return (
    <p className={className}>
      {claimNodes(claim).map((node, index) => {
        if (node.kind === 'text') return <span key={index}>{node.text}</span>
        if (node.kind === 'em') return <em key={index}>{node.text}</em>
        if (!onLink) return <span key={index}>{node.text}</span>
        return (
          <button
            key={index}
            type="button"
            className={styles.claimLink}
            onClick={() => onLink(node.text)}
          >
            {node.text}
          </button>
        )
      })}
    </p>
  )
}

/** The whole paper object: the way back, then the bound page. */
export function Paper({
  backTo,
  backLabel,
  children,
}: {
  backTo: string
  backLabel: string
  children: ReactNode
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.topBar}>
        <Link to={backTo} className={styles.back}>
          ← {backLabel}
        </Link>
      </div>
      <div className={styles.book}>{children}</div>
    </div>
  )
}
