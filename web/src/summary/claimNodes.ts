/**
 * A claim carries a little inline markup — `<em>` for emphasis, and
 * `<a class="link">` for a concept named mid-sentence. This turns that string
 * into a list of pieces the views render as real elements.
 *
 * ## Why not `dangerouslySetInnerHTML`
 *
 * Today every claim in the app is hand-written fixture text and perfectly
 * safe. Tomorrow it is whatever a model wrote about whatever a reader pasted
 * into a book. A model asked for `<em>` will occasionally return more than
 * `<em>`, and by then the injection point would be in shipped code that nobody
 * is looking at any more. So the parser is here from the first day, and the
 * rule is the strict one: two tags are understood, everything else is text.
 * A stray `<script>` renders as the visible characters `<script>`, which is
 * ugly and harmless — the right way round.
 */

export type ClaimNode =
  | { kind: 'text'; text: string }
  | { kind: 'em'; text: string }
  /** A concept named inside the sentence. `text` is the concept's name. */
  | { kind: 'link'; text: string }

/** `<em>…</em>` or `<a class="link">…</a>`, non-greedy, nothing nested. */
const TAG = /<em>(.*?)<\/em>|<a class="link">(.*?)<\/a>/g

export function claimNodes(claim: string): ClaimNode[] {
  const nodes: ClaimNode[] = []
  let cursor = 0

  for (const match of claim.matchAll(TAG)) {
    const at = match.index
    if (at > cursor) nodes.push({ kind: 'text', text: claim.slice(cursor, at) })

    const [, emphasis, link] = match
    if (emphasis !== undefined) nodes.push({ kind: 'em', text: emphasis })
    else nodes.push({ kind: 'link', text: link })

    cursor = at + match[0].length
  }

  if (cursor < claim.length) nodes.push({ kind: 'text', text: claim.slice(cursor) })
  return nodes
}
