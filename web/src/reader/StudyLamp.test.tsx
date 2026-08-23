// @vitest-environment jsdom
//
// What the lamp draws once a model has answered.
//
// Two rules are worth a test, and both are about honesty rather than looks:
// a bubble names the model that really wrote it, and a bubble that does not
// know draws no name at all. The second is the one a refactor breaks — falling
// back to "the current model" is the obvious convenience, and it would label
// every thread saved before this feature with a model that never saw it.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PREFERRED_MODEL } from './models.ts'
import { StudyLamp } from './StudyLamp.tsx'
import type { PassageAnchor, TutorMessage } from './tutor.ts'

vi.mock('./models.ts', async () => {
  const real = await vi.importActual<typeof import('./models.ts')>('./models.ts')
  return {
    ...real,
    loadModels: () =>
      Promise.resolve([
        { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super', description: '', contextLength: 131_072 },
        { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', description: '', contextLength: 131_072 },
      ]),
  }
})

vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: () => Promise.resolve('token'),
}))

afterEach(cleanup)

const passage: PassageAnchor = {
  anchor: 'ch02-s03-p013' as never,
  excerpt: 'Dreams are the soil from which most symbols grow.',
  kind: 'sentence',
}

function lamp(saved: TutorMessage[], over: Partial<Parameters<typeof StudyLamp>[0]> = {}) {
  return render(
    <StudyLamp passage={passage} saved={saved} onSave={() => {}} onClose={() => {}} {...over} />,
  )
}

/*
 * The captions, read off the page.
 *
 * By tag rather than by text: the model names also appear in the picker's
 * options, so a text search would find the menu and call it a caption. The
 * reader's own messages are paragraphs too, which is why the caller checks the
 * whole list rather than asking whether a name is present anywhere.
 */
function paragraphs(): string[] {
  return [...document.body.querySelectorAll('p')].map((node) => node.textContent ?? '')
}

describe('the study lamp', () => {
  it('names the model that wrote the answer', async () => {
    lamp([
      { role: 'you', text: 'Explain simply', ts: 1 },
      { role: 'claude', text: 'The mind talks in pictures.', model: 'google/gemma-4-31b-it:free', ts: 2 },
    ])
    // The roster's own name, because the roster has it.
    await waitFor(() => expect(paragraphs()).toEqual(['Explain simply', 'Gemma 4 31B']))
  })

  it('names a model the roster has never heard of', async () => {
    // A failover reports a slug nobody picked. The label still has to read.
    lamp([{ role: 'claude', text: 'An answer.', model: 'vendor/inkling-2:free', ts: 2 }])
    await waitFor(() => expect(paragraphs()).toEqual(['Inkling 2']))
  })

  it('draws no name on a message that never recorded one', async () => {
    lamp([{ role: 'claude', text: 'An older answer.', ts: 2 }])
    expect(await screen.findByText('An older answer.')).toBeTruthy()
    // The picker has loaded by now, so a caption drawn from "the current
    // model" rather than from the message would show up here.
    await screen.findByLabelText(/Which model answers/)
    expect(paragraphs()).toEqual([])
  })

  it('offers the roster in a sheet, and says which one is chosen', async () => {
    lamp([])
    const picker = await screen.findByLabelText(/Which model answers/)
    // The preferred model, since nothing has been chosen before. It is on the
    // closed control, so the reader can read it without opening anything.
    await waitFor(() => expect(picker.textContent).toContain('Nemotron 3 Super'))
    expect(PREFERRED_MODEL).toBe('nvidia/nemotron-3-super-120b-a12b:free')

    fireEvent.click(picker)
    const sheet = await screen.findByRole('dialog', { name: 'Which model answers' })
    const rows = [...sheet.querySelectorAll('button')].map((row) => row.textContent)
    expect(rows).toEqual(['Nemotron 3 Super', 'Gemma 4 31B', 'Cancel'])
  })

  it('takes a choice from the sheet and closes it', async () => {
    lamp([])
    fireEvent.click(await screen.findByLabelText(/Which model answers/))
    fireEvent.click(await screen.findByRole('button', { name: 'Gemma 4 31B' }))

    expect(screen.queryByRole('dialog', { name: 'Which model answers' })).toBeNull()
    await waitFor(() =>
      expect(screen.getByLabelText(/Which model answers/).textContent).toContain('Gemma 4 31B'),
    )
  })
})

/* --- what happens when the tutor cannot be reached ------------------------ */

function relay(...answers: Response[]) {
  let at = 0
  const fetch = vi.fn(() => {
    const answer = answers[Math.min(at, answers.length - 1)]!
    at += 1
    return Promise.resolve(answer.clone())
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const refused = () => new Response(JSON.stringify({ error: 'all busy' }), { status: 502 })
const answered = () =>
  new Response(
    JSON.stringify({ text: 'Jung meant the unconscious.', model: 'google/gemma-4-31b-it:free' }),
    { status: 200 },
  )

async function ask(label = 'Explain simply') {
  fireEvent.click(await screen.findByRole('button', { name: label }))
}

afterEach(() => vi.unstubAllGlobals())

describe('a failure the reader can see', () => {
  it('does not stack when the tutor keeps refusing', async () => {
    relay(refused())
    lamp([])
    await ask()
    await screen.findByText(/no model would answer/i)

    // Ask again, and again. One note, never a pile of identical bubbles.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getAllByText(/no model would answer/i)).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getAllByText(/no model would answer/i)).toHaveLength(1))
  })

  it('disappears as soon as a model answers', async () => {
    relay(refused(), answered())
    lamp([])
    await ask()
    await screen.findByText(/no model would answer/i)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Jung meant the unconscious.')).toBeTruthy()
    expect(screen.queryByText(/no model would answer/i)).toBeNull()
  })

  it('is never saved into the thread', async () => {
    // The failure must not reach storage, because from storage it would be
    // replayed to the model as one of its own previous turns.
    const saved: TutorMessage[][] = []
    relay(refused())
    render(
      <StudyLamp passage={passage} saved={[]} onSave={(m) => void saved.push(m)} onClose={() => {}} />,
    )
    await ask()
    await screen.findByText(/no model would answer/i)
    await waitFor(() => expect(saved.length).toBe(1))
    expect(saved[0]!.map((m) => m.role)).toEqual(['you'])
  })
})

describe('the message actions', () => {
  it('re-asks a question and replaces its old answer', async () => {
    relay(answered())
    lamp([
      { role: 'you', text: 'Who is the great psychologist?', ts: 1 },
      { role: 'claude', text: 'An older answer.', model: 'google/gemma-4-31b-it:free', ts: 2 },
    ])
    fireEvent.click(await screen.findByRole('button', { name: 'Answer this again' }))
    expect(await screen.findByText('Jung meant the unconscious.')).toBeTruthy()
    // One answer to one question, not two.
    expect(screen.queryByText('An older answer.')).toBeNull()
    expect(screen.getAllByText('Who is the great psychologist?')).toHaveLength(1)
  })

  it('puts an edited question back in the composer and rewinds the thread', async () => {
    relay(answered())
    lamp([
      { role: 'you', text: 'Who is the great psychologist?', ts: 1 },
      { role: 'claude', text: 'An older answer.', model: 'google/gemma-4-31b-it:free', ts: 2 },
    ])
    fireEvent.click(await screen.findByRole('button', { name: 'Edit your question' }))
    const composer = screen.getByLabelText('Ask about this passage') as HTMLInputElement
    expect(composer.value).toBe('Who is the great psychologist?')
    // Editing does not send. The reader decides when it is ready.
    expect(screen.queryByText('An older answer.')).toBeNull()
    expect(screen.queryByText('Jung meant the unconscious.')).toBeNull()
  })

  it('opens without raising the keyboard', async () => {
    lamp([{ role: 'claude', text: 'An answer.', ts: 2 }])
    // The box is not focused, so a phone shows no keyboard. Focus is on the
    // overlay instead, which keeps Tab and Escape working.
    const composer = await screen.findByLabelText('Ask about this passage')
    expect(document.activeElement).not.toBe(composer)
    expect((document.activeElement as HTMLElement | null)?.getAttribute('role')).toBe('dialog')
  })

  it('folds the working-out away, and opens it on a tap', async () => {
    lamp([
      {
        role: 'claude',
        text: 'The mind talks in pictures.',
        reasoning: 'First I checked what a symbol is.',
        ts: 2,
      },
    ])
    // Folded: the answer is there, the thinking is not.
    expect(screen.queryByText('First I checked what a symbol is.')).toBeNull()
    const fold = await screen.findByRole('button', { name: /How it thought this through/ })
    expect(fold.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(fold)
    expect(await screen.findByText('First I checked what a symbol is.')).toBeTruthy()
    expect(fold.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(fold)
    expect(screen.queryByText('First I checked what a symbol is.')).toBeNull()
  })

  it('draws no fold when the model published no thinking', async () => {
    lamp([{ role: 'claude', text: 'An answer.', ts: 2 }])
    await screen.findByText('An answer.')
    expect(screen.queryByRole('button', { name: /How it thought this through/ })).toBeNull()
  })

  it('says what the last exchange cost', async () => {
    lamp([
      { role: 'you', text: 'Why?', ts: 1 },
      {
        role: 'claude',
        text: 'An answer.',
        usage: { input: 1200, output: 340, total: 1540 },
        ts: 2,
      },
    ])
    expect(await screen.findByText(/1,200 in · 340 out · 1,540 total/)).toBeTruthy()
  })

  it('says nothing about tokens when nothing reported them', async () => {
    lamp([{ role: 'claude', text: 'An answer.', ts: 2 }])
    await screen.findByText('An answer.')
    expect(screen.queryByText(/total/)).toBeNull()
  })

  it('starts with the web switched off', async () => {
    lamp([])
    const globe = await screen.findByRole('button', { name: /Search the web/ })
    expect(globe.getAttribute('aria-pressed')).toBe('false')
  })

  it('turns the web on for one question when the globe is tapped', async () => {
    lamp([])
    const globe = await screen.findByRole('button', { name: /Search the web/ })
    fireEvent.click(globe)
    // The label changes with the state, so a reader who cannot see the colour
    // is told the same thing the colour says.
    const on = await screen.findByRole('button', { name: /Web search is on/ })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(on)
    expect(
      (await screen.findByRole('button', { name: /Search the web/ })).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('offers a novel the story chip and never the fact-checking one', async () => {
    lamp([], { genre: 'fiction' })
    expect(await screen.findByRole('button', { name: /What’s happening here/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Still true/ })).toBeNull()
  })

  it('offers a science book the fact-checking chip and never the story one', async () => {
    lamp([], { genre: 'nonfiction' })
    expect(await screen.findByRole('button', { name: /Still true/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /What’s happening here/ })).toBeNull()
  })

  it('gives a book of unknown kind the four that suit anything', async () => {
    lamp([])
    expect(await screen.findByRole('button', { name: 'Explain simply' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Still true/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Interpret this/ })).toBeNull()
  })

  it('prints where a searched answer looked', async () => {
    lamp([
      {
        role: 'claude',
        text: 'Still true, with one correction.',
        sources: [{ url: 'https://example.org/paper', title: 'A 2024 review' }],
        ts: 2,
      },
    ])
    const link = await screen.findByRole('link', { name: 'A 2024 review' })
    expect(link.getAttribute('href')).toBe('https://example.org/paper')
  })
})
