/**
 * The library's filter and sort controls, on the shelf itself rather than
 * behind a button.
 *
 * ## Why they came out of the sheet
 *
 * The sheet is still here and still holds everything — it is what the icon at
 * the left of this row opens. What changed is that the three controls the reader
 * actually reaches for (sort, folder, reading status) were costing two taps and
 * a wait for a 280 ms slide *before* they could even be read. Worse, the sheet
 * covers the shelf while it is open, so the one thing that tells you whether a
 * filter did what you wanted is hidden at the moment you choose it. Out here the
 * shelf reorders underneath your thumb as you tap.
 *
 * ## Why the open menu is a panel below the row, not a dropdown under the chip
 *
 * The row scrolls sideways — there are more controls than fit on a phone — and
 * anything anchored to a chip inside a horizontally scrolling box is either
 * clipped by it or has to escape it with `position: fixed`, which **does not
 * work anywhere inside the app frame**: `AppShell`'s always-on `filter` makes it
 * a containing block, so "fixed to the screen" silently means "fixed to the
 * document". That rule has already cost this project two rounds (see
 * `app/Portal.tsx`), and the way to not pay it a third time is to not need it.
 *
 * A panel in the normal flow beneath the row needs no positioning at all, is the
 * full width of the screen so the options are big enough to hit, and pushes the
 * shelf down rather than covering it.
 */

import { useState } from 'react'

import type { FolderChoice } from './systemFolders.ts'
import {
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type LibraryPrefs,
  type SortKey,
  type ViewMode,
} from './prefs.ts'
import type { ReadingStatus } from './status.ts'
import styles from './FilterBar.module.css'

export interface FilterBarProps {
  prefs: LibraryPrefs
  /** The two computed folders and the reader's own, in one list. */
  folders: readonly FolderChoice[]
  onChange: (prefs: LibraryPrefs) => void
  /** Opens the full sheet — everything here, plus content type. */
  onOpenAll: () => void
}

/** Which control is expanded, if any. Only ever one at a time. */
type OpenControl = 'sort' | 'folder' | 'status' | 'view' | null

/** Add or remove one value from a filter list — the "empty means all" rule. */
function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

/**
 * What the reading-status chip says when it isn't showing "All".
 *
 * Named rather than counted while there is one — "Unread" tells you what you are
 * looking at and "1 selected" does not. Past one there is no room for the names,
 * and the count at least says how many things are being hidden.
 */
/**
 * What the sort chip says. "Title A → Z" as one phrase, but "Recently added"
 * rather than "Recently added Recently added" — several options carry the same
 * word in both halves, and the sheet's chips read the pair the same way.
 */
function sortLabel(sort: SortKey): string {
  const option = SORT_OPTIONS.find((entry) => entry.value === sort)
  if (!option) return 'Sort by'
  return option.group === option.label ? option.label : `${option.group} ${option.label}`
}

function statusLabel(statuses: readonly ReadingStatus[]): string {
  if (statuses.length === 0) return 'Reading status'
  if (statuses.length === 1) {
    return STATUS_OPTIONS.find((option) => option.value === statuses[0])?.label ?? 'Reading status'
  }
  return `${statuses.length} statuses`
}

export function FilterBar({ prefs, folders, onChange, onOpenAll }: FilterBarProps) {
  const [open, setOpen] = useState<OpenControl>(null)

  function toggle(control: OpenControl) {
    setOpen((current) => (current === control ? null : control))
  }

  const folder = folders.find((choice) => choice.id === prefs.folderId)

  return (
    <div className={styles.wrap} data-no-swipe="">
      <div className={styles.row}>
        {/* Everything, including the one filter that isn't out here (content
            type). Kept as the way in to the sheet rather than deleted with it:
            a reader who has learned where the filters live shouldn't find the
            button gone. */}
        <button
          type="button"
          className={styles.iconButton}
          aria-label="All filters"
          onClick={onOpenAll}
        >
          <span className={styles.tuneIcon} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <Control
          label={sortLabel(prefs.sort)}
          leading="⇅"
          open={open === 'sort'}
          on={false}
          onClick={() => toggle('sort')}
        />

        <Control
          label={folder ? folder.name : 'Folders'}
          open={open === 'folder'}
          on={prefs.folderId !== undefined}
          onClick={() => toggle('folder')}
        />

        <Control
          label={statusLabel(prefs.statuses)}
          open={open === 'status'}
          on={prefs.statuses.length > 0}
          onClick={() => toggle('status')}
        />

        <Control
          label={prefs.view === 'grid' ? 'Grid' : 'List'}
          open={open === 'view'}
          on={false}
          onClick={() => toggle('view')}
        />
      </div>

      {open === 'sort' && (
        <Panel>
          {SORT_OPTIONS.map((option) => (
            <Choice
              key={option.value}
              label={option.group === option.label ? option.label : `${option.group} ${option.label}`}
              active={prefs.sort === option.value}
              // A single choice, so the panel closes on it: the chip above now
              // shows the answer, and leaving the list open would be a menu with
              // nothing left to decide.
              onClick={() => {
                onChange({ ...prefs, sort: option.value satisfies SortKey })
                setOpen(null)
              }}
            />
          ))}
        </Panel>
      )}

      {open === 'folder' && (
        <Panel>
          <Choice
            label="All books"
            active={prefs.folderId === undefined}
            onClick={() => {
              onChange({ ...prefs, folderId: undefined })
              setOpen(null)
            }}
          />
          {folders.map((choice) => (
            <Choice
              key={choice.id}
              label={choice.name}
              active={prefs.folderId === choice.id}
              onClick={() => {
                // Tapping the folder you are already in is how you get back out.
                onChange({
                  ...prefs,
                  folderId: prefs.folderId === choice.id ? undefined : choice.id,
                })
                setOpen(null)
              }}
            />
          ))}
        </Panel>
      )}

      {open === 'status' && (
        <Panel>
          {/* "All" is the absence of a filter, not a fourth status — it clears
              the list rather than being a member of it. */}
          <Choice
            label="All"
            active={prefs.statuses.length === 0}
            onClick={() => onChange({ ...prefs, statuses: [] })}
          />
          {STATUS_OPTIONS.map((option) => (
            <Choice
              key={option.value}
              label={option.label}
              // Several statuses can be on at once, so this panel stays open —
              // the same rule the folder menu in `SelectionBar` follows.
              active={prefs.statuses.includes(option.value)}
              onClick={() =>
                onChange({
                  ...prefs,
                  statuses: toggled<ReadingStatus>(prefs.statuses, option.value),
                })
              }
            />
          ))}
        </Panel>
      )}

      {open === 'view' && (
        <Panel>
          {(['list', 'grid'] as ViewMode[]).map((view) => (
            <Choice
              key={view}
              label={view === 'list' ? 'List' : 'Grid'}
              active={prefs.view === view}
              onClick={() => {
                onChange({ ...prefs, view })
                setOpen(null)
              }}
            />
          ))}
        </Panel>
      )}
    </div>
  )
}

/**
 * One chip in the row: what it is currently set to, and a caret saying it opens.
 *
 * `on` is "this is narrowing the shelf" and is deliberately not the same as
 * "this has a value". Sort and view always have a value and never hide a book,
 * so lighting them up would make a library with no filters at all look filtered.
 */
function Control({
  label,
  leading,
  open,
  on,
  onClick,
}: {
  label: string
  leading?: string
  open: boolean
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={on ? `${styles.control} ${styles.controlOn}` : styles.control}
      aria-expanded={open}
      onClick={onClick}
    >
      {leading && (
        <span className={styles.leading} aria-hidden="true">
          {leading}
        </span>
      )}
      <span className={styles.controlLabel}>{label}</span>
      <span className={open ? `${styles.caret} ${styles.caretUp}` : styles.caret} aria-hidden="true">
        ▾
      </span>
    </button>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className={styles.panel}>{children}</div>
}

/**
 * One option. `aria-pressed` rather than a radio or a checkbox because the same
 * control serves both the single-choice panels (sort, folder, view) and the
 * many-choice one (status), and "is this on" is the honest description of all of
 * them — the same reasoning `FilterSheet`'s chips are built on.
 */
function Choice({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? `${styles.choice} ${styles.choiceActive}` : styles.choice}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
