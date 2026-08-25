/**
 * Merriam-Webster's JSON, turned into something the panel can draw.
 *
 * ## Why the parsing is here and not in the relay
 *
 * `api/define.ts` holds the two keys and nothing else. It hands back both
 * responses exactly as MW sent them, and every decision about what they *mean*
 * is made in this file. Two reasons. The parsed entry is what gets cached, so
 * the parser has to be a function of the raw response rather than a step behind
 * a network call. And the whole test suite lives on this side — a parser in
 * `api/` would be the one piece of the feature nothing could test.
 *
 * ## The one rule
 *
 * **No raw `{token}` may ever reach the screen.** MW's text is full of them —
 * `{bc}`, `{it}…{/it}`, `{sx|word||}` — and they are not decoration; they carry
 * the meaning. A missed token does not look like a small bug on a phone. It
 * looks like the app is broken. `clean` is the only way text leaves this file,
 * and it ends by deleting anything in braces it did not recognise.
 */

/** One hop in a word's descent, oldest first. */
export interface EtymologyNode {
  /** The word itself, as MW italicises it. */
  root: string
  /** "Latin", "Middle English", "suffix" — the label beside the root. */
  lang: string
  /** What it meant, where MW says. */
  gloss?: string
}

export interface Etymology {
  /** Oldest first, the headword last. Empty when only prose could be had. */
  chain: EtymologyNode[]
  /** "15th century" — the date, cut back to the part a reader wants. */
  firstUse?: string
  /** MW's "more at" cross-references: words that share the root. */
  kin?: string[]
  /** The cleaned original, kept when the chain could not be built. */
  prose?: string
}

export interface DefineSense {
  text: string
  example?: string
}

export interface DefineEntry {
  headword: string
  /** "fun·da·men·tal". */
  syllables: string
  pronunciation?: {
    /** MW's own respelling, not IPA. We do not convert and do not pretend to. */
    respelling: string
    audioUrl?: string
  }
  partsOfSpeech: string[]
  senseGroups: { pos: string; senses: DefineSense[] }[]
  synonyms: string[]
  etymology?: Etymology
  source: string
}

/** What MW hands back for a word it knows. Only the parts we read are named. */
interface CollegiateEntry {
  meta?: { id?: unknown }
  hwi?: { hw?: unknown; prs?: { mw?: unknown; sound?: { audio?: unknown } }[] }
  fl?: unknown
  def?: { sseq?: unknown }[]
  et?: unknown
  date?: unknown
  shortdef?: unknown
}

/** At most this many senses under one part of speech. `shortdef` caps at 3. */
const MAX_SENSES = 3

/** Enough synonyms to be useful, few enough to stay one or two lines of chips. */
const MAX_SYNONYMS = 8

/**
 * Strip MW's markup, keeping every word it wraps.
 *
 * The order matters. The paired blocks that must go *with* their contents
 * (`{dx}` cross-references) are removed first, then the links are unwrapped to
 * the word they name, then the plain formatting tags go, and the last rule
 * sweeps up anything in braces this function has never heard of. That last rule
 * is the one that keeps the promise: a token MW adds next year appears as
 * nothing rather than as itself.
 */
export function clean(text: string): string {
  return (
    text
      // Cross-references, contents and all. "— see FOUNDATION" inside a
      // definition is a page reference to a book we are not showing.
      .replace(/\{dx(?:_ety|_def)?\}[\s\S]*?\{\/dx(?:_ety|_def)?\}/g, '')
      .replace(/\{ma\}[\s\S]*?\{\/ma\}/g, '')
      // "Boldface colon": MW's way of writing "means".
      .replace(/\{bc\}/g, ': ')
      .replace(/\{ldquo\}/g, '“')
      .replace(/\{rdquo\}/g, '”')
      // Links, each to the word a reader would recognise. `et_link` names its
      // target first and its display text last, so it takes the last field;
      // the rest name the word first.
      .replace(/\{et_link\|[^|}]*\|([^}]*)\}/g, '$1')
      .replace(/\{(?:a_link|d_link|i_link|sx|dxt|mat)\|([^|}]*)(?:\|[^}]*)?\}/g, '$1')
      // Everything else in braces, known formatting and unknown alike.
      .replace(/\{\/?[a-z_]+\}/gi, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,;.])/g, '$1')
      .trim()
  )
}

/**
 * Where MW keeps a pronunciation's audio.
 *
 * The folder is not in the response; it has to be worked out from the file
 * name, and the three special cases below are MW's own documented rule rather
 * than a guess. Getting it wrong is a 404 behind a speaker button that looks
 * perfectly fine.
 */
export function audioUrl(audio: string): string | undefined {
  const name = audio.trim()
  if (!name) return undefined

  const subdir = name.startsWith('bix')
    ? 'bix'
    : name.startsWith('gg')
      ? 'gg'
      : /^[0-9\W_]/.test(name)
        ? 'number'
        : name[0]!
  // `/audio/prons/en/us/mp3/`, not `/audio/pronunciation/mp3/`. The second
  // shape reads well and answers 403 to every request. Found on the phone
  // 2026-08-24: the speaker drew, the tap did nothing, and the failure was
  // swallowed. The test below holds the real path.
  return `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subdir}/${name}.mp3`
}

/** "fun*da*men*tal" is how MW writes syllables. A reader wants the dots. */
export function syllablesOf(hw: string): string {
  return clean(hw).replace(/\*/g, '·')
}

/**
 * "15th century, in the meaning defined at sense 1b" → "15th century".
 *
 * The tail names a sense the panel does not number the same way, so carrying it
 * across would be a reference to something not on the screen.
 */
export function firstUseOf(date: string): string | undefined {
  const said = clean(date).split(',')[0]?.trim()
  return said ? said : undefined
}

/** Whether MW is offering spellings rather than an entry. */
export function isNotFound(body: unknown): boolean {
  if (!Array.isArray(body)) return true
  if (body.length === 0) return true
  return typeof body[0] === 'string'
}

/**
 * Whether MW has the word and simply did not define it.
 *
 * ## Two very different answers with the same shape
 *
 * A word MW has never heard of and a malfunctioning MW look identical from
 * here: **200, with a JSON array of spelling suggestions.** There is no status
 * code and no header to tell them apart. Read literally, the second one makes
 * the app tell the reader "no dictionary entry for that word" — about a word
 * that is plainly in the dictionary, and about every word at once.
 *
 * ## This is measured, and the first explanation for it was wrong
 *
 * On 2026-08-25 the Collegiate endpoint returned suggestion lists for `cat`,
 * `dog`, `water`, `person` and `fundamental` for about half an hour, then
 * recovered on its own with no change at this end.
 *
 * It was called a spent daily quota at first. The reader's usage report
 * disproved that: 30 hits in 30 days. Also ruled out, each by measurement — a
 * wrong or swapped key (swapping them answers "Not subscribed"), an invalid
 * key (that answers in plain text, not JSON), a rate limit (`justice` survived
 * eight rapid calls unharmed), response caching (a cache-buster and a
 * `no-cache` header changed nothing), and common words being treated
 * differently (`house`, `tree` and `book` all worked while `cat` failed).
 *
 * What is left is a transient fault at MW. We cannot prevent it. We can refuse
 * to blame the reader's word for it.
 *
 * ## How to tell them apart
 *
 * MW echoes the word back as its own first suggestion when it knows the word.
 * A word it genuinely lacks cannot be its own suggestion — "asdfghjkl" comes
 * back with other spellings, or with nothing.
 *
 * The degraded half of this rule is measured. The other half — that a real
 * miss does not echo — is MW's documented behaviour, and it is what the
 * existing suggestion list already relies on. If it is ever wrong, the cost is
 * a reader told "try again" about a word that truly is absent, and the panel
 * still offers Veda underneath.
 */
export function mwKnowsTheWord(word: string, body: unknown): boolean {
  if (!Array.isArray(body)) return false
  const asked = word.trim().toLowerCase()
  return body.some((one) => typeof one === 'string' && one.trim().toLowerCase() === asked)
}

/** The headword an entry is for, with the homograph number taken off. */
function headwordOf(entry: CollegiateEntry): string {
  const id = typeof entry.meta?.id === 'string' ? entry.meta.id : ''
  return id.split(':')[0]!.toLowerCase()
}

/**
 * The entries that are actually about the word the reader tapped.
 *
 * MW answers "run" with the verb, the noun, and a dozen entries for phrases
 * built on it. Keeping only the matching headword is what stops the panel
 * filling with definitions of "run-of-the-mill".
 */
function entriesFor(body: unknown, word: string): CollegiateEntry[] {
  if (isNotFound(body)) return []
  const wanted = word.trim().toLowerCase()
  return (body as CollegiateEntry[]).filter(
    (entry) => entry && typeof entry === 'object' && headwordOf(entry) === wanted,
  )
}

/**
 * The verbal illustration under a sense, if MW gave one.
 *
 * `sseq` is nested about four deep and irregularly shaped, which is why this
 * walks it looking for a `vis` rather than typing a path through it. An example
 * is a nice-to-have; a crash while reaching for one is not.
 */
function exampleIn(sseq: unknown): string | undefined {
  const found: string[] = []

  const walk = (node: unknown): void => {
    if (found.length > 0) return
    if (Array.isArray(node)) {
      if (node[0] === 'vis' && Array.isArray(node[1])) {
        const first = node[1][0] as { t?: unknown } | undefined
        if (first && typeof first.t === 'string') {
          const said = clean(first.t)
          if (said) found.push(said)
        }
        return
      }
      for (const child of node) walk(child)
      return
    }
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value)
    }
  }

  walk(sseq)
  return found[0]
}

/**
 * One block of `sseq` per sense, in MW's own order.
 *
 * `def` is *not* one entry per sense — it is one entry per part of speech, and
 * usually there is exactly one. The senses live a level down, inside `sseq`.
 * Reading `def[index]` therefore missed for every sense after the first.
 */
function senseBlocks(entry: CollegiateEntry): unknown[] {
  const groups = Array.isArray(entry.def) ? entry.def : []
  return groups.flatMap((group) => (Array.isArray(group?.sseq) ? group.sseq : []))
}

/**
 * The senses of one entry, in MW's own order.
 *
 * `shortdef` is the baseline because it is the one field MW guarantees is
 * clean, short and present. The examples are read separately out of `sseq` and
 * matched by position, which is approximate — `sseq` counts sub-senses that
 * `shortdef` folds together. An example under a neighbouring sense of the same
 * word is a small wrong; no examples at all is a duller panel.
 *
 * ## One example, one sense
 *
 * Reported from the phone 2026-08-24: a word with three senses showed the same
 * sentence three times. The cause was the fallback to `def[0]` above, which
 * every sense after the first took. An example repeated under three different
 * meanings is worse than no example at all — it tells the reader the meanings
 * are interchangeable, which is the one thing the numbered list denies. So a
 * sentence is used once, and a sense that would repeat it shows none.
 */
function sensesOf(entry: CollegiateEntry): DefineSense[] {
  const short = Array.isArray(entry.shortdef) ? entry.shortdef : []
  const blocks = senseBlocks(entry)
  const used = new Set<string>()

  return short.slice(0, MAX_SENSES).flatMap((text, index) => {
    if (typeof text !== 'string') return []
    const said = clean(text)
    if (!said) return []

    const example = exampleIn(blocks[index])
    if (!example || used.has(example)) return [{ text: said }]
    used.add(example)
    return [{ text: said, example }]
  })
}

/**
 * Every synonym MW's thesaurus offers, best first.
 *
 * The first sense's list, then the second's if the first was thin. Past that
 * the words are about a meaning the reader did not look up — the third sense of
 * "run" has nothing to do with why they tapped it.
 */
export function synonymsOf(body: unknown): string[] {
  if (isNotFound(body)) return []
  const first = (body as { meta?: { syns?: unknown } }[])[0]
  const groups = Array.isArray(first?.meta?.syns) ? (first.meta.syns as unknown[]) : []

  const out: string[] = []
  const seen = new Set<string>()
  for (const group of groups.slice(0, 2)) {
    if (!Array.isArray(group)) continue
    for (const word of group) {
      if (typeof word !== 'string') continue
      const said = clean(word)
      const key = said.toLowerCase()
      if (!said || seen.has(key)) continue
      seen.add(key)
      out.push(said)
      if (out.length >= MAX_SYNONYMS) return out
    }
    if (out.length >= MAX_SYNONYMS - 2) break
  }
  return out
}

/**
 * The raw `et` text to build the Origin from, and the date to end it with.
 *
 * The first entry that *has* an etymology, rather than the first entry: MW
 * often puts the derivation on the noun and leaves the adjective bare, and an
 * empty Origin box on a word that plainly has one reads as the app not
 * bothering.
 */
export function etymologyTextOf(body: unknown, word: string): { et?: string; date?: string } {
  const entries = entriesFor(body, word)
  for (const entry of entries) {
    const et = Array.isArray(entry.et) ? entry.et : []
    const text = et.find((pair) => Array.isArray(pair) && pair[0] === 'text') as
      | [string, string]
      | undefined
    if (text && typeof text[1] === 'string') {
      return { et: text[1], date: typeof entry.date === 'string' ? entry.date : undefined }
    }
  }
  const first = entries[0]
  return { date: typeof first?.date === 'string' ? first.date : undefined }
}

/** MW's spelling suggestions, for a word it does not have. */
export function suggestionsOf(body: unknown): string[] {
  if (!Array.isArray(body)) return []
  return body.filter((one): one is string => typeof one === 'string').slice(0, 6)
}

/**
 * Both responses, one entry.
 *
 * Returns `null` when the dictionary has no entry for the word — the caller
 * shows the not-found state rather than an empty panel. Every *section* is
 * optional on its own: a word with no audio, no synonyms and no etymology is a
 * perfectly good entry with three fewer boxes in it.
 */
export function normalize(
  word: string,
  collegiate: unknown,
  thesaurus: unknown,
  etymology?: Etymology,
): DefineEntry | null {
  const entries = entriesFor(collegiate, word)
  if (entries.length === 0) return null

  const headword = word.trim().toLowerCase()

  // The first entry carrying each one. MW spreads them across homographs, and
  // only the first is the word said the way the reader met it.
  const spelt = entries.find((entry) => typeof entry.hwi?.hw === 'string')
  const spoken = entries.find((entry) => {
    const prs = entry.hwi?.prs
    return Array.isArray(prs) && typeof prs[0]?.mw === 'string'
  })

  const groups: { pos: string; senses: DefineSense[] }[] = []
  for (const entry of entries) {
    const pos = typeof entry.fl === 'string' ? clean(entry.fl) : ''
    const senses = sensesOf(entry)
    if (!pos || senses.length === 0) continue
    // Homographs share a part of speech more often than not. They are one
    // section with the senses run together, not two sections under one heading.
    const already = groups.find((group) => group.pos === pos)
    if (already) already.senses.push(...senses)
    else groups.push({ pos, senses })
  }

  if (groups.length === 0) return null

  const respelling = spoken ? clean(String(spoken.hwi!.prs![0]!.mw)) : ''
  const audio = spoken?.hwi?.prs?.[0]?.sound?.audio
  const url = typeof audio === 'string' ? audioUrl(audio) : undefined

  return {
    headword,
    syllables: spelt ? syllablesOf(String(spelt.hwi!.hw)) : headword,
    ...(respelling ? { pronunciation: { respelling, ...(url ? { audioUrl: url } : {}) } } : {}),
    partsOfSpeech: groups.map((group) => group.pos),
    senseGroups: groups,
    synonyms: synonymsOf(thesaurus),
    ...(etymology && (etymology.chain.length > 0 || etymology.prose) ? { etymology } : {}),
    source: 'Merriam-Webster',
  }
}
