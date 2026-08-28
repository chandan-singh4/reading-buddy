import { useEffect, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'

import { modelLabel } from '../reader/tutor.ts'
import { repository } from '../storage/index.ts'
import type { BookId } from '../structure/index.ts'
import { backLabel, backTo } from '../summary/backTo.ts'
import { summaryData } from '../summary/dataSource.ts'
import { approve } from '../summary/engine.ts'
import { finishedChapters, readSections, titledSections } from '../summary/queue.ts'
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
  /*
   * Whether the two questions the empty state depends on have been answered.
   *
   * Without it the page paints "you have finished this, ask for a summary"
   * before the check that decides it has come back, and the button appears for
   * an instant and vanishes. The reader saw exactly that flicker moving from
   * chapter 5 to 6.
   */
  const [checked, setChecked] = useState(false)
  /*
   * Which one thing is running, not whether anything is.
   *
   * A single boolean disabled every button on the page at once, so pressing one
   * part made all three read as busy. `'chapter'` for the whole chapter, the
   * section number for a part.
   */
  const [asking, setAsking] = useState<'chapter' | number | undefined>()
  /**
   * The named parts of this chapter the reader has finished and not summarised.
   *
   * The bell offers these too, but the bell is not where a reader is standing
   * when they wonder where the summaries are. This one chapter's parts belong
   * on this one chapter's page.
   */
  const [waiting, setWaiting] = useState<{ section: number; title: string }[]>([])
  /**
   * Every named part of this chapter, read or not.
   *
   * The rail is built from this and not from the summaries. A rail that only
   * listed parts already summarised was empty exactly when the reader most
   * wanted it — on a chapter they are still working through — and pushed the
   * parts back into a list below the text, which is the one shape the reader
   * has now rejected five times. A part with nothing behind it yet still gets
   * a tab; the tab says why.
   */
  const [allParts, setAllParts] = useState<{ section: number; title: string }[]>([])
  /** The parts the reader has read far enough to summarise, by section number. */
  const [eligible, setEligible] = useState<number[]>([])

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
      const here = Number(current)
      const done = finishedChapters(spine, position ?? undefined)
      const whole = done.includes(here)
      setFinished(whole)

      /*
       * A finished chapter offers all of its named parts. The chapter still in
       * hand offers the parts already read — the same rule `plan` follows, so
       * the page and the bell can never disagree about what is on offer.
       */
      const entry = spine.find((row) => row.chapter === here)
      const named = titledSections(entry)
      setAllParts(named)

      const offered = whole
        ? named
        : readSections(spine, position ?? undefined).filter((row) => row.chapter === here)
      setEligible(offered.map((row) => row.section))
      /* Only the parts with nothing behind them yet. A part that already has a
         summary is one tap away in the rail, and offering it a second time in a
         list below the text is the duplicate the reader keeps seeing. */
      const haveSummary = new Set((open?.sections ?? []).map((part) => part.section))
      setWaiting(
        offered
          .filter((row) => !haveSummary.has(row.section))
          .map((row) => ({ section: row.section, title: row.title })),
      )
      setChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [id, current, open])

  /** Ask for one thing — the whole chapter, or one named part of it. */
  async function onAsk(part?: { section: number; title: string }) {
    setAsking(part ? part.section : 'chapter')
    try {
      await approve(id, Number(current), part)
      setOpen(await summaryData().getChapter(id, current))
    } catch {
      // Nothing was stored, so the page is unchanged and the button comes back.
    } finally {
      setAsking(undefined)
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

  /*
   * The second strip: the whole chapter, then each named part of it.
   *
   * "The whole chapter" is a row rather than an unmarked default, because the
   * reader has to be able to get back to the chapter recap after opening a
   * part, and a rail with no way back to where it started is a trap.
   *
   * Built from the spine, not from the summaries. Every part the author named
   * gets a tab from the first moment the chapter is opened, whether it has a
   * summary, is waiting for one, or is still unread. The tab's own page says
   * which of the three it is.
   */
  const named = [...allParts]
  /* A part that has a summary but is not in the spine still belongs in the row.
     The spine is re-read on import and a summary outlives it, so the two can
     disagree; the reader must not lose a part they have already paid for. */
  for (const part of open?.sections ?? []) {
    if (!named.some((row) => row.section === part.section)) {
      named.push({ section: part.section, title: part.title })
    }
  }
  named.sort((a, b) => a.section - b.section)

  const parts: RailItem[] =
    named.length > 0
      ? [
          { key: 'all', label: 'The whole chapter' },
          ...named.map((part) => ({
            key: String(part.section),
            label: part.title,
          })),
        ]
      : []

  const askedPart = params.get('part') ?? 'all'
  /* A part named in the URL that this chapter does not have — a stale link, or
     a chapter switched underneath the parameter. Fall back to the chapter. */
  const currentPart = parts.some((part) => part.key === askedPart) ? askedPart : 'all'
  /* The part the rail is standing on, from the spine. It exists even when no
     model has written a word about it — that is the whole point of the rail. */
  const partOnScreen =
    currentPart === 'all'
      ? undefined
      : named.find((part) => String(part.section) === currentPart)
  /* Its summary, when there is one. */
  const openPart =
    partOnScreen && open?.sections?.find((part) => part.section === partOnScreen.section)
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
          // A part number means nothing in the next chapter. Dropped, so the
          // reader lands on that chapter whole rather than on its third part.
          next.delete('part')
          setParams(next, { replace: true })
        }}
        parts={parts}
        currentPart={currentPart}
        onPickPart={(part) => {
          const next = new URLSearchParams(params)
          if (part === 'all') next.delete('part')
          else next.set('part', part)
          setParams(next, { replace: true })
        }}
      />

      <main className={styles.page}>
        <div className={styles.eyebrow}>{title || 'This book'}</div>
        <h1 className={styles.chapterNo}>Chapter {current || '—'}</h1>
        {/* The part's own name takes the subtitle when a part is open, so the
            reader can see at a glance which of the two they are reading. */}
        {partOnScreen ? (
          <div className={styles.chapterTtl}>{partOnScreen.title}</div>
        ) : (
          open && <div className={styles.chapterTtl}>{open.chapterTitle}</div>
        )}
        <Flourish wide />

        {loading || !checked ? null : partOnScreen && !openPart ? (
          /*
           * A part with no summary yet. It still has a tab, so it still needs a
           * page: one that says which of the two reasons it is empty for, and
           * offers the call when the reader has earned it.
           */
          <>
            <p className={styles.empty}>
              {eligible.includes(partOnScreen.section)
                ? 'You have finished this part. Ask for a summary and Veda will read it.'
                : 'The summary of this part comes when you finish reading it.'}
            </p>
            {eligible.includes(partOnScreen.section) && (
              <button
                type="button"
                className={styles.ask}
                disabled={asking !== undefined}
                onClick={() => void onAsk(partOnScreen)}
              >
                {asking === partOnScreen.section ? 'Summarising…' : 'Summarise this part'}
              </button>
            )}
          </>
        ) : openPart ? (
          /* One part, alone. The same two labels as the chapter, because it is
             the same job one level down. */
          <>
            <div className={styles.secLabel}>This part, in plain words</div>
            <Byline model={openPart.recapModel} />
            <RichText text={openPart.recapText} className={styles.recap} />
            {openPart.tags.length > 0 && <Tags tags={openPart.tags} />}

            <div className={styles.secLabel}>What we worked through</div>
            {openPart.qaText ? (
              <>
                <Byline model={openPart.itemsModel} />
                <RichText text={openPart.qaText} className={styles.recap} />
              </>
            ) : (
              <p className={styles.empty}>
                You have not asked Veda about this part yet. What you talk about will be
                summarised here.
              </p>
            )}
          </>
        ) : open ? (
          <>
            {/*
             * The chapter recap waits for the whole chapter, so the ordinary
             * state of the chapter in hand is parts but no recap yet. Saying
             * that plainly is better than an empty heading over nothing.
             */}
            <div className={styles.secLabel}>The chapter, in plain words</div>
            {open.recapText ? (
              <>
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
                  /* A chapter read without a question is normal, not a gap. */
                  <p className={styles.empty}>
                    You have not asked Veda about this chapter yet. What you talk about will be
                    summarised here.
                  </p>
                )}
              </>
            ) : (
              <p className={styles.empty}>
                The recap of the whole chapter comes when you finish it. Open a part in the
                strip above to read that part on its own.
              </p>
            )}
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
                  : waiting.length > 0
                  ? 'The recap of the whole chapter comes when you finish it. Open a part in the strip above to read that part on its own.'
                  : 'This chapter has no summary yet. It appears here once you have finished reading it.'}
            </p>
            {finished && (
              <button
                type="button"
                className={styles.ask}
                disabled={asking !== undefined}
                onClick={() => void onAsk()}
              >
                {asking === 'chapter' ? 'Reading the chapter…' : 'Summarise this chapter'}
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
