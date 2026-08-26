/**
 * The outline reader, tested against a fake document.
 *
 * `outlineOf` takes an interface rather than a pdf.js document precisely so
 * this can exist: the destination lookups are the fiddly part, and they need no
 * binary fixture to exercise.
 */
import { describe, expect, it } from 'vitest'
import { outlineOf } from './pdf.ts'

const ref = (index: number) => ({ index })

function fake(tree: unknown, named: Record<string, unknown[]> = {}) {
  return {
    getOutline: async () => tree as never,
    getDestination: async (id: string) => named[id] ?? null,
    getPageIndex: async (one: unknown) => (one as { index: number }).index,
  }
}

describe('outlineOf', () => {
  it('is empty when the file has no bookmarks', async () => {
    expect(await outlineOf(fake(null))).toEqual([])
    expect(await outlineOf(fake([]))).toEqual([])
  })

  it('flattens the tree, recording each entry’s depth', async () => {
    const tree = [
      {
        title: 'Volume One',
        dest: [ref(0)],
        items: [
          { title: 'Preface', dest: [ref(4)] },
          { title: 'Chapter I', dest: [ref(9)] },
        ],
      },
      { title: 'Volume Two', dest: [ref(19)] },
    ]
    expect(await outlineOf(fake(tree))).toEqual([
      { title: 'Volume One', page: 1, depth: 0 },
      { title: 'Preface', page: 5, depth: 1 },
      { title: 'Chapter I', page: 10, depth: 1 },
      { title: 'Volume Two', page: 20, depth: 0 },
    ])
  })

  it('looks up a destination given by name', async () => {
    const tree = [{ title: 'Named', dest: 'chapter-one' }]
    expect(await outlineOf(fake(tree, { 'chapter-one': [ref(6)] }))).toEqual([
      { title: 'Named', page: 7, depth: 0 },
    ])
  })

  /* A malformed bookmark costs one row of the contents, never the import. */
  it('drops an entry it cannot resolve and keeps the rest', async () => {
    const tree = [
      { title: 'Good', dest: [ref(0)] },
      { title: 'Missing name', dest: 'nowhere' },
      { title: 'No destination' },
      { title: '   ', dest: [ref(2)] },
      { title: 'Also good', dest: [ref(3)] },
    ]
    expect(await outlineOf(fake(tree))).toEqual([
      { title: 'Good', page: 1, depth: 0 },
      { title: 'Also good', page: 4, depth: 0 },
    ])
  })

  it('survives a document that throws when asked', async () => {
    expect(
      await outlineOf({
        getOutline: async () => {
          throw new Error('no')
        },
        getDestination: async () => null,
        getPageIndex: async () => 0,
      }),
    ).toEqual([])
  })

  it('puts the entries in reading order, a parent before its children', async () => {
    const tree = [
      { title: 'Later', dest: [ref(9)] },
      { title: 'Earlier', dest: [ref(1)], items: [{ title: 'Child', dest: [ref(1)] }] },
    ]
    expect((await outlineOf(fake(tree))).map((one) => one.title)).toEqual([
      'Earlier',
      'Child',
      'Later',
    ])
  })
})
