// @vitest-environment jsdom
//
// What the lamp draws once a model has answered.
//
// Two rules are worth a test, and both are about honesty rather than looks:
// a bubble names the model that really wrote it, and a bubble that does not
// know draws no name at all. The second is the one a refactor breaks — falling
// back to "the current model" is the obvious convenience, and it would label
// every thread saved before this feature with a model that never saw it.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { forgetAllErrands } from './errand.ts'
import { PREFERRED_MODEL } from './models.ts'
import { StudyLamp } from './StudyLamp.tsx'
import type { PassageAnchor, TutorMessage } from './tutor.ts'

vi.mock('./models.ts', async () => {
  const real = await vi.importActual<typeof import('./models.ts')>('./models.ts')
  return {
    ...real,
    /* Two providers, because one column would not exercise the thing the grid
       exists for: the fallback going sideways rather than down. */
    loadModels: () =>
      Promise.resolve([
        { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', description: '', contextLength: 1_048_576, source: 'gemini' },
        { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super', description: '', contextLength: 131_072, source: 'openrouter' },
        { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', description: '', contextLength: 131_072, source: 'openrouter' },
      ]),
  }
})

vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: () => Promise.resolve('token'),
}))

/*
 * Where the words are, as jsdom would say if jsdom laid anything out.
 *
 * Moving it is how a scroll is expressed here: a scroll does not change the
 * range, it changes where that range is on screen, and re-measuring is exactly
 * what the lamp has to do about it.
 */
let boxNow = { top: 100, bottom: 120, left: 40, right: 240, width: 200, height: 20 } as DOMRect

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
  return [...document.body.querySelectorAll('p')]
    // A tutor answer is markdown now, so it is drawn as paragraphs of its own.
    // Those are the message, not a caption about it.
    .filter((node) => !node.closest('[data-markdown]'))
    .map((node) => node.textContent ?? '')
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
    await waitFor(() => expect(picker.textContent).toContain('Gemini 3.7 Flash'))
    expect(PREFERRED_MODEL).toBe('gemini-3.7-flash')

    fireEvent.click(picker)
    const sheet = await screen.findByRole('dialog', { name: 'Which model answers' })

    // One column per provider, in the order the chain walks them.
    const heads = [...sheet.querySelectorAll('[class*="head"]')].map((head) => head.textContent)
    expect(heads).toEqual(['Google', 'OpenRouter'])

    // Every model is offered, and ranked inside its own column.
    const rows = [...sheet.querySelectorAll('[class*="_row"]')].map(
      (row) => row.getAttribute('aria-label'),
    )
    expect(rows).toEqual(['Gemini 3.7 Flash', 'Nemotron 3 Super', 'Gemma 4 31B'])
  })

  it('offers the controls before the roster has arrived', async () => {
    /*
     * The reader's report: for the first three or four seconds of a new
     * conversation, the model and the effort controls are not on screen. The
     * roster is fetched behind a sign-in, and the picker was drawn only once
     * it landed — so the lamp opened without its controls and they appeared
     * later, moving everything under the reader's thumb.
     *
     * The roster the reader saw last time is now on the first paint. Held here
     * with a fetch that never answers, which is the worst version of the wait.
     */
    localStorage.setItem(
      'reading-buddy:tutor-roster',
      JSON.stringify([
        {
          id: 'google/gemma-4-31b-it:free',
          name: 'Gemma 4 31B',
          description: '',
          contextLength: 131_072,
          source: 'openrouter',
        },
      ]),
    )
    const models = await import('./models.ts')
    const slow = vi.spyOn(models, 'loadModels').mockReturnValue(new Promise(() => {}))
    try {
      lamp([])
      // No `findBy`: the point is that it is already there, not that it turns
      // up eventually.
      expect(screen.getByLabelText(/Which model answers/).textContent).toContain('Gemma 4 31B')
      expect(screen.getByLabelText(/How hard it thinks/)).toBeTruthy()
    } finally {
      slow.mockRestore()
      localStorage.clear()
    }
  })

  it('takes a choice from the sheet and closes it', async () => {
    lamp([])
    fireEvent.click(await screen.findByLabelText(/Which model answers/))
    // The whole finger gesture. The click is the part that chooses — see the
    // model sheet's own tests for why it cannot be the release.
    const row = await screen.findByRole('button', { name: 'Gemma 4 31B' })
    fireEvent.pointerDown(row)
    fireEvent.pointerUp(window)
    fireEvent.click(row)

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

/** The relay's streaming reply: one JSON object per line. */
function streamed(lines: unknown[]): Response {
  return new Response(lines.map((line) => `${JSON.stringify(line)}
`).join(''), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

/**
 * An answer, written one word at a time.
 *
 * Split into pieces on purpose. The panel now assembles the words itself, so a
 * stub that hands over the whole answer at once would test a path the app no
 * longer takes.
 */
const answered = (
  text = 'Jung meant the unconscious.',
  model = 'google/gemma-4-31b-it:free',
) =>
  streamed([
    { t: 'open', model, source: 'openrouter' },
    ...text.split(' ').map((word, at) => ({ t: 'text', d: at === 0 ? word : ` ${word}` })),
    { t: 'done', reply: { text, model, source: 'openrouter' } },
  ])

/**
 * A reply the test writes into, one line at a time.
 *
 * `streamed` hands everything over at once, which is fine for checking what
 * the panel ends up with and useless for checking what it draws *during*. This
 * one stays open until the test closes it, so the half-written state can be
 * looked at.
 */
function held() {
  let push!: (line: unknown) => void
  let close!: () => void
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      push = (line) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}
`))
      close = () => controller.close()
    },
  })
  const response = new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  })
  return { response, push, close }
}

async function ask(label = 'Explain simply') {
  fireEvent.click(await screen.findByRole('button', { name: label }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  // Errands live in a module, on purpose — they have to survive a panel going
  // away. That also means one test's ask would otherwise turn up in the next.
  forgetAllErrands()
})

describe('the question box', () => {
  /*
   * It used to be a one-line `<input>`. A question longer than the bar scrolled
   * sideways, so correcting a word in the middle meant dragging the text back
   * and forth to find it. It is a textarea that grows now — which means Enter
   * has to be given back its job by hand, because a textarea's Enter makes a
   * line rather than submitting the form.
   */

  it('takes more than one line', async () => {
    lamp([])
    const box = await screen.findByLabelText('Ask about this passage')
    expect(box.tagName).toBe('TEXTAREA')
  })

  it('sends on Enter', async () => {
    relay(answered('The mind talks in pictures.'))
    lamp([])
    const box = await screen.findByLabelText('Ask about this passage')
    fireEvent.change(box, { target: { value: 'What does this mean?' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    expect(await screen.findByText('What does this mean?')).toBeTruthy()
  })

  it('makes a new line on Shift+Enter, and sends nothing', async () => {
    relay(answered('Never asked.'))
    lamp([])
    const box = await screen.findByLabelText('Ask about this passage')
    fireEvent.change(box, { target: { value: 'First line' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })

    // Still in the box, not in the thread.
    expect((box as HTMLTextAreaElement).value).toBe('First line')
    expect(screen.queryByText('Never asked.')).toBeNull()
  })

  it('does not echo the phone keyboard while it composes a word', async () => {
    /*
     * The reader's bug, in a screenshot: the box filling with the same sentence
     * over and over, each copy longer than the last.
     *
     * Android's keyboard does not type finished text. It holds a composing
     * region — the underlined words it is still deciding about, which is how
     * voice typing, autocorrect and glide typing all work — and it replaces
     * that region as it makes up its mind. A *controlled* React field writes
     * `value` back onto the element after every change, and writing to an
     * element with a live composing region makes the keyboard commit its
     * buffer again. That is the echo.
     *
     * What is held here is the property that stops it: the element's own text
     * survives a re-render. React must never put anything back into this box.
     */
    lamp([])
    const box = (await screen.findByLabelText('Ask about this passage')) as HTMLTextAreaElement

    fireEvent.compositionStart(box)
    fireEvent.change(box, { target: { value: 'I don’t think this issue' } })
    fireEvent.compositionEnd(box)

    // A re-render from somewhere else entirely. A controlled field would take
    // this moment to write its own idea of the value over the keyboard's.
    fireEvent.click(screen.getByLabelText(/Search the web/i))

    expect(box.value).toBe('I don’t think this issue')
  })

  it('clears the box after the question is sent', async () => {
    // The box owns its text now, so clearing it is the app's job rather than
    // something a re-render does for free. A question left behind after
    // sending would be asked twice.
    relay(answered('An answer.'))
    lamp([])
    const box = (await screen.findByLabelText('Ask about this passage')) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'What does this mean?' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    await screen.findByText('An answer.')
    expect(box.value).toBe('')
  })

  it('sends nothing on Enter when the box is empty', async () => {
    lamp([])
    const box = await screen.findByLabelText('Ask about this passage')
    fireEvent.keyDown(box, { key: 'Enter' })

    expect(screen.queryByText(/Claude is thinking/)).toBeNull()
  })

  it('lets an IME finish a character without sending', async () => {
    // Mid-word in a Japanese or Chinese keyboard, Enter picks the candidate.
    // Sending there would cut the question off at half a word.
    relay(answered('Never asked.'))
    lamp([])
    const box = await screen.findByLabelText('Ask about this passage')
    fireEvent.change(box, { target: { value: 'なに' } })
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })

    expect((box as HTMLTextAreaElement).value).toBe('なに')
  })
})

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

describe('an answer arriving', () => {
  it('draws the words before the answer is finished', async () => {
    /*
     * The stub hands over every line at once, so this cannot time the arrival.
     * What it can hold is the part that matters: the panel builds the answer
     * out of the pieces rather than waiting for one finished body. A panel
     * that ignored the deltas and read only the `done` line would pass every
     * other test in this file and fail this one.
     */
    relay(
      streamed([
        { t: 'open', model: 'google/gemma-4-31b-it:free', source: 'openrouter' },
        { t: 'text', d: 'Jung meant ' },
        { t: 'text', d: 'the unconscious.' },
        // No `done` line: the stream stopped early. The words still stand.
      ]),
    )
    lamp([])
    await ask()

    await screen.findByText('Jung meant the unconscious.')
  })

  it('reads a finished answer from its first line, not its last', async () => {
    /*
     * The reader's own request. A long answer used to end with the view at the
     * bottom of it, so every single time they had to scroll back by hand to
     * start reading.
     *
     * jsdom has no layout, so the scroll cannot be measured — every element is
     * zero high. What is checked instead is the hook the effect scrolls to: the
     * finished answer carries `data-answer`, and without it the effect has
     * nothing to find and silently falls back to the bottom.
     */
    relay(answered('A long explanation of the unconscious.'))
    lamp([])
    await ask()

    const answer = await screen.findByText('A long explanation of the unconscious.')
    expect(answer.closest('[data-answer]')).not.toBeNull()
  })

  it('shows the thinking while there are no words yet', async () => {
    // A reasoning model can run for ten seconds before it writes anything, and
    // ten seconds of pulsing dots reads as a hang.
    const stream = held()
    relay(stream.response)
    lamp([])
    await ask()

    stream.push({ t: 'open', model: 'google/gemma-4-31b-it:free', source: 'openrouter' })
    stream.push({ t: 'think', d: 'First I should work out what Jung meant.' })

    await screen.findByText(/what Jung meant/)
    stream.close()
  })

  it('puts the thinking away as soon as the first word lands', async () => {
    const stream = held()
    relay(stream.response)
    lamp([])
    await ask()

    stream.push({ t: 'think', d: 'First I should work out what Jung meant.' })
    await screen.findByText(/what Jung meant/)

    stream.push({ t: 'text', d: 'Jung meant the unconscious.' })
    await screen.findByText('Jung meant the unconscious.')
    expect(screen.queryByText(/what Jung meant/)).toBeNull()
    stream.close()
  })

  it('does not offer to copy an answer that is still arriving', async () => {
    // There is nothing finished to copy or ask again yet. The reader's own
    // question keeps its actions, so this counts rather than asserting none.
    const stream = held()
    relay(stream.response)
    lamp([])
    await ask()

    stream.push({ t: 'text', d: 'Half an answer' })
    await screen.findByText('Half an answer')

    // One copy button, and it belongs to the question above.
    expect(screen.getAllByRole('button', { name: /copy/i })).toHaveLength(1)
    stream.close()
  })
})

/**
 * Select the words of one element, the way a reader's drag does.
 *
 * `selectionchange` is dispatched by hand. jsdom keeps a Selection and answers
 * questions about it, but it does not fire the event when a script builds a
 * range — and that event is the whole of how the lamp learns about a drag.
 */
function selectWordsIn(element: Element) {
  /*
   * jsdom has no layout, so a Range cannot measure itself. The lamp asks for
   * the selection's box to place the card above it, which is a question only a
   * real browser can answer. A fixed box is enough here: these tests are about
   * which words were picked and what happens to them, not about where the card
   * lands.
   */
  Range.prototype.getBoundingClientRect = () => boxNow
  Range.prototype.getClientRects = () => [boxNow] as unknown as DOMRectList

  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = document.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  // `act`, because this is a plain DOM event and not a React one: without it
  // the state it sets is scheduled and the assertion runs before the card does.
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

describe('keeping a line Veda said', () => {
  const spoken: TutorMessage[] = [
    { role: 'you', text: 'What is a symbol?', ts: 1 },
    {
      role: 'claude',
      text: 'A symbol is a picture the mind can hold.',
      model: 'google/gemma-4-31b-it:free',
      ts: 2,
    },
  ]

  it('offers Save and Ask on words picked out of an answer', async () => {
    lamp(spoken, { onKeep: () => {} })
    selectWordsIn(await screen.findByText('A symbol is a picture the mind can hold.'))

    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeTruthy()
  })

  it('lands on the kept line when a note sent the reader here', async () => {
    /*
     * The reader's report, 2026-08-26: tapping one of Veda's Quotes opened the
     * right conversation and left them at the top of it, hunting for the
     * sentence they had saved. A long answer is several screens, so the right
     * thread is not the same place as the right line.
     *
     * The line comes back picked, not merely scrolled to: the reader can see
     * which words the note holds, and copy or ask about them again at once.
     */
    Range.prototype.getBoundingClientRect = () => boxNow
    Range.prototype.getClientRects = () => [boxNow] as unknown as DOMRectList

    lamp(spoken, { onKeep: () => {}, find: 'a picture the mind can hold' })

    const card = await screen.findByRole('group', { name: 'What to do with these words' })
    expect(card).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('says nothing when the kept words are not in this conversation', async () => {
    // An answer can be edited away, or the note can belong to a thread that no
    // longer holds it. Opening the conversation is still the right answer —
    // failing to find the line must not cost the reader the thread.
    lamp(spoken, { onKeep: () => {}, find: 'words nobody ever said' })

    expect(await screen.findByText('A symbol is a picture the mind can hold.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('hands the words up when they are saved', async () => {
    const onKeep = vi.fn()
    lamp(spoken, { onKeep })
    selectWordsIn(await screen.findByText('A symbol is a picture the mind can hold.'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Twice over: the marks, for the Notes tab to draw, and the plain words,
    // so a tap on that note can find this line again. See `pickMarkdown.ts`.
    expect(onKeep).toHaveBeenCalledWith(
      'A symbol is a picture the mind can hold.',
      'A symbol is a picture the mind can hold.',
    )
  })

  it('puts the words in the box as a quote, and does not send them', async () => {
    /*
     * Ask writes no question. A prefilled one is a question the reader did not
     * ask, and it would go out the moment they tapped send without reading it.
     */
    const onKeep = vi.fn()
    lamp(spoken, { onKeep })
    selectWordsIn(await screen.findByText('A symbol is a picture the mind can hold.'))
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    const composer = screen.getByLabelText('Ask about this passage') as HTMLTextAreaElement
    expect(composer.value).toBe('> A symbol is a picture the mind can hold.\n\n')
    expect(onKeep).not.toHaveBeenCalled()
    // Still two messages: the question and the answer. Nothing was asked.
    expect(screen.getAllByRole('button', { name: 'Copy this answer' })).toHaveLength(1)
  })

  it('moves what it draws with the words when the conversation scrolls', async () => {
    /*
     * The reader's report, with a screenshot: they picked several paragraphs,
     * scrolled to read the rest, and the violet stayed exactly where it was
     * while the words slid out from under it.
     *
     * Everything the picker draws is placed in viewport coordinates, which are
     * true when they are taken and false as soon as anything moves. The range
     * does not go stale — it is nodes and offsets — so it is measured again.
     */
    lamp(spoken, { onKeep: () => {} })
    selectWordsIn(await screen.findByText('A symbol is a picture the mind can hold.'))

    /*
     * The card, because it is drawn in both modes. The violet wash and the two
     * handles are only drawn when the app owns the selection, which is the
     * touch path, and jsdom lays nothing out so there is no point to pick from.
     * All three are placed from the same re-measured rectangle, so the card
     * moving is the thing under test.
     */
    const card = () => screen.getByRole('group', { name: 'What to do with these words' })
    expect(card().style.top).toBe('90px')

    boxNow = { ...boxNow, top: 30, bottom: 50 } as DOMRect
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    await waitFor(() => expect(card().style.top).toBe('20px'))
  })

  it('copies the words without keeping them', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      },
    })
    const onKeep = vi.fn()
    lamp(spoken, { onKeep })
    selectWordsIn(await screen.findByText('A symbol is a picture the mind can hold.'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    expect(written).toEqual(['A symbol is a picture the mind can hold.'])
    expect(onKeep).not.toHaveBeenCalled()
  })

  it('offers nothing on the reader’s own question', async () => {
    // Keeping the reader's words under Veda's name would put a sentence in her
    // mouth that she never said.
    lamp(spoken, { onKeep: () => {} })
    selectWordsIn(await screen.findByText('What is a symbol?'))

    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull()
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
    // Twice over: once beside that answer's own buttons, once in the total
    // under the message bar. One exchange means the two agree.
    expect(await screen.findAllByText(/1,200 in · 340 out · 1,540 total/)).toHaveLength(2)
  })

  it('adds every exchange up under the message bar', async () => {
    lamp([
      { role: 'you', text: 'One?', ts: 1 },
      {
        role: 'claude',
        text: 'The first answer.',
        usage: { input: 1000, output: 200, total: 1200 },
        ts: 2,
      },
      { role: 'you', text: 'Two?', ts: 3 },
      {
        role: 'claude',
        text: 'The second answer.',
        usage: { input: 1500, output: 300, total: 1800 },
        ts: 4,
      },
    ])
    // Each answer says what it cost on its own …
    expect(await screen.findByText('1,000 in · 200 out · 1,200 total')).toBeTruthy()
    expect(screen.getByText('1,500 in · 300 out · 1,800 total')).toBeTruthy()
    // … and the line under the bar is the sum of them, not the last one.
    expect(screen.getByText('2,500 in · 500 out · 3,000 total')).toBeTruthy()
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

  /**
   * Every book is offered every chip.
   *
   * The lamp used to show four and work the last three out from the kind of
   * book. That needed a column in the database, a row of controls on the book's
   * page, and a guess — for a cost the reader never actually paid: an unsuited
   * chip is one they simply do not tap.
   */
  it('offers all seven chips, whatever the book is', async () => {
    lamp([])
    for (const chip of [
      'Explain simply',
      'Explain to a friend',
      'Discuss & ask questions',
      'Define a term',
      'What’s happening here?',
      'Still true?',
      'Interpret this',
    ]) {
      expect(await screen.findByRole('button', { name: chip })).toBeTruthy()
    }
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

/* --- asking about a picture ---------------------------------------------- */

const PLATE = 'data:image/jpeg;base64,abc'

const figure: PassageAnchor = {
  anchor: 'ch02-s03-p013' as never,
  excerpt: 'Figure 1. A mandala.',
  kind: 'figure',
}

/** The body of the nth call to the relay, parsed. */
function sent(fetch: ReturnType<typeof relay>, at = 0): Record<string, unknown> {
  const call = fetch.mock.calls[at] as unknown as [string, { body: string }]
  return JSON.parse(call[1].body) as Record<string, unknown>
}

/** A roster with one model that can read a picture, and one that cannot. */
async function rosterThatSees() {
  const models = await import('./models.ts')
  return vi.spyOn(models, 'loadModels').mockResolvedValue([
    { id: 'seeing/one:free', name: 'Seeing One', description: '', contextLength: 131_072, source: 'openrouter', sees: true },
    { id: 'blind/one:free', name: 'Blind One', description: '', contextLength: 131_072, source: 'openrouter' },
  ])
}

async function askAboutThePlate(over: Partial<Parameters<typeof StudyLamp>[0]> = {}) {
  render(
    <StudyLamp
      passage={figure}
      picture={PLATE}
      saved={[]}
      onSave={() => {}}
      onClose={() => {}}
      {...over}
    />,
  )
  // Waiting for the roster: the chain is filtered by it, and a question asked
  // before it lands is a different case (the relay picks its own chain).
  await waitFor(() => expect(screen.getByLabelText(/Which model answers/)).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /Explain simply/i }))
}

describe('a question about a picture', () => {
  afterEach(() => {
    forgetAllErrands()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the reader the plate the tutor was given', () => {
    render(
      <StudyLamp passage={figure} picture={PLATE} saved={[]} onSave={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByRole('img', { name: 'Figure 1. A mandala.' }).getAttribute('src')).toBe(PLATE)
  })

  it('sends the picture with the question', async () => {
    await rosterThatSees()
    const fetch = relay(answered())
    await askAboutThePlate()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(sent(fetch).picture).toBe(PLATE)
  })

  it('offers only the models that can see, and never the blind one', async () => {
    await rosterThatSees()
    const fetch = relay(answered())
    await askAboutThePlate()
    await waitFor(() => expect(fetch).toHaveBeenCalled())

    const chain = sent(fetch).models as { id: string }[]
    expect(chain.map((step) => step.id)).toEqual(['seeing/one:free'])
  })

  it('sends no picture for an ordinary passage', async () => {
    await rosterThatSees()
    const fetch = relay(answered())
    render(<StudyLamp passage={passage} saved={[]} onSave={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/Which model answers/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Explain simply/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(sent(fetch).picture).toBeUndefined()
  })

  it('refuses to ask when no model on the roster can see', async () => {
    // The roster in this file is three text-only models, so this is the whole
    // default case: a plate opened on a day when nothing can read one.
    const fetch = relay(answered())
    await askAboutThePlate()

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByText(/No model on today’s list can look at a picture/)).toBeTruthy()
  })
})
