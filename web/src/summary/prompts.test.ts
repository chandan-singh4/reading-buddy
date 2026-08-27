import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error — a plain .mjs build script, deliberately not typed.
import { PROMPT_DIR, TARGET, inject } from '../../../scripts/build-prompts.mjs'

/*
 * The two prompts are golden.
 *
 * They were written outside this repo and copied in byte for byte. Nobody may
 * reword them here — not to fit a schema, not to shorten them, not to make a
 * sentence read better. The two `.md` files in `prompts/` are the source; the
 * build script writes them into `api/tutor.ts` between a pair of markers.
 *
 * This test is the guard. It re-runs the injection and compares. It fails if
 * someone edits the generated block by hand, or edits a `.md` and forgets to
 * run `node scripts/build-prompts.mjs`.
 */

const DIR = join(import.meta.dirname, '..', '..', '..', 'prompts')

describe('the golden prompts', () => {
  it('is written into api/tutor.ts exactly as the two source files read', () => {
    const committed = readFileSync(TARGET, 'utf8')
    expect(committed).toBe(inject(committed, PROMPT_DIR))
  })

  it('still holds the Librarian, whole', () => {
    // Spot checks on load-bearing lines. If one of these goes missing, the
    // file was replaced by something that is not the prompt we were given.
    const text = readFileSync(join(DIR, 'librarian.md'), 'utf8')
    expect(text.startsWith('# Librarian — System Prompt')).toBe(true)
    expect(text).toContain('## 5. The Supplied Concept List Is Authoritative')
    expect(text).toContain('## 6. Concepts Are Not Subject Tags')
    expect(text).toContain('`recap`: the finished plain-language chapter recap.')
  })

  it('still holds the Scribe, whole', () => {
    const text = readFileSync(join(DIR, 'scribe.md'), 'utf8')
    expect(text.startsWith('# Scribe — System Prompt')).toBe(true)
    expect(text).toContain('## 7. Never Invent an Approved Concept')
    expect(text).toContain('## 9. Anchors')
    expect(text).toContain('`claim`: the distilled load-bearing knowledge')
  })
})
