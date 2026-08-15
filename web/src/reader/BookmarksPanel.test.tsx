// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BookmarksPanel, type BookmarkRow } from './BookmarksPanel.tsx'
import type { Anchor } from '../structure/index.ts'

function row(id: string, page: number | null, chapter = 1): BookmarkRow {
  return {
    id,
    anchor: `[ch0${chapter}-s01-p00${id}]` as Anchor,
    label: `Passage ${id}`,
    chapter,
    chapterTitle: `Chapter ${chapter}`,
    page,
    savedAt: '2026-03-14T09:00:00.000Z',
  }
}

function draw(bookmarks: BookmarkRow[], handlers: Partial<Parameters<typeof BookmarksPanel>[0]> = {}) {
  return render(
    <BookmarksPanel
      bookmarks={bookmarks}
      onJumpToBookmark={handlers.onJumpToBookmark ?? vi.fn()}
      onRenameBookmark={handlers.onRenameBookmark ?? vi.fn()}
      onDeleteBookmark={handlers.onDeleteBookmark ?? vi.fn()}
    />,
  )
}

afterEach(cleanup)

describe('the bookmarks tab', () => {
  it('says how to make one when there are none', () => {
    draw([])
    expect(screen.getByText(/No bookmarks yet/)).toBeTruthy()
  })

  it('rests furled, and unfurls the row you tap', () => {
    draw([row('1', 12), row('2', 40)])

    const first = screen.getAllByRole('button', { expanded: false })[0]!
    expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0)

    fireEvent.click(first)
    expect(first.getAttribute('aria-expanded')).toBe('true')
  })

  it('furls the open row when another is opened', () => {
    draw([row('1', 12), row('2', 40)])
    const [first, second] = screen.getAllByRole('button', { expanded: false })

    fireEvent.click(first!)
    fireEvent.click(second!)

    expect(first!.getAttribute('aria-expanded')).toBe('false')
    expect(second!.getAttribute('aria-expanded')).toBe('true')
  })

  it('furls again when the open row is tapped a second time', () => {
    draw([row('1', 12)])
    const head = screen.getByRole('button', { expanded: false })

    fireEvent.click(head)
    fireEvent.click(head)

    expect(head.getAttribute('aria-expanded')).toBe('false')
  })

  it('offers the page by number, and jumps to the anchor', () => {
    const onJumpToBookmark = vi.fn()
    draw([row('1', 91)], { onJumpToBookmark })

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 91' }))

    expect(onJumpToBookmark).toHaveBeenCalledWith('[ch01-s01-p001]')
  })

  it('drops the page number for a book that has none', () => {
    draw([row('1', null)])
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    expect(screen.getByRole('button', { name: 'Go to this page' })).toBeTruthy()
  })

  it('keeps rename and remove, inside the opened row', () => {
    const onDeleteBookmark = vi.fn()
    draw([row('1', 12)], { onDeleteBookmark })

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Passage 1' }))

    expect(onDeleteBookmark).toHaveBeenCalledWith('1')
  })
})
