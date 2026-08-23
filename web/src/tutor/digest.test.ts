/**
 * The block arithmetic and the staleness rules.
 *
 * These are the numbers that decide how many paid model calls a chapter costs,
 * and a mistake in them is invisible: a wrong cut still produces a plausible
 * recap, it just charges twice for it, or quietly recaps a page the reader has
 * not turned. So the rules are pinned here rather than trusted.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  BLOCK_MAX,
  buildDigest,
  confusionMaterial,
  MERGE_TAIL_UNDER,
  NOTHING_YET,
  NO_DIGEST_UNDER,
  planBlocks,
  proseOf,
  work,
  type BuiltDigest,
  type MemoryModule,
} from './digest.ts'
import type { ChapterIndexEntry, SectionPath } from '../structure/index.ts'

/** A chapter index entry, as much of one as the block planner reads. */
function entry(section: number, words: number): ChapterIndexEntry {
  return {
    section,
    words,
    path: `ch01/s${String(section).padStart(2, '0')}` as SectionPath,
  }
}

/** `count` sections of `words` each, numbered from 1. */
function chapter(count: number, words: number): ChapterIndexEntry[] {
  return Array.from({ length: count }, (_, i) => entry(i + 1, words))
}

describe('planBlocks', () => {
  it('gives a bare heading no digest at all', () => {
    expect(planBlocks([entry(1, NO_DIGEST_UNDER - 1)])).toEqual([])
  })

  it('digests a chapter that just clears the floor', () => {
    expect(planBlocks([entry(1, NO_DIGEST_UNDER)])).toHaveLength(1)
  })

  it('keeps a short chapter in one block, so there is nothing to stitch', () => {
    const blocks = planBlocks(chapter(4, 500))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.words).toBe(2000)
    expect(blocks[0]?.through).toBe(4)
  })

  it('cuts a long chapter, and no block runs over the cap', () => {
    const blocks = planBlocks(chapter(10, 1500))
    expect(blocks.length).toBeGreaterThan(1)
    for (const block of blocks) expect(block.words).toBeLessThanOrEqual(BLOCK_MAX)
  })

  it('loses no section when it cuts', () => {
    const blocks = planBlocks(chapter(10, 1500))
    expect(blocks.flatMap((block) => block.paths)).toHaveLength(10)
    expect(blocks[blocks.length - 1]?.through).toBe(10)
  })

  it('lets one huge section be its own oversized block rather than dropping it', () => {
    const blocks = planBlocks([entry(1, BLOCK_MAX * 3)])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.words).toBe(BLOCK_MAX * 3)
  })

  it('counts a section with no stored word count as nothing, but still keeps it', () => {
    const blocks = planBlocks([entry(1, 1000), { section: 2, path: 'ch01/s02' as SectionPath }])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.paths).toHaveLength(2)
    expect(blocks[0]?.words).toBe(1000)
  })

  it('folds a scrap of a last block into the one before it', () => {
    // 4,000 then 100: without the merge the scrap costs a whole model call.
    const blocks = planBlocks([entry(1, BLOCK_MAX), entry(2, MERGE_TAIL_UNDER - 1)])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.through).toBe(2)
  })

  it('leaves a last block alone when it is big enough to be worth a call', () => {
    const blocks = planBlocks([entry(1, BLOCK_MAX), entry(2, MERGE_TAIL_UNDER + 1)])
    expect(blocks).toHaveLength(2)
  })
})

describe('planBlocks while the reader is still inside the chapter', () => {
  it('withholds the block that is still filling up', () => {
    // Read as far as section 3 of a chapter cut at 4,000 words: the first block
    // is closed, the second is half-written and must wait.
    expect(planBlocks(chapter(3, 1500), false)).toHaveLength(1)
  })

  it('gives nothing back before the first block is closed', () => {
    expect(planBlocks(chapter(2, 1500), false)).toEqual([])
  })

  it('never merges the tail, because the tail is not the end yet', () => {
    const open = planBlocks([entry(1, BLOCK_MAX), entry(2, 10)], false)
    expect(open).toHaveLength(1)
    expect(open[0]?.through).toBe(1)
  })

  it('digests a long stretch even though the chapter is unfinished', () => {
    // The point of the whole design: a 70,000-word chapter must not wait for
    // its end to leave anything behind.
    expect(planBlocks(chapter(40, 1500), false).length).toBeGreaterThan(10)
  })

  it('keeps the blocks behind the reader identical as they read on', () => {
    // The stored block digests are re-used by their position in this list. If
    // reading further could redraw an earlier block, every stored digest would
    // silently describe the wrong pages.
    const near = planBlocks(chapter(6, 1500), false)
    const far = planBlocks(chapter(20, 1500), false)
    expect(far.slice(0, near.length)).toEqual(near)
    expect(planBlocks(chapter(20, 1500), true).slice(0, near.length)).toEqual(near)
  })
})

describe('proseOf', () => {
  it('joins the paragraphs and drops the blank ones', () => {
    const prose = proseOf({
      paragraphs: [
        { text: 'The first thing.' },
        { text: '   ' },
        { text: 'The second thing.' },
      ] as never,
    })
    expect(prose).toBe('The first thing.\n\nThe second thing.')
  })
})

describe('confusionMaterial', () => {
  it('says who spoke, so the model can tell a question from an answer', () => {
    const material = confusionMaterial([
      { messages: [{ role: 'you', text: 'What is a lumen?' }, { role: 'claude', text: 'A unit.' }] },
    ])
    expect(material).toBe('READER: What is a lumen?\nTUTOR: A unit.')
  })

  it('keeps separate threads apart, because each one is one confusion', () => {
    const material = confusionMaterial([
      { messages: [{ role: 'you', text: 'One?' }] },
      { messages: [{ role: 'you', text: 'Two?' }] },
    ])
    expect(material).toBe('READER: One?\n\n---\n\nREADER: Two?')
  })

  it('gives nothing back for nothing', () => {
    expect(confusionMaterial([])).toBe('')
    expect(confusionMaterial([{ messages: [] }])).toBe('')
  })
})

describe('work', () => {
  const had: BuiltDigest = {
    ...NOTHING_YET,
    blocks: ['one', 'two'],
    coversNConversations: 3,
  }

  it('rebuilds the recap only when a new block has closed', () => {
    expect(work(had, 2, 3).content).toBe(false)
    expect(work(had, 3, 3).content).toBe(true)
  })

  it('rebuilds the index only when another question was asked', () => {
    expect(work(had, 2, 3).conversation).toBe(false)
    expect(work(had, 2, 4).conversation).toBe(true)
  })

  it('does not rebuild the expensive half for a cheap change', () => {
    // One more question must never re-digest the chapter's prose.
    expect(work(had, 2, 9)).toEqual({ content: false, conversation: true })
  })

  it('asks for nothing when there is nothing to say', () => {
    expect(work(NOTHING_YET, 0, 0)).toEqual({ content: false, conversation: false })
  })
})

/** A stub relay that records what it was asked and answers predictably. */
function recorder() {
  const calls: { module: MemoryModule; material: string }[] = []
  const ask = vi.fn(async (module: MemoryModule, material: string) => {
    calls.push({ module, material })
    return `${module}(${material})`
  })
  return { calls, ask }
}

const prose = async (path: SectionPath) => `prose of ${path}`

describe('buildDigest', () => {
  it('digests a short chapter in one call and never stitches', async () => {
    const { calls, ask } = recorder()
    const built = await buildDigest(
      { sections: chapter(2, 500), finished: true, read: prose, threads: [], ask },
      { content: true, conversation: false },
    )
    expect(calls.map((call) => call.module)).toEqual(['recap'])
    expect(built.blocks).toHaveLength(1)
    expect(built.contentRecap).toBe(built.blocks[0])
    expect(built.coversThroughSection).toBe(2)
  })

  it('stitches a long chapter with the roll-up step', async () => {
    const { calls, ask } = recorder()
    const built = await buildDigest(
      { sections: chapter(6, 1500), finished: true, read: prose, threads: [], ask },
      { content: true, conversation: false },
    )
    expect(calls.filter((call) => call.module === 'recap')).toHaveLength(built.blocks.length)
    expect(calls[calls.length - 1]?.module).toBe('rollup')
    expect(built.contentRecap.startsWith('rollup(')).toBe(true)
  })

  it('digests only the block that is new, and keeps the rest', async () => {
    const { calls, ask } = recorder()
    const had: BuiltDigest = { ...NOTHING_YET, blocks: ['stored one', 'stored two'] }
    const built = await buildDigest(
      { sections: chapter(6, 1500), finished: true, read: prose, threads: [], ask },
      { content: true, conversation: false },
      had,
    )
    // Three blocks in a 9,000-word chapter; two were already stored.
    expect(calls.filter((call) => call.module === 'recap')).toHaveLength(1)
    expect(built.blocks.slice(0, 2)).toEqual(['stored one', 'stored two'])
    expect(built.blocks).toHaveLength(3)
  })

  it('reads only the sections it is about to digest', async () => {
    const read = vi.fn(prose)
    const { ask } = recorder()
    await buildDigest(
      { sections: chapter(6, 1500), finished: false, read, threads: [], ask },
      { content: true, conversation: false },
      { ...NOTHING_YET, blocks: ['stored one'] },
    )
    // Two closed blocks of two sections each; the first is already stored.
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('leaves the recap untouched when only a question was added', async () => {
    const { calls, ask } = recorder()
    const had: BuiltDigest = {
      blocks: ['stored one'],
      contentRecap: 'the stored recap',
      conversationDigest: 'an old line',
      coversNConversations: 1,
      coversThroughSection: 4,
    }
    const built = await buildDigest(
      {
        sections: chapter(2, 500),
        finished: true,
        read: prose,
        threads: [{ messages: [{ role: 'you', text: 'Why?' }] }],
        ask,
      },
      { content: false, conversation: true },
      had,
    )
    expect(calls.map((call) => call.module)).toEqual(['confusions'])
    expect(built.contentRecap).toBe('the stored recap')
    expect(built.blocks).toEqual(['stored one'])
    expect(built.coversThroughSection).toBe(4)
    expect(built.coversNConversations).toBe(1)
  })

  it('spends nothing on a chapter with no closed block yet', async () => {
    const { ask } = recorder()
    const built = await buildDigest(
      { sections: chapter(1, 500), finished: false, read: prose, threads: [], ask },
      { content: true, conversation: false },
    )
    expect(ask).not.toHaveBeenCalled()
    expect(built).toEqual(NOTHING_YET)
  })

  it('spends nothing on a block whose sections came back empty', async () => {
    const { ask } = recorder()
    const built = await buildDigest(
      { sections: chapter(2, 500), finished: true, read: async () => '', threads: [], ask },
      { content: true, conversation: false },
    )
    expect(ask).not.toHaveBeenCalled()
    expect(built.blocks).toEqual([])
  })
})
