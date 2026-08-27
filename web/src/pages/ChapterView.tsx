import { useEffect, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'

import { modelLabel } from '../reader/tutor.ts'
import { repository } from '../storage/index.ts'
import type { BookId } from '../structure/index.ts'
import { backLabel, backTo } from '../summary/backTo.ts'
import { summaryData } from '../summary/dataSource.ts'
import { approve } from '../summary/engine.ts'
import { finishedChapters } from '../summary/queue.ts'
import { Flourish, Paper, Rail, RichText, type RailItem } from '../summary/Paper.tsx'
import styles from '../summary/summary.module.css'
import type { ChapterListEntry, ChapterSummary, SectionSummary } from '../summary/types.ts'

/**
 * One chapter, in two sections.
 *
 * 1. **The chapter, in plain words** — the Librarian's summary, with the tags
 *    it gave for the chapter underneath.
 * 2. **What we worked through** — the Scribe's summary of the reader's
 *    conversation with Veda about this chapter.
 * 3. **The parts of the chapter**, when the author named them — the same two
 *    things again, one set per titled section. A chapter of six named sections
 *    gets one recap that ties it together and six that go into detail. Books
 *    whose sections have no names show nothing here, which is most fiction.
 *
 * Read-only. Nothing here runs a model or edits what one wrote.
 */
export default function ChapterView() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId
  const [params, setParams] = useSearchParams()
  const location = useLocation()

  /*
   * The title is for the eyebrow only. Every query below goes through the
   * book's id: that is the key the summaries are actually stored under, and
   * looking one book up by two different keys is how a page ends up showing
   * another book's chapters.
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
  /* Whether the reader has read past this chapter, so asking for a summary of
     it is a fair thing to offer. Unread chapters are never offered: a recap of
     a chapter you have not reached is a spoiler. */
  const [finished, setFinished] = useState(false)
  const [asking, setAsking] = useState(false)

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
      .getChapterList(id)
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
    let cancelled = false
    void Promise.all([
      repository.listChapterIndexes(id),
      repository.getPosition(id),
    ]).then(([spine, position]) => {
      if (cancelled) return
      const done = finishedChapters(spine, position ?? undefined)
      setFinished(done.includes(Number(current)))
    })
    return () => {
      cancelled = true
    }
  }, [id, current])

  async function onAsk() {
    setAsking(true)
    try {
      await approve(id, Number(current))
      setOpen(await summaryData().getChapter(id, current))
    } catch {
      // Nothing was stored, so the page is unchanged and the button comes back.
    } finally {
      setAsking(false)
    }
  }

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
      .getChapter(id, current)
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
            <Byline model={open.recapModel} />
            <RichText text={open.recapText} className={styles.recap} />
            {open.tags.length > 0 && <Tags tags={open.tags} />}

            <div className={styles.secLabel}>What we worked through</div>
            {open.qaText ? (
              <>
                <Byline model={open.itemsModel} />
                <RichText text={open.qaText} className={styles.recap} />
              </>
            ) : (
              /* A chapter read without a single question is normal, not a gap. */
              <p className={styles.empty}>
                You have not asked Veda about this chapter yet. What you talk about will be
                summarised here.
              </p>
            )}

            {open.sections?.map((part) => <Part key={part.section} part={part} />)}
          </>
        ) : (
          /*
           * An empty page used to be a dead end: it said "not yet" and gave the
           * reader nothing to do about it. The button is the way out. It is the
           * same call the bell makes, so a chapter can be asked for from
           * wherever the reader happens to be standing.
           */
          <>
            {/*
             * Three different facts used to share one sentence, and the reader
             * could not tell them apart: a book with no chapters on this device
             * read exactly like a chapter they had not finished. The empty rail
             * was the only clue, and a clue is not an answer.
             */}
            <p className={styles.empty}>
              {chapters.length === 0
                ? 'This book has no chapters saved on this device, so there is nothing to summarise. Re-import it from Book details and it will appear here.'
                : finished
                  ? 'This chapter has no summary yet. Ask for one and Veda will read the whole chapter.'
                  : 'This chapter has no summary yet. It appears here once you have finished reading it.'}
            </p>
            {finished && (
              <button
                type="button"
                className={styles.ask}
                disabled={asking}
                onClick={() => void onAsk()}
              >
                {asking ? 'Reading the chapter…' : 'Summarise this chapter'}
              </button>
            )}
          </>
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

/**
 * One titled section of the chapter, under the chapter's own summary.
 *
 * Deliberately quieter than the chapter above it. The heading carries the
 * author's own name for the part, so the reader recognises it from the contents
 * page, and the two labels are the same two as above — the same job at a
 * smaller scale should not need a second vocabulary.
 */
function Part({ part }: { part: SectionSummary }) {
  return (
    <section className={styles.part}>
      <h2 className={styles.partTtl}>{part.title}</h2>
      <Byline model={part.recapModel} />
      <RichText text={part.recapText} className={styles.recap} />
      {part.tags.length > 0 && <Tags tags={part.tags} />}
      {/* No "nothing asked yet" line here. The chapter above already says it
          once, and saying it again under every section would bury the summaries
          in apologies for conversations that never happened. */}
      {part.qaText && (
        <>
          <div className={styles.secLabel}>What we worked through</div>
          <Byline model={part.itemsModel} />
          <RichText text={part.qaText} className={styles.recap} />
        </>
      )}
    </section>
  )
}

/**
 * Who wrote the paragraph below.
 *
 * The relay walks a fallback chain, so the model that answered is often not the
 * model that was asked for. A reader judging a summary should know whose words
 * they are judging — the reading lamp has said so above every one of Veda's
 * answers since v13, and a summary is no different.
 *
 * Nothing is drawn when the row recorded no model. Summaries written before
 * this was kept have none, and a caption naming today's model over yesterday's
 * words would be a plain lie.
 */
function Byline({ model }: { model?: string }) {
  if (!model) return null
  return <p className={styles.byline}>{modelLabel(model)}</p>
}
