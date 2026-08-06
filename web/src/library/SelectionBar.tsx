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
  folders: readonly StoredFolder[]
  onSelectAll: () => void
  onSelectNone: () => void
  onChangeType: (shelf: Shelf) => void
  onMoveToFolder: (folderId: string | undefined) => void
  onNewFolder: () => void
  onDelete: () => void
  onCancel: () => void
}

/** Which sub-menu is showing, if any. Only ever one at a time. */
type OpenMenu = 'type' | 'folder' | 'delete' | null

export function SelectionBar({
  count,
  allShown,
  folders,
  onSelectAll,
  onSelectNone,
  onChangeType,
  onMoveToFolder,
  onNewFolder,
  onDelete,
  onCancel,
}: SelectionBarProps) {
  const [menu, setMenu] = useState<OpenMenu>(null)
  const none = count === 0

  function choose(open: OpenMenu) {
    setMenu((current) => (current === open ? null : open))
  }

  return (
    <div className={styles.bar} role="toolbar" aria-label="Selected books">
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
          Move to folder
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
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setMenu(null)
                onMoveToFolder(folder.id)
              }}
            >
              {folder.name}
            </button>
          ))}

          {/* The way back out. Without this a book can be filed and never
              unfiled, which is a one-way door on an organising feature. */}
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              setMenu(null)
              onMoveToFolder(undefined)
            }}
          >
            No folder
          </button>

          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemStrong}`}
            onClick={() => {
              setMenu(null)
              onNewFolder()
            }}
          >
            + New folder…
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
