/**
 * The notes tab: a ruled sheet holding your notes and the tutor's.
 *
 * Built to the reader's own prototype, and the one rule it exists to keep is
 * that the two authors can never be confused. Yours are handwritten in ink on
 * the rules. Claude's are printed slips taped to the page. See the head of
 * `NotesPanel.module.css` for how that is drawn; the component's part is
 * simply that `author` decides which of the two shapes a note takes, and
 * nothing else ever does.
 *
 * Presentational. Ordering, filtering and grouping are decided in `notes.ts`,
 * where they can be tested without a screen.
 */

import { useRef, useState } from 'react'

import { groupByChapter, NOTE_FILTERS, notesUnder, type NoteFilter } from './notes.ts'
import type { NoteAuthor } from '../storage/index.ts'
import type { Anchor } from '../structure/index.ts'
import styles from './NotesPanel.module.css'

/**
 * A note as this panel needs it. `page` and `chapterTitle` are worked out by
 * the reading page, for the same reason the bookmark rows' are.
 */
export interface NoteRow {
  id: string
  anchor: Anchor
  author: NoteAuthor
  text: string
  chapter: number
  chapterTitle: string
  page: number | null
  createdAt: string
  /** A highlight's colour, where the note is one. */
  colour?: string
}

export interface NotesPanelProps {
  /** Every note in this book, already in the book's own order. */
  notes: readonly NoteRow[]
  /** Go to the paragraph a note is about. */
  onJumpToNote: (anchor: Anchor) => void
}

/** "Ch. Breathing · p.91" — the small tag above a note. */
function whereItIs(note: NoteRow): string {
  return note.page === null ? note.chapterTitle : `${note.chapterTitle} · p.${note.page}`
}

/** One note, in the hand of whoever wrote it. */
function Note({ note, onJump }: { note: NoteRow; onJump: () => void }) {
  if (note.author === 'claude') {
    return (
      <li className={styles.note}>
        <button type="button" className={styles.slip} onClick={onJump}>
          <span className={styles.who}>✦ Claude</span>
          <span className={styles.txt}>{note.text}</span>
        </button>
        <span className={styles.tag}>{whereItIs(note)}</span>
      </li>
    )
  }

  return (
    <li className={styles.note}>
      <span className={styles.tag}>{whereItIs(note)}</span>
      {/* The colour the reader chose, carried through to the list. It is the
          only thing telling two highlights apart at a glance, and readers give
          their colours meanings the app is not told about. */}
      <button
        type="button"
        className={styles.hand}
        onClick={onJump}
        style={note.colour ? { borderInlineStartColor: note.colour } : undefined}
      >
        {note.text}
      </button>
    </li>
  )
}

export function NotesPanel({ notes, onJumpToNote }: NotesPanelProps) {
  const [filter, setFilter] = useState<NoteFilter>('all')
  const chips = useRef<(HTMLButtonElement | null)[]>([])

  const shown = notesUnder(notes, filter)

  /**
   * Arrow keys move between chips and choose as they go.
   *
   * That is what a radio group does, and these are radios: exactly one is on,
   * and choosing one turns the others off. Tab moves past the whole group,
   * which is why only the chosen chip is tabbable.
   */
  function onChipKey(event: React.KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0) return

    event.preventDefault()
    const next = (index + step + NOTE_FILTERS.length) % NOTE_FILTERS.length
    setFilter(NOTE_FILTERS[next]!.value)
    chips.current[next]?.focus()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.filter} role="radiogroup" aria-label="Which notes">
        {NOTE_FILTERS.map((chip, index) => (
          <button
            key={chip.value}
            ref={(element) => {
              chips.current[index] = element
            }}
            type="button"
            role="radio"
            className={styles.chip}
            aria-checked={filter === chip.value}
            tabIndex={filter === chip.value ? 0 : -1}
            onClick={() => setFilter(chip.value)}
            onKeyDown={(event) => onChipKey(event, index)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className={styles.sheet}>
        {shown.length === 0 ? (
          <p className={styles.empty}>
            {notes.length === 0
              ? 'No notes yet. Ask the tutor about a passage, or write your own — they all land here, filed by chapter.'
              : 'No notes of that kind in this book yet.'}
          </p>
        ) : filter === 'chapter' ? (
          /*
            "By chapter" groups; it does not hide. Every note the reader has is
            still on the page, gathered under the chapter it belongs to — which
            is the only reading of the words that is any use.
          */
          groupByChapter(shown).map((group) => (
            <section key={group.chapter}>
              <h3 className={styles.divider}>
                {group.notes[0]?.chapterTitle ?? 'Elsewhere'}
              </h3>
              <ul className={styles.group}>
                {group.notes.map((note) => (
                  <Note key={note.id} note={note} onJump={() => onJumpToNote(note.anchor)} />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <ul className={styles.list}>
            {shown.map((note) => (
              <Note key={note.id} note={note} onJump={() => onJumpToNote(note.anchor)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
