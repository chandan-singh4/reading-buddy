// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NotesPanel, type NoteRow } from './NotesPanel.tsx'
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

  it('marks Claude’s notes as Claude’s, and never the reader’s', () => {
    draw()

    expect(screen.getAllByText('✦ Claude')).toHaveLength(1)
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

    fireEvent.click(screen.getByRole('radio', { name: 'Claude' }))
    expect(screen.queryByText('My thought 1')).toBeNull()
    expect(screen.getByText('Claude says 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Quotes' }))
    expect(screen.getByText('My thought 1')).toBeTruthy()
    expect(screen.queryByText('Claude says 2')).toBeNull()
  })

  it('groups by chapter without hiding anything', () => {
    draw()
    fireEvent.click(screen.getByRole('radio', { name: 'By chapter' }))

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
