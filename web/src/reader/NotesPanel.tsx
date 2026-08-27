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

import { Markdown } from './markdown.tsx'
import {
  canGroupByChapter,
  groupByChapter,
  NOTE_FILTERS,
  notesUnder,
  type NoteFilter,
} from './notes.ts'
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
  /** Set when the row is a tutor conversation — tapping it reopens the
   *  thread under the lamp rather than jumping to the paragraph. */
  threadId?: string
  /** Set when the row is a line the reader kept out of one of Veda's answers.
   *  Names the thread it was said in, which is also what `threadId` carries —
   *  the two are the same id doing two jobs. `threadId` says where a tap goes;
   *  this says what the row *is*, and it is what the Veda quotes chip reads. */
  fromThread?: string
  /** The kept line's own words, without the markdown marks. What the lamp
   *  searches its answers for, so a tap lands on the line and not merely in
   *  the conversation around it. See `reader/pickMarkdown.ts`. */
  quote?: string
}

/** A word the reader kept from the Define panel. */
export interface WordRow {
  word: string
  /** The first sense, as it read on the day it was saved. */
  gloss?: string
  savedAt: string
}

export interface NotesPanelProps {
  /** Every note in this book, already in the book's own order. */
  notes: readonly NoteRow[]
  /** Go to the paragraph a note is about. */
  onJumpToNote: (anchor: Anchor) => void
  /** Reopen a tutor conversation under the lamp. */
  onOpenThread?: (threadId: string, find?: string) => void
  /** Every word the reader has kept, newest first. Not book-scoped: a word is
   *  learned once, and the reader who kept it wants it in the next book too. */
  words?: readonly WordRow[]
  /** Open the loupe on a kept word. */
  onDefineWord?: (word: string) => void
}

/** "Ch. Breathing · p.91" — the small tag above a note. */
function whereItIs(note: NoteRow): string {
  return note.page === null ? note.chapterTitle : `${note.chapterTitle} · p.${note.page}`
}

/*
 * One note, in the hand of whoever wrote it.
 *
 * **Nothing here deletes.** There used to be a small × on every row, and it sat
 * a thumb's width from the row itself — one slip and a conversation was gone
 * with no warning and no way back. Deleting is still offered, but only where
 * the reader is already looking at the thing itself: a highlight comes off from
 * its own menu on the page, and a conversation from the menu inside it. This
 * list is for finding your way back to them.
 */
function Note({ note, onJump }: { note: NoteRow; onJump: () => void }) {
  if (note.fromThread) {
    /*
     * A line the reader kept out of an answer, drawn as a quotation and not as
     * a slip. The difference is the point: a slip is a whole exchange the
     * reader can go back into, and this is one sentence they thought was worth
     * more than the answer around it. Same violet hand — it is still Veda — but
     * set against a rule rather than boxed, the way a kept line looks anywhere
     * anybody keeps them.
     */
    return (
      <li className={styles.note}>
        {/* The chapter first, as it is over a Quote. The reader asked for the
            two to match: where a line came from is how they find it again. */}
        <span className={styles.tagRow}>
          <span className={styles.tag}>{whereItIs(note)}</span>
        </span>
        <div
          role="button"
          tabIndex={0}
          className={styles.kept}
          onClick={onJump}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onJump()
          }}
        >
          <Markdown className={styles.txt} text={note.text} />
        </div>
      </li>
    )
  }

  if (note.author === 'claude') {
    return (
      <li className={styles.note}>
        {/* The chapter first, as it is over every other kind of note. Where a
            conversation happened is how the reader finds it again. */}
        <span className={styles.tagRow}>
          <span className={styles.tag}>{whereItIs(note)}</span>
        </span>
        {/*
          A div wearing a button's clothes, and it has to be one. The answer is
          markdown now, so this holds headings, lists and stacked tables — and
          a `<button>` may not contain any of them. The role and the two keys
          give back everything the element gave up.
        */}
        <div
          role="button"
          tabIndex={0}
          className={styles.slip}
          onClick={onJump}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onJump()
          }}
        >
          <span className={styles.who}>✦ Veda</span>
          {/* The tutor writes `**like this**`. The lamp has always drawn it;
              the Notes tab showed the marks themselves until now. */}
          <Markdown className={styles.txt} text={note.text} />
        </div>
      </li>
    )
  }

  return (
    <li className={styles.note}>
      <span className={styles.tagRow}>
        <span className={styles.tag}>{whereItIs(note)}</span>
      </span>
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

export function NotesPanel({
  notes,
  onJumpToNote,
  onOpenThread,
  words = [],
  onDefineWord,
}: NotesPanelProps) {
  const [filter, setFilter] = useState<NoteFilter>('all')
  /*
   * Grouping, which is not filtering.
   *
   * "By chapter" used to be a sixth chip, which put it in a row that answers
   * "which of these notes?" while it answered "arranged how?". It also showed
   * every note, exactly as All did, so two of the five chips looked to the
   * reader like the same button. It is a switch now, and it applies to whatever
   * chip is chosen — Quotes by chapter is a thing a reader wants, and the chip
   * row could never offer it.
   */
  const [grouped, setGrouped] = useState(false)
  const chips = useRef<(HTMLButtonElement | null)[]>([])

  const shown = notesUnder(notes, filter)
  const groupable = canGroupByChapter(filter)

  /** A tutor row reopens its conversation; every other note goes to its page. */
  function visit(note: NoteRow) {
    if (note.threadId && onOpenThread) {
      /*
       * The plain words when the note has them, and the note's own text when it
       * does not. Every line kept before `quote` existed has no plain copy, and
       * without this fall-back a tap on one of them could never land anywhere
       * but the top of the conversation — the notes the reader already had
       * would stay broken for ever. `wordsIn` strips the marks off before it
       * searches, so the older markdown still finds its way home.
       */
      onOpenThread(note.threadId, note.fromThread ? (note.quote ?? note.text) : undefined)
      return
    }
    onJumpToNote(note.anchor)
  }

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

      {groupable && (
        <div className={styles.arrange}>
          {/*
            A switch, not a radio: it does not belong to the group above it, and
            arrowing onto it from the chips would make it look as though it did.
            `aria-pressed` is what says "on", and it is read out that way.
          */}
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={grouped}
            onClick={() => setGrouped((was) => !was)}
          >
            By chapter
          </button>
        </div>
      )}

      <div className={styles.sheet}>
        <div className={styles.page}>
          {filter === 'words' ? (
            /*
              The kept words. A different table from the notes, so this branch
              comes before the empty check below — "no notes in this book" is
              the wrong sentence for a reader who has kept no words yet.
            */
            words.length === 0 ? (
              <p className={styles.empty}>
                No words kept yet. Tap a word, choose Define, then Save word — they gather here,
                across every book.
              </p>
            ) : (
              <ul className={styles.list}>
                {words.map((kept) => (
                  <li key={kept.word}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={styles.wordRow}
                      onClick={() => onDefineWord?.(kept.word)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onDefineWord?.(kept.word)
                        }
                      }}
                    >
                      <span className={styles.wordHead}>{kept.word}</span>
                      {kept.gloss && <span className={styles.wordGloss}>{kept.gloss}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : shown.length === 0 ? (
            <p className={styles.empty}>
              {notes.length === 0
                ? 'No notes yet. Ask the tutor about a passage, or write your own — they all land here, filed by chapter.'
                : 'No notes of that kind in this book yet.'}
            </p>
          ) : grouped ? (
            /*
              "By chapter" groups; it does not hide. Every note the chosen chip
              shows is still on the page, gathered under the chapter it belongs
              to — which is the only reading of the words that is any use.
            */
            groupByChapter(shown).map((group) => (
              <section key={group.chapter}>
                <h3 className={styles.divider}>
                  {group.notes[0]?.chapterTitle ?? 'Elsewhere'}
                </h3>
                <ul className={styles.group}>
                  {group.notes.map((note) => (
                    <Note key={note.id} note={note} onJump={() => visit(note)} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <ul className={styles.list}>
              {shown.map((note) => (
                <Note key={note.id} note={note} onJump={() => visit(note)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
