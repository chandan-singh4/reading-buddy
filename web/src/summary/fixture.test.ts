import { describe, expect, it } from 'vitest'

import { backLabel, backTo } from './backTo.ts'
import { fixtureBook, fixtureDataSource } from './fixture.ts'

/*
 * The fixture is sample data, but two of the rules it enforces are real rules
 * that any future source must also keep. Those are what is tested here — not
 * the sample words themselves, which will be deleted when the engine lands.
 */

describe('the fixture data source', () => {
  it('keeps a candidate concept out of the Commonplace Book', async () => {
    // The load-bearing rule. A candidate has no confirmed heading to live
    // under, so it must appear under no heading at all.
    const concepts = await fixtureDataSource.getConcepts()
    const everyItem = concepts.flatMap((concept) => concept.items)
    expect(everyItem.every((item) => item.concept.status === 'linked')).toBe(true)
    expect(everyItem.some((item) => item.id === 'jung-survivorship')).toBe(false)
  })

  it('still shows the candidate in its chapter', async () => {
    // The other half of the same rule: held out of one lens, present in the
    // other. A reader must be able to see that the question was kept.
    const chapter = await fixtureDataSource.getChapter(fixtureBook, 4)
    const pending = chapter?.items.filter((item) => item.concept.status === 'candidate')
    expect(pending).toHaveLength(1)
    expect(pending?.[0].concept.name).toBe('survivorship in dream interpretation')
  })

  it('gathers one heading from more than one book', async () => {
    // The reason the Commonplace Book exists at all.
    const concept = await fixtureDataSource.getConcept('prospective function of dreams')
    const books = new Set(concept?.items.map((item) => item.book))
    expect(books.size).toBeGreaterThan(1)
  })

  it('lists headings that hold nothing yet', async () => {
    // A concept enters the vocabulary when a chapter pass extracts it, which
    // is earlier than the first passage filed under it. An empty heading is
    // correct, not a gap.
    const concepts = await fixtureDataSource.getConcepts()
    expect(concepts.some((concept) => concept.items.length === 0)).toBe(true)
  })

  it('offers its sample chapters for whatever book it is asked about', async () => {
    // Deliberate, and temporary — see the note on `sampleChapters`. The view
    // is reached from a book's own details page, so sample content keyed
    // strictly by title would be invisible to anyone who does not own that
    // exact book.
    const list = await fixtureDataSource.getChapterList('A Book Nobody Imported')
    expect(list).toHaveLength(6)
  })

  it('prints the reader’s own book above the sample chapter', async () => {
    const summary = await fixtureDataSource.getChapter('A Book Nobody Imported', 4)
    expect(summary?.recap.book).toBe('A Book Nobody Imported')
  })

  it('has nothing for a chapter that was never distilled', async () => {
    expect(await fixtureDataSource.getChapter(fixtureBook, 6)).toBeUndefined()
  })

  it('matches a chapter whether it is asked for as a number or a string', async () => {
    // The rail hands back strings from the URL; the data holds numbers.
    expect(await fixtureDataSource.getChapter(fixtureBook, '4')).toBeDefined()
  })

  it('holds Veda back on a heading she has not written about', async () => {
    expect(await fixtureDataSource.getVedaNote('individuation')).toBeUndefined()
  })
})

describe('the way back', () => {
  it('goes home when nowhere was named', () => {
    expect(backTo('')).toBe('/')
    expect(backTo('?concept=x')).toBe('/')
  })

  it('returns to the page that sent the reader here', () => {
    expect(backTo('?from=%2Fbook%2Fabc%2Finfo')).toBe('/book/abc/info')
  })

  it('refuses to leave the app', () => {
    // `from` arrives in a URL, so it is reader input like any other. An
    // absolute URL or a protocol-relative one would make the way back an
    // open redirect.
    expect(backTo('?from=https%3A%2F%2Felsewhere.example')).toBe('/')
    expect(backTo('?from=%2F%2Felsewhere.example')).toBe('/')
  })

  it('names the place it is going back to', () => {
    expect(backLabel('/book/abc/info')).toBe('Book details')
    expect(backLabel('/library')).toBe('Library')
  })

  it('names a crossing that carries its own state', () => {
    // A chip tapped in the Chapter View sends `?chapter=4` along with the
    // path, so the label must be read from the path alone.
    expect(backLabel('/book/abc/chapters?chapter=4')).toBe('Chapters')
    expect(backLabel('/commonplace?concept=the%20shadow')).toBe('Commonplace Book')
  })
})
