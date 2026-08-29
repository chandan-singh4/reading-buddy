// @vitest-environment jsdom
//
// The day's commit log. The cases here are the ones that decide whether the
// feed reads as a record or as bookkeeping.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import DayLog, { heading, span, spell } from './DayLog.tsx'
import type { DayActivity, ReadingSession } from './gather.ts'
import type { BookId } from '../structure/index.ts'

afterEach(cleanup)

const at = (h: number, m: number): number => new Date(2026, 7, 28, h, m).getTime()

const line = (over: Partial<ReadingSession> = {}): ReadingSession => ({
  id: `s${Math.random()}`,
  bookId: 'b1' as BookId,
  startTime: at(20, 48),
  endTime: at(21, 50),
  durationMinutes: 63,
  chapterTitle: 'Part 1: Approaching the Unconscious',
  sectionTitle: undefined,
  highlightCount: 0,
  chatCount: 0,
  qaCount: 0,
  micro: false,
  ...over,
})

const day = (sessions: ReadingSession[]): DayActivity => ({
  date: '2026-08-28',
  totalMinutes: 63,
  books: [
    {
      bookId: 'b1' as BookId,
      bookTitle: 'Man and His Symbols',
      author: 'Carl G. Jung',
      totalMinutes: 63,
      sessions,
    },
  ],
})

describe('spell', () => {
  it('says under a minute rather than zero', () => {
    // "0 min" reads as a bug. The sitting was real, it was just short.
    expect(spell(0)).toBe('<1 min')
  })

  it('reaches for hours only once there are hours', () => {
    expect(spell(43)).toBe('43 min')
    expect(spell(63)).toBe('1h 3m')
    expect(spell(120)).toBe('2h')
  })
})

describe('span', () => {
  it('gives both ends of an ordinary sitting', () => {
    expect(span(line())).toBe('8:48 pm – 9:50 pm')
  })

  it('names the day a sitting ended when it ran past midnight', () => {
    // The reader started twenty minutes before midnight and read through it.
    // The session is filed under the 28th, which is right — but the card must
    // not leave "11:41 pm – 12:25 am" looking like a session that went
    // backwards.
    const overran = line({
      startTime: new Date(2026, 7, 28, 23, 41).getTime(),
      endTime: new Date(2026, 7, 29, 0, 25).getTime(),
    })
    expect(span(overran)).toBe('11:41 pm – 12:25 am · Aug 29')
  })

  it('is not fooled by a sitting that merely lasts a long time', () => {
    const long = line({
      startTime: new Date(2026, 7, 28, 9, 0).getTime(),
      endTime: new Date(2026, 7, 28, 14, 0).getTime(),
    })
    expect(span(long)).toBe('9:00 am – 2:00 pm')
  })
})

describe('heading', () => {
  it('drops a chapter that only repeats the book’s own name', () => {
    const repeated = line({ chapterTitle: 'Walden', sectionTitle: 'Economy' })
    expect(heading(repeated, 'Walden')).toBe('Economy')
  })

  it('joins the chapter and the section when they differ', () => {
    expect(heading(line({ sectionTitle: 'The analysis of dreams' }), 'Man and His Symbols')).toBe(
      'Part 1: Approaching the Unconscious · The analysis of dreams',
    )
  })

  it('drops an author glued to the end of a chapter heading', () => {
    // Real EPUB heading, from the reader's own book. The author line sits
    // directly above it, so saying it twice is the book's habit, not a fact.
    const glued = line({ chapterTitle: 'Part 1: Approaching the Unconscious Carl G. Jung' })
    expect(heading(glued, 'Man and His Symbols', 'Carl G. Jung')).toBe(
      'Part 1: Approaching the Unconscious',
    )
  })

  it('leaves a chapter alone when the author is only in the middle of it', () => {
    const about = line({ chapterTitle: 'What Carl G. Jung got wrong' })
    expect(heading(about, 'A Life', 'Carl G. Jung')).toBe('What Carl G. Jung got wrong')
  })

  it('still says something for a session recorded before places were tracked', () => {
    expect(heading(line({ chapterTitle: undefined }), 'Man and His Symbols')).toBe('Reading')
  })
})

/** The rendered diff line, whose parts are separate elements so Veda can be violet. */
function diff(one: ReadingSession): string {
  const { container } = render(<DayLog day={day([one])} />)
  return container.querySelectorAll('li > div > div')[1].textContent ?? ''
}

describe('DayLog', () => {
  it('heads the group with the book and its author', () => {
    render(<DayLog day={day([line()])} />)
    expect(screen.getByRole('heading', { name: 'Man and His Symbols' })).toBeTruthy()
    expect(screen.getByText('Carl G. Jung')).toBeTruthy()
  })

  it('leaves an empty count out rather than printing a zero', () => {
    expect(diff(line({ highlightCount: 2 }))).toBe('1h 3m · 2 highlights')
  })

  it('reads as a diff: what was marked and what was asked', () => {
    expect(diff(line({ highlightCount: 2, chatCount: 3, qaCount: 11 }))).toBe(
      '1h 3m · 2 highlights · 3 chats with Veda · 11 Q&A',
    )
  })

  it('says one chat, not one chats', () => {
    expect(diff(line({ chatCount: 1, qaCount: 1 }))).toBe('1h 3m · 1 chat with Veda · 1 Q&A')
  })

  it('leaves the Q&A count out when there were no chats to attach it to', () => {
    expect(diff(line({ qaCount: 4 }))).toBe('1h 3m')
  })

  it('squashes the micro-sessions, and opens them when asked', () => {
    const sessions = [
      line(),
      line({ id: 'm1', durationMinutes: 0, micro: true, startTime: at(22, 19) }),
      line({ id: 'm2', durationMinutes: 0, micro: true, startTime: at(22, 20) }),
    ]
    render(<DayLog day={day(sessions)} />)

    const squashed = screen.getByRole('button', { name: /2 micro-sessions/ })
    expect(screen.getAllByText(/·/)).toHaveLength(1)

    fireEvent.click(squashed)

    // Nothing was thrown away — a squashed commit is still in the history.
    expect(screen.queryByRole('button', { name: /squashed/ })).toBeNull()
    expect(screen.getAllByText('<1 min')).toHaveLength(2)
  })

  it('says so in the summary when the day ran past midnight', () => {
    const overran = line({
      startTime: new Date(2026, 7, 28, 23, 41).getTime(),
      endTime: new Date(2026, 7, 29, 0, 25).getTime(),
    })
    render(<DayLog day={day([overran])} />)
    expect(screen.getByText(/ran past midnight/)).toBeTruthy()
  })

  it('does not say it for a day that stayed inside itself', () => {
    render(<DayLog day={day([line()])} />)
    expect(screen.queryByText(/ran past midnight/)).toBeNull()
  })

  it('draws nothing at all for a day with no reading', () => {
    const { container } = render(<DayLog day={undefined} />)
    expect(container.innerHTML).toBe('')
  })
})
