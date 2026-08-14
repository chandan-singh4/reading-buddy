import { describe, expect, it } from 'vitest'

import { isRunningHead, stripRunningHeads } from './runningHead.ts'

describe('running heads left behind by the print edition', () => {
  it('recognises a label with the page number after it', () => {
    expect(isRunningHead('Introduction | 7')).toBe(true)
  })

  it('recognises a page number with the label after it', () => {
    // The other side of the spread, from the same book.
    expect(isRunningHead('6 | You Are the One You’ve Been Waiting For')).toBe(true)
  })

  it('recognises a bare page number', () => {
    expect(isRunningHead('7')).toBe(true)
    expect(isRunningHead('199')).toBe(true)
  })

  it('recognises roman front-matter numbering beside a label', () => {
    expect(isRunningHead('Preface | vii')).toBe(true)
  })

  it('takes the bars a typesetter actually uses', () => {
    expect(isRunningHead('Chapter One • 24')).toBe(true)
    expect(isRunningHead('12 · Breath')).toBe(true)
  })
})

describe('what it deliberately leaves alone', () => {
  it('leaves a bare roman numeral, which is far more often a word', () => {
    expect(isRunningHead('I')).toBe(false)
    expect(isRunningHead('MIX')).toBe(false)
  })

  it('leaves a sentence that happens to contain a bar', () => {
    expect(isRunningHead('The command is `ls | wc -l` on 3.')).toBe(false)
  })

  it('leaves anything that ends like a sentence', () => {
    expect(isRunningHead('7 | And then it was over.')).toBe(false)
  })

  it('leaves a dash, which real prose uses constantly', () => {
    // Books whose running heads use a dash keep them — see the module note.
    expect(isRunningHead('1962 — a bad year')).toBe(false)
    expect(isRunningHead('Introduction - 7')).toBe(false)
  })

  it('leaves a long line, however it is punctuated', () => {
    const long = `7 | ${'a line that simply goes on and on and on and on and on, far past anything a printer would set in a margin'}`
    expect(long.length).toBeGreaterThan(80)
    expect(isRunningHead(long)).toBe(false)
  })

  it('leaves a number range, which is not a head', () => {
    expect(isRunningHead('7 | 9')).toBe(false)
  })

  it('leaves what is left of a table row', () => {
    expect(isRunningHead('Name | Age | 7')).toBe(false)
  })

  it('leaves ordinary prose', () => {
    expect(isRunningHead('There is another way, and we will explore it')).toBe(false)
    expect(isRunningHead('')).toBe(false)
  })
})

describe('running heads glued to the paragraph below them', () => {
  const block = (text: string) => ({ kind: 'prose', text })

  it('strips the head off the front of the prose it was joined to', () => {
    // The real shape, from You Are the One You've Been Waiting For: on a verso
    // page the head sits above a sentence continuing from the page before, so
    // the converter emits one paragraph rather than two.
    const blocks = [
      block('8 | You Are the One You’ve Been Waiting For or distract from the pain and emptiness.'),
      block('10 | You Are the One You’ve Been Waiting For desperately desired.'),
    ]
    expect(stripRunningHeads(blocks).map((b) => b.text)).toEqual([
      'or distract from the pain and emptiness.',
      'desperately desired.',
    ])
  })

  it('takes roman front-matter numbering too', () => {
    const blocks = [
      block('x | You Are the One You’ve Been Waiting For The Power of Exiles'),
      block('8 | You Are the One You’ve Been Waiting For or distract from the pain.'),
    ]
    expect(stripRunningHeads(blocks).map((b) => b.text)).toEqual([
      'The Power of Exiles',
      'or distract from the pain.',
    ])
  })

  it('leaves a single occurrence alone, because one is a coincidence', () => {
    const blocks = [block('8 | You Are the One You’ve Been Waiting For or distract from the pain.')]
    expect(stripRunningHeads(blocks).map((b) => b.text)).toEqual([
      '8 | You Are the One You’ve Been Waiting For or distract from the pain.',
    ])
  })

  it('leaves paragraphs that share no text after the number', () => {
    const blocks = [
      block('7 | and then the argument turns.'),
      block('9 | but nothing in it repeats.'),
    ]
    expect(stripRunningHeads(blocks).map((b) => b.text)).toEqual([
      '7 | and then the argument turns.',
      '9 | but nothing in it repeats.',
    ])
  })

  it('leaves a block that is nothing but the head, for the page break to keep', () => {
    const blocks = [
      block('8 | You Are the One You’ve Been Waiting For'),
      block('10 | You Are the One You’ve Been Waiting For desperately desired.'),
    ]
    expect(stripRunningHeads(blocks)[0]!.text).toBe('8 | You Are the One You’ve Been Waiting For')
  })

  it('does not touch headings or other kinds', () => {
    const blocks = [
      { kind: 'heading', text: '8 | You Are the One You’ve Been Waiting For and more' },
      block('8 | You Are the One You’ve Been Waiting For or distract.'),
      block('10 | You Are the One You’ve Been Waiting For desperately.'),
    ]
    expect(stripRunningHeads(blocks)[0]!.text).toBe(
      '8 | You Are the One You’ve Been Waiting For and more',
    )
  })
})
