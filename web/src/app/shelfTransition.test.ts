// @vitest-environment jsdom
//
// A book changing shelf without its cover blinking. The animation itself is the
// browser's business and can't be asserted here — what can, and what would break
// silently, is the *contract* around it: the update always happens, the names are
// on the covers at the moment the picture is taken, and they never stay on.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { coverName, coversAreNamed, moveBooks } from './shelfTransition.ts'
import type { BookId } from '../structure/index.ts'

/**
 * The document as this module actually uses it.
 *
 * Cast right through `Document` rather than intersected with it: the real
 * `ViewTransition` has four more members than anything here needs, and a stub
 * that implemented all of them to satisfy the compiler would be four more
 * things to keep true and none of them asserted.
 */
interface Fake {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

const withApi = document as unknown as Fake
const original = withApi.startViewTransition

/** Naming as seen from inside the callback the browser gives us. */
let namedDuringUpdate: boolean | null = null
let finish: (() => void) | null = null

/**
 * Stand in for the browser's own transition: run the callback straight away, and
 * hand back a `finished` this test controls — the window in which the covers are
 * supposed to be wearing their names.
 */
function installApi() {
  withApi.startViewTransition = (callback: () => void) => {
    callback()
    return {
      finished: new Promise<void>((resolve) => {
        finish = () => resolve()
      }),
    }
  }
}

beforeEach(() => {
  namedDuringUpdate = null
  finish = null
  delete withApi.startViewTransition
})

afterEach(() => {
  if (original) withApi.startViewTransition = original
  else delete withApi.startViewTransition
})

const record = () => {
  namedDuringUpdate = coversAreNamed()
}

describe('moving books between shelves', () => {
  it('makes the change immediately where the browser has no transitions', () => {
    let applied = false
    moveBooks(() => {
      applied = true
      record()
    })

    // Not merely "eventually" — synchronously. Firefox and Safari are most of
    // the reasons this branch exists, and a shelf that updated a tick late there
    // would be a regression dressed as a fallback.
    expect(applied).toBe(true)
    // And with no names, so nothing is left holding a `view-transition-name` on
    // a browser that would never have removed it.
    expect(namedDuringUpdate).toBe(false)
  })

  it('has the covers named at the moment the change is made', async () => {
    installApi()

    expect(coversAreNamed()).toBe(false)
    moveBooks(record)

    // The whole point: a name that arrives after the update is a name the old
    // picture never had, and an element the browser cannot pair does not glide —
    // it flashes, which is the bug this module exists for.
    expect(namedDuringUpdate).toBe(true)

    expect(coversAreNamed()).toBe(true)
    finish?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(coversAreNamed()).toBe(false)
  })

  it('marks the document while the move runs, and unmarks it after', async () => {
    installApi()

    moveBooks(() => {
      expect(document.documentElement.hasAttribute('data-shelf-move')).toBe(true)
    })

    finish?.()
    await Promise.resolve()
    await Promise.resolve()
    // Left behind, every cover on every later crossing would be pulled out of
    // the root snapshot — including the one that opens a book.
    expect(document.documentElement.hasAttribute('data-shelf-move')).toBe(false)
  })

  it('still takes the names off when the browser abandons the crossing', async () => {
    withApi.startViewTransition = (callback: () => void) => {
      callback()
      return { finished: Promise.reject(new Error('interrupted')) }
    }

    moveBooks(record)
    expect(namedDuringUpdate).toBe(true)

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(coversAreNamed()).toBe(false)
    expect(document.documentElement.hasAttribute('data-shelf-move')).toBe(false)
  })
})

describe('naming a cover', () => {
  it('is stable for one book and different for another', () => {
    expect(coverName('abc123' as BookId)).toBe('book-abc123')
    expect(coverName('abc123' as BookId)).toBe(coverName('abc123' as BookId))
    expect(coverName('abc123' as BookId)).not.toBe(coverName('abc124' as BookId))
  })

  it('keeps anything CSS would choke on out of the name', () => {
    // A `view-transition-name` is a custom-ident. One stray character makes the
    // declaration invalid, and the book it belonged to silently stops gliding
    // while every other book still does — the worst kind of bug to be handed.
    expect(coverName('epub:a b/c.d' as BookId)).toBe('book-epub-a-b-c-d')
  })
})
