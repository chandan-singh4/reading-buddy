// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PaceHorizon } from './PaceHorizon.tsx'

afterEach(cleanup)

/* A week of reading as the trajectory records it: the day, and how far through
   the book the reader was at the end of it. */
const PATH = [
  { day: 0, percent: 4 },
  { day: 1, percent: 9 },
  { day: 2, percent: 11 },
  { day: 3, percent: 14 },
  { day: 4, percent: 20 },
  { day: 5, percent: 25 },
  { day: 6, percent: 28 },
]

function show(props: Partial<Parameters<typeof PaceHorizon>[0]> = {}) {
  return render(
    <PaceHorizon
      progress={PATH}
      projectedDays={18}
      estimatedFinishDate="Sep 18"
      pacePerDay="77m / day"
      status="ahead"
      {...props}
    />,
  )
}

function paths(container: HTMLElement): string[] {
  return [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '')
}

describe('the pace horizon', () => {
  it('says the two things the reader came for', () => {
    show()
    expect(screen.getByText('Sep 18')).toBeTruthy()
    expect(screen.getByText('77m / day')).toBeTruthy()
    expect(screen.getByText('Est. finish (18d)')).toBeTruthy()
  })

  // The reader asked for the rate alone. "7-day pace" told them how the number
  // was worked out, which is a question they were not asking.
  it('does not explain the pace it prints', () => {
    show()
    expect(screen.queryByText(/7-day pace/)).toBeNull()
    expect(screen.queryByText(/All-time pace/)).toBeNull()
  })

  it('names the pacing status in words, not only in colour', () => {
    show({ status: 'on_track' })
    expect(screen.getByText('On track')).toBeTruthy()
  })

  it('draws a curve through every day the reader has read', () => {
    const { container } = show()
    // Six cubic segments join seven points.
    const line = paths(container).find((d) => d.startsWith('M 0 ') && d.includes('C'))
    expect(line?.match(/C /g)).toHaveLength(PATH.length - 1)
  })

  /* The details page plots percent against days and only ever climbs. This is
     the same chart made small, so it must climb too — an earlier version drew
     minutes per day, which rose and fell, and the two screens then disagreed
     about the shape of one book. */
  it('climbs, the way the chart on the details page climbs', () => {
    const { container } = show()
    const line = paths(container).find((d) => d.startsWith('M 0 ') && d.includes('C'))!
    const ys = [...line.matchAll(/, (-?[\d.]+), (-?[\d.]+), (-?[\d.]+) (-?[\d.]+)/g)].map((m) =>
      Number(m[4]),
    )
    // Y grows downward in an SVG, so a rising line is a falling number.
    for (let i = 1; i < ys.length; i += 1) expect(ys[i]!).toBeLessThanOrEqual(ys[i - 1]!)
  })

  it('ends the projection at the top of the book, not at the pace', () => {
    const { container } = show()
    const projection = paths(container).find((d) => d.endsWith(' 100 4'))
    expect(projection).toBeTruthy()
  })

  it('survives a reader on their first day, with no line to draw yet', () => {
    const { container } = show({ progress: [] })
    expect(screen.getByText('Sep 18')).toBeTruthy()
    // No NaN anywhere in the geometry — one bad number blanks the whole SVG.
    for (const d of paths(container)) expect(d).not.toMatch(/NaN/)
  })

  it('survives a finish forecast for today, with no days left to span', () => {
    const { container } = show({ projectedDays: 0 })
    for (const d of paths(container)) expect(d).not.toMatch(/NaN/)
  })
})
