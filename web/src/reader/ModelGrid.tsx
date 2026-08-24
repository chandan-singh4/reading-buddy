/**
 * The model picker, drawn as the fallback chain rather than as a list.
 *
 * ## Why a grid and not a list
 *
 * The old picker was one column, strongest first, and it answered "which model
 * do you want?" perfectly well. It could not answer the question the reader
 * actually kept asking, which was "it did not reply — so what replied instead?"
 *
 * The chain goes across providers: the pick, then the top of each other column,
 * then the second of each. Drawn as a grid with one column per provider, that
 * order is just the reading order. Google's best is at the top left; if it
 * declines, the next thing tried is the model directly to its right. Nothing
 * has to explain the fallback, because the fallback is the picture.
 *
 * ## Why it can be rearranged
 *
 * Once the grid *is* the chain, moving something in it is editing the chain.
 * Dragging a model up its column promotes it; dragging a column left means that
 * provider gets tried sooner. This is the reader taking the ranking off us —
 * `strength` in `models.ts` is a guess from parameter counts in model names,
 * and the reader knows better than the guess as soon as they have used them.
 *
 * ## Long press, and the fight with scrolling
 *
 * Touch drag and touch scroll are the same gesture until something disambiguates
 * them. The usual fix is a separate grip handle, which is reliable and ugly, and
 * at this column width would cost a third of the row.
 *
 * So: press and hold for `HOLD_MS`, and the row lifts. Until it lifts, the
 * gesture belongs to the scroller and the grid behaves like ordinary content.
 * After it lifts, a non-passive `touchmove` listener calls `preventDefault` and
 * the browser stops scrolling — this is the part that cannot be done with CSS
 * alone, because `touch-action` is read when the gesture begins and changing it
 * mid-gesture has no effect. A small move before the hold completes cancels it,
 * so a flick still scrolls.
 *
 * Reordering happens live under the finger rather than against a dropped
 * placeholder. It is less code and it reads better: the list is always showing
 * the order you would get by letting go now.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { PROVIDER_NAME, type Column, type Provider, type TutorModel } from './models.ts'
import { modelLabel } from './tutor.ts'
import styles from './ModelGrid.module.css'

/** How long a press must last before it becomes a drag. */
const HOLD_MS = 350

/** How far a finger may stray before the hold is treated as a scroll instead. */
const SLOP = 10

export interface ModelGridProps {
  columns: readonly Column[]
  pick?: string
  onPick: (id: string) => void
  /** Called with the whole new layout whenever the reader moves something. */
  onArrange: (columns: Column[]) => void
}

/** What is currently in the air. */
type Lift =
  | { kind: 'row'; source: Provider; id: string }
  | { kind: 'column'; source: Provider }
  | null

/**
 * A model's name, short enough for a narrow column.
 *
 * Only two things are cut, and the line between them matters more than it
 * looks at 110 pixels wide.
 *
 * **The provider's own name**, because the column heading already says it:
 * "Google: Gemma 4 31B" under a heading reading "Google" spends a third of the
 * row saying nothing. The lab's name is *not* cut — "NVIDIA", "Z.ai", "Gemini"
 * — because that says which house built the model, which the heading does not.
 * Under "Google", "Gemini 3.7 Flash" and "Gemma 4 31B" are two different
 * families and the reader is choosing between them.
 *
 * **"(free)"**, because every model in this picker is free. Claude says "paid"
 * in its own tag, which is the only distinction worth the width.
 */
export function shortName(model: TutorModel): string {
  const vendor = { gemini: 'google', openrouter: 'openrouter', groq: 'groq' }[model.source]
  const said = model.name || modelLabel(model.id)
  return (
    said
      .replace(new RegExp(`^${vendor}[\\s:-]+`, 'i'), '')
      .replace(/\s*\(free\)\s*/i, '')
      .trim() || said
  )
}

export function ModelGrid({ columns, pick, onPick, onArrange }: ModelGridProps) {
  const [lift, setLift] = useState<Lift>(null)
  const grid = useRef<HTMLDivElement | null>(null)
  const lists = useRef(new Map<Provider, HTMLDivElement>())
  const chosen = useRef<HTMLButtonElement | null>(null)
  /*
   * Whether the press that just ended was a drag.
   *
   * A drag ends with a `click` like any other press does, and that click must
   * not also choose the model the reader was only moving. Read and cleared by
   * the row's `onClick` below, which is the next thing to run.
   */
  const dragged = useRef(false)

  /*
   * Focus opens on the current choice, which is where a platform picker puts
   * it. It is also the only way to reach the grid from a keyboard without
   * tabbing through however many models are on today's roster.
   */
  useEffect(() => {
    chosen.current?.focus()
    // Once, on opening. Refocusing on every drag would fight the drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * Stop the page scrolling while something is in the air.
   *
   * Non-passive on purpose: a passive listener is not allowed to call
   * `preventDefault`, and React's own `onTouchMove` is registered passively. So
   * this is attached by hand, and only while a drag is live — the rest of the
   * time the grid must scroll normally.
   */
  useEffect(() => {
    if (!lift) return
    const held = (event: TouchEvent) => event.preventDefault()
    const node = grid.current
    node?.addEventListener('touchmove', held, { passive: false })
    return () => node?.removeEventListener('touchmove', held)
  }, [lift])

  /** Which slot in a column a pointer at this height is over. */
  const rowAt = useCallback((source: Provider, y: number): number => {
    const list = lists.current.get(source)
    if (!list) return -1
    const rows = [...list.children] as HTMLElement[]
    for (let at = 0; at < rows.length; at += 1) {
      const box = rows[at].getBoundingClientRect()
      if (y < box.top + box.height / 2) return at
    }
    return rows.length - 1
  }, [])

  /** Which column a pointer at this position is over. */
  const columnAt = useCallback(
    (x: number): number => {
      for (const [at, column] of columns.entries()) {
        const box = lists.current.get(column.source)?.parentElement?.getBoundingClientRect()
        if (box && x < box.right) return at
      }
      return columns.length - 1
    },
    [columns],
  )

  const move = useCallback(
    (event: React.PointerEvent) => {
      if (!lift) return

      if (lift.kind === 'row') {
        const column = columns.find((entry) => entry.source === lift.source)
        if (!column) return

        const from = column.models.findIndex((row) => row.id === lift.id)
        const to = rowAt(lift.source, event.clientY)
        if (from < 0 || to < 0 || to === from) return

        const models = [...column.models]
        const [moved] = models.splice(from, 1)
        models.splice(to, 0, moved)
        onArrange(
          columns.map((entry) => (entry.source === lift.source ? { ...entry, models } : entry)),
        )
        return
      }

      const from = columns.findIndex((entry) => entry.source === lift.source)
      const to = columnAt(event.clientX)
      if (from < 0 || to < 0 || to === from) return

      const next = [...columns]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      onArrange(next)
    },
    [lift, columns, onArrange, rowAt, columnAt],
  )

  /**
   * One press, which becomes either a tap or a drag.
   *
   * The timer is the whole mechanism. It is cleared by a move beyond `SLOP`
   * (the reader is scrolling), and by letting go (the reader is tapping). Only
   * if it survives both does anything lift.
   *
   * A tap is **not** acted on here. Choosing a model closes the sheet, and a
   * sheet closed on `pointerup` is gone by the time the browser dispatches the
   * `click` that follows — so the browser hit-tests that click against the
   * page now under the finger and presses whatever chip was behind the sheet.
   * The reader picked a model and the tutor answered a question they never
   * asked. The `click` handler on the row does the choosing instead: it runs
   * while the sheet is still on screen and is aimed at the row itself.
   */
  const press = useCallback(
    (event: React.PointerEvent, becomes: NonNullable<Lift>) => {
      const start = { x: event.clientX, y: event.clientY }
      const target = event.currentTarget as HTMLElement
      let held = false
      dragged.current = false

      const timer = window.setTimeout(() => {
        held = true
        dragged.current = true
        target.setPointerCapture(event.pointerId)
        setLift(becomes)
        // The phone's own confirmation that something is now in the air. Silent
        // where the browser has no vibrator, which is most desktops.
        navigator.vibrate?.(8)
      }, HOLD_MS)

      const strayed = (moved: PointerEvent) =>
        Math.abs(moved.clientX - start.x) > SLOP || Math.abs(moved.clientY - start.y) > SLOP

      const watch = (moved: PointerEvent) => {
        if (!held && strayed(moved)) stop()
      }

      const stop = () => {
        clearTimeout(timer)
        window.removeEventListener('pointermove', watch)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        if (held) setLift(null)
      }

      const up = () => stop()
      const cancel = () => stop()

      window.addEventListener('pointermove', watch)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    },
    [],
  )

  /**
   * Moving a row without a pointer.
   *
   * The drag is a touch gesture and a keyboard has no equivalent, so the same
   * two operations are offered as keys on the focused row. Without this the
   * arrangement would be reachable by finger only, and the picker is already a
   * `dialog` full of real buttons precisely so it is not.
   */
  const nudge = useCallback(
    (source: Provider, id: string, by: -1 | 1) => {
      const column = columns.find((entry) => entry.source === source)
      if (!column) return
      const from = column.models.findIndex((row) => row.id === id)
      const to = from + by
      if (from < 0 || to < 0 || to >= column.models.length) return

      const models = [...column.models]
      const [moved] = models.splice(from, 1)
      models.splice(to, 0, moved)
      onArrange(columns.map((entry) => (entry.source === source ? { ...entry, models } : entry)))
    },
    [columns, onArrange],
  )

  return (
    <div className={styles.grid} ref={grid} onPointerMove={move}>
      {columns.map((column) => (
        <div key={column.source} className={styles.column}>
          <button
            type="button"
            className={`${styles.head} ${
              lift?.kind === 'column' && lift.source === column.source ? styles.lifted : ''
            }`}
            onPointerDown={(event) => press(event, { kind: 'column', source: column.source })}
            aria-label={`${PROVIDER_NAME[column.source]} — hold to move this column`}
          >
            {PROVIDER_NAME[column.source]}
          </button>

          <div
            className={styles.list}
            ref={(node) => {
              if (node) lists.current.set(column.source, node)
              else lists.current.delete(column.source)
            }}
          >
            {column.models.map((row, rank) => {
              const here = row.id === pick
              const up = lift?.kind === 'row' && lift.id === row.id
              return (
                <button
                  key={row.id}
                  ref={here ? chosen : undefined}
                  type="button"
                  className={`${styles.row} ${here ? styles.picked : ''} ${up ? styles.lifted : ''}`}
                  aria-pressed={here}
                  /* Spelled out rather than left to the browser. Adjacent inline
                     elements are concatenated without a space when the
                     accessible name is computed, so the row would otherwise be
                     announced as "Claudepaid". */
                  aria-label={`${shortName(row)}${row.paid ? ', paid' : ''}${
                    row.busy ? ', busy' : ''
                  }`}
                  onPointerDown={(event) =>
                    press(event, { kind: 'row', source: column.source, id: row.id })
                  }
                  /* Every way of choosing lands here — finger, mouse, Enter,
                     Space. See `press` for why the finger is not served on
                     `pointerup` instead. A drag ends with a click too, and that
                     one is a move, not a choice. */
                  onClick={() => {
                    if (dragged.current) {
                      dragged.current = false
                      return
                    }
                    onPick(row.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp' && event.altKey) {
                      event.preventDefault()
                      nudge(column.source, row.id, -1)
                    }
                    if (event.key === 'ArrowDown' && event.altKey) {
                      event.preventDefault()
                      nudge(column.source, row.id, 1)
                    }
                  }}
                >
                  {/* The rung number. The reader asked to see how far the chain
                      fell, and on a grid that is a position, not a sentence. */}
                  <span className={styles.rank} aria-hidden="true">
                    {rank + 1}
                  </span>
                  <span className={styles.said}>{shortName(row)}</span>
                  {row.paid && <em className={`${styles.tag} ${styles.paid}`}>paid</em>}
                  {row.busy && <em className={styles.tag}>busy</em>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
