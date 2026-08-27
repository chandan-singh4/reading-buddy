import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'

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
 */
export default function Commonplace() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [open, setOpen] = useState<Concept | undefined>()
  const [note, setNote] = useState<VedaNote | undefined>()

  const wanted = params.get('concept') ?? openingConcept

  useEffect(() => {
    let cancelled = false
    summaryData()
      .getConcepts()
      .then((all) => {
        if (!cancelled) setConcepts(all)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const data = summaryData()
    Promise.all([data.getConcept(wanted), data.getVedaNote(wanted)]).then(([found, vedaNote]) => {
      if (cancelled) return
      setOpen(found)
      /* Veda only speaks where there is a seam to point at. One passage under a
         heading is not a seam, so her note is held back until there are two. */
      setNote(found && found.items.length > 1 ? vedaNote : undefined)
    })
    return () => {
      cancelled = true
    }
  }, [wanted])

  const tabs: RailItem[] = concepts.map((concept) => ({ key: concept.name, label: concept.name }))
  const exit = backTo(location.search)

  return (
    <Paper backTo={exit} backLabel={backLabel(exit)}>
      <Rail
        label="Headings"
        note="Passages you kept, filed by idea — not by book."
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
        <div className={styles.eyebrow}>The Commonplace Book</div>
        <h1 className={styles.concept}>{wanted}</h1>
        <Flourish />
        <Gathered concept={open} />
        {open?.items.map((item) => (
          <Entry key={item.id} item={item} />
        ))}
        {note && <Marginal note={note} />}
      </main>
    </Paper>
  )
}

/** "2 passages · gathered from 2 books", or the honest blank page. */
function Gathered({ concept }: { concept: Concept | undefined }) {
  const items = concept?.items ?? []
  if (items.length === 0) {
    return (
      <>
        <p className={styles.count}>
          <b>No passages yet</b>
        </p>
        <p className={styles.empty}>
          This heading is on the list, but nothing has been filed under it. It will fill as you
          work through chapters that touch the idea.
        </p>
      </>
    )
  }

  const books = new Set(items.map((item) => item.book)).size
  return (
    <p className={styles.count}>
      <b>
        {items.length} {items.length === 1 ? 'passage' : 'passages'}
      </b>{' '}
      · gathered from {books} {books === 1 ? 'book' : 'books'}
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
