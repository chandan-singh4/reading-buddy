import { describe, expect, it } from 'vitest'

import { isRunningHead } from './runningHead.ts'

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
