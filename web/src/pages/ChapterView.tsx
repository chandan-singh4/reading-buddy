import { useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'

import { repository } from '../storage/repository.ts'
import type { BookId } from '../structure/index.ts'
import { backLabel, backTo, fromParam } from '../summary/backTo.ts'
import { claimNodes } from '../summary/claimNodes.ts'
import { summaryData } from '../summary/dataSource.ts'
import { Claim, Flourish, Paper, Rail, type RailItem } from '../summary/Paper.tsx'
import styles from '../summary/summary.module.css'
import type { ChapterListEntry, ChapterSummary, DistilledItem } from '../summary/types.ts'

/**
 * The Chapter View — the same passages as the Commonplace Book, filed by where
 * the reader met them instead of by what they are about.
 *
 * A chapter's recap sits on top, in plain words, and the distilled items follow
 * it, each footnoted with the concept it links to. Tapping that concept crosses
 * to the other lens.
 *
 * Read-only. Nothing here approves a candidate or runs a pass.
 */
export default function ChapterView() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId
  const [params, setParams] = useSearchParams()
  const location = useLocation()

  /*
   * The summary source is keyed by the book's *title*, not by its id: a
   * commonplace book gathers across shelves, and the same book imported twice
   * is one book to a reader. So the title is looked up once, here, and every
   * query below goes through it.
   */
  const [title, setTitle] = useState<string | undefined>()
  const [chapters, setChapters] = useState<ChapterListEntry[]>([])
  const [open, setOpen] = useState<ChapterSummary | undefined>()
  const [loading, setLoading] = useState(true)
  /*
   * Whether the chapter list has come back — which is not the same question as
   * whether it has anything in it. Without this, a book with no distilled
   * chapters at all leaves `current` empty, the effect below has nothing to
   * ask for, and the page waits for a load that will never be started: a
   * permanently blank page rather than an honest "nothing here yet".
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
   * Not simply the first chapter. A reader arrives here from a button on their
   * book's details page, and most of a book is undistilled for most of its
   * life — opening on chapter 1 would show them an empty page and read as a
   * feature that does not work. Falls back to the first chapter of all only
   * when none has been distilled, which is the state the empty message is for.
   */
  const asked = params.get('chapter')
  const opening = chapters.find((entry) => entry.distilled) ?? chapters[0]
  const current = asked ?? (opening ? String(opening.chapter) : '')

  useEffect(() => {
    if (title === undefined || !listed) return
    if (current === '') {
      // The list came back empty: there is nothing to ask for, and nothing to
      // wait for either.
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
  const crossing = `${location.pathname}?chapter=${encodeURIComponent(current)}`

  return (
    <Paper backTo={exit} backLabel={backLabel(exit)}>
      <Rail
        label="Chapters"
        note="The same passages, filed by where you met them."
        items={tabs}
        current={current}
        onPick={(chapter) => {
          const next = new URLSearchParams(params)
          next.set('chapter', chapter)
          setParams(next, { replace: true })
        }}
      />

      <main className={styles.page}>
        <div className={styles.eyebrow}>{title || 'This book'}</div>
        <h1 className={styles.chapterNo}>Chapter {current || '—'}</h1>
        {open && <div className={styles.chapterTtl}>{open.recap.chapterTitle}</div>}
        <Flourish wide />

        {loading ? null : open ? (
          <>
            <div className={styles.secLabel}>In plain words</div>
            {/* The signature sits inside the quoted block, under the violet
                rule, rather than beside it — it is part of what she said. */}
            <p className={styles.recap}>
              {claimNodes(open.recap.recapText).map((node, index) =>
                node.kind === 'em' ? (
                  <em key={index}>{node.text}</em>
                ) : (
                  <span key={index}>{node.text}</span>
                ),
              )}
              <span className={styles.recapSig}>— Veda, in her own words</span>
            </p>

            <div className={styles.secLabel}>
              Kept from our conversation · {open.items.length}{' '}
              {open.items.length === 1 ? 'passage' : 'passages'}
            </div>
            {open.items.map((item) => (
              <Item key={item.id} item={item} crossing={crossing} bookId={id} />
            ))}
          </>
        ) : (
          <p className={styles.empty}>
            Nothing has been distilled from this chapter yet. A recap and the passages you kept
            appear here once you have worked through it.
          </p>
        )}
      </main>
    </Paper>
  )
}

/** One distilled item: the claim, its passage anchor, and its concept chip. */
function Item({
  item,
  crossing,
  bookId,
}: {
  item: DistilledItem
  crossing: string
  bookId: string
}) {
  const pending = item.concept.status === 'candidate'
  return (
    <div className={styles.item}>
      <Claim claim={item.claim} className={styles.itemClaim} />
      <div className={styles.foot}>
        <span className={styles.anchor}>{item.anchor}</span>
        {pending ? (
          <>
            {/*
             * Not a link, and that is the point. A candidate concept has no
             * heading in the Commonplace Book to lead to — the Q&A pass met a
             * name that is not on the running list and declined to invent a
             * node for it. Making it tappable would promise a page that does
             * not exist.
             */}
            <span className={`${styles.chip} ${styles.pending}`}>{item.concept.name}</span>
            <span className={styles.pendingHint}>awaiting Librarian</span>
          </>
        ) : (
          /* The crossing carries the book with it. A reader thinking about
             one book stays inside it; widening to the whole shelf on a tap
             would be a change of subject they did not ask for. */
          <Link
            className={styles.chip}
            to={`/commonplace?concept=${encodeURIComponent(item.concept.name)}&book=${bookId}&${fromParam(crossing)}`}
          >
            {item.concept.name}
          </Link>
        )}
      </div>
    </div>
  )
}
