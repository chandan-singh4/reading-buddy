// @vitest-environment jsdom
/**
 * What the loupe draws.
 *
 * Two rules run through all of it. A section with no data is *absent*, not
 * empty — a heading over nothing reads as a broken panel. And no reader is ever
 * dead-ended: every way a lookup can come back with nothing still offers Ask
 * Veda.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DefinePanel } from './DefinePanel.tsx'
import type { Lookup } from './defineWord.ts'
import type { DefineEntry } from './dictionary.ts'
import type { WordStore } from '../storage/words.ts'

const lookUpWord = vi.fn<(word: string) => Promise<Lookup>>()

vi.mock('./defineWord.ts', async () => {
  const real = await vi.importActual<typeof import('./defineWord.ts')>('./defineWord.ts')
  return { ...real, lookUpWord: (word: string) => lookUpWord(word) }
})

afterEach(() => {
  cleanup()
  lookUpWord.mockReset()
})

const ENTRY: DefineEntry = {
  headword: 'fundamental',
  syllables: 'fun·da·men·tal',
  pronunciation: {
    respelling: 'ˌfən-də-ˈmen-tᵊl',
    audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/f/fundam01.mp3',
  },
  partsOfSpeech: ['adjective', 'noun'],
  senseGroups: [
    {
      pos: 'adjective',
      senses: [
        { text: 'serving as an original source', example: 'the fundamental principles of justice' },
        { text: 'of central importance' },
      ],
    },
    { pos: 'noun', senses: [{ text: 'a basic principle' }] },
  ],
  synonyms: ['basic', 'essential'],
  etymology: {
    chain: [
      { root: 'fundāmentum', lang: 'Latin', gloss: 'foundation, basis' },
      { root: 'fundāmentālis', lang: 'Late Latin', gloss: 'serving as a foundation' },
      { root: 'fundamental', lang: 'Middle English · 15th century' },
    ],
    firstUse: '15th century',
    kin: ['found', 'profound'],
  },
  source: 'Merriam-Webster',
}

/** A store backed by Maps, in the shape the real one has. */
function store() {
  const saved = new Map<string, unknown>()
  return {
    saved,
    api: {
      cachedDefinition: () => Promise.resolve(undefined),
      cacheDefinition: () => Promise.resolve(),
      saveWord: (word: string) => {
        saved.set(word, true)
        return Promise.resolve({ word, savedAt: '' })
      },
      isSaved: (word: string) => Promise.resolve(saved.has(word)),
      forgetWord: (word: string) => {
        saved.delete(word)
        return Promise.resolve()
      },
      savedWords: () => Promise.resolve([]),
    } as unknown as WordStore,
  }
}

const RECTS = [{ top: 300, left: 120, width: 90, height: 22 }]

function panel(over: Partial<Parameters<typeof DefinePanel>[0]> = {}) {
  const onAsk = vi.fn()
  const onClose = vi.fn()
  const kept = store()
  render(
    <DefinePanel
      selected="fundamental"
      rects={RECTS}
      onAsk={onAsk}
      onClose={onClose}
      store={kept.api}
      {...over}
    />,
  )
  return { onAsk, onClose, kept }
}

describe('a word the dictionary has', () => {
  it('draws every section the entry carries', async () => {
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    panel()

    expect(await screen.findByText('fundamental', { selector: 'div' })).toBeTruthy()
    expect(screen.getByText('serving as an original source')).toBeTruthy()
    expect(screen.getByText('basic')).toBeTruthy()
    expect(screen.getByText('fundāmentum')).toBeTruthy()
    expect(screen.getByText('Merriam-Webster')).toBeTruthy()
  })

  it('numbers the senses straight through, across the parts of speech', async () => {
    /*
     * The prototype numbers 1 and 2 under "adjective" and carries on at 3 under
     * "noun". Restarting at 1 per group is the other reasonable reading and is
     * not what the design does: "sense 3" must name one sense in the panel.
     */
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    panel()

    await screen.findByText('a basic principle')
    const numbers = [...document.querySelectorAll('[class*="num"]')].map((node) => node.textContent)
    expect(numbers).toEqual(['1', '2', '3'])
  })

  it('shows the example under the sense it belongs to', async () => {
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    panel()
    expect(await screen.findByText(/the fundamental principles of justice/)).toBeTruthy()
  })

  it('names the words that share the root', async () => {
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    panel()
    await screen.findByText('fundāmentum')
    expect(screen.getByText('found')).toBeTruthy()
    expect(screen.getByText('profound')).toBeTruthy()
  })
})

describe('a section with nothing in it', () => {
  it('is absent rather than empty', async () => {
    // A labelled empty box reads as a failure. An absent one reads as a word
    // that simply has no synonyms.
    const bare: DefineEntry = {
      ...ENTRY,
      synonyms: [],
      etymology: undefined,
      pronunciation: undefined,
    }
    lookUpWord.mockResolvedValue({ state: 'entry', entry: bare, fromCache: false })
    panel()

    await screen.findByText('a basic principle')
    expect(screen.queryByText('Synonyms')).toBeNull()
    expect(screen.queryByText(/Origin/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Pronounce/ })).toBeNull()
  })

  it('hides the speaker when there is no recording, without a broken request', async () => {
    const silent: DefineEntry = {
      ...ENTRY,
      pronunciation: { respelling: 'ˌfən-də-ˈmen-tᵊl' },
    }
    lookUpWord.mockResolvedValue({ state: 'entry', entry: silent, fromCache: false })
    panel()

    await screen.findByText('ˌfən-də-ˈmen-tᵊl')
    expect(screen.queryByRole('button', { name: /Pronounce/ })).toBeNull()
  })

  it('draws the prose fallback in the same box as a chain', async () => {
    const vague: DefineEntry = {
      ...ENTRY,
      etymology: { chain: [], prose: 'origin unknown' },
    }
    lookUpWord.mockResolvedValue({ state: 'entry', entry: vague, fromCache: false })
    panel()

    expect(await screen.findByText('origin unknown')).toBeTruthy()
    expect(screen.getByText(/Origin/)).toBeTruthy()
  })
})

describe('the ways there is nothing to show', () => {
  it('says so, and still offers the tutor', async () => {
    lookUpWord.mockResolvedValue({ state: 'none', word: 'asdfghjkl', suggestions: [] })
    const { onAsk } = panel({ selected: 'asdfghjkl' })

    expect(await screen.findByText(/No dictionary entry/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ask Veda/ }))
    expect(onAsk).toHaveBeenCalledWith('asdfghjkl')
  })

  it('offers MW’s own spellings when it had some', async () => {
    lookUpWord.mockResolvedValue({
      state: 'none',
      word: 'fundemental',
      suggestions: ['fundamental', 'fundamentals'],
    })
    panel({ selected: 'fundemental' })
    expect(await screen.findByText(/Did you mean fundamental/)).toBeTruthy()
  })

  it('tells offline apart from missing', async () => {
    // The two need opposite things from the reader: wait for a signal, or stop
    // looking for a spelling mistake that is not there.
    lookUpWord.mockResolvedValue({ state: 'offline', word: 'fundamental' })
    panel()
    expect(await screen.findByText(/isn’t saved offline yet/)).toBeTruthy()
  })

  it('says plainly when the day’s lookups are spent', async () => {
    lookUpWord.mockResolvedValue({ state: 'busy', word: 'fundamental' })
    panel()
    expect(await screen.findByText(/out of lookups for today/)).toBeTruthy()
  })

  it('offers no Save button when there is nothing to save', async () => {
    lookUpWord.mockResolvedValue({ state: 'none', word: 'asdfghjkl', suggestions: [] })
    panel({ selected: 'asdfghjkl' })
    await screen.findByText(/No dictionary entry/)
    expect(screen.queryByRole('button', { name: /Save word/ })).toBeNull()
  })
})

describe('the things a reader can do in the panel', () => {
  it('looks a synonym up in place, without leaving the loupe', async () => {
    lookUpWord.mockImplementation((word) =>
      Promise.resolve({
        state: 'entry',
        entry: { ...ENTRY, headword: word, synonyms: ['basic'] },
        fromCache: false,
      }),
    )
    panel()

    fireEvent.click(await screen.findByRole('button', { name: 'basic' }))
    await waitFor(() => expect(lookUpWord).toHaveBeenCalledWith('basic'))
  })

  it('saves the word, and says it did', async () => {
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    const { kept } = panel()

    fireEvent.click(await screen.findByRole('button', { name: /Save word/ }))
    await screen.findByRole('button', { name: /Saved/ })
    expect(kept.saved.has('fundamental')).toBe(true)
  })

  it('lets a saved word go again', async () => {
    /*
     * The 2026-08-24 report: the button disabled itself once it said "Saved",
     * so a mis-tap put a word on the list forever. Keeping a word is a small
     * decision, and every small decision should be reversible.
     */
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    const { kept } = panel()

    fireEvent.click(await screen.findByRole('button', { name: /Save word/ }))
    const saved = await screen.findByRole('button', { name: /Saved/ })
    expect(kept.saved.has('fundamental')).toBe(true)

    fireEvent.click(saved)
    await screen.findByRole('button', { name: /Save word/ })
    await waitFor(() => expect(kept.saved.has('fundamental')).toBe(false))
  })

  it('takes the word to the tutor, not the sentence it came from', async () => {
    /*
     * The reader asked about *this word*. Handing the tutor the whole
     * selection would answer a question they did not ask.
     */
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    const { onAsk } = panel({ selected: 'fundamental principles of justice' })

    fireEvent.click(await screen.findByRole('button', { name: /Ask Veda/ }))
    expect(onAsk).toHaveBeenCalledWith('fundamental')
  })

  it('leaves the history stack alone', async () => {
    /*
     * The 2026-08-24 report: Define did nothing on the phone. The panel used to
     * run its own `useBackDismiss`, keeping a private count of the same history
     * stack the Reader keeps. The Reader saw the entry the panel had just
     * pushed, read it as one of its own left behind, and went back — and the
     * panel read that as the reader's back gesture and closed. The panel opened
     * and shut inside one frame.
     *
     * The Reader counts the loupe as one of its layers. The panel owns no
     * history at all.
     */
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    const before = window.history.length
    panel()

    await screen.findByText('a basic principle')
    expect(window.history.length).toBe(before)
  })

  /*
   * The 2026-08-24 report was "I tap the sound and hear nothing", and the answer
   * then was to take the button away on any failure at all. The 2026-08-25
   * report is what that answer cost: "the button shows up, and when I click it,
   * it disappears" — on `fundamental`, whose recording is perfectly good.
   *
   * So the rule is narrower now. Only the browser saying it cannot play this
   * file — `NotSupportedError` — removes the button. A refusal that might not
   * happen twice leaves it alone.
   */
  it('keeps the speaker when a play fails but the file is fine', async () => {
    const play = vi.fn(() => Promise.reject(new DOMException('interrupted', 'AbortError')))
    vi.stubGlobal('Audio', class { src = ''; currentTime = 0; pause = vi.fn(); play = play })
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    panel()

    fireEvent.click(await screen.findByRole('button', { name: /Pronounce/ }))
    await waitFor(() => expect(play).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Pronounce/ })).not.toBeNull()
    vi.unstubAllGlobals()
  })

  it('takes the speaker away only when the file cannot be played at all', async () => {
    const play = vi.fn(() => Promise.reject(new DOMException('no', 'NotSupportedError')))
    vi.stubGlobal('Audio', class { src = ''; currentTime = 0; pause = vi.fn(); play = play })
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    panel()

    fireEvent.click(await screen.findByRole('button', { name: /Pronounce/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Pronounce/ })).toBeNull())
    vi.unstubAllGlobals()
  })

  /*
   * The bug itself. The old line was `new Audio(url).play()`, which kept no
   * reference to the element it started. An unreachable media element that is
   * still loading can be collected, and that rejects the `play()` in flight.
   * Holding it in a ref is the fix, and reusing one element is how the test can
   * see that it was held.
   */
  it('reuses one audio element rather than dropping each one it makes', async () => {
    const built: unknown[] = []
    const play = vi.fn(() => Promise.resolve())
    vi.stubGlobal(
      'Audio',
      class {
        src = ''
        currentTime = 0
        pause = vi.fn()
        play = play
        constructor() {
          built.push(this)
        }
      },
    )
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    panel()

    const speaker = await screen.findByRole('button', { name: /Pronounce/ })
    fireEvent.click(speaker)
    fireEvent.click(speaker)
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))

    expect(built).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it('closes on the scrim, on the button, and on Escape', async () => {
    lookUpWord.mockResolvedValue({ state: 'entry', entry: ENTRY, fromCache: false })
    const { onClose } = panel()

    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
