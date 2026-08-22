// @vitest-environment jsdom
//
// What the lamp draws once a model has answered.
//
// Two rules are worth a test, and both are about honesty rather than looks:
// a bubble names the model that really wrote it, and a bubble that does not
// know draws no name at all. The second is the one a refactor breaks — falling
// back to "the current model" is the obvious convenience, and it would label
// every thread saved before this feature with a model that never saw it.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StudyLamp } from './StudyLamp.tsx'
import type { PassageAnchor, TutorMessage } from './tutor.ts'

vi.mock('./models.ts', async () => {
  const real = await vi.importActual<typeof import('./models.ts')>('./models.ts')
  return {
    ...real,
    loadModels: () =>
      Promise.resolve([
        { id: 'z-ai/glm-5.2:free', name: 'GLM 5.2', description: '', contextLength: 131_072 },
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
    expect([...picker.options].map((option) => option.text)).toEqual(['GLM 5.2', 'Gemma 4 31B'])
    // The preferred model, since nothing has been chosen before.
    await waitFor(() => expect(picker.value).toBe('z-ai/glm-5.2:free'))
  })
})
