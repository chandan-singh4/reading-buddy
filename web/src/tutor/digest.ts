/**
 * The memory layer: what a chapter leaves behind once the reader has passed
 * through it.
 *
 * Two products, built from two different materials and going stale for two
 * different reasons.
 *
 * - The **content recap** is made from the book. It is long on purpose — 800 to
 *   1,200 words for a long chapter — because its job is to bring the chapter
 *   back, not to replace it with a blurb. A vague half-page is the failure mode
 *   here, not the goal.
 * - The **conversation digest** is made from the reader's own tutor threads and
 *   is the exception to that rule. It stays terse: one line per confusion,
 *   `problem → resolution`. It is an index, not prose.
 *
 * ## Blocks are not pages
 *
 * A long chapter is cut into blocks of about 3,000 to 4,000 words before it is
 * digested, because a whole chapter does not fit in one call. **A block is not
 * a reading unit.** Nothing here may touch `positions`, and nothing here may
 * report a block boundary to the reader. The two ideas are kept apart on
 * purpose: the day a "block" becomes a place, the reader's place starts moving
 * on its own.
 *
 * ## Only closed blocks are digested, and each one only once
 *
 * The digest of a chapter can be built while the reader is still inside it — a
 * 70,000-word chapter is many sittings, and waiting for its end would mean
 * never. Two rules make that safe and cheap.
 *
 * 1. **A block is digested only when it is closed** — when the reader has read
 *    past its end. So the recap never contains material the reader has not
 *    reached, and no block is ever digested twice from different halves of
 *    itself.
 * 2. **The block digests are kept**, not just the finished recap. Reading on
 *    digests the one new block and re-stitches; it never re-reads the chapter.
 *    Without this, a long chapter would be digested from scratch at every
 *    boundary, which costs the square of the chapter's length in model calls.
 *
 * ## The arithmetic is done on the index, not the book
 *
 * `planBlocks` reads the `words` counts already stored on the chapter index. It
 * never opens a section, and it never re-parses the book. Only the blocks that
 * are actually digested are read, one section at a time.
 */

import { accessToken } from '../storage/cloud/client.ts'
import { TUTOR_URL } from '../reader/tutor.ts'
import type { ChapterIndexEntry, Section, SectionPath } from '../structure/index.ts'

/**
 * Below this many words, a chapter gets no digest at all.
 *
 * A part title, a dedication or a bare heading is a "chapter" in the spine and
 * nothing in the reading. Digesting it would spend a model call to be told the
 * chapter is called what it is called.
 */
export const NO_DIGEST_UNDER = 50

/**
 * The biggest block, in words. Above this the material is cut.
 *
 * Also the line between the two shapes of the job: a chapter at or under this
 * is digested whole, in one call, with no reduce step to stitch afterwards.
 */
export const BLOCK_MAX = 4000

/**
 * A trailing block smaller than this is folded into the one before it.
 *
 * Without this, a finished 4,100-word chapter becomes a full block plus a
 * 100-word scrap, and the scrap costs a whole model call to digest three
 * sentences. Applied only when the chapter is finished — before that the last
 * block is still filling up.
 */
export const MERGE_TAIL_UNDER = 1000

/** One unit of digesting. Several sections, or one long one. */
export interface DigestBlock {
  /** The sections in it, in reading order. */
  paths: SectionPath[]
  /** Their stored word counts, added up. */
  words: number
  /** The number of the last section in it — how far this block reaches. */
  through: number
}

/**
 * Cut a chapter's sections into blocks. Pure arithmetic over the stored index.
 *
 * `sections` is what the reader has actually read: the whole chapter when
 * `finished`, and the sections up to their place when not. Only **closed**
 * blocks come back — while the chapter is unfinished the block still filling up
 * is left out, because digesting it now would have to be undone later.
 *
 * A section with no stored `words` count still goes into a block. It counts as
 * zero, which is a lie about its length and the right lie: dropping it would
 * leave a piece of the chapter out of the recap silently, and the only cost of
 * keeping it is a block that runs long.
 *
 * Returns an empty list when there is nothing worth a call yet.
 */
export function planBlocks(
  sections: readonly ChapterIndexEntry[],
  finished = true,
): DigestBlock[] {
  if (sections.length === 0) return []
  const total = sections.reduce((sum, entry) => sum + (entry.words ?? 0), 0)
  if (finished && total < NO_DIGEST_UNDER) return []

  const blocks: DigestBlock[] = []
  let open: DigestBlock = { paths: [], words: 0, through: 0 }

  for (const entry of sections) {
    const words = entry.words ?? 0
    // A section longer than a whole block on its own cannot be cut without
    // re-parsing the book, which this file will not do. It becomes its own
    // oversized block, and the relay's own character cap is the backstop.
    if (open.paths.length > 0 && open.words + words > BLOCK_MAX) {
      blocks.push(open)
      open = { paths: [], words: 0, through: 0 }
    }
    open.paths.push(entry.path)
    open.words += words
    open.through = entry.section
  }

  // The open block is closed only by the end of the chapter.
  if (finished && open.paths.length > 0) blocks.push(open)

  const last = blocks[blocks.length - 1]
  const before = blocks[blocks.length - 2]
  if (finished && before && last && last.words < MERGE_TAIL_UNDER) {
    before.paths.push(...last.paths)
    before.words += last.words
    before.through = last.through
    blocks.pop()
  }

  return blocks
}

/**
 * A section as one string of prose.
 *
 * Every block is kept, headings included: a heading is the sentence that says
 * what the next twenty paragraphs are about, and dropping it costs the recap
 * its shape. Empty paragraphs go, because a run of blank lines teaches the
 * model that the material is padded.
 */
export function proseOf(section: Pick<Section, 'paragraphs'>): string {
  return section.paragraphs
    .map((paragraph) => paragraph.text.trim())
    .filter((text) => text.length > 0)
    .join('\n\n')
}

/** A tutor exchange, as much of it as the digest needs. */
export interface DigestibleThread {
  messages: readonly { role: string; text: string }[]
}

/**
 * The reader's conversations, laid out for the confusion index.
 *
 * Threads are separated rather than run together, because the prompt asks for
 * one line per *distinct* question, and a wall of turns hides where one
 * question ended and the next began.
 */
export function confusionMaterial(threads: readonly DigestibleThread[]): string {
  return threads
    .map((thread) =>
      thread.messages
        .map((message) => `${message.role === 'you' ? 'READER' : 'TUTOR'}: ${message.text.trim()}`)
        .join('\n'),
    )
    .filter((block) => block.trim().length > 0)
    .join('\n\n---\n\n')
}

/** The four memory jobs the relay knows. Named exactly as its modules are. */
export type MemoryModule = 'recap' | 'rollup' | 'confusions' | 'welcome'

/**
 * One memory call to the relay.
 *
 * Its own function rather than `askTutor`, and deliberately. `askTutor` is
 * shaped around a passage the reader selected — it takes an anchor, a mode and
 * a conversation history, and none of the three exists here. It also *never
 * rejects*, because the lamp must always have something to print; this one
 * throws, because a digest that quietly stores a canned apology as the recap of
 * chapter four is worse than no digest at all.
 */
export async function askMemory(module: MemoryModule, material: string): Promise<string> {
  const token = await accessToken()
  const response = await fetch(TUTOR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      excerpt: material,
      intent: module,
      history: [],
      userMessage: 'Write the record.',
    }),
  })
  if (!response.ok) throw new Error(`the tutor relay answered ${response.status}`)

  const data = (await response.json()) as { text?: unknown }
  if (typeof data.text !== 'string' || data.text.trim().length === 0) {
    throw new Error('the tutor relay sent no text')
  }
  return data.text.trim()
}

/** What a build produced. The caller stores it against the chapter. */
export interface BuiltDigest {
  /** The map step's output, one per closed block, in order. Kept, not thrown. */
  blocks: string[]
  /** The reduce step's output — the chapter recap the reader is shown. */
  contentRecap: string
  conversationDigest: string
  coversNConversations: number
  /** The last section number the recap accounts for. */
  coversThroughSection: number
}

/** Nothing built yet — the starting point of every chapter. */
export const NOTHING_YET: BuiltDigest = {
  blocks: [],
  contentRecap: '',
  conversationDigest: '',
  coversNConversations: 0,
  coversThroughSection: 0,
}

/**
 * What still has to be built for one chapter.
 *
 * Two answers, not one, because the two halves go stale for different reasons.
 * The recap is made from the book, so it grows only when the reader reads
 * further. The confusion index is made from the reader's own questions, so it
 * goes stale the moment they ask another one.
 *
 * Rolling both into a single "is it stale?" would rebuild the expensive half
 * every time the reader asked one more question about one paragraph.
 */
export function work(
  had: BuiltDigest,
  closedBlocks: number,
  conversations: number,
): { content: boolean; conversation: boolean } {
  return {
    content: closedBlocks > had.blocks.length,
    conversation: conversations > 0 && conversations > had.coversNConversations,
  }
}

/** Everything one chapter's digest is built from. Injected, so it can be tested. */
export interface DigestSource {
  /**
   * The chapter's sections as far as the reader has read, in order, from the
   * stored chapter index.
   */
  sections: readonly ChapterIndexEntry[]
  /** Whether the reader has read past the end of this chapter. */
  finished: boolean
  /** One section's prose. Called only for the blocks that are actually built. */
  read: (path: SectionPath) => Promise<string>
  /** The reader's tutor threads inside this chapter. */
  threads: readonly DigestibleThread[]
  /** The relay. `askMemory` in the app; a stub in a test. */
  ask: (module: MemoryModule, material: string) => Promise<string>
}

/**
 * Build the parts of a chapter's digest that are missing or out of date.
 *
 * `todo` says which halves to build — `work` above decides. Anything not built
 * is carried over from `had` unchanged, so a rebuild of the cheap half never
 * throws the expensive half away.
 */
export async function buildDigest(
  source: DigestSource,
  todo: { content: boolean; conversation: boolean },
  had: BuiltDigest = NOTHING_YET,
): Promise<BuiltDigest> {
  let { blocks, contentRecap, coversThroughSection } = had

  if (todo.content) {
    const planned = planBlocks(source.sections, source.finished)
    // Only what is new. The blocks already digested are stable — the greedy cut
    // above fills each block before it opens the next, so reading further can
    // only add blocks, never redraw the ones behind.
    const fresh = planned.slice(blocks.length)

    const added: string[] = []
    for (const block of fresh) {
      const parts: string[] = []
      for (const path of block.paths) parts.push(await source.read(path))
      const material = parts.filter((part) => part.trim().length > 0).join('\n\n')
      if (material.trim().length === 0) continue
      added.push(await source.ask('recap', material))
    }

    if (added.length > 0) {
      blocks = [...blocks, ...added]
      // One block needs no stitching, and running the reduce step over a single
      // digest could only make it shorter — the one thing that step must not do.
      contentRecap =
        blocks.length === 1
          ? (blocks[0] ?? '')
          : await source.ask('rollup', blocks.join('\n\n---\n\n'))
      coversThroughSection = planned[planned.length - 1]?.through ?? coversThroughSection
    }
  }

  let { conversationDigest, coversNConversations } = had

  if (todo.conversation) {
    const material = confusionMaterial(source.threads)
    conversationDigest = material.length === 0 ? '' : await source.ask('confusions', material)
    coversNConversations = source.threads.length
  }

  return { blocks, contentRecap, conversationDigest, coversNConversations, coversThroughSection }
}
