// @vitest-environment jsdom
/**
 * Every link out of the reading toolbar must replace, not push.
 *
 * The toolbar owns a history entry — that is how a back swipe closes it rather
 * than leaving the book. A link that pushed from inside the toolbar would
 * strand that entry underneath the destination, and coming back would land on
 * it: same URL, no visible change, a dead gesture. Each visit stranded another.
 *
 * This test reads the file rather than driving a router, and that is a
 * deliberate trade. The bug is a property of the *stack*, and neither jsdom nor
 * a memory router models the browser's stack faithfully enough to catch it —
 * `useBackDismiss`'s own tests say the same thing about jsdom, and the bug that
 * hook was written for was invisible to them too. What can be checked honestly
 * is that no link in the bar is missing `replace`.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(join(import.meta.dirname, 'Chrome.tsx'), 'utf8')

/** The `<header className={styles.bar}>` block — the toolbar and nothing else. */
function toolbar(): string {
  const start = SOURCE.indexOf('<header className={styles.bar}>')
  const end = SOURCE.indexOf('</header>', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return SOURCE.slice(start, end)
}

describe('the reading toolbar', () => {
  it('has links out of it, so this test is testing something', () => {
    expect(toolbar().match(/<Link\b/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('gives every one of them `replace`', () => {
    const bar = toolbar()
    // Each `<Link` up to the `>` that closes its opening tag.
    const links = bar.split('<Link').slice(1)
    for (const link of links) {
      const openingTag = link.slice(0, link.indexOf('>'))
      expect(openingTag).toContain('replace')
    }
  })
})
