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

function lamp(saved: TutorMessage[]) {
  return render(<StudyLamp passage={passage} saved={saved} onSave={() => {}} onClose={() => {}} />)
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
    await screen.findByLabelText('Which model answers')
    expect(paragraphs()).toEqual([])
  })

  it('offers the roster in the composer', async () => {
    lamp([])
    const picker = (await screen.findByLabelText('Which model answers')) as HTMLSelectElement
    expect([...picker.options].map((option) => option.text)).toEqual([
      'Nemotron 3 Super',
      'Gemma 4 31B',
    ])
    // The preferred model, since nothing has been chosen before.
    await waitFor(() => expect(picker.value).toBe(PREFERRED_MODEL))
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
})
