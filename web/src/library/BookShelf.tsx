/**
 * The books, as either a list or a grid.
 *
 * One component rather than two, on purpose. The list row and the grid card
 * show *the same facts* — cover, title, author, progress, badges — and the only
 * real difference is how they are laid out, which is a CSS grid vs. flex
 * question and nothing more. Two components would mean adding every future
 * badge twice and discovering the second one had been forgotten from a
 * screenshot.
 *
 * It also means switching view keeps the same React elements in the same order,
 * so the browser animates between the two layouts instead of tearing the list
 * down and building another — and the scroll position survives, which is the
 * whole of the "preserve scroll when switching views" requirement.
 */

import { Link } from 'react-router'

import { isOutOfDate, shelfOf } from '../import/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import type { StoredFolder } from '../storage/index.ts'
import { Cover } from '../app/Cover.tsx'
import { rowId } from '../app/useRowMemory.ts'
import { foldersOf } from './folders.ts'
import { SHELF_OPTIONS, type ViewMode } from './prefs.ts'
import { progressOf, type BookProgress } from './status.ts'
import { useLongPress } from './useLongPress.ts'
import styles from './BookShelf.module.css'

export interface BookShelfProps {
  books: readonly BookMeta[]
  view: ViewMode
  progress: ReadonlyMap<BookId, BookProgress>
  folders: ReadonlyMap<string, StoredFolder>
  /** bookId → object URL for its cover art, where the book has any. */
  covers: ReadonlyMap<BookId, string>
  /** Ticked books, or `null` when not selecting at all. */
  selected: ReadonlySet<BookId> | null
  /**
   * Books on the shelf that can't be opened right now — offline, the ones never
   * read before the signal went. Empty in every other situation.
   */
  unavailable?: ReadonlySet<BookId>
  onLongPress: (id: BookId) => void
  onToggle: (id: BookId) => void
  /** Remembers which book was opened, so coming back lands on it. */
  onOpen: (id: BookId) => void
}

export function BookShelf({
  books,
  view,
  progress,
  folders,
  covers,
  selected,
  unavailable,
  onLongPress,
  onToggle,
  onOpen,
}: BookShelfProps) {
  return (
    <ul className={view === 'grid' ? `${styles.shelf} ${styles.grid}` : styles.shelf}>
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          view={view}
          progress={progressOf(book, progress)}
          // Every folder it is in, not just one — a book filed under both
          // Philosophy and For the course is still a single row on the shelf,
          // and the badges are where that shows.
          bookFolders={foldersOf(book, folders)}
          cover={covers.get(book.id)}
          away={unavailable?.has(book.id) ?? false}
          selecting={selected !== null}
          ticked={selected?.has(book.id) ?? false}
          onLongPress={() => onLongPress(book.id)}
          onToggle={() => onToggle(book.id)}
          onOpen={() => onOpen(book.id)}
        />
      ))}
    </ul>
  )
}

interface BookCardProps {
  book: BookMeta
  view: ViewMode
  progress: BookProgress
  bookFolders: readonly StoredFolder[]
  cover: string | undefined
  /** Listed, but not readable until there is a signal. */
  away: boolean
  selecting: boolean
  ticked: boolean
  onLongPress: () => void
  onToggle: () => void
  onOpen: () => void
}

function BookCard({
  book,
  view,
  progress,
  bookFolders,
  cover,
  away,
  selecting,
  ticked,
  onLongPress,
  onToggle,
  onOpen,
}: BookCardProps) {
  const press = useLongPress(onLongPress)

  const facts = (
    <div className={styles.text}>
      <span className={styles.cardTitle}>{book.title}</span>
      {book.author && <span className={styles.author}>{book.author}</span>}
      <Badges
        book={book}
        progress={progress}
        bookFolders={bookFolders}
        view={view}
        away={away}
      />
    </div>
  )

  const inside = (
    <>
      <span className={styles.media}>
        <Cover title={book.title} src={cover} />
      </span>
      {facts}
    </>
  )

  return (
    <li
      id={rowId(book.id)}
      className={[
        styles.card,
        view === 'grid' ? styles.cardGrid : styles.cardList,
        ticked ? styles.cardTicked : '',
        away ? styles.cardAway : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...press}
    >
      {/*
        While selecting, the whole card ticks the box instead of opening the
        book. Half a screen of tappable title doing something other than what
        the tick beside it does is how a reader loses a shelf by accident.
      */}
      {selecting ? (
        <button
          type="button"
          className={styles.hit}
          aria-pressed={ticked}
          onClick={onToggle}
        >
          {inside}
        </button>
      ) : away ? (
        /*
          Not a link, because there is nothing at the other end: the book's own
          screen reads a manifest the copy hasn't got. A link that lands on an
          error is a worse answer than a row that plainly isn't a door — the
          badge below says why, and the book comes back with the signal.
        */
        <span className={styles.hit} aria-disabled="true">
          {inside}
        </span>
      ) : (
        <Link to={`/book/${book.id}`} className={styles.hit} onClick={onOpen}>
          {inside}
        </Link>
      )}

      {/* Drawn over the cover rather than beside it: a checkbox in the flow
          would shift every title sideways the moment selection started, and a
          shelf that jumps when you touch it reads as a mis-tap. */}
      {ticked && (
        <span className={styles.tick} aria-hidden="true">
          ✓
        </span>
      )}
    </li>
  )
}

/**
 * The small facts under a title: how far through, or that it's finished, plus
 * its folder and anything the shelf needs to say about it.
 *
 * Progress is a **bar in list view and a line of text in grid view**. A grid
 * card is roughly half the width and already carries a title and an author over
 * two lines each; a bar there is a smear of colour with no room for its own
 * label, which is what the reference screenshots do too.
 */
function Badges({
  book,
  progress,
  bookFolders,
  view,
  away,
}: {
  book: BookMeta
  progress: BookProgress
  bookFolders: readonly StoredFolder[]
  view: ViewMode
  away: boolean
}) {
  const shelf = shelfOf(book)
  const shelfLabel = SHELF_OPTIONS.find((option) => option.value === shelf)?.singular

  return (
    <span className={styles.badges}>
      {/* First, and in words rather than only in colour: the dimming alone is
          the sort of thing a reader reads as "finished" or as a rendering bug.
          "Needs a signal" says both what is wrong and that it is temporary. */}
      {away && <span className={styles.badgeAway}>Needs a signal</span>}

      {progress.status === 'finished' ? (
        <span className={styles.finished}>✓ Finished</span>
      ) : progress.percent !== undefined ? (
        view === 'list' ? (
          <span className={styles.meter}>
            <span className={styles.meterLabel}>{progress.percent}% read</span>
            <span className={styles.meterTrack}>
              <span className={styles.meterFill} style={{ width: `${progress.percent}%` }} />
            </span>
          </span>
        ) : (
          <span className={styles.percent}>{progress.percent}% read</span>
        )
      ) : progress.status === 'reading' ? (
        // Opened, but nothing to report — the position predates percentages or
        // the spine hadn't built. Saying "0%" here would be a lie.
        <span className={styles.badge}>Reading</span>
      ) : null}

      {/* Only when it isn't the obvious one. A shelf of novels labelled "Book"
          on every row is noise, and the reference screenshots badge only the
          exceptions. */}
      {shelf !== 'book' && <span className={styles.badge}>{shelfLabel}</span>}

      {bookFolders.map((folder) => (
        <span key={folder.id} className={styles.badge}>
          {folder.name}
        </span>
      ))}

      {/* So the "N books can be improved" banner's number has faces. */}
      {isOutOfDate(book) && <span className={styles.badgeMuted}>can be improved</span>}
    </span>
  )
}
