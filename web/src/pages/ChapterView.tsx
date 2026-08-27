import { useEffect, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'

import { repository } from '../storage/repository.ts'
import type { BookId } from '../structure/index.ts'
import { backLabel, backTo } from '../summary/backTo.ts'
import { summaryData } from '../summary/dataSource.ts'
import { Flourish, Paper, Rail, RichText, type RailItem } from '../summary/Paper.tsx'
import styles from '../summary/summary.module.css'
import type { ChapterListEntry, ChapterSummary } from '../summary/types.ts'

/**
 * One chapter, in two sections.
 *
 * 1. **The chapter, in plain words** — the Librarian's summary, with the tags
 *    it gave for the chapter underneath.
 * 2. **What we worked through** — the Scribe's summary of the reader's
 *    conversation with Veda about this chapter.
 *
 * Read-only. Nothing here runs a model or edits what one wrote.
 */
export default function ChapterView() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId
  const [params, setParams] = useSearchParams()
  const location = useLocation()

  /*
   * The summary source is keyed by the book's *title*, not by its id — the
   * same book imported twice is one book to a reader. So the title is looked
   * up once, here, and every query below goes through it.
   */
  const [title, setTitle] = useState<string | undefined>()
  const [chapters, setChapters] = useState<ChapterListEntry[]>([])
  const [open, setOpen] = useState<ChapterSummary | undefined>()
  const [loading, setLoading] = useState(true)
  /*
   * Whether the chapter list has come back — which is not the same question as
   * whether it has anything in it. Without this, a book with nothing read at
   * all leaves `current` empty, the effect below has nothing to ask for, and
   * the page waits for a load that will never be started: a permanently blank
   * page rather than an honest "nothing here yet".
   */
  const [listed, setListed] = useState(false)

  useEffect(() => {
    let cancelled = false
    repository.getBook(id).then((book) => {
      if (!cancelled) setTitle(book?.title ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (title === undefined) return
    let cancelled = false
    summaryData()
      .getChapterList(title)
      .then((list) => {
        if (cancelled) return
        setChapters(list)
        setListed(true)
      })
    return () => {
      cancelled = true
    }
  }, [title])

  /*
   * The chapter asked for; failing that, the first one with something in it.
   *
   * Not simply the first chapter. A reader arrives from a button on their
   * book's details page, and most of a book is unread for most of its life —
   * opening on chapter 1 would show an empty page and read as a feature that
   * does not work.
   */
  const asked = params.get('chapter')
  const opening = chapters.find((entry) => entry.distilled) ?? chapters[0]
  const current = asked ?? (opening ? String(opening.chapter) : '')

  useEffect(() => {
    if (title === undefined || !listed) return
    if (current === '') {
      // The list came back empty: nothing to ask for, nothing to wait for.
      setOpen(undefined)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    summaryData()
      .getChapter(title, current)
      .then((summary) => {
        if (cancelled) return
        setOpen(summary)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [title, current, listed])

  const tabs: RailItem[] = chapters.map((entry) => ({
    key: String(entry.chapter),
    label: `${entry.chapter} · ${entry.chapterTitle}`,
  }))
  const exit = backTo(location.search)

  return (
    <Paper backTo={exit} backLabel={backLabel(exit)}>
      <Rail
        label="Chapters"
        note="A chapter in plain words, and what you asked about it."
        items={tabs}
        current={current}
        onPick={(chapter) => {
          /* `replace`, so flicking through chapters does not fill the back
             stack with pages the reader never meant to keep. */
          const next = new URLSearchParams(params)
          next.set('chapter', chapter)
          setParams(next, { replace: true })
        }}
      />

      <main className={styles.page}>
        <div className={styles.eyebrow}>{title || 'This book'}</div>
        <h1 className={styles.chapterNo}>Chapter {current || '—'}</h1>
        {open && <div className={styles.chapterTtl}>{open.chapterTitle}</div>}
        <Flourish wide />

        {loading ? null : open ? (
          <>
            <div className={styles.secLabel}>The chapter, in plain words</div>
            <RichText text={open.recapText} className={styles.recap} />
            {open.tags.length > 0 && <Tags tags={open.tags} />}

            <div className={styles.secLabel}>What we worked through</div>
            {open.qaText ? (
              <RichText text={open.qaText} className={styles.recap} />
            ) : (
              /* A chapter read without a single question is normal, not a gap. */
              <p className={styles.empty}>
                You have not asked Veda about this chapter yet. What you talk about will be
                summarised here.
              </p>
            )}
          </>
        ) : (
          <p className={styles.empty}>
            This chapter has not been summarised yet. It appears here once you have read it.
          </p>
        )}
      </main>
    </Paper>
  )
}

/**
 * The Librarian's tags for the chapter.
 *
 * Plain chips, and deliberately not links. A tag says what the chapter is
 * about; there is no page behind it to open, and making it tappable would
 * promise one. An earlier build had a concept index they led to — the reader
 * cut it, and the tags stayed.
 */
function Tags({ tags }: { tags: string[] }) {
  return (
    <ul className={styles.tags} aria-label="Tags for this chapter">
      {tags.map((tag) => (
        <li key={tag} className={styles.tag}>
          {tag}
        </li>
      ))}
    </ul>
  )
}
