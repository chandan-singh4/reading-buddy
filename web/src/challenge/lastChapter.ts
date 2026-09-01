/**
 * Which chapter the reader last had Veda ask about, per book.
 *
 * The examination used to open on whatever chapter the reader was standing in.
 * That is the right *first* answer and a wrong one every time after: a reader
 * who deliberately switched to chapter one, answered six questions, went back
 * to the book and returned was put back on chapter two. The app had thrown away
 * the only choice they had made on that screen.
 *
 * So the chapter they chose wins, and where they are reading is the fallback
 * for a book they have never been examined on.
 *
 * In `localStorage` rather than the database, for the same reasons the reading
 * settings are: it is a preference about a screen, it is needed on the first
 * render before any async read could finish, and losing it costs nothing.
 */

const KEY = 'reading-buddy:challenge-chapter'

type Book = Record<string, number>

function read(): Book {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    // Anything that is not an object of numbers is treated as absent rather
    // than repaired. A corrupt preference is not worth a migration.
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Book
  } catch {
    return {}
  }
}

/** The chapter this book was last examined on, or `undefined` for a new one. */
export function lastChapter(bookId: string): number | undefined {
  const value = read()[bookId]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export function rememberChapter(bookId: string, chapter: number): void {
  if (!Number.isFinite(chapter) || chapter <= 0) return
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...read(), [bookId]: chapter }))
  } catch {
    /* The choice simply won't outlive the visit. */
  }
}
