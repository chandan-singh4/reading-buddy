// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NotesPanel, type NoteRow, type WordRow } from './NotesPanel.tsx'
import styles from './NotesPanel.module.css'
import type { Anchor } from '../structure/index.ts'

function note(id: string, author: 'you' | 'claude', chapter = 1): NoteRow {
  return {
    id,
    anchor: `[ch0${chapter}-s01-p00${id}]` as Anchor,
    author,
    text: author === 'you' ? `My thought ${id}` : `Claude says ${id}`,
    chapter,
    chapterTitle: `Chapter ${chapter}`,
    page: 10 + Number(id),
    createdAt: '2026-03-14T09:00:00.000Z',
  }
}

const NOTES = [note('1', 'you'), note('2', 'claude'), note('3', 'you', 2)]

function draw(notes: NoteRow[] = NOTES, onJumpToNote = vi.fn(), onOpenThread = vi.fn()) {
  render(
    <NotesPanel notes={notes} onJumpToNote={onJumpToNote} onOpenThread={onOpenThread} />,
  )
  return { onJumpToNote, onOpenThread }
}

afterEach(cleanup)

describe('the notes tab', () => {
  it('says where notes will come from when there are none', () => {
    draw([])
    expect(screen.getByText(/No notes yet/)).toBeTruthy()
  })

  it("draws the tutor's answer as markdown, not as its marks", () => {
    /*
     * The reader's report: the Notes tab showed `**bold**` and `##` as
     * themselves. The lamp has always drawn the marks; this list was the one
     * place the same answer arrived raw.
     */
    const written = note('2', 'claude')
    written.text = '## The core teaching\n\nYou are **already** free.'
    draw([written])

    expect(screen.getByText('The core teaching')).toBeTruthy()
    expect(screen.getByText('already').tagName).toBe('STRONG')
    expect(screen.queryByText(/\*\*/)).toBeNull()
  })

  it('still opens the thread when the answer is markdown', () => {
    // The slip stopped being a `<button>` when it began holding headings and
    // lists, which a button may not contain. It must still act like one.
    const written = note('2', 'claude')
    written.text = '**Bold** and plain.'
    written.threadId = 'thread-2'
    const { onOpenThread } = draw([written])

    fireEvent.click(screen.getByRole('button', { name: /Bold and plain/ }))
    expect(onOpenThread).toHaveBeenCalledWith('thread-2')
  })

  it('gives Veda a hand of her own, apart from the reader’s', () => {
    /*
     * Two hands share this list: the reader's kept quotes in blue Caveat, and
     * Veda's answers in violet Kalam. The colours live in the stylesheet, but
     * the split that carries them is structural — the tutor's words go through
     * the markdown container, the reader's do not — so that is what is checked
     * here. If a change ever routes a quote through the same container, the two
     * hands become one and this fails.
     */
    draw([note('1', 'you'), note('2', 'claude')])

    const veda = screen.getByText('Claude says 2')
    expect(veda.closest(`.${styles.txt}`)).toBeTruthy()

    const mine = screen.getByText('My thought 1')
    expect(mine.className).toContain(styles.hand)
    expect(mine.closest(`.${styles.txt}`)).toBeNull()
  })

  it('marks Veda’s notes as Veda’s, and never the reader’s', () => {
    draw()

    expect(screen.getAllByText('✦ Veda')).toHaveLength(1)
    expect(screen.getByText('Claude says 2')).toBeTruthy()
    expect(screen.getByText('My thought 1')).toBeTruthy()
  })

  it('starts on All, with every note on the page', () => {
    draw()

    expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('My thought 1')).toBeTruthy()
    expect(screen.getByText('Claude says 2')).toBeTruthy()
  })

  it('narrows to one author', () => {
    draw()

    fireEvent.click(screen.getByRole('radio', { name: 'Veda' }))
    expect(screen.queryByText('My thought 1')).toBeNull()
    expect(screen.getByText('Claude says 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Quotes' }))
    expect(screen.getByText('My thought 1')).toBeTruthy()
    expect(screen.queryByText('Claude says 2')).toBeNull()
  })

  it('groups by chapter without hiding anything', () => {
    draw()
    // A switch beside the chips now, not a sixth chip among them.
    fireEvent.click(screen.getByRole('button', { name: 'By chapter' }))

    expect(screen.getAllByRole('heading', { level: 3 }).map((head) => head.textContent)).toEqual([
      'Chapter 1',
      'Chapter 2',
    ])
    // Every note is still there — that is what makes it a grouping, not a filter.
    expect(screen.getByText('My thought 1')).toBeTruthy()
    expect(screen.getByText('Claude says 2')).toBeTruthy()
    expect(screen.getByText('My thought 3')).toBeTruthy()
  })

  it('moves between chips with the arrow keys', () => {
    draw()

    fireEvent.keyDown(screen.getByRole('radio', { name: 'All' }), { key: 'ArrowRight' })

    expect(screen.getByRole('radio', { name: 'Quotes' }).getAttribute('aria-checked')).toBe('true')
  })

  it('jumps to the paragraph a note is about', () => {
    const { onJumpToNote } = draw()

    fireEvent.click(screen.getByText('My thought 1'))

    expect(onJumpToNote).toHaveBeenCalledWith('[ch01-s01-p001]')
  })

  it('offers no way to delete from this list', () => {
    /*
     * The reader asked for the crosses to go. Each one sat a thumb's width from
     * the note it belonged to, and pressing one took a highlight or a whole
     * conversation with no warning and no way back. Deleting is still offered
     * where the reader is already looking at the thing itself — a highlight
     * from its menu on the page, a conversation from the menu inside it.
     */
    draw()

    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
  })

  it('reopens a tutor thread instead of jumping', () => {
    const thread = { ...note('4', 'claude'), threadId: 'thread-4' }
    const { onJumpToNote, onOpenThread } = draw([...NOTES, thread])

    fireEvent.click(screen.getByText('Claude says 4'))

    expect(onOpenThread).toHaveBeenCalledWith('thread-4')
    expect(onJumpToNote).not.toHaveBeenCalled()
  })

  it('offers no way to delete a conversation from this list either', () => {
    // The row a slip of the thumb cost the most: a whole conversation.
    const thread = { ...note('4', 'claude'), threadId: 'thread-4' }
    draw([thread])

    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
  })
})

describe('Veda quotes', () => {
  function kept(id: string): NoteRow {
    return {
      ...note(id, 'claude'),
      text: 'A symbol is a picture the mind can hold.',
      fromThread: 'thread-9',
      threadId: 'thread-9',
    }
  }

  it('keeps kept lines off the Veda chip, and conversations off theirs', () => {
    /*
     * Both are Veda's, so the split has to come from `fromThread` and not from
     * the author. Without it, keeping one sentence would drop a near-copy of
     * the whole conversation into the list beside it.
     */
    draw([note('2', 'claude'), kept('4')])

    fireEvent.click(screen.getByRole('radio', { name: 'Veda' }))
    expect(screen.getByText('Claude says 2')).toBeTruthy()
    expect(screen.queryByText(/A symbol is a picture/)).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Veda’s Quotes' }))
    expect(screen.getByText(/A symbol is a picture/)).toBeTruthy()
    expect(screen.queryByText('Claude says 2')).toBeNull()
  })

  it('sends a tap on a kept line back to the conversation it came from', () => {
    // A line is worth keeping because of what it answered. A quote the reader
    // cannot get back behind is a fortune-cookie slip.
    const { onOpenThread } = draw([kept('4')])

    fireEvent.click(screen.getByRole('button', { name: /A symbol is a picture/ }))
    expect(onOpenThread).toHaveBeenCalledWith('thread-9')
  })
})

describe('arranging by chapter', () => {
  it('groups whichever chip is chosen, and is off to begin with', () => {
    /*
     * "By chapter" was a chip, which put a question about *arrangement* in a
     * row of questions about *which notes*. It also showed exactly what All
     * showed, so two of the chips looked like one button. As a switch it can do
     * the thing the chip never could: Quotes, by chapter.
     */
    draw([note('1', 'you'), note('3', 'you', 2)])

    expect(screen.queryByText('Chapter 1')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'By chapter' }))
    expect(screen.getByRole('button', { name: 'By chapter' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByText('Chapter 1')).toBeTruthy()
    expect(screen.getByText('Chapter 2')).toBeTruthy()
  })

  it('is not offered over the kept words, which belong to no chapter', () => {
    draw()

    fireEvent.click(screen.getByRole('radio', { name: 'Words' }))
    expect(screen.queryByRole('button', { name: 'By chapter' })).toBeNull()
  })
})

describe('the words tab', () => {
  /*
   * The 2026-08-24 question: "Save word saves it — but where do I see them?"
   * Nowhere, until this tab. A button that keeps something the reader can never
   * find again is worse than no button.
   */
  const WORDS: WordRow[] = [
    { word: 'fundamental', gloss: 'serving as an original source', savedAt: '2026-08-24T10:00:00.000Z' },
    { word: 'palimpsest', savedAt: '2026-08-23T10:00:00.000Z' },
  ]

  function drawWords(words: WordRow[], onDefineWord = vi.fn()) {
    render(
      <NotesPanel
        notes={NOTES}
        onJumpToNote={vi.fn()}
        words={words}
        onDefineWord={onDefineWord}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Words' }))
    return { onDefineWord }
  }

  it('lists the kept words, with the meaning under each', () => {
    drawWords(WORDS)
    expect(screen.getByText('fundamental')).toBeTruthy()
    expect(screen.getByText('serving as an original source')).toBeTruthy()
    expect(screen.getByText('palimpsest')).toBeTruthy()
  })

  it('opens the loupe again on a word the reader taps', () => {
    const { onDefineWord } = drawWords(WORDS)
    fireEvent.click(screen.getByText('fundamental'))
    expect(onDefineWord).toHaveBeenCalledWith('fundamental')
  })

  it('says how words get here, rather than talking about notes', () => {
    // The notes list is not empty. Reusing its sentence would tell a reader
    // with three notes and no words that they have no notes.
    drawWords([])
    expect(screen.getByText(/No words kept yet/)).toBeTruthy()
    expect(screen.queryByText(/No notes/)).toBeNull()
  })

  it('hides the notes while it is showing words', () => {
    drawWords(WORDS)
    expect(screen.queryByText('My thought 1')).toBeNull()
  })
})

