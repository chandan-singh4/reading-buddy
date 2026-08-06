/**
 * The floating "+" in the bottom-right, and the two things it can add.
 *
 * It replaces the pair of "Add books" / "Add a folder" buttons that used to sit
 * in a panel at the top of the screen. Those cost the most valuable strip of a
 * phone screen — the part above the fold — to two actions a reader takes
 * occasionally, and pushed the books themselves below it. A floating button
 * costs a thumb's worth of the bottom-right corner, which is the easiest place
 * on the screen to reach and the hardest place to put a book.
 *
 * **"Add Folder" means two different things and both are here.** Importing every
 * book inside a folder on the device is what the old button did; making a folder
 * to file books into is what the new folders feature needs. They are named apart
 * rather than merged, because a reader who picks the wrong one either imports
 * nothing or waits three minutes for a hundred books.
 */

import { useEffect, useRef, useState } from 'react'

import { ACCEPTED_EXTENSIONS } from '../import/index.ts'
import styles from './AddButton.module.css'

export interface AddButtonProps {
  busy: boolean
  onPickFiles: (files: File[]) => void
  onPickFolder: (files: File[]) => void
  onNewFolder: () => void
}

export function AddButton({ busy, onPickFiles, onPickFolder, onNewFolder }: AddButtonProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // A menu that stays open after you have tapped past it is a menu you have to
  // fight. Escape and a tap anywhere else both close it.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function picked(
    event: React.ChangeEvent<HTMLInputElement>,
    handle: (files: File[]) => void,
  ): void {
    const files = Array.from(event.target.files ?? [])
    // Reset immediately, so picking the same files twice still fires a change.
    event.target.value = ''
    setOpen(false)
    handle(files)
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={open ? `${styles.menu} ${styles.menuOpen}` : styles.menu} inert={!open}>
        {/* The label *is* the menu item — a file input can only be opened by a
            real user gesture on its own label or the input itself, so there is
            no button here to forward a click to one. */}
        <input
          id="library-add-files"
          className={styles.fileInput}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          disabled={busy}
          onChange={(event) => picked(event, onPickFiles)}
        />
        <label htmlFor="library-add-files" className={styles.item} aria-disabled={busy}>
          <span className={styles.itemIcon} aria-hidden="true">
            ▤
          </span>
          Add books
        </label>

        <input
          id="library-add-directory"
          className={styles.fileInput}
          type="file"
          multiple
          disabled={busy}
          // Not in React's typings; the attribute is what makes the picker
          // choose a folder instead of files, so it is set directly.
          ref={(element) => {
            element?.setAttribute('webkitdirectory', '')
          }}
          onChange={(event) => picked(event, onPickFolder)}
        />
        <label htmlFor="library-add-directory" className={styles.item} aria-disabled={busy}>
          <span className={styles.itemIcon} aria-hidden="true">
            ⊞
          </span>
          Import a folder of books
        </label>

        <button
          type="button"
          className={styles.item}
          onClick={() => {
            setOpen(false)
            onNewFolder()
          }}
        >
          <span className={styles.itemIcon} aria-hidden="true">
            🗀
          </span>
          New folder
        </button>
      </div>

      <button
        type="button"
        className={open ? `${styles.fab} ${styles.fabOpen}` : styles.fab}
        aria-label={open ? 'Close add menu' : 'Add to your library'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.plus} aria-hidden="true">
          +
        </span>
      </button>
    </div>
  )
}
