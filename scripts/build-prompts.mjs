/*
 * Turns the two golden prompt files into a TypeScript module.
 *
 * ## Why the folder starts with an underscore
 *
 * Vercel treats every file under `api/` as a serverless function and requires a
 * default export from each one. `text.ts` is a module of two strings, so the
 * build failed — silently, as far as this repo could tell: five commits sat on
 * `main` undeployed while the phone kept running the last good build. A leading
 * underscore is Vercel's documented way to say "helper, not a route".
 *
 * The `.md` files in `api/_prompts/` are the source of truth. They were written
 * outside this repo and must never be edited here — not a word, not a line
 * break. `api/_prompts/text.ts` is generated from them so the serverless
 * functions can import the text without reading a file at runtime, which is
 * the part Vercel makes fragile.
 *
 * The text is emitted with `JSON.stringify`, not as a template literal. A
 * template literal would need the backticks inside these prompts escaped by
 * hand, and a hand-written escape is exactly the kind of thing that quietly
 * alters a golden file. `JSON.stringify` cannot get it wrong.
 *
 * `web/src/summary/prompts.test.ts` re-runs this and compares, so an edited
 * `.md` that was never regenerated fails the suite.
 *
 * Run: `node scripts/build-prompts.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROMPT_FILES = [
  ['LIBRARIAN_PROMPT', 'librarian.md'],
  ['SCRIBE_PROMPT', 'scribe.md'],
]

export const PROMPT_DIR = join(import.meta.dirname, '..', 'api', '_prompts')

const HEAD = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by \`scripts/build-prompts.mjs\` from \`librarian.md\` and \`scribe.md\`
 * in this folder. Those two files are the golden source. They came from outside
 * this repo and are copied byte for byte; nothing here may reword them.
 *
 * To change a prompt: edit the \`.md\`, then run \`node scripts/build-prompts.mjs\`.
 * \`web/src/summary/prompts.test.ts\` fails if the two ever drift apart.
 */
`

/** The exact bytes of the generated module, given the folder to read from. */
export function generate(dir) {
  const parts = [HEAD]
  for (const [name, file] of PROMPT_FILES) {
    const text = readFileSync(join(dir, file), 'utf8')
    parts.push(`\nexport const ${name} = ${JSON.stringify(text)}\n`)
  }
  return parts.join('')
}

// Only write when run directly, so the test can import `generate` in peace.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  writeFileSync(join(PROMPT_DIR, 'text.ts'), generate(PROMPT_DIR), 'utf8')
  console.log('wrote api/_prompts/text.ts')
}
