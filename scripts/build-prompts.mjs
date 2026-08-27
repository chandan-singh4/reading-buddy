/*
 * Writes the two golden prompts into `api/tutor.ts`.
 *
 * ## Why they are injected rather than imported
 *
 * Two Vercel builds failed before this shape was found, and both failures were
 * invisible from inside this repo — `main` moved five commits ahead while the
 * phone kept running the last good build.
 *
 *   1. The prompts started at `api/prompts/text.ts`. Vercel builds every file
 *      under `api/` as a serverless function and wants a default export from
 *      each. A module of two strings is not a function.
 *   2. Moved to `api/_prompts/text.ts` and imported, it failed again: Vercel
 *      typechecks `api/` without `allowImportingTsExtensions`, so the `.ts` on
 *      the end of an import path is an error there (TS5097), and the Edge
 *      bundler then could not resolve the module at all.
 *
 * `api/tutor.ts` had no imports whatsoever before this work, and the only
 * import anywhere in `api/` is an npm package. There is no working example of
 * one file in `api/` importing another, so this stops trying to be the first.
 *
 * The text is written directly into `api/tutor.ts`, between two markers, which
 * is exactly where `BASE_PROMPT` and `RECORDER_PROMPT` already live. No module,
 * no import, nothing for a bundler to resolve.
 *
 * The two `.md` files stay the source of truth. They sit in `prompts/` at the
 * root, outside `api/`, so Vercel never looks at them.
 * `web/src/summary/prompts.test.ts` re-runs this and compares, so an edited
 * prompt that was never regenerated fails the suite.
 *
 * Run: `node scripts/build-prompts.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROMPT_FILES = [
  ['LIBRARIAN_PROMPT', 'librarian.md'],
  ['SCRIBE_PROMPT', 'scribe.md'],
]

const ROOT = join(import.meta.dirname, '..')
export const PROMPT_DIR = join(ROOT, 'prompts')
export const TARGET = join(ROOT, 'api', 'tutor.ts')

export const BEGIN = '/* --- BEGIN GENERATED PROMPTS - scripts/build-prompts.mjs --- */'
export const END = '/* --- END GENERATED PROMPTS --- */'

/**
 * The block that goes between the markers, given the folder to read from.
 *
 * `JSON.stringify`, not a template literal. Both prompts contain backticks, and
 * a hand-written escape is exactly how a golden file quietly changes.
 */
export function block(dir) {
  const lines = [
    BEGIN,
    '/*',
    ' * The Librarian and the Scribe, copied byte for byte from the two files in',
    ' * `prompts/` at the root of this repo.',
    ' *',
    ' * DO NOT EDIT THESE TWO STRINGS. They were written outside this repo and',
    ' * nothing here may reword them. To change one: edit the `.md`, then run',
    ' * `node scripts/build-prompts.mjs`.',
    ' */',
  ]
  for (const [name, file] of PROMPT_FILES) {
    const text = readFileSync(join(dir, file), 'utf8')
    lines.push(`const ${name} = ${JSON.stringify(text)}`)
  }
  lines.push(END)
  return lines.join('\n')
}

/** Replace the block in `source`, leaving every other line untouched. */
export function inject(source, dir) {
  const start = source.indexOf(BEGIN)
  const finish = source.indexOf(END)
  if (start === -1 || finish === -1) {
    throw new Error('markers not found in api/tutor.ts')
  }
  return source.slice(0, start) + block(dir) + source.slice(finish + END.length)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const source = readFileSync(TARGET, 'utf8')
  writeFileSync(TARGET, inject(source, PROMPT_DIR), 'utf8')
  console.log('wrote the golden prompts into api/tutor.ts')
}
