/**
 * Reading a word's descent out of MW's prose.
 *
 * The golden case is `fundamental`, from the build brief. The rest of this file
 * is about the etymologies that do *not* fit the pattern, because those are the
 * majority and the whole design rests on them degrading quietly.
 */

import { describe, expect, it } from 'vitest'

import { kinIn, parseEtymology } from './etymology.ts'

/** MW's own `et` text for `fundamental`, markup and all. */
const FUNDAMENTAL =
  'Middle English, borrowed from Late Latin {it}fundāmentālis{/it} "serving as a foundation," ' +
  'from Latin {it}fundāmentum{/it} "foundation, basis" + {it}-ālis{/it} {it}-al{/it}'

describe('the golden case', () => {
  const built = parseEtymology(FUNDAMENTAL, 'fundamental', '15th century, in the meaning defined at sense 1b')

  it('runs oldest to newest, ending at the word the reader tapped', () => {
    expect(built.chain.map((node) => node.root)).toEqual([
      'fundāmentum',
      '-ālis',
      'fundāmentālis',
      'fundamental',
    ])
  })

  it('keeps the two halves of a compound in the order they were written', () => {
    /*
     * `fundāmentum + -ālis` is one generation, not two. The hops around it are
     * reversed; the halves inside it are not, because neither came from the
     * other — they were joined.
     */
    const roots = built.chain.map((node) => node.root)
    expect(roots.indexOf('fundāmentum')).toBeLessThan(roots.indexOf('-ālis'))
  })

  it('labels each root with its language', () => {
    expect(built.chain.map((node) => node.lang)).toEqual([
      'Latin',
      'suffix',
      'Late Latin',
      'Middle English · 15th century',
    ])
  })

  it('carries the meanings across, without their trailing commas', () => {
    expect(built.chain[0]?.gloss).toBe('foundation, basis')
    expect(built.chain[2]?.gloss).toBe('serving as a foundation')
  })

  it('reads a suffix’s meaning from the italics when there are no quotes', () => {
    // MW writes `{it}-ālis{/it} {it}-al{/it}` — no quotation marks anywhere.
    expect(built.chain[1]?.gloss).toBe('-al')
  })

  it('cuts the date back to the part a reader wants', () => {
    expect(built.firstUse).toBe('15th century')
  })

  it('builds a chain rather than falling back to prose', () => {
    expect(built.prose).toBeUndefined()
  })
})

describe('an etymology that does not fit the pattern', () => {
  it('falls back to prose rather than inventing a chain', () => {
    // "of uncertain origin" is a whole category of MW entry and there is
    // nothing in it to split.
    const built = parseEtymology('origin unknown', 'of', '12th century')
    expect(built.chain).toEqual([])
    expect(built.prose).toBe('origin unknown')
  })

  it('falls back when there is only one hop', () => {
    /*
     * One root is a fact, not a descent. Drawing it as a chain would give the
     * reader a line with a single dot on it and the headword under it, which
     * says less than the sentence it was made from.
     */
    const built = parseEtymology('borrowed from Latin {it}focus{/it} "hearth"', 'focus')
    expect(built.chain).toEqual([])
    expect(built.prose).toContain('focus')
  })

  it('keeps the first-use date even when the chain could not be built', () => {
    const built = parseEtymology('origin unknown', 'of', '12th century, in the meaning defined above')
    expect(built.firstUse).toBe('12th century')
  })

  it('never lets a raw token through, chain or prose', () => {
    const built = parseEtymology(
      'Middle English {it}bond{/it}, alteration of {sx|band||} {bc} see {dx}there{/dx}',
      'bond',
    )
    const said = JSON.stringify(built)
    expect(said).not.toMatch(/\{[a-z_]+/i)
  })

  it('handles an empty etymology without throwing', () => {
    expect(parseEtymology('', 'word').chain).toEqual([])
    expect(parseEtymology('', 'word').prose).toBeUndefined()
  })
})

describe('the “more at” line', () => {
  it('reads the kin off the raw text', () => {
    const built = parseEtymology(
      'Middle English, borrowed from Late Latin {it}fundāmentālis{/it} "of a foundation," ' +
        'from Latin {it}fundāmentum{/it} "a foundation" {ma}found{/ma}',
      'fundamental',
    )
    expect(built.kin).toEqual(['found'])
  })

  it('splits several kin apart', () => {
    expect(kinIn('{ma}found, founder and profound{/ma}')).toEqual(['found', 'founder', 'profound'])
  })

  it('keeps the kin out of the chain’s glosses', () => {
    // The `{ma}` block sits mid-sentence. Left in, "more at FOUND" would be
    // read as part of the meaning of the root before it.
    const built = parseEtymology(
      'borrowed from Latin {it}fundāmentum{/it} "a foundation" {ma}found{/ma}, ' +
        'from {it}fundāre{/it} "to lay a base"',
      'fundament',
    )
    for (const node of built.chain) expect(node.gloss ?? '').not.toMatch(/found\b.*found/)
  })
})

describe('the splitting itself', () => {
  it('does not cut a gloss that contains the word “from”', () => {
    /*
     * The failure this guards is silent and ugly: the gloss is severed at
     * "from", its tail becomes a hop of its own, and a root that never existed
     * appears in the chain.
     */
    const built = parseEtymology(
      'Middle English, borrowed from Latin {it}excidere{/it} "to fall from a height," ' +
        'from Latin {it}cadere{/it} "to fall"',
      'excide',
    )
    expect(built.chain.map((node) => node.root)).toEqual(['cadere', 'excidere', 'excide'])
    expect(built.chain[1]?.gloss).toBe('to fall from a height')
  })

  it('reads “going back to”, which MW uses as often as “from”', () => {
    const built = parseEtymology(
      'Middle English {it}nyce{/it} "foolish," going back to Old French {it}nice{/it} "simple," ' +
        'going back to Latin {it}nescius{/it} "ignorant"',
      'nice',
    )
    expect(built.chain.map((node) => node.root)).toEqual(['nescius', 'nice', 'nyce', 'nice'])
  })

  it('drops a hedge from the language label', () => {
    const built = parseEtymology(
      'borrowed from probably Old French {it}bougette{/it} "little bag," ' +
        'from Latin {it}bulga{/it} "leather sack"',
      'budget',
    )
    expect(built.chain[0]?.lang).toBe('Latin')
    expect(built.chain[1]?.lang).toBe('Old French')
  })
})
