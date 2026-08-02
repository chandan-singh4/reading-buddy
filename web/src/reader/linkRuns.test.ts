/**
 * Cutting a paragraph into text and links. Every bug here shows up as
 * underlining the wrong words, so the offsets are tested directly.
 */

import { describe, expect, it } from 'vitest'

import type { Anchor, Paragraph } from '../structure/index.ts'
import { lineRunsOf, runsOf } from './linkRuns.ts'

function block(text: string, links?: Paragraph['links']): Paragraph {
  const paragraph: Paragraph = { anchor: '[ch01-s01-p001]' as Anchor, text, kind: 'prose' }
  if (links) paragraph.links = links
  return paragraph
}

const target = '[ch02-s01-p005]' as Anchor

describe('splitting a paragraph around its links', () => {
  it('leaves a paragraph with no links in one piece', () => {
    expect(runsOf(block('Plain prose.'))).toEqual([{ text: 'Plain prose.' }])
  })

  it('cuts text, link, text', () => {
    const runs = runsOf(block('See the note here.', [{ start: 4, end: 12, anchor: target }]))

    expect(runs.map((run) => run.text)).toEqual(['See ', 'the note', ' here.'])
    expect(runs[1].link?.anchor).toBe(target)
    expect(runs[0].link).toBeUndefined()
  })

  it('handles a link at the very start and the very end', () => {
    expect(runsOf(block('ab', [{ start: 0, end: 2, anchor: target }])).map((r) => r.text)).toEqual([
      'ab',
    ])
  })

  it('keeps two links in reading order', () => {
    const runs = runsOf(
      block('one two three', [
        { start: 8, end: 13, anchor: target },
        { start: 0, end: 3, anchor: target },
      ]),
    )

    expect(runs.map((run) => run.text)).toEqual(['one', ' two ', 'three'])
  })

  it('ignores a range that runs past the end of the text', () => {
    // A book imported by an older build, or a parser bug. Slicing blindly would
    // silently underline to the end of the paragraph.
    const runs = runsOf(block('short', [{ start: 2, end: 900, anchor: target }]))

    expect(runs.map((run) => run.text).join('')).toBe('short')
    expect(runs.every((run) => run.text.length > 0)).toBe(true)
  })

  it('drops a link that overlaps one already placed', () => {
    // Not something well-formed markup produces, but rendering two links over
    // the same words lets the later one win by accident.
    const runs = runsOf(
      block('one two three', [
        { start: 0, end: 7, anchor: target },
        { start: 4, end: 13, anchor: target },
      ]),
    )

    expect(runs.map((run) => run.text).join('')).toBe('one two three')
    expect(runs.filter((run) => run.link)).toHaveLength(1)
  })

  it('ignores an empty or backwards range', () => {
    expect(runsOf(block('text', [{ start: 2, end: 2, anchor: target }]))).toEqual([
      { text: 'text' },
    ])
    expect(runsOf(block('text', [{ start: 3, end: 1, anchor: target }]))).toEqual([
      { text: 'text' },
    ])
  })
})

describe('cutting runs into lines', () => {
  it('gives each list item its own runs', () => {
    // A contents page arrives as one block, one entry per line, with a link on
    // each. The renderer needs them grouped per item to draw a <li> each.
    const runs = lineRunsOf(
      block('• One\n• Two', [
        { start: 2, end: 5, anchor: target },
        { start: 8, end: 11, anchor: target },
      ]),
    )

    expect(runs).toHaveLength(2)
    expect(runs[0].map((run) => run.text).join('')).toBe('• One')
    expect(runs[1].map((run) => run.text).join('')).toBe('• Two')
    expect(runs.every((line) => line.some((run) => run.link))).toBe(true)
  })

  it('keeps a plain list as lines with no links', () => {
    expect(lineRunsOf(block('• One\n• Two', []))).toEqual([[{ text: '• One' }], [{ text: '• Two' }]])
  })

  it('drops a blank line rather than drawing an empty item', () => {
    expect(lineRunsOf(block('One\n\nTwo', []))).toHaveLength(2)
  })

  it('carries a link that ends exactly on the line break', () => {
    const runs = lineRunsOf(block('One\nTwo', [{ start: 0, end: 3, anchor: target }]))

    expect(runs).toHaveLength(2)
    expect(runs[0]).toEqual([{ text: 'One', link: { start: 0, end: 3, anchor: target } }])
    expect(runs[1]).toEqual([{ text: 'Two' }])
  })
})
