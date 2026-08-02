import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'

import {
  Block,
  chapterTitle,
  firstSection,
  nextSection,
  pathOf,
  previousSection,
  type SectionRef,
} from '../reader/index.ts'
import { repository } from '../storage/index.ts'
import type { BookId, BookMeta, Manifest, Section } from '../structure/index.ts'
import styles from './Reader.module.css'

/** The book and its manifest — loaded once, then never again while reading. */
type FrameState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; book: BookMeta; manifest: Manifest }

/** One section — reloaded on every move, and the only thing that is. */
type PageState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; section: Section }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The reading page: one section on screen, with Previous and Next.
 *
 * Deliberately bare. Focus Mode is a toggle that hides chrome without removing
 * it (see `backlog.md`), so the baseline is built as the quiet version and
 * WP-13's overlay arrives as a layer on top — rather than the reverse, which
 * would mean retrofitting a way back to every control once hidden.
 *
 * Never loads a book. It loads a manifest (one line per chapter), one chapter
 * index, and one section, which is the entire retrieval path the storage layer
 * was shaped around.
 */
export default function Reader() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId | undefined

  const [frame, setFrame] = useState<FrameState>({ status: 'loading' })
  const [here, setHere] = useState<SectionRef>(firstSection())
  const [page, setPage] = useState<PageState>({ status: 'loading' })
  const [neighbours, setNeighbours] = useState<{
    previous?: SectionRef
    next?: SectionRef
  }>({})

  /**
   * How many sections each chapter has, remembered as we go. Navigation asks
   * this on every move, and re-reading the same chapter index to answer "am I
   * at the end of this chapter?" would be a database round trip per tap.
   */
  const sectionCounts = useRef(new Map<number, number>())

  const sectionsIn = useCallback(
    async (chapter: number): Promise<number | undefined> => {
      if (!id) return undefined

      const known = sectionCounts.current.get(chapter)
      if (known !== undefined) return known

      const index = await repository.getChapterIndex(id, chapter)
      if (!index) return undefined

      sectionCounts.current.set(chapter, index.sections.length)
      return index.sections.length
    },
    [id],
  )

  // The frame: book + manifest, once per book.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    void (async () => {
      try {
        const [book, manifest] = await Promise.all([
          repository.getBook(id),
          repository.getManifest(id),
        ])
        if (cancelled) return

        if (!book || !manifest) {
          setFrame({ status: 'missing' })
          return
        }
        setFrame({ status: 'ready', book, manifest })
      } catch (error: unknown) {
        if (!cancelled) setFrame({ status: 'failed', message: messageOf(error) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  // The page: one section, plus what sits either side of it.
  useEffect(() => {
    if (!id || frame.status !== 'ready') return
    let cancelled = false

    setPage({ status: 'loading' })

    void (async () => {
      try {
        const section = await repository.getSection(id, pathOf(here))
        if (cancelled) return

        if (!section) {
          setPage({
            status: 'failed',
            message: 'That part of the book is missing. Try importing it again.',
          })
          return
        }

        setPage({ status: 'ready', section })

        const [previous, next] = await Promise.all([
          previousSection(here, sectionsIn),
          nextSection(frame.manifest, here, sectionsIn),
        ])
        if (!cancelled) setNeighbours({ previous, next })
      } catch (error: unknown) {
        if (!cancelled) setPage({ status: 'failed', message: messageOf(error) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, frame, here, sectionsIn])

  // A new section starts at its beginning. Without this, moving on from
  // halfway down a long section drops you halfway down the next one.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [here])

  const title =
    frame.status === 'ready' ? chapterTitle(frame.manifest, here.chapter) : undefined

  return (
    <div className={styles.reader}>
      <Link to="/" className={styles.back}>
        ← Library
      </Link>

      {frame.status === 'loading' && <p className={styles.note}>Opening…</p>}

      {frame.status === 'missing' && (
        <p className={styles.note} role="alert">
          That book isn’t in your library.
        </p>
      )}

      {frame.status === 'failed' && (
        <p className={styles.note} role="alert">
          Couldn’t open that book. {frame.message}
        </p>
      )}

      {frame.status === 'ready' && (
        <>
          <article className={styles.page}>
            <header className={styles.header}>
              <p className={styles.context}>
                {frame.book.title}
                {title ? ` · ${title}` : ''}
              </p>
              {page.status === 'ready' && page.section.title && (
                <h2 className={styles.sectionTitle}>{page.section.title}</h2>
              )}
            </header>

            {page.status === 'loading' && <p className={styles.note}>Loading…</p>}

            {page.status === 'failed' && (
              <p className={styles.note} role="alert">
                {page.message}
              </p>
            )}

            {page.status === 'ready' &&
              page.section.paragraphs.map((block) => (
                <Block key={block.anchor} block={block} />
              ))}
          </article>

          <nav className={styles.pager} aria-label="Move through the book">
            <button
              type="button"
              className={styles.pagerButton}
              disabled={!neighbours.previous}
              onClick={() => {
                if (neighbours.previous) setHere(neighbours.previous)
              }}
            >
              Previous
            </button>

            <button
              type="button"
              className={styles.pagerButton}
              disabled={!neighbours.next}
              onClick={() => {
                if (neighbours.next) setHere(neighbours.next)
              }}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  )
}
