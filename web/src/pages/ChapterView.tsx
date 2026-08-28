import { useEffect, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'

import {
  arrange,
  arrangementOf,
  lastRoster,
  rememberArrangement,
  rememberSummaryPick,
  storedArrangement,
  storedPick,
  storedSummaryPick,
  type Column,
} from '../reader/models.ts'
import { ModelSheet } from '../reader/ModelSheet.tsx'
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
   * Which of the two models is running, when one is.
   *
   * The reader asked for the recap and the conversation summary to be two
   * things they can rewrite on their own. So the page has to know which of them
   * is being written, or a redo of one would blank the other.
   */
  const [askingOnly, setAskingOnly] = useState<'recap' | 'items'>('recap')
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
  /**
   * What the reader has asked for but not yet chosen a model for.
   *
   * A summary is a paid call, and the reader asked to say who writes it at the
   * moment they spend it rather than in a screen two taps away. So the button
   * opens the picker and the picker starts the work. `'chapter'` for the whole
   * chapter, the part itself for a part.
   */
  const [choosing, setChoosing] = useState<
    {
      part?: { section: number; title: string }
      force: boolean
      only?: 'recap' | 'items'
    } | undefined
  >()
  /**
   * The recap as the model writes it, or an empty string before its first word.
   *
   * Undefined means nothing is being written. The distinction matters: an empty
   * string is a model that has taken the job and not spoken yet, which is what
   * the three dots are for.
   */
  const [live, setLive] = useState<string | undefined>()
  /**
   * Set when a run ended with nothing. Cleared when another starts, and when
   * the reader moves.
   *
   * Moving matters as much as running. The line says the model did not answer
   * about *this* summary, so carrying it to the next chapter accuses a model
   * that was never asked. See the effect below.
   */
  const [failed, setFailed] = useState<string | undefined>()
  /*
   * The picker's own columns, held here so a drag inside the sheet survives
   * until it is saved. The roster is the one the app last saw: this page must
   * not open a network call to draw a menu.
   */
  const [columns, setColumns] = useState<readonly Column[]>(() =>
    arrange(lastRoster(), storedArrangement()),
  )

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

  /**
   * The reader pressed a Summarise button.
   *
   * The picker comes first, unless there is nothing to pick from — a reader who
   * has never opened the lamp has no roster, and an empty sheet would be a
   * button that appears to do nothing. Then the relay picks, as it always did.
   */
  function onWant(
    part?: { section: number; title: string },
    force = false,
    only?: 'recap' | 'items',
  ) {
    if (columns.length === 0) {
      void onAsk(part, force, only)
      return
    }
    setChoosing({ ...(part ? { part } : {}), force, ...(only ? { only } : {}) })
  }

  /**
   * Ask for one thing — the whole chapter, or one named part of it.
   *
   * The words are watched on their way in, so the reader sees the paragraph
   * being written rather than a button that goes quiet for half a minute.
   *
   * Nothing is written to the store until the whole answer is in, so a run that
   * fails leaves the summary that was already there. That is what makes Redo
   * safe to press: the worst case is a wasted call, never a lost summary.
   */
  async function onAsk(
    part?: { section: number; title: string },
    force = false,
    only?: 'recap' | 'items',
  ) {
    setAsking(part ? part.section : 'chapter')
    setAskingOnly(only ?? 'recap')
    setFailed(undefined)
    setLive('')
    try {
      await approve(id, Number(current), part, {
        force,
        onWriting: setLive,
        ...(only ? { only } : {}),
      })
      setOpen(await summaryData().getChapter(id, current))
    } catch (error) {
      /* The model did not answer. The page still holds what it held before.
         The reason is shown as it came: "the free model is busy" says what to
         do next, and so does "the model did not send readable JSON". A blank
         "did not answer" for both told the reader nothing. */
      setFailed(error instanceof Error ? error.message : '')
    } finally {
      setAsking(undefined)
      setLive(undefined)
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
  /*
   * Whether the thing on screen is the thing being written.
   *
   * Asked once, because three different branches need the same answer: a part
   * open in the rail, a chapter recap, and a page with nothing on it yet. A
   * reader who starts a part and flicks to another must not see that part's
   * words appearing under this part's heading.
   */
  const writingHere =
    asking !== undefined && (partOnScreen ? asking === partOnScreen.section : asking === 'chapter')
  /*
   * Each half is written in its own place. The recap area shows the dots while
   * the recap is written; the conversation summary below it stays where it is,
   * because a redo of one half does not touch the other half.
   */
  const writingRecap = writingHere && askingOnly === 'recap'
  const writingItems = writingHere && askingOnly === 'items'
  /*
   * The one time writing does take the page: the very first summary. There is
   * no heading to write under yet, so there is nothing for the dots to sit in.
   */
  const firstEver = writingRecap && !(partOnScreen ? openPart?.recapText : open?.recapText)

  /*
   * A failure belongs to the summary it happened to, so it is dropped the
   * moment the reader looks at another one. The reader saw "The model did not
   * answer" follow them from chapter to chapter, accusing models that had
   * never been asked anything.
   */
  useEffect(() => {
    setFailed(undefined)
  }, [current, currentPart])

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

        {loading || !checked ? null : firstEver ? (
          /* The first summary of all: no page yet, so the writing is the page. */
          <>
            <div className={styles.secLabel}>
              {partOnScreen ? 'This part, in plain words' : 'The chapter, in plain words'}
            </div>
            <Writing text={live ?? ''} />
          </>
        ) : partOnScreen && !openPart ? (
          /*
           * A part with no summary yet. It still has a tab, so it still needs a
           * page: one that says which of the two reasons it is empty for, and
           * offers the call when the reader has earned it.
           */
          <>
            {failed !== undefined && <Failure said={failed} />}
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
                onClick={() => onWant(partOnScreen)}
              >
                Summarise this part
              </button>
            )}
          </>
        ) : openPart ? (
          /* One part, alone. The same two labels as the chapter, because it is
             the same job one level down. */
          <>
            <SectionHead
              label="This part, in plain words"
              of="this part's summary"
              text={openPart.recapText}
              busy={asking !== undefined}
              onRedo={() => onWant(partOnScreen, true, 'recap')}
            />
            {failed !== undefined && <Failure said={failed} />}
            {writingRecap ? (
              <Writing text={live ?? ''} />
            ) : (
              <>
                <Byline model={openPart.recapModel} />
                <RichText text={openPart.recapText} className={styles.recap} />
                {openPart.tags.length > 0 && <Tags tags={openPart.tags} />}
              </>
            )}

            <SectionHead
              label="What we worked through"
              of="the conversation summary"
              text={openPart.qaText}
              busy={asking !== undefined}
              onRedo={openPart.qaText ? () => onWant(partOnScreen, true, 'items') : undefined}
            />
            {writingItems ? (
              <Writing text="" />
            ) : openPart.qaText ? (
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
            {open.recapText ? (
              <>
                <SectionHead
                  label="The chapter, in plain words"
                  of="the chapter summary"
                  text={open.recapText}
                  busy={asking !== undefined}
                  onRedo={() => onWant(undefined, true, 'recap')}
                />
                {failed !== undefined && <Failure said={failed} />}
                {writingRecap ? (
                  <Writing text={live ?? ''} />
                ) : (
                  <>
                    <Byline model={open.recapModel} />
                    <RichText text={open.recapText} className={styles.recap} />
                    {open.tags.length > 0 && <Tags tags={open.tags} />}
                  </>
                )}

                <SectionHead
                  label="What we worked through"
                  of="the conversation summary"
                  text={open.qaText}
                  busy={asking !== undefined}
                  onRedo={open.qaText ? () => onWant(undefined, true, 'items') : undefined}
                />
                {writingItems ? (
                  <Writing text="" />
                ) : open.qaText ? (
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
        ) : writingHere ? (
          <>
            <div className={styles.secLabel}>The chapter, in plain words</div>
            <Writing text={live ?? ''} />
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
            {failed !== undefined && <Failure said={failed} />}
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
                onClick={() => onWant()}
              >
                Summarise this chapter
              </button>
            )}
          </>
        )}
      </main>

      {choosing !== undefined && (
        /*
         * The same picker the lamp uses, doing the same job. A reader who has
         * learnt the three columns under Veda has already learnt this one, and
         * a second picker of our own would be a second thing to learn and a
         * second place for the fallback chain to disagree with itself.
         */
        <ModelSheet
          columns={columns}
          pick={storedSummaryPick() ?? storedPick() ?? undefined}
          onPick={(model) => {
            /* Saved, not held for this one call. The reader asked for the pick
               to stick, so Settings and this sheet always say the same thing —
               and `summaryChain` reads it back on the way to the relay. */
            rememberSummaryPick(model)
            const want = choosing
            setChoosing(undefined)
            void onAsk(want?.part, want?.force === true, want?.only)
          }}
          onArrange={(next) => {
            // Saved as it is dragged. The sheet can be dismissed three ways,
            // and an arrangement lost to one would look like the drag failed.
            setColumns(next)
            rememberArrangement(arrangementOf(next))
          }}
          onClose={() => setChoosing(undefined)}
        />
      )}
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

/**
 * The summary as it is being written.
 *
 * Three dots until the first word, then the words themselves. The dots are not
 * decoration: a model may think for ten seconds before it says anything, and
 * being shown that it has started is the difference between a slow answer and
 * an app that looks broken. The reading lamp has worked this way since v13 and
 * this is the same furniture, so a reader has nothing new to learn.
 *
 * The caret is what makes it read as *being written* rather than as a summary
 * that stopped short. It goes when the words do.
 */
function Writing({ text }: { text: string }) {
  if (text.trim().length === 0) {
    return (
      <div className={styles.recap} aria-label="Veda is reading the chapter">
        <span className={styles.thinking} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    )
  }
  return (
    <div aria-live="polite">
      <RichText text={text} className={styles.recap} />
      <span className={styles.caret} aria-hidden="true" />
    </div>
  )
}

/**
 * The heading of a summary, with what you can do to it on the right.
 *
 * The two controls sit level with the label — at the top of the summary, where
 * the reader's eye already is when they decide the words are worth keeping or
 * worth having again. Underneath, they were furniture the reader had to scroll
 * past three paragraphs to find.
 *
 * Icons, not words. At this size a label reading "Redo the summary" is wider
 * than the heading it sits beside and shouts louder than the summary. The
 * meaning is carried by `aria-label` and `title`, so a screen reader and a
 * hovering cursor both get the full sentence.
 *
 * **Copy**, because a summary is the one thing here worth taking elsewhere.
 * The text is selectable too; the icon is for a thumb, which is bad at
 * selecting three paragraphs.
 *
 * **Redo**, because a summary is one model's reading of a chapter and the
 * reader may want another's. It opens the picker first, so choosing a
 * different model *is* the redo.
 */
function SectionHead({
  label,
  of,
  text,
  busy,
  onRedo,
}: {
  label: string
  /**
   * What these two controls act on, said as a noun phrase.
   *
   * There are two of each on a page now, so "Copy" alone names neither. A
   * screen reader reads "Copy the conversation summary" and knows which of the
   * two headings it has landed on.
   */
  of: string
  /** The words under this heading. No words, no Copy: there is nothing to take. */
  text?: string
  busy: boolean
  /** Absent where a rewrite makes no sense — nothing has been written yet. */
  onRedo?: () => void
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className={styles.secHead}>
      <div className={styles.secLabel}>{label}</div>
      <div className={styles.secTools}>
        {text ? (
          <button
            type="button"
            className={styles.tool}
            aria-label={copied ? 'Copied' : `Copy ${of}`}
            title={copied ? 'Copied' : `Copy ${of}`}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(text)
                .then(() => {
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1600)
                })
                .catch(() => {
                  /* No clipboard permission. The text is still selectable. */
                })
            }}
          >
            {copied ? <TickIcon /> : <CopyIcon />}
          </button>
        ) : null}
        {onRedo ? (
          <button
            type="button"
            className={styles.tool}
            disabled={busy}
            aria-label={`Redo ${of}`}
            title={`Redo ${of}`}
            onClick={onRedo}
          >
            <RedoIcon />
          </button>
        ) : null}
      </div>
    </div>
  )
}

/* Drawn at 16px in a 20px box, to sit on the heading's own line without
   growing it. `currentColor` so they inherit the button's ink and its hover. */
function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M13 5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TickIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
      <path
        d="M4.5 10.5l3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
      <path
        d="M15.5 6.5A6.5 6.5 0 1 0 16.4 12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M15.8 3.2v3.6h-3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The model did not answer.
 *
 * Said plainly, and said next to the summary that is still there, because the
 * reader has just watched a Redo produce nothing and needs to know that what
 * they are looking at is their old summary rather than a bad new one. Nothing
 * was written and nothing was lost — only a call was spent.
 */
function Failure({ said }: { said: string }) {
  return (
    <p className={styles.failure} role="status">
      {sentence(said) || 'The model did not answer.'} Nothing was changed — what you had is
      still here.
    </p>
  )
}

/* A reason written to sit inside another sentence, made to stand as its own. */
function sentence(said: string): string {
  const text = said.trim()
  if (text === '') return ''
  const stopped = /[.!?]$/.test(text) ? text : `${text}.`
  return stopped[0].toUpperCase() + stopped.slice(1)
}
