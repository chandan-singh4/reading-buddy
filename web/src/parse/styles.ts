/**
 * What a block *looks like*, read from the book's own stylesheet.
 *
 * The parser used to judge structure from tags alone: `<h1>` is a heading,
 * `<p>` is prose, a whole-line `<b>` is a subheading. That works on a book
 * written as HTML. It fails on the ones people actually have, because almost
 * every ebook in the wild has been converted — from print, from a PDF, from
 * AZW3 — and converters do not emit `<h1>`. They emit this:
 *
 *     <p class="chaphead">CONTENTS</p>
 *
 * with `font-size: 1.8em; font-weight: bold; text-align: center` sitting in a
 * stylesheet we never opened. Every visible difference between a chapter title
 * and a sentence of prose was in that file, and we threw it away. That is why
 * the contents page arrived as a wall of identical paragraphs, and why fixing
 * it book by book never ended: each converter names its classes differently,
 * and there is no list of names long enough.
 *
 * So this reads the CSS instead of guessing at class names. Nothing here knows
 * the word "calibre" or "chaphead", and nothing should.
 *
 * ## Everything is relative to the book's own body text
 *
 * The one rule that makes this general. Ebooks set type in `em`, `rem`, `%`,
 * `pt` and `px`, against a base nobody agrees on, so no absolute threshold —
 * "bigger than 16px is a heading" — survives contact with a second book. What
 * *is* stable is the ratio between a book's headings and its own body text. A
 * heading is louder **than the rest of this book**. See `baselineOf`.
 *
 * ## Deliberately a small CSS engine, not a real one
 *
 * No cascade layers, no inheritance, no media queries, and selectors are
 * matched on their rightmost compound only. A real engine here would be weeks
 * of work to answer one question: is this line louder than that one. Where this
 * is wrong it is wrong by a little — a heading it grades one level off — and
 * never by enough to turn prose into a title.
 */

/** The properties worth reading. Everything else in a book's CSS is decoration. */
export interface Appearance {
  /** Font size as a multiple of the document's base. `1` is ordinary text. */
  size: number
  bold: boolean
  italic: boolean
  centred: boolean
  /** Set when the rule says so. Used to tell a run-in paragraph from a title. */
  indented: boolean
}

export const PLAIN: Appearance = {
  size: 1,
  bold: false,
  italic: false,
  centred: false,
  indented: false,
}

/** One parsed rule: what to match, how loudly it shouts, and how specific it is. */
interface Rule {
  /** The rightmost compound selector, pre-split. */
  tag: string | null
  classes: string[]
  id: string | null
  weight: number
  order: number
  declarations: Partial<Appearance>
}

export interface StyleSheet {
  rules: Rule[]
}

export const NO_STYLES: StyleSheet = { rules: [] }

/** `/* … *\/` and any at-rule block we do not model. */
const COMMENTS = /\/\*[\s\S]*?\*\//g

/**
 * Font sizes, normalised to a multiple of the base.
 *
 * `16px` is assumed to be the base because it is the browser's, and every
 * converter that emits pixels is writing against that assumption. Points are
 * converted the printer's way, 72 to the inch.
 */
const KEYWORDS: Record<string, number> = {
  'xx-small': 0.6,
  'x-small': 0.75,
  small: 0.89,
  medium: 1,
  large: 1.2,
  'x-large': 1.5,
  'xx-large': 2,
  smaller: 0.83,
  larger: 1.2,
}

export function sizeToRatio(value: string): number | null {
  const text = value.trim().toLowerCase()
  if (text in KEYWORDS) return KEYWORDS[text]!

  const number = Number.parseFloat(text)
  if (!Number.isFinite(number)) return null

  if (text.endsWith('em') || text.endsWith('rem')) return number
  if (text.endsWith('%')) return number / 100
  if (text.endsWith('px')) return number / 16
  if (text.endsWith('pt')) return (number * 96) / 72 / 16
  return null
}

/** The declarations we care about, out of one rule body. */
function readDeclarations(body: string): Partial<Appearance> {
  const found: Partial<Appearance> = {}

  for (const piece of body.split(';')) {
    const at = piece.indexOf(':')
    if (at < 0) continue
    const name = piece.slice(0, at).trim().toLowerCase()
    const value = piece.slice(at + 1).trim().toLowerCase()
    if (!value) continue

    switch (name) {
      case 'font-size': {
        const ratio = sizeToRatio(value)
        if (ratio !== null) found.size = ratio
        break
      }
      case 'font-weight':
        // `bold`, `bolder`, or 600 and up — the point where a reader sees weight.
        found.bold = value === 'bold' || value === 'bolder' || Number.parseInt(value, 10) >= 600
        break
      case 'font-style':
        found.italic = value === 'italic' || value === 'oblique'
        break
      case 'text-align':
        found.centred = value === 'center'
        break
      case 'text-indent':
        // A first-line indent is the mark of running prose. Zero is not: plenty
        // of books set every paragraph flush and space them instead.
        found.indented = Number.parseFloat(value) > 0
        break
    }
  }

  return found
}

/** `h1.title#x` → its parts, plus a specificity. */
function readSelector(selector: string, order: number, declarations: Partial<Appearance>): Rule | null {
  // The rightmost compound is what the selector actually targets. `.chap p`
  // and `p` both end in `p`, and for our one question that is close enough.
  const last = selector.trim().split(/\s+|>/).pop()
  if (!last) return null

  const id = /#([\w-]+)/.exec(last)?.[1] ?? null
  const classes = [...last.matchAll(/\.([\w-]+)/g)].map((match) => match[1]!)
  const tag = /^[a-zA-Z][\w-]*/.exec(last)?.[0]?.toUpperCase() ?? null

  if (!id && classes.length === 0 && !tag) return null

  return {
    tag,
    classes,
    id,
    weight: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0),
    order,
    declarations,
  }
}

/**
 * Parse one or more stylesheets into rules.
 *
 * At-rules are dropped whole. `@media` is the common one, and a book that only
 * states its type inside a media query is stating it for a screen that is not
 * this one.
 */
export function readStyles(sources: readonly string[]): StyleSheet {
  const rules: Rule[] = []
  let order = 0

  for (const source of sources) {
    const css = source.replace(COMMENTS, '')

    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = match[1]!.trim()
      if (selectors.startsWith('@')) continue

      const declarations = readDeclarations(match[2]!)
      if (Object.keys(declarations).length === 0) continue

      for (const selector of selectors.split(',')) {
        const rule = readSelector(selector, order, declarations)
        if (rule) rules.push(rule)
      }
      order += 1
    }
  }

  return { rules }
}

/** Whether a rule's rightmost compound describes this element. */
function matches(rule: Rule, tag: string, classes: Set<string>, id: string): boolean {
  if (rule.tag && rule.tag !== tag) return false
  if (rule.id && rule.id !== id) return false
  for (const wanted of rule.classes) if (!classes.has(wanted)) return false
  return true
}

/** The browser's own defaults for the tags a book uses to shout. */
const BUILT_IN: Record<string, Partial<Appearance>> = {
  H1: { size: 2, bold: true },
  H2: { size: 1.5, bold: true },
  H3: { size: 1.17, bold: true },
  H4: { size: 1, bold: true },
  H5: { size: 0.83, bold: true },
  H6: { size: 0.67, bold: true },
  B: { bold: true },
  STRONG: { bold: true },
  I: { italic: true },
  EM: { italic: true },
  CENTER: { centred: true },
}

/**
 * How this element looks, once its stylesheet has been consulted.
 *
 * Rules are applied weakest first, so the most specific one lands last and
 * wins. An inline `style=` attribute beats all of them, which is also what a
 * browser does and what converters rely on.
 *
 * A wrapping `<b>`, `<i>` or `<center>` counts too: a converter that wraps the
 * whole line in one is saying the same thing the CSS would have said.
 */
export function appearanceOf(element: Element, sheet: StyleSheet): Appearance {
  const tag = element.tagName.toUpperCase()
  const classes = new Set((element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean))
  const id = element.getAttribute('id') ?? ''

  const found: Partial<Appearance> = { ...BUILT_IN[tag] }

  const hits = sheet.rules
    .filter((rule) => matches(rule, tag, classes, id))
    .sort((a, b) => a.weight - b.weight || a.order - b.order)

  for (const rule of hits) Object.assign(found, rule.declarations)

  const inline = element.getAttribute('style')
  if (inline) Object.assign(found, readDeclarations(inline))

  const style = { ...PLAIN, ...found }

  // A line wrapped entirely in <b> or <i> is styled by that wrapper, whatever
  // the stylesheet says about the paragraph.
  const text = (element.textContent ?? '').trim()
  if (text) {
    for (const [selector, key] of [
      ['b, strong', 'bold'],
      ['i, em', 'italic'],
    ] as const) {
      const wrapped = [...element.querySelectorAll(selector)]
      const covered = wrapped.map((node) => node.textContent ?? '').join(' ').trim()
      if (wrapped.length > 0 && covered.replace(/\s+/g, ' ') === text.replace(/\s+/g, ' ')) {
        style[key] = true
      }
    }
  }

  return style
}

/**
 * The size the body text of *this book* is set in.
 *
 * Taken as the size carrying the most text, not the commonest rule: a book with
 * forty short centred headings and thirty long paragraphs must still call the
 * paragraphs its baseline. Weighting by characters is what says so.
 *
 * Returns `1` when there is nothing to go on, which makes every later
 * comparison fall back to the ordinary browser scale.
 */
export function baselineOf(samples: readonly { size: number; length: number }[]): number {
  const weight = new Map<number, number>()

  for (const sample of samples) {
    // Rounded, so 1.001em and 1em are one bucket rather than two.
    const bucket = Math.round(sample.size * 20) / 20
    weight.set(bucket, (weight.get(bucket) ?? 0) + sample.length)
  }

  let best = 1
  let most = 0
  for (const [size, carried] of weight) {
    if (carried > most) {
      most = carried
      best = size
    }
  }

  return best > 0 ? best : 1
}
