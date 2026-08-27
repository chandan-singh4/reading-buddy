import { describe, expect, it } from 'vitest'

import { claimNodes } from './claimNodes.ts'

/*
 * The parser is the one piece of this feature that will one day be handed text
 * written by a model rather than by us. So the cases that matter most are the
 * ones about what it *refuses* to understand.
 */

describe('claimNodes', () => {
  it('leaves plain text alone', () => {
    expect(claimNodes('A sentence.')).toEqual([{ kind: 'text', text: 'A sentence.' }])
  })

  it('pulls emphasis out of the middle of a sentence', () => {
    expect(claimNodes('they can look <em>forward</em> too')).toEqual([
      { kind: 'text', text: 'they can look ' },
      { kind: 'em', text: 'forward' },
      { kind: 'text', text: ' too' },
    ])
  })

  it('reads a concept named mid-sentence as a link', () => {
    expect(claimNodes('his <a class="link">unconscious</a> flagging it')).toEqual([
      { kind: 'text', text: 'his ' },
      { kind: 'link', text: 'unconscious' },
      { kind: 'text', text: ' flagging it' },
    ])
  })

  it('handles both tags in one claim, in order', () => {
    const nodes = claimNodes('<em>a</em> then <a class="link">b</a>')
    expect(nodes.map((node) => node.kind)).toEqual(['em', 'text', 'link'])
  })

  it('does not run past the end of a tag', () => {
    // A greedy match would swallow "one</em> and <em>two" as a single node.
    expect(claimNodes('<em>one</em> and <em>two</em>')).toEqual([
      { kind: 'em', text: 'one' },
      { kind: 'text', text: ' and ' },
      { kind: 'em', text: 'two' },
    ])
  })

  it('treats every tag it does not know as plain text', () => {
    // The whole point. A model that returns more than it was asked for gets
    // its extra markup shown to the reader as characters, not executed.
    const nodes = claimNodes('safe <script>alert(1)</script> text')
    expect(nodes).toEqual([{ kind: 'text', text: 'safe <script>alert(1)</script> text' }])
  })

  it('does not treat a bare anchor as a concept link', () => {
    // Only `<a class="link">` is understood. An anchor with an href is markup
    // we did not ask for, so it stays text.
    const nodes = claimNodes('see <a href="http://x">this</a>')
    expect(nodes).toEqual([{ kind: 'text', text: 'see <a href="http://x">this</a>' }])
  })

  it('returns nothing for an empty claim', () => {
    expect(claimNodes('')).toEqual([])
  })
})
