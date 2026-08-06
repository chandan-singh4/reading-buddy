/**
 * The filter and sort menu, behind the icon at the right of the search bar.
 *
 * A sheet rising from the bottom rather than a dropdown: it holds four groups
 * of choices, which is more than a menu's worth, and on a phone the bottom of
 * the screen is the half a thumb can reach. Every choice applies **the moment
 * it is tapped** — there is no Apply button, because the shelf is visible
 * behind the sheet and the result of a filter is the only honest preview of it.
 *
 * Adding a group later is a `<Group>` block and one field on `LibraryPrefs`;
 * nothing here knows what the filters mean.
 */

import { useEffect, useRef } from 'react'

import type { Shelf } from '../structure/index.ts'
import type { StoredFolder } from '../storage/index.ts'
import {
  SHELF_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type LibraryPrefs,
  type SortKey,
  type ViewMode,
} from './prefs.ts'
import type { ReadingStatus } from './status.ts'
import { Portal } from '../app/Portal.tsx'
import styles from './FilterSheet.module.css'

export interface FilterSheetProps {
  open: boolean
  prefs: LibraryPrefs
  folders: readonly StoredFolder[]
  onChange: (prefs: LibraryPrefs) => void
  onClose: () => void
}

/** Add or remove one value from a filter list — the "empty means all" rule. */
function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

export function FilterSheet({ open, prefs, folders, onChange, onClose }: FilterSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  // Escape closes and the page behind stops scrolling, exactly as the
  // navigation drawer does — the two are the same kind of thing and a reader
  // shouldn't have to learn each one separately.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  return (
    // Outside the app frame. `AppShell`'s always-on `filter` makes it a
    // containing block for fixed descendants, so a sheet rendered inside the
    // page rises from the bottom of the *document* — hundreds of pixels below
    // the fold on a long shelf, which reads as the button doing nothing.
    // See `app/Portal.tsx`.
    <Portal>
      <div
        className={open ? `${styles.scrim} ${styles.scrimOpen}` : styles.scrim}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        className={open ? `${styles.sheet} ${styles.sheetOpen}` : styles.sheet}
        role="dialog"
        aria-label="Filter and sort"
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        // A swipe inside the sheet is aimed at the sheet, not at the page
        // behind it — without this, dragging across the chips navigates away.
        data-no-swipe=""
      >
        <div className={styles.handle} aria-hidden="true" />

        <div className={styles.scroll}>
          <Group title="View">
            <div className={styles.row}>
              {(['list', 'grid'] as ViewMode[]).map((view) => (
                <Choice
                  key={view}
                  label={view === 'list' ? 'List' : 'Grid'}
                  active={prefs.view === view}
                  onClick={() => onChange({ ...prefs, view })}
                />
              ))}
            </div>
          </Group>

          <Group title="Reading status">
            <div className={styles.row}>
              {/* "All" is the absence of a filter, not a fourth status — it
                  clears the list rather than being a member of it. */}
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
            </div>
          </Group>

          <Group title="Content type">
            <div className={styles.row}>
              <Choice
                label="All"
                active={prefs.shelves.length === 0}
                onClick={() => onChange({ ...prefs, shelves: [] })}
              />
              {SHELF_OPTIONS.map((option) => (
                <Choice
                  key={option.value}
                  label={option.label}
                  active={prefs.shelves.includes(option.value)}
                  onClick={() =>
                    onChange({ ...prefs, shelves: toggled<Shelf>(prefs.shelves, option.value) })
                  }
                />
              ))}
            </div>
          </Group>

          {/* Only once there is a folder to choose. An empty "Folder" heading
              on a library nobody has organised is furniture. */}
          {folders.length > 0 && (
            <Group title="Folder">
              <div className={styles.row}>
                <Choice
                  label="All"
                  active={prefs.folderId === undefined}
                  onClick={() => onChange({ ...prefs, folderId: undefined })}
                />
                {folders.map((folder) => (
                  <Choice
                    key={folder.id}
                    label={folder.name}
                    active={prefs.folderId === folder.id}
                    onClick={() =>
                      onChange({
                        ...prefs,
                        folderId: prefs.folderId === folder.id ? undefined : folder.id,
                      })
                    }
                  />
                ))}
              </div>
            </Group>
          )}

          <Group title="Sort by">
            <div className={styles.row}>
              {SORT_OPTIONS.map((option) => (
                <Choice
                  key={option.value}
                  // Grouped labels read as "Title A → Z" in one chip: two
                  // levels of heading for eight options is more structure than
                  // eight things need.
                  label={
                    option.group === option.label ? option.label : `${option.group} ${option.label}`
                  }
                  active={prefs.sort === option.value}
                  onClick={() => onChange({ ...prefs, sort: option.value satisfies SortKey })}
                />
              ))}
            </div>
          </Group>
        </div>

        <button type="button" className={styles.done} onClick={onClose}>
          Done
        </button>
      </div>
    </Portal>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      {children}
    </section>
  )
}

/**
 * One chip. `aria-pressed` rather than a checkbox or a radio because the same
 * control is used for both single-choice (view, sort) and many-choice (status,
 * type) groups, and "is this on" is the honest description of all of them.
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
