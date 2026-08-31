/**
 * The bar that takes over the top of the screen while books are selected.
 *
 * It replaces the old row of management buttons that sat on the shelf all the
 * time — a Select button, a shelf dropdown on every single row, and a Remove
 * beside it. Those were permanently visible in service of something a reader
 * does rarely, and the per-row dropdown in particular meant every book carried
 * a control that could silently refile it on a mis-tap.
 *
 * Two rules the old screen established and this one keeps:
 *
 *   - **Delete names the number and asks.** Removing one book by mistake is
 *     annoying; removing thirty-five is a small disaster, and there is no undo.
 *   - **"Select all" means everything on screen.** With a search or a filter
 *     applied, ticking books the reader cannot see and then deleting them would
 *     be the worst bug this screen could have.
 */

import { useState } from 'react'

import type { Shelf } from '../structure/index.ts'
import type { StoredFolder } from '../storage/index.ts'
import { SHELF_OPTIONS } from './prefs.ts'
import styles from './SelectionBar.module.css'

export interface SelectionBarProps {
  count: number
  /** True once every book currently on screen is ticked. */
  allShown: boolean
  /**
   * The reader's own folders only. Unread and Finished are deliberately absent:
   * they are worked out from reading progress, so "put these books in Finished"
   * would either be a lie or a request to have read them — see
   * `library/systemFolders.ts`.
   */
  folders: readonly StoredFolder[]
  /**
   * How many of the ticked books are in each folder.
   *
   * Needed because membership is no longer one-or-nothing. With thirty books
   * ticked and eleven of them already in Philosophy, a plain "Philosophy" button
   * has no honest label — the reader cannot tell whether tapping it will file
   * the other nineteen or unfile the eleven. The count turns that into three
   * states the row can actually show: none, some, all.
   */
  folderCounts: ReadonlyMap<string, number>
  onSelectAll: () => void
  onSelectNone: () => void
  onChangeType: (shelf: Shelf) => void
  /** Add the ticked books to a folder, or take them out of it. */
  onToggleFolder: (folderId: string, add: boolean) => void
  /** Take the ticked books out of every folder they are in. */
  onClearFolders: () => void
  onNewFolder: () => void
  /**
   * Rename the one ticked book. Unlike every other action on this bar, this one
   * takes a single book and not a set: two books cannot share a new title, and
   * a rename that quietly applied to thirty would be unrecoverable.
   */
  onRename: () => void
  onDelete: () => void
  onCancel: () => void
}

/** Which sub-menu is showing, if any. Only ever one at a time. */
type OpenMenu = 'type' | 'folder' | 'delete' | null

export function SelectionBar({
  count,
  allShown,
  folders,
  folderCounts,
  onSelectAll,
  onSelectNone,
  onChangeType,
  onToggleFolder,
  onClearFolders,
  onNewFolder,
  onRename,
  onDelete,
  onCancel,
}: SelectionBarProps) {
  const [menu, setMenu] = useState<OpenMenu>(null)
  const none = count === 0

  function choose(open: OpenMenu) {
    setMenu((current) => (current === open ? null : open))
  }

  return (
    // Swiping off the screen mid-selection would throw the selection away, so
    // the bar opts out of page navigation — see `app/useSwipeNav.ts`.
    <div className={styles.bar} role="toolbar" aria-label="Selected books" data-no-swipe="">
      <div className={styles.top}>
        <button
          type="button"
          className={styles.icon}
          aria-label="Cancel selection"
          onClick={onCancel}
        >
          ✕
        </button>

        <span className={styles.count} role="status">
          {count === 0 ? 'Select books' : `${count} selected`}
        </span>

        <button
          type="button"
          className={styles.text}
          onClick={allShown ? onSelectNone : onSelectAll}
        >
          {allShown ? 'Select none' : 'Select all'}
        </button>
      </div>

      <div className={styles.actions}>
        {/* Every action is disabled with nothing ticked rather than hidden:
            a bar whose buttons appear and disappear as you tick is a bar you
            can't aim at. */}
        <button
          type="button"
          className={styles.action}
          disabled={none}
          aria-expanded={menu === 'type'}
          onClick={() => choose('type')}
        >
          Change type
        </button>

        <button
          type="button"
          className={styles.action}
          disabled={none}
          aria-expanded={menu === 'folder'}
          onClick={() => choose('folder')}
        >
          {/* Not just "Folders": the filter bar above has a control by that
              name, and two buttons with one label on screen at the same time
              doing entirely different jobs — one narrowing the shelf, one
              rewriting what is on it — is a mis-tap waiting to happen. */}
          Change folders
        </button>

        {/* The only action here that is not a batch. It is disabled with two or
            more ticked rather than hidden, for the same reason as the rest: a
            button that comes and goes as you tick is a button you cannot aim
            at. */}
        <button
          type="button"
          className={styles.action}
          disabled={count !== 1}
          onClick={onRename}
        >
          Rename
        </button>

        <button
          type="button"
          className={`${styles.action} ${styles.danger}`}
          disabled={none}
          aria-expanded={menu === 'delete'}
          onClick={() => choose('delete')}
        >
          Delete
        </button>
      </div>

      {menu === 'type' && (
        <div className={styles.menu}>
          {SHELF_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setMenu(null)
                onChangeType(option.value satisfies Shelf)
              }}
            >
              {option.singular}
            </button>
          ))}
        </div>
      )}

      {menu === 'folder' && (
        <div className={styles.menu}>
          {/*
            The menu stays open as folders are tapped, unlike "Change type"
            above. That one is a single choice and closing is the confirmation;
            this one is a set, and filing thirty books under three folders would
            otherwise mean re-opening the menu and re-finding your place twice.
          */}
          {folders.map((folder) => {
            const inside = folderCounts.get(folder.id) ?? 0
            const all = inside === count
            return (
              <button
                key={folder.id}
                type="button"
                className={styles.menuItem}
                // A checkbox in all but name: it has an on state, an off state
                // and a partly-on state, and `aria-checked="mixed"` is the one
                // way to say the third out loud.
                role="menuitemcheckbox"
                aria-checked={all ? true : inside > 0 ? 'mixed' : false}
                onClick={() => onToggleFolder(folder.id, !all)}
              >
                <span className={styles.menuMark} aria-hidden="true">
                  {all ? '✓' : inside > 0 ? '–' : ''}
                </span>
                {folder.name}
                {/* Only when it would otherwise be ambiguous. "3 of 12" on a
                    folder the reader is about to fill is the fact that decides
                    what the next tap means. */}
                {inside > 0 && !all && (
                  <span className={styles.menuNote}>
                    {inside} of {count}
                  </span>
                )}
              </button>
            )
          })}

          {/* The way back out. Without this a book can be filed and never
              unfiled, which is a one-way door on an organising feature. */}
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              setMenu(null)
              onClearFolders()
            }}
          >
            <span className={styles.menuMark} aria-hidden="true" />
            Remove from all folders
          </button>

          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemStrong}`}
            onClick={() => {
              setMenu(null)
              onNewFolder()
            }}
          >
            <span className={styles.menuMark} aria-hidden="true" />+ New folder…
          </button>
        </div>
      )}

      {menu === 'delete' && (
        <div className={styles.confirm} role="alert">
          <p className={styles.confirmText}>
            Remove {count} {count === 1 ? 'book' : 'books'} for good? This can’t be undone.
          </p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={`${styles.action} ${styles.danger}`}
              onClick={() => {
                setMenu(null)
                onDelete()
              }}
            >
              Delete {count}
            </button>
            <button type="button" className={styles.action} onClick={() => setMenu(null)}>
              Keep
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
