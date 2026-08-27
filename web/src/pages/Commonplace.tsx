import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { repository } from '../storage/repository.ts'
import type { BookId } from '../structure/index.ts'
import { backLabel, backTo } from '../summary/backTo.ts'
import { summaryData } from '../summary/dataSource.ts'
import { openingConcept } from '../summary/fixture.ts'
import { Claim, Flourish, Paper, Rail, type RailItem } from '../summary/Paper.tsx'
import styles from '../summary/summary.module.css'
import type { Concept, DistilledItem, VedaNote } from '../summary/types.ts'

/**
 * The Commonplace Book — every kept passage, filed by idea rather than by book.
 *
 * A commonplace book is a real thing with a long history: a reader's own
 * notebook, ruled into headings, into which they copied whatever they wanted
 * to keep. Two passages three hundred pages and two authors apart end up on
 * the same page because they are about the same thing. That is the whole idea
 * here, and it is why the index is concepts and not books.
 *
 * Read-only. Nothing on this page approves, edits or generates anything.
 *
 * Which heading is open is held in the URL (`?concept=`), not in state alone,
 * so a chip tapped in the Chapter View can open a specific heading, and so the
 * page a reader is looking at is a page they can come back to.
 *
 * ## Two scopes, one page, decided by the door
 *
 * `?book=` scopes the page to one book. It is set by the link on that book's
 * details page, and carried through the crossing from the Chapter View — a
 * reader who is thinking about one book stays inside it.
 *
 * Without it the page is the whole shelf, and a heading can hold a memoir and
 * a neuroscience book side by side. That is the only thing this lens does that
 * the Chapter View cannot, so it is worth keeping a door to.
 */
export default function Commonplace() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [open, setOpen] = useState<Concept | undefined>()
  const [note, setNote] = useState<VedaNote | undefined>()

  /*
   * The scope arrives as a book *id* and the source is keyed by *title*, so it
   * is looked up here — the same crossing the Chapter View makes. `undefined`
   * means the whole shelf; the empty string means a book that no longer
   * exists, which must not silently widen into every book.
   */
  const scopeId = params.get('book')
  const [scope, setScope] = useState<string | undefined>()

  useEffect(() => {
    if (!scopeId) {
      setScope(undefined)
      return
    }
    let cancelled = false
    repository.getBook(scopeId as BookId).then((book) => {
      if (!cancelled) setScope(book?.title ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [scopeId])

  /* Nothing is asked for until the scope is known, or a scoped page would
     flash the whole shelf on its way to showing one book. */
  const settled = !scopeId || scope !== undefined

  /*
   * Which heading is open. Asked for in the URL, or else the first one there
   * is something under.
   *
   * Unscoped that is the reference design's own opening heading. Scoped it is
   * the first heading this book actually has — `openingConcept` is an idea
   * from Jung, and defaulting to it inside somebody else's book would open on
   * an empty page.
   */
  const wanted = params.get('concept') ?? (scopeId ? (concepts[0]?.name ?? '') : openingConcept)

  useEffect(() => {
    if (!settled) return
    let cancelled = false
    summaryData()
      .getConcepts(scope)
      .then((all) => {
        if (!cancelled) setConcepts(all)
      })
    return () => {
      cancelled = true
    }
  }, [settled, scope])

  useEffect(() => {
    if (!settled) return
    let cancelled = false
    const data = summaryData()
    Promise.all([data.getConcept(wanted, scope), data.getVedaNote(wanted)]).then(
      ([found, vedaNote]) => {
        if (cancelled) return
        setOpen(found)
        /* Veda only speaks where there is a seam to point at. One passage under
           a heading is not a seam — and inside one book there is rarely one to
           find — so her note is held back until there are two. */
        setNote(found && found.items.length > 1 ? vedaNote : undefined)
      },
    )
    return () => {
      cancelled = true
    }
  }, [wanted, settled, scope])

  const tabs: RailItem[] = concepts.map((concept) => ({ key: concept.name, label: concept.name }))
  const exit = backTo(location.search)

  return (
    <Paper backTo={exit} backLabel={backLabel(exit)}>
      <Rail
        label="Headings"
        /* The one line that tells a reader which of the two scopes they are
           in. Without it the same page means two different things and looks
           identical in both. */
        note={
          scopeId
            ? 'This book’s passages, filed by idea — not by chapter.'
            : 'Passages you kept, filed by idea — not by book.'
        }
        items={tabs}
        current={wanted}
        onPick={(name) => {
          /* `replace`, so flicking through headings does not fill the back
             stack with pages the reader never meant to keep. */
          const next = new URLSearchParams(params)
          next.set('concept', name)
          setParams(next, { replace: true })
        }}
      />

      <main className={styles.page}>
        {/* Scoped, the eyebrow names the book — it is the only place on the
            page that says which book's ideas these are. */}
        <div className={styles.eyebrow}>
          {scopeId && scope ? `The Commonplace Book · ${scope}` : 'The Commonplace Book'}
        </div>
        <h1 className={styles.concept}>{wanted}</h1>
        <Flourish />
        <Gathered concept={open} scoped={Boolean(scopeId)} />
        {open?.items.map((item) => (
          <Entry key={item.id} item={item} />
        ))}
        {note && <Marginal note={note} />}
      </main>
    </Paper>
  )
}

/** "2 passages · gathered from 2 books", or the honest blank page. */
function Gathered({ concept, scoped }: { concept: Concept | undefined; scoped: boolean }) {
  const items = concept?.items ?? []
  if (items.length === 0) {
    return (
      <>
        <p className={styles.count}>
          <b>No passages yet</b>
        </p>
        <p className={styles.empty}>
          {scoped
            ? 'Nothing from this book has been filed under this idea yet. It will fill as you work through the chapters that touch it.'
            : 'This heading is on the list, but nothing has been filed under it. It will fill as you work through chapters that touch the idea.'}
        </p>
      </>
    )
  }

  const count = (
    <b>
      {items.length} {items.length === 1 ? 'passage' : 'passages'}
    </b>
  )

  /*
   * The count of *books* is the library-wide lens making its case: two authors
   * under one heading is the thing worth seeing. Inside one book it would
   * always read "from 1 book", which says nothing, so the scoped page says
   * where they came from instead.
   */
  if (scoped) {
    return <p className={styles.count}>{count} · from this book</p>
  }

  const books = new Set(items.map((item) => item.book)).size
  return (
    <p className={styles.count}>
      {count} · gathered from {books} {books === 1 ? 'book' : 'books'}
    </p>
  )
}

/** One kept passage, with the manicule beside it and its book underneath. */
function Entry({ item }: { item: DistilledItem }) {
  const domain = item.subjectTags[0]
  return (
    <div className={styles.entry}>
      <span className={styles.manicule} aria-hidden="true">
        ☞
      </span>
      <Claim claim={item.claim} className={styles.claim} />
      <div className={styles.prov}>
        <span aria-hidden="true">—</span>
        <span className={styles.provTitle}>{item.book}</span>
        <span className={styles.provDot} aria-hidden="true">
          ·
        </span>
        <span>ch. {item.chapter}</span>
        {domain && <span className={styles.provDomain}>{domain}</span>}
      </div>
    </div>
  )
}

/** Veda's marginal note, in her own hand. */
function Marginal({ note }: { note: VedaNote }) {
  return (
    <div className={styles.veda}>
      <div className={styles.vedaRule} aria-hidden="true" />
      <div>
        <p className={styles.vedaNote}>{note.text}</p>
        <span className={styles.vedaWho}>— Veda</span>
      </div>
    </div>
  )
}
