// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PaceHorizon } from './PaceHorizon.tsx'

afterEach(cleanup)

const WEEK = [65, 40, 25, 30, 55, 90, 77]

function show(props: Partial<Parameters<typeof PaceHorizon>[0]> = {}) {
  return render(
    <PaceHorizon
      historicalMinutes={WEEK}
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

  it('draws a curve through every day of the week', () => {
    const { container } = show()
    // Six cubic segments join seven points.
    const line = paths(container).find((d) => d.startsWith('M 0 ') && d.includes('C'))
    expect(line?.match(/C /g)).toHaveLength(WEEK.length - 1)
  })

  it('carries the line on to a milestone at the far right', () => {
    const { container } = show()
    const projection = paths(container).filter((d) => d.endsWith('100 24') || / 100 /.test(d))
    expect(projection.length).toBeGreaterThan(0)
  })

  it('survives a reader with one day of history and no week to draw', () => {
    const { container } = show({ historicalMinutes: [] })
    expect(screen.getByText('Sep 18')).toBeTruthy()
    // No NaN anywhere in the geometry — one bad number blanks the whole SVG.
    for (const d of paths(container)) expect(d).not.toMatch(/NaN/)
  })

  it('draws a flat week without dividing by zero', () => {
    const { container } = show({ historicalMinutes: [0, 0, 0, 0, 0, 0, 0] })
    for (const d of paths(container)) expect(d).not.toMatch(/NaN/)
  })
})
