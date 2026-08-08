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
 * ## What the yellow means: the one chip you are working on
 *
 * **Exactly one chip in the row is lit, and it is the last one the reader
 * touched.** Tap Reading progress and the accent moves there, off whichever sort
 * chip had it; tap Folders and it moves again.
 *
 * This replaces a rule that sounded better than it worked: "lit means this
 * control is doing something", so the active sort was lit and a filter lit up
 * only once it was actually hiding books. Two faults, both reported. Opening the
 * Reading progress panel lit *nothing* — the reader had tapped a control and the
 * screen answered by highlighting a different one, which reads as the tap having
 * missed. And with sort always set, the accent sat on a sort chip permanently,
 * so it stopped being a mark and became decoration.
 *
 * A mark that cannot move says nothing. This one moves on every tap.
 *
 * ## What the accent stopped carrying, and what carries it instead
 *
 * It no longer says "this filter is hiding books" — but nothing was lost with
 * it, because **that was never the accent's job alone**. A filter that is on
 * says so in its own label: the chip reads "Unread" rather than "Reading
 * status", "0–25%" rather than "Reading progress", the folder's name rather than
 * "Folders". And the line under the row spells it out in words — "Showing 3 of
 * 12", next to the one tap that clears it. The reader who has lost a book has
 * two plainer answers than a coloured border ever was.
 *
 * ## List/Grid still never lights up
 *
 * It is the one control with no "off": it always has a value and never hides
 * anything, so lighting it would put a permanent mark back on the row. Its label
 * already says which of the two it is set to, which is the whole story. Tapping
 * it therefore leaves the accent where it was rather than claiming it.
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

/**
 * A chip that can carry the accent. View is absent on purpose — it is the one
 * control that never lights up.
 *
 * The three sort chips are named by their `SORT_OPTIONS` group, so "which chip
 * is lit" and "which group is the shelf sorted by" are comparable without a
 * lookup table between them.
 */
type ChipKey = 'Title' | 'Author' | 'Recently' | 'progress' | 'folder' | 'status'

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

  /**
   * The chip the reader is working on — the last one they tapped.
   *
   * `null` until they touch anything, which is why the fallback below matters:
   * on a shelf nobody has touched yet, the sort chip that is in force carries
   * the accent, so the row opens saying what the order is rather than saying
   * nothing at all.
   *
   * Deliberately *not* derived from the preferences. "Which control am I
   * working on" is a fact about this glance at the screen and nothing else — it
   * should not survive a reload, and it has no business being written to
   * `localStorage` alongside the reader's actual choices.
   */
  const [working, setWorking] = useState<ChipKey | null>(null)

  /** The group of the sort in force — the accent's home before anything is tapped. */
  const sortedGroup = SORT_OPTIONS.find((option) => option.value === prefs.sort)?.group
  const lit: ChipKey | null = working ?? (sortedGroup as ChipKey | undefined) ?? null

  function toggle(control: Exclude<OpenControl, null>) {
    setWorking(control)
    setOpen((current) => (current === control ? null : control))
  }

  /**
   * Move to a control that has no panel: the accent goes with it, and whatever
   * was open closes.
   *
   * The closing is the part worth naming. A panel belongs to the chip that
   * opened it, so leaving it standing while the reader works somewhere else
   * makes the row lie twice over — the shelf is pushed down by a list of options
   * for a control nobody is on, and the accent is somewhere the open panel is
   * not. Tapping List with the Reading progress options showing should leave the
   * row as it would have been if they had never been opened.
   */
  function switchTo(chip: ChipKey | null, change: () => void) {
    if (chip) setWorking(chip)
    setOpen(null)
    change()
  }

  /** One of the three sort chips, which differ only in which group they hold. */
  function sortChip(group: ChipKey) {
    const sorted = sortsIn(group).some((option) => option.value === prefs.sort)
    return (
      <Switch
        label={sortChipLabel(group, prefs.sort)}
        leading="⇅"
        on={lit === group}
        // Announced as a pressed toggle: "Title Z → A, pressed" is this
        // control's own state said out loud. It tracks the *sort*, not the
        // accent — "which of these three is the shelf ordered by" is a fact a
        // screen reader needs, and "which one did I last touch" is not.
        pressed={sorted}
        onClick={() => switchTo(group, () => onChange({ ...prefs, sort: nextSort(group, prefs.sort) }))}
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
          // The sheet holds these same options, so a panel left open behind it
          // would be the reader's choices offered twice at once.
          onClick={() => switchTo(null, onOpenAll)}
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
          on={lit === 'progress'}
          onClick={() => toggle('progress')}
        />

        <Control
          label={folder ? folder.name : 'Folders'}
          open={open === 'folder'}
          on={lit === 'folder'}
          onClick={() => toggle('folder')}
        />

        <Control
          label={statusLabel(prefs.statuses)}
          open={open === 'status'}
          on={lit === 'status'}
          onClick={() => toggle('status')}
        />

        {/* Two options, so it switches on the tap — and never lights up, for
            the reason in this file's opening note. `null` because it takes the
            accent from nobody: it closes whatever was open and leaves the mark
            where it was. */}
        <Switch
          label={prefs.view === 'grid' ? 'Grid' : 'List'}
          leading={prefs.view === 'grid' ? '▦' : '☰'}
          onClick={() =>
            switchTo(null, () =>
              onChange({ ...prefs, view: prefs.view === 'grid' ? 'list' : 'grid' }),
            )
          }
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
  /** The control's own state, for a screen reader. Not the same as `on`. */
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
 * `on` is the accent, and means the same here as everywhere else in the row:
 * *this is the chip you are working on*. It is set by tapping, not by whether
 * the filter is doing anything — see this file's opening note.
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
