/**
 * The library's filter and sort controls, on the shelf itself rather than
 * behind a button.
 *
 * ## Why they came out of the sheet
 *
 * The sheet is still here and still holds everything — it is what the icon at
 * the left of this row opens. What changed is that the controls the reader
 * actually reaches for were costing two taps and a wait for a 280 ms slide
 * *before* they could even be read. Worse, the sheet covers the shelf while it
 * is open, so the one thing that tells you whether a filter did what you wanted
 * is hidden at the moment you choose it. Out here the shelf reorders underneath
 * your thumb as you tap.
 *
 * ## One control per question, not one control called "Sort by"
 *
 * This started as a single sort chip holding all eight orderings, and that was
 * a menu wearing a chip's clothes: the reader had to open it to find out what it
 * was set to, and the thing they were looking for ("by author") was buried among
 * seven things they were not. Now each question gets its own control and answers
 * itself from the outside — **Title**, **Author** and **Recently** each say
 * which way they are pointing, and the two that aren't in force say only their
 * own name.
 *
 * Sort is still *one* setting underneath, so choosing from one of the three
 * releases the other two. That is what sorting is, and three chips that could
 * each be on at once would be promising an order that cannot exist.
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
  PROGRESS_OPTIONS,
  SORT_OPTIONS,
  sortPhrase,
  STATUS_OPTIONS,
  type LibraryPrefs,
  type ProgressBand,
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
type OpenControl = 'title' | 'author' | 'recently' | 'progress' | 'folder' | 'status' | 'view' | null

/** Add or remove one value from a filter list — the "empty means all" rule. */
function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

/**
 * The orderings belonging to one chip — "Title" holds A → Z and Z → A.
 *
 * Read off `SORT_OPTIONS` rather than listed again here, so a sort added there
 * appears under its own chip with nothing to change in this file.
 */
function sortsIn(group: string) {
  return SORT_OPTIONS.filter((option) => option.group === group)
}

/**
 * What a sort chip says: its current setting if the shelf is sorted by it, and
 * otherwise just its name.
 *
 * The label is the whole point of splitting the chips up. "Title" means "you
 * could sort by this"; "Title Z → A" means "this is the order you are looking
 * at" — and the reader can tell which without opening anything.
 */
function sortChipLabel(group: string, sort: SortKey): string {
  const active = sortsIn(group).find((option) => option.value === sort)
  return active ? sortPhrase(active) : group
}

/**
 * What the reading-status chip says when it isn't showing "All".
 *
 * Named rather than counted while there is one — "Unread" tells you what you are
 * looking at and "1 selected" does not. Past one there is no room for the names,
 * and the count at least says how many things are being hidden.
 */
function statusLabel(statuses: readonly ReadingStatus[]): string {
  if (statuses.length === 0) return 'Reading status'
  if (statuses.length === 1) {
    return STATUS_OPTIONS.find((option) => option.value === statuses[0])?.label ?? 'Reading status'
  }
  return `${statuses.length} statuses`
}

/** The same rule for the progress bands — one is named, several are counted. */
function progressLabel(bands: readonly ProgressBand[]): string {
  if (bands.length === 0) return 'Reading progress'
  if (bands.length === 1) {
    return PROGRESS_OPTIONS.find((option) => option.value === bands[0])?.label ?? 'Reading progress'
  }
  return `${bands.length} ranges`
}

export function FilterBar({ prefs, folders, onChange, onOpenAll }: FilterBarProps) {
  const [open, setOpen] = useState<OpenControl>(null)

  function toggle(control: OpenControl) {
    setOpen((current) => (current === control ? null : control))
  }

  /** One of the three sort chips, which differ only in which group they hold. */
  function sortControl(group: string, control: OpenControl) {
    const sorted = sortsIn(group).some((option) => option.value === prefs.sort)
    return (
      <Control
        label={sortChipLabel(group, prefs.sort)}
        leading="⇅"
        open={open === control}
        sorted={sorted}
        onClick={() => toggle(control)}
      />
    )
  }

  /** The options inside a sort chip. Choosing one closes the panel. */
  function sortPanel(group: string) {
    return (
      <Panel>
        {sortsIn(group).map((option) => (
          <Choice
            key={option.value}
            label={sortPhrase(option)}
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
    )
  }

  const folder = folders.find((choice) => choice.id === prefs.folderId)

  return (
    <div className={styles.wrap} data-no-swipe="">
      <div className={styles.row}>
        {/* Everything, including the one filter that isn't out here (content
            type). This is now the *only* way to the sheet — the matching button
            that used to sit inside the search bar has gone, since it opened the
            same thing from two inches away. */}
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

        {sortControl('Title', 'title')}
        {sortControl('Author', 'author')}
        {sortControl('Recently', 'recently')}

        <Control
          label={progressLabel(prefs.bands)}
          open={open === 'progress'}
          on={prefs.bands.length > 0}
          onClick={() => toggle('progress')}
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
          onClick={() => toggle('view')}
        />
      </div>

      {open === 'title' && sortPanel('Title')}
      {open === 'author' && sortPanel('Author')}
      {open === 'recently' && sortPanel('Recently')}

      {open === 'progress' && (
        <Panel>
          {/* "All" is the absence of a filter, not a fifth band — it clears the
              list rather than being a member of it. */}
          <Choice
            label="All"
            active={prefs.bands.length === 0}
            onClick={() => onChange({ ...prefs, bands: [] })}
          />
          {PROGRESS_OPTIONS.map((option) => (
            <Choice
              key={option.value}
              label={option.label}
              // Several bands can be on at once — "the ones I've barely started
              // and the ones I'm nearly done with" is a real thing to ask for —
              // so this panel stays open.
              active={prefs.bands.includes(option.value)}
              onClick={() =>
                onChange({ ...prefs, bands: toggled<ProgressBand>(prefs.bands, option.value) })
              }
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
          <Choice
            label="All"
            active={prefs.statuses.length === 0}
            onClick={() => onChange({ ...prefs, statuses: [] })}
          />
          {STATUS_OPTIONS.map((option) => (
            <Choice
              key={option.value}
              label={option.label}
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
 * ## Two lit states, because there are two different things to say
 *
 * `on` means **this control is hiding books** and fills the chip with the accent
 * colour, which is the loud signal — a reader who can't find a book needs to spot
 * it from across the screen.
 *
 * `sorted` means **this is the order the shelf is in**, and only outlines the
 * chip. Ordering hides nothing, so painting it as loudly as a filter would make
 * an unfiltered library look filtered — the mistake the single "Sort by" chip
 * avoided by never lighting up at all. That was the right call while one chip
 * held every ordering; with three, exactly one of them is in force at a time and
 * *which* one is worth showing. A quieter state says it without crying wolf.
 *
 * View passes neither. It always has a value, it hides nothing, and there is
 * nothing to choose between — the label already reads "List" or "Grid".
 */
function Control({
  label,
  leading,
  open,
  on = false,
  sorted = false,
  onClick,
}: {
  label: string
  leading?: string
  open: boolean
  on?: boolean
  sorted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={[styles.control, on ? styles.controlOn : '', sorted ? styles.controlSorted : '']
        .filter(Boolean)
        .join(' ')}
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
 * many-choice ones (status, reading progress), and "is this on" is the honest
 * description of all of them — the same reasoning `FilterSheet`'s chips are
 * built on.
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
