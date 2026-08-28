import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'

import { claimNodes } from './claimNodes.ts'
import styles from './summary.module.css'

/**
 * The furniture the chapter page is built from: the bound page, the thumb
 * index, the hand-drawn rule under the heading, and the text renderer.
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
  /** What identifies it to the page — the chapter number, as a string. */
  key: string
}

/**
 * The thumb index down the left edge. Becomes a sideways-scrolling strip under
 * 640px, which is where a phone reads it.
 *
 * `parts` is an optional second strip, for a chapter the author divided into
 * named sections. It swipes exactly as the chapter strip does, because it is
 * the same control doing the same job one level down — a reader who has learnt
 * the first row has already learnt the second. Drawn only when there is
 * something in it: an empty second strip is a rule across the page promising a
 * choice that is not there.
 */
export function Rail({
  label,
  note,
  items,
  current,
  onPick,
  parts,
  currentPart,
  onPickPart,
}: {
  label: string
  note: string
  items: RailItem[]
  current: string
  onPick: (key: string) => void
  parts?: RailItem[]
  currentPart?: string
  onPickPart?: (key: string) => void
}) {
  return (
    <nav className={styles.rail} aria-label={label}>
      <div className={styles.railLabel}>{label}</div>
      {/* Wrapped, so the chapters are one scrolling row on a phone rather than
          one row each once the rail becomes a column of strips. */}
      <Strip className={styles.chapters}>
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
      </Strip>
      {parts && parts.length > 0 && onPickPart && (
        <Strip className={styles.parts} role="group" label="Parts of this chapter">
          {parts.map((part) => {
            const on = part.key === currentPart
            return (
              <button
                key={part.key}
                type="button"
                className={on ? `${styles.tab} ${styles.partTab} ${styles.on}` : `${styles.tab} ${styles.partTab}`}
                aria-current={on ? 'true' : undefined}
                onClick={() => onPickPart(part.key)}
              >
                {part.label}
              </button>
            )
          })}
        </Strip>
      )}

      <p className={styles.railNote}>{note}</p>
    </nav>
  )
}

/**
 * One scrolling row of tabs, with the tab you are on held in the middle.
 *
 * The row only moves when the tab you are on changes. It never corrects a
 * scroll you made yourself, so a rail you pushed with your thumb stays where
 * you left it until you open something else.
 */
function Strip({
  className,
  role,
  label,
  children,
}: {
  className: string
  role?: string
  label?: string
  children: ReactNode
}) {
  const strip = useRef<HTMLDivElement>(null)
  const settled = useRef(false)
  useEffect(() => {
    const row = strip.current
    const tab = row?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!row || !tab) return
    const want = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2
    const most = row.scrollWidth - row.clientWidth
    const to = Math.max(0, Math.min(want, most))
    if (Math.abs(to - row.scrollLeft) < 1) return
    /* The first paint jumps; every move after it slides, because a slide is
       what tells you the row moved rather than the labels changing under you. */
    row.scrollTo?.({ left: to, behavior: settled.current ? 'smooth' : 'auto' })
    settled.current = true
  })
  return (
    <div ref={strip} className={className} role={role} aria-label={label}>
      {children}
    </div>
  )
}

/**
 * A model's paragraph, with its `<em>` rendered as emphasis.
 *
 * Parsed, never set as HTML — see `claimNodes.ts` for why that matters when
 * the text is written by a model rather than by us.
 */
export function RichText({ text, className }: { text: string; className: string }) {
  /*
   * Split on a blank line, because the Scribe returns a list rather than a
   * paragraph and each of its claims stands on its own. Welding them into one
   * block would need connective sentences, and nothing here may write words and
   * present them as a model's.
   */
  const blocks = text.split(/\n\s*\n/).filter((block) => block.trim().length > 0)

  return (
    <>
      {blocks.map((block, blockIndex) => (
        <p key={blockIndex} className={className}>
          {claimNodes(block).map((node, index) =>
            node.kind === 'em' ? (
              <em key={index}>{node.text}</em>
            ) : (
              <span key={index}>{node.text}</span>
            ),
          )}
        </p>
      ))}
    </>
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
        {/*
         * `replace`, and this is the whole of the fix for a back button that
         * would not let the reader go.
         *
         * The way out goes to the page the reader came from. Pushed, that page
         * is now in the history twice with this one between them, so a back
         * swipe returned here, and the next one returned to the page they had
         * just left: a loop with no end. Replacing drops this page as the
         * reader leaves it, which is what the rest of the app does and what a
         * back swipe expects — one step out, and out.
         */}
        <Link to={backTo} replace className={styles.back}>
          ← {backLabel}
        </Link>
      </div>
      <div className={styles.book}>{children}</div>
    </div>
  )
}
