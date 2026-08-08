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
 * ## Two options is a switch, not a menu
 *
 * Title, Author, Recently and List/Grid each have exactly two settings, so they
 * **change on the tap** rather than opening a panel to offer a choice of two.
 * A menu earns its extra tap by having something to decide; with two options the
 * panel was asking "which of these two?" when the reader had already answered by
 * reaching for the control at all. Tap Title for A → Z, tap it again for Z → A.
 *
 * The three that hold more than two — reading progress, folders, reading status
 * — still open a panel, because there the choice is real.
 *
 * ## What the yellow means, and why it is never permanent
 *
 * The accent marks **the thing you are working on**, and it has to be able to
 * move or it says nothing. Exactly one of Title / Author / Recently carries it,
 * because sort is one setting: tap Title and it leaves Recently. The filter
 * chips carry it when they are hiding books.
 *
 * **List/Grid deliberately never carries it.** It always has a value, so a lit
 * View chip would be lit on every screen the reader ever sees — which is the
 * "permanent yellow" that made the mark meaningless in the first place. Its
 * label already says which of the two it is set to, which is the whole story.
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

/**
 * Which panel is open, if any. Only the controls with more than two options
 * have one.
 */
type OpenControl = 'progress' | 'folder' | 'status' | null

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
 * What tapping a sort chip should do.
 *
 * Two different jobs behind one gesture, and getting the first one wrong is what
 * makes a toggle feel unpredictable:
 *
 * - **Not the current sort** → its *first* ordering. The reader tapping "Author"
 *   while the shelf is by title is asking for authors A → Z, not for whichever
 *   direction the author chip happened to be left in a week ago.
 * - **Already the current sort** → the next one along, wrapping. That is the
 *   reversal the reader is reaching for on the second tap.
 */
function nextSort(group: string, sort: SortKey): SortKey {
  const options = sortsIn(group)
  const at = options.findIndex((option) => option.value === sort)
  if (at === -1) return options[0]!.value
  return options[(at + 1) % options.length]!.value
}

/**
 * What a sort chip says: its current setting if the shelf is sorted by it, and
 * otherwise just its name.
 *
 * "Title" means "you could sort by this"; "Title Z → A" means "this is the order
 * you are looking at" — and the reader can tell which without tapping anything.
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
  function sortChip(group: string) {
    const sorted = sortsIn(group).some((option) => option.value === prefs.sort)
    return (
      <Switch
        label={sortChipLabel(group, prefs.sort)}
        leading="⇅"
        on={sorted}
        // Announced as a pressed toggle: "Title Z → A, pressed" is the whole
        // state of this control said out loud, which is what the accent says
        // to everyone else.
        pressed={sorted}
        onClick={() => onChange({ ...prefs, sort: nextSort(group, prefs.sort) })}
      />
    )
  }

  const folder = folders.find((choice) => choice.id === prefs.folderId)

  return (
    <div className={styles.wrap} data-no-swipe="">
      <div className={styles.row}>
        {/* Everything, including the one filter that isn't out here (content
            type). This is the only way to the sheet — the matching button that
            used to sit inside the search bar has gone, since it opened the same
            thing from two inches away. */}
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

        {sortChip('Title')}
        {sortChip('Author')}
        {sortChip('Recently')}

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

        {/* Two options, so it switches on the tap — and never lights up, for
            the reason in this file's opening note. */}
        <Switch
          label={prefs.view === 'grid' ? 'Grid' : 'List'}
          leading={prefs.view === 'grid' ? '▦' : '☰'}
          onClick={() => onChange({ ...prefs, view: prefs.view === 'grid' ? 'list' : 'grid' })}
        />
      </div>

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
    </div>
  )
}

/**
 * A chip that changes on the tap, for the controls with exactly two settings.
 *
 * No caret: a caret promises something will open, and nothing does. The label is
 * the state, so the chip reads as a switch you can see the position of rather
 * than a button whose effect you have to remember.
 */
function Switch({
  label,
  leading,
  on = false,
  pressed,
  onClick,
}: {
  label: string
  leading?: string
  /** Carries the accent — "this is the one you are working on". */
  on?: boolean
  pressed?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={on ? `${styles.control} ${styles.controlOn}` : styles.control}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {leading && (
        <span className={styles.leading} aria-hidden="true">
          {leading}
        </span>
      )}
      <span className={styles.controlLabel}>{label}</span>
    </button>
  )
}

/**
 * A chip that opens a panel, for the controls with more than two options.
 *
 * `on` means this control is hiding books, and is the same accent the active
 * sort carries — one mark, one meaning: *this is doing something right now*.
 */
function Control({
  label,
  open,
  on,
  onClick,
}: {
  label: string
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
 * control serves both the single-choice panel (folders) and the many-choice ones
 * (status, reading progress), and "is this on" is the honest description of both
 * — the same reasoning `FilterSheet`'s chips are built on.
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
