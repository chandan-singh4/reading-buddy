/**
 * The lookup, end to end: cache, relay, parser, and the four ways it fails.
 *
 * The cache tests are the ones worth having. "Looked up once, then free and
 * offline for ever" is the whole storage design, and it is the kind of thing
 * that quietly stops being true.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { lookUpWord, wordFrom } from './defineWord.ts'
import { DEFINITION_VERSION, type WordStore } from '../storage/words.ts'

vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: () => Promise.resolve('token'),
}))

const COLLEGIATE = [
  {
    meta: { id: 'fundamental:1' },
    hwi: { hw: 'fun*da*men*tal', prs: [{ mw: 'ˌfən-də-ˈmen-tᵊl', sound: { audio: 'fundam01' } }] },
    fl: 'adjective',
    et: [
      [
        'text',
        'Middle English, borrowed from Late Latin {it}fundāmentālis{/it} "serving as a foundation," ' +
          'from Latin {it}fundāmentum{/it} "foundation, basis"',
      ],
    ],
    date: '15th century, in the meaning defined at sense 1a',
    shortdef: ['serving as an original source'],
  },
]

/** A store backed by a Map, in the shape the real one has. */
function store(seeded: Record<string, unknown> = {}) {
  const cache = new Map<string, unknown>(Object.entries(seeded))
  const saved = new Map<string, unknown>()
  return {
    cache,
    saved,
    api: {
      cachedDefinition: (word: string) =>
        Promise.resolve(
          cache.has(word)
            ? { word, entry: cache.get(word), fetchedAt: '2026-08-24T00:00:00.000Z', v: 2 }
            : undefined,
        ),
      cacheDefinition: (word: string, entry: unknown) => {
        cache.set(word, entry)
        return Promise.resolve()
      },
      saveWord: (word: string) => Promise.resolve({ word, savedAt: '' }),
      isSaved: () => Promise.resolve(false),
      forgetWord: () => Promise.resolve(),
      savedWords: () => Promise.resolve([]),
    } as unknown as WordStore,
  }
}

/** The relay, answering with whatever this test wants. */
function relay(body: unknown, status = 200) {
  const fetching = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  )
  vi.stubGlobal('fetch', fetching)
  return fetching
}

function online(is: boolean) {
  vi.stubGlobal('navigator', { onLine: is })
}

afterEach(() => vi.unstubAllGlobals())

describe('the word to look up', () => {
  it('takes the first word of a longer selection', () => {
    // Define is offered on any selection. A reader with a sentence highlighted
    // means the word they were looking at, and refusing helps nobody.
    expect(wordFrom('fundamental principles of justice')).toBe('fundamental')
  })

  it('drops the punctuation a book puts round a word', () => {
    expect(wordFrom('“Fundamental,”')).toBe('fundamental')
    expect(wordFrom('(bondage)')).toBe('bondage')
  })

  it('keeps the marks that are part of a word', () => {
    expect(wordFrom("don't")).toBe("don't")
    expect(wordFrom('self-evident')).toBe('self-evident')
  })

  it('is empty for a selection with no word in it', () => {
    expect(wordFrom('   —  ')).toBe('')
  })
})

describe('a word that has been looked up before', () => {
  it('comes from the cache without touching the network', async () => {
    const kept = store({ fundamental: { headword: 'fundamental', senseGroups: [] } })
    const fetching = relay(null, 500)
    online(true)

    const found = await lookUpWord('fundamental', kept.api)

    expect(found.state).toBe('entry')
    expect(found).toMatchObject({ fromCache: true })
    expect(fetching).not.toHaveBeenCalled()
  })

  it('works with no signal at all', async () => {
    /*
     * The point of caching the parsed entry rather than the response. A reader
     * on a train can still read what they already looked up.
     */
    const kept = store({ fundamental: { headword: 'fundamental', senseGroups: [] } })
    online(false)

    const found = await lookUpWord('fundamental', kept.api)
    expect(found.state).toBe('entry')
  })
})

describe('a word that has not', () => {
  it('is fetched, parsed and kept', async () => {
    const kept = store()
    relay({ word: 'fundamental', collegiate: COLLEGIATE, thesaurus: null })
    online(true)

    const found = await lookUpWord('fundamental', kept.api)

    expect(found).toMatchObject({ state: 'entry', fromCache: false })
    if (found.state !== 'entry') throw new Error('expected an entry')
    expect(found.entry.headword).toBe('fundamental')
    expect(found.entry.etymology?.chain.map((node) => node.root)).toEqual([
      'fundāmentum',
      'fundāmentālis',
      'fundamental',
    ])
    // Parsed once, ever. The chain is in the cache, not just the JSON.
    expect(kept.cache.get('fundamental')).toMatchObject({ headword: 'fundamental' })
  })

  it('says so plainly when MW has no such word', async () => {
    const kept = store()
    relay({ word: 'asdfghjkl', collegiate: ['asdf', 'asdfg'], thesaurus: null })
    online(true)

    const found = await lookUpWord('asdfghjkl', kept.api)
    expect(found).toEqual({ state: 'none', word: 'asdfghjkl', suggestions: ['asdf', 'asdfg'] })
  })

  it('is not cached when it could not be looked up', async () => {
    // Caching a failure would make it permanent.
    const kept = store()
    relay({ error: 'nope' }, 502)
    online(true)

    await lookUpWord('fundamental', kept.api)
    expect(kept.cache.size).toBe(0)
  })
})

describe('the four ways it fails', () => {
  it('knows offline from missing', async () => {
    const kept = store()
    online(false)
    expect(await lookUpWord('fundamental', kept.api)).toEqual({ state: 'offline', word: 'fundamental' })
  })

  it('knows a spent quota from a missing word', async () => {
    /*
     * The two look identical from the panel and mean opposite things. Told
     * "no entry", the reader looks for a spelling mistake that is not there.
     */
    const kept = store()
    relay({ error: 'busy' }, 429)
    online(true)
    expect(await lookUpWord('fundamental', kept.api)).toEqual({ state: 'busy', word: 'fundamental' })
  })

  it('does not retry a spent quota', async () => {
    // It will not un-spend itself in seven hundred milliseconds.
    const kept = store()
    const fetching = relay({ error: 'busy' }, 429)
    online(true)
    await lookUpWord('fundamental', kept.api)
    expect(fetching).toHaveBeenCalledTimes(1)
  })

  it('tries a second time after a server error', async () => {
    const kept = store()
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1
        return Promise.resolve(
          calls === 1
            ? new Response('{}', { status: 502 })
            : new Response(JSON.stringify({ collegiate: COLLEGIATE, thesaurus: null }), { status: 200 }),
        )
      }),
    )
    online(true)

    const found = await lookUpWord('fundamental', kept.api)
    expect(found.state).toBe('entry')
    expect(calls).toBe(2)
  })

  it('calls a dead network offline rather than failed', async () => {
    const kept = store()
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no route'))))
    online(true)
    expect(await lookUpWord('fundamental', kept.api)).toEqual({ state: 'offline', word: 'fundamental' })
  })
})

/*
 * The 2026-08-25 report: the speaker vanished on "fundamental", every time, on
 * a device where the URL fix had already shipped.
 *
 * The cache holds the *parsed* entry and is read before the network, so a
 * parsing bug outlives its own fix: the device keeps serving the old broken
 * entry for every word it had already looked up. `DEFINITION_VERSION` is what
 * makes a fix reach a device. These two hold that seam open.
 */
describe('a cached entry from an older parser', () => {
  /** A store holding one row written before `DEFINITION_VERSION` existed. */
  function stale() {
    return {
      cachedDefinition: (word: string) => {
        const kept = {
          word,
          entry: { headword: 'fundamental' },
          fetchedAt: '2026-08-20T00:00:00.000Z',
          // No `v` at all — every row written before 2026-08-25 looks like this.
          v: undefined as number | undefined,
        }
        return Promise.resolve(kept.v === DEFINITION_VERSION ? kept : undefined)
      },
      cacheDefinition: () => Promise.resolve(),
      saveWord: () => Promise.resolve({ word: '', savedAt: '' }),
      isSaved: () => Promise.resolve(false),
      forgetWord: () => Promise.resolve(),
      savedWords: () => Promise.resolve([]),
    } as unknown as WordStore
  }

  it('is a miss, so the word is fetched and parsed again', async () => {
    online(true)
    const fetching = relay({ collegiate: COLLEGIATE, thesaurus: [] })

    const found = await lookUpWord('fundamental', stale())

    expect(fetching).toHaveBeenCalled()
    expect(found.state).toBe('entry')
    if (found.state === 'entry') expect(found.fromCache).toBe(false)
  })

  it('is a hit when the version matches, and costs no network', async () => {
    online(true)
    const fetching = relay({ collegiate: COLLEGIATE, thesaurus: [] })
    const kept = store({ fundamental: { headword: 'fundamental', senseGroups: [] } })

    const found = await lookUpWord('fundamental', kept.api)

    expect(fetching).not.toHaveBeenCalled()
    expect(found.state).toBe('entry')
    if (found.state === 'entry') expect(found.fromCache).toBe(true)
  })
})

/*
 * MW answers a spent quota with 200 and a suggestion list — the same shape as a
 * word it has never heard of. Read literally, it makes the app tell the reader
 * "no dictionary entry" about every word at once.
 */
describe('the day’s lookups running out', () => {
  it('is called busy, not a missing word', async () => {
    online(true)
    // The real reply for "person" on a spent key, trimmed.
    relay({ collegiate: ['person', 'persona', 'Pearson'], thesaurus: [] })

    const found = await lookUpWord('person', store().api)

    expect(found.state).toBe('busy')
  })

  it('still calls a genuine miss a miss', async () => {
    online(true)
    relay({ collegiate: ['ashcake', 'askance'], thesaurus: [] })

    const found = await lookUpWord('asdfghjkl', store().api)

    expect(found.state).toBe('none')
  })
})
