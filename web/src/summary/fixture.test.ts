import { describe, expect, it } from 'vitest'

import { backLabel, backTo } from './backTo.ts'
import { fixtureBook, fixtureDataSource } from './fixture.ts'

/*
 * The fixture is sample data, but the rules it keeps are real rules that any
 * future source must keep too. Those are what is tested here — not the sample
 * words themselves, which go when the two models land.
 */

describe('the fixture data source', () => {
  it('offers its sample chapters for whatever book it is asked about', async () => {
    // Deliberate, and temporary — see the note on `sampleChapters`. The page
    // is reached from a book's own details page, so sample content keyed
    // strictly by title would be invisible to anyone who does not own that
    // exact book.
    const list = await fixtureDataSource.getChapterList('A Book Nobody Imported')
    expect(list).toHaveLength(6)
  })

  it('marks which chapters have a summary and which do not', async () => {
    // The page opens on the first chapter that has something in it, and it
    // needs this flag to know which one that is.
    const list = await fixtureDataSource.getChapterList(fixtureBook)
    expect(list.filter((entry) => entry.distilled).map((entry) => entry.chapter)).toEqual([4])
  })

  it('prints the reader’s own book above the sample chapter', async () => {
    const summary = await fixtureDataSource.getChapter('A Book Nobody Imported', 4)
    expect(summary?.book).toBe('A Book Nobody Imported')
  })

  it('gives back both sections and the tags', async () => {
    const summary = await fixtureDataSource.getChapter(fixtureBook, 4)
    expect(summary?.recapText).toBeTruthy()
    expect(summary?.qaText).toBeTruthy()
    expect(summary?.tags).toContain('dreams')
  })

  it('has nothing for a chapter that was never summarised', async () => {
    expect(await fixtureDataSource.getChapter(fixtureBook, 6)).toBeUndefined()
  })

  it('matches a chapter whether it is asked for as a number or a string', async () => {
    // The rail hands back strings from the URL; the data holds numbers.
    expect(await fixtureDataSource.getChapter(fixtureBook, '4')).toBeDefined()
  })
})

describe('the way back', () => {
  it('goes home when nowhere was named', () => {
    expect(backTo('')).toBe('/')
    expect(backTo('?chapter=4')).toBe('/')
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

  it('names a path that carries its own state', () => {
    // The rail writes `?chapter=4` into the URL, so the label must be read
    // from the path alone.
    expect(backLabel('/book/abc/chapters?chapter=4')).toBe('Chapters')
  })
})
