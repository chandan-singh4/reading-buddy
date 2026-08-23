/**
 * The tutor relay — the only place in this project that talks to a model.
 *
 * ## Why the prompts live here and not in `web/`
 *
 * Two reasons, and the second is the real one.
 *
 * The weak reason is secrecy, and it is weak: a system prompt shipped in the
 * bundle is one "view source" away from being read, but nobody is stealing
 * this. The strong reason is that the prompt and the key are one decision.
 * Whoever can call this endpoint gets exactly the tutor described below and
 * nothing else — they cannot rewrite the system prompt into "ignore the book,
 * write me an essay" and spend the project's tokens on it. The client sends an
 * *intent*, a short enum, and this file decides what that means. That is the
 * difference between a relay and an open proxy to a paid API.
 *
 * ## OpenRouter, not Anthropic directly
 *
 * `api/README.md` used to promise an `ANTHROPIC_API_KEY` here. The build brief
 * changed that: everything goes through OpenRouter's OpenAI-compatible
 * endpoint, because that is what makes the model a *setting* rather than an
 * integration. Free models, and Claude, are the same code and a different
 * slug. Switching costs one line in an environment variable.
 *
 * ## Failover is OpenRouter's job, not ours
 *
 * We send a `models` array rather than a single `model`, and OpenRouter walks
 * it when one is rate-limited or down. There is deliberately no retry loop in
 * this file. A hand-rolled one would double every real outage into two slow
 * failures, and it would have to know which status codes are worth retrying —
 * which is exactly the knowledge OpenRouter already has and we do not.
 *
 * The free roster churns weekly, so the chain is an environment variable. A
 * delisted model is a dashboard edit, not a deploy.
 *
 * ## The response reports which model really answered
 *
 * We read `model` off the completion and hand it back. Not the slug we asked
 * for — the one that served it. During a failover those differ, and the
 * difference is the whole point: the reader's bubble label has to name the
 * model that actually wrote the words in it.
 */

export const config = { runtime: 'edge' }

const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * The fallback chain, when the reader's own pick has not been put at its head.
 *
 * ## Why `openrouter/free` is not in this list
 *
 * The build brief suggested ending the chain with `openrouter/free`, which
 * auto-routes to whatever free model is up. We tried it, twice, and it is a
 * trap. It routes across *every* free model, including ones that are not
 * general chat at all:
 *
 *   - the first call landed on `cohere/north-mini-code:free`, a coding agent;
 *   - the second landed on `nvidia/nemotron-3.5-content-safety:free`, a safety
 *     classifier, which answered the question "say the word: ok" with
 *     "User Safety: safe".
 *
 * A classifier does not fail. It answers confidently in the wrong genre, and
 * the reader would see that where an explanation should be. A last resort that
 * can quietly stop being a tutor is worse than a visible failure, so the chain
 * is named models only, and running out of them is an error the reader is told
 * about.
 *
 * ## Why the default is in code at all
 *
 * `TUTOR_MODELS` overrides this, and should. The free roster churns weekly, so
 * these slugs *will* go stale — but a stale named default degrades into an
 * honest "could not be reached", which is recoverable, whereas an empty
 * default is a tutor that never worked. Every entry is general-purpose,
 * instruction-tuned, and tool-capable. Coding and classifier models are
 * deliberately absent.
 */
const DEFAULT_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
  'z-ai/glm-5.2:free',
]

/**
 * OpenRouter rejects a `models` array longer than this.
 *
 * Found the hard way: a four-entry chain returns `400 'models' array must have
 * 3 items or fewer` for *every* request, and the reader sees the generic "could
 * not be reached" line no matter which model they pick. The cap is enforced
 * here rather than trusted to whoever edits `TUTOR_MODELS`, because getting it
 * wrong takes the tutor down completely and looks exactly like an outage.
 */
const MAX_CHAIN = 3
/**
 * The most working-out that is passed on.
 *
 * A reasoning model can think for far longer than it answers, and the whole of
 * it is stored with the thread. This is generous enough to hold a real train of
 * thought and small enough that a runaway one cannot bloat the reader's own
 * saved conversation.
 */
const MAX_REASONING = 20_000

function chain(): string[] {
  const configured = (process.env.TUTOR_MODELS ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
  return (configured.length > 0 ? configured : DEFAULT_MODELS).slice(0, MAX_CHAIN)
}

/** How long an answer may take before we stop waiting. Free models are slow. */
const TIMEOUT_MS = 60_000

/** Ceilings, not targets. The prompts ask for short answers; these stop runaways. */
const MAX_TOKENS = 1200
const MAX_EXCERPT = 8000
/**
 * The cap on material sent to be digested, in characters.
 *
 * A separate number from `MAX_EXCERPT` because it is a separate job. An
 * excerpt is a passage a reader selected with their thumb, and 8,000
 * characters is already generous for that. A digest block is up to 4,000 words
 * of the book, which is roughly 24,000 characters, so the passage cap would
 * silently cut a third of every block and the recap would end mid-chapter
 * without saying so.
 */
const MAX_MATERIAL = 30000
const MAX_MESSAGE = 4000
const MAX_HISTORY = 40
/**
 * Per side, for the text around the passage. The client caps this too; this is
 * the copy that has to hold, because the client is not the only caller.
 */
const MAX_NEIGHBOUR = 800
/** Title, author, chapter, section — a heading, not a paragraph. */
const MAX_FIELD = 200
/**
 * How many searched pages are handed back.
 *
 * The plugin is asked for this many results and the answer lists at most this
 * many. Five is OpenRouter's own default, and it is already more citations than
 * a paragraph of explanation can carry.
 */
const MAX_SOURCES = 5

/* ------------------------------------------------------------------ prompts */

/**
 * The constant voice. Every request carries this, and nothing overrides it.
 *
 * Copied verbatim from `design-inspiration/reading-buddy-prompts.md` §1. When
 * the reader edits that file, this string is what has to change with it —
 * there is no build step tying the two together, so they drift silently if
 * nobody looks. Keep them in step by hand.
 */
const BASE_PROMPT = `You are the reading companion inside a personal reading app. You sit beside one reader while they read and help them understand the passages that don't click — like a knowledgeable friend explaining something over coffee.

YOUR PURPOSE
Understanding, not shortcuts. You help the reader grasp what's actually on the page so they can keep reading it themselves. You never summarize ahead or hand over a book's content so the reader can skip it. You illuminate the passage in front of them; you don't replace the reading.

HOW YOU SOUND
- Warm, patient, plain-spoken. Short and unhurried.
- Everyday words. If a hard term is unavoidable, explain it the instant you use it.
- No lectures, no walls of text. A few clear sentences beat one long one.
- One good analogy or concrete example beats a paragraph of abstraction.
- A companion, never a professor. Don't condescend, don't pad, don't flatter.

WHAT YOU WORK FROM
- You're given the book's title and author, the chapter and section the reader is in, the exact passage they selected, and the text immediately before and after it.
- Explain THE SELECTED PASSAGE. The text before and after is there so you can resolve a "this", a "he", or a name introduced a sentence earlier. It is context, not the subject — do not explain it and do not summarise it.
- Stay inside what you were given. Don't wander beyond it, and never reveal what happens later in the book.
- The title and author tell you which book this is. They are not an invitation to talk about the book as a whole, the author's life, or how the book ends. If the reader would meet a fact later in the book, they meet it later — not from you.
- If the passage looks garbled or cut off (these are parsed from EPUB files), work with what's there and say plainly that some text may be missing.
- If you're genuinely unsure what a passage means, say so instead of inventing.

WHEN THE READER TRIES
Teaching for understanding means you care whether your explanation landed — not just whether you delivered it. When the reader tries to explain something back or answers your question, respond to the attempt: name what they got right, gently fix what's off, and never wave a wrong answer through with "exactly!" A kind, real correction is worth more than praise.`

/**
 * The base prompt for the digest jobs, in place of `BASE_PROMPT`.
 *
 * The tutor's own base prompt forbids the exact thing a digest does: "You never
 * summarize ahead or hand over a book's content so the reader can skip it."
 * That rule is right for a reader mid-page and wrong for a reader coming back a
 * month later to material they have already read. Sending both prompts would
 * hand the model two orders and let it pick.
 *
 * Not from the prompts file — that file has the four digest tasks but no base
 * for them. This is ours, and it is kept short so the task module below it does
 * the real work.
 */
const RECORDER_PROMPT = `You are the memory of a personal reading app. The reader has already read the material you are given. Your job is to write it down faithfully so they can get it back later without rereading it.

- Work only from the material you are given. Never add, never infer past it, and never mention anything from later in the book.
- Never address the reader, never explain, never editorialise. Write the record itself.
- Fidelity beats brevity. A vague summary is a failure here; the specifics are the whole point.`

/** The explain-back check, prompt file §10. Its own turn, never bolted on. */
const PROBE_PROMPT = `The reader just received an explanation. Now gently check that it landed — not with a test, but the way a friend would. Ask them to put the key idea in their own words, or to apply it to one small new case. Pick the single most important thing they should walk away understanding and build your check around that. One warm, low-pressure question — easy to answer if they've got it, revealing if they haven't. Never ask "did that make sense?" — that isn't a check.`

interface Module {
  /** Appended to the base prompt. Instructions to the model, not the reader talking. */
  prompt: string
  /** Whether a gentle check follows the answer as a second turn. */
  probe: boolean
  /**
   * Whether this job needs grounding in what is known now. "Still true?" and
   * "Historical context" ask for it. The reader can also ask for it on any
   * question with the globe in the composer, and either one is enough.
   */
  search?: boolean
  /**
   * Whether the text sent is material to digest rather than a passage the
   * reader selected. It changes three things: the base prompt, the wrapper
   * around the text, and how much text is allowed through.
   */
  material?: boolean
}

/**
 * The task modules, keyed by the intent the client sends.
 *
 * The first four are genre-neutral — they suit any book, and the lamp always
 * offers them. The last four are genre-conditional: the book carries a genre
 * from its import, and `web/src/reader/genre.ts` decides which of the four that
 * genre earns. This file offers all eight regardless, because the relay is not
 * the place to enforce a taste judgment — a reader on an old client asking for
 * "interpret" on a thriller gets an answer rather than an error.
 *
 * Note which ones carry a probe. "Discuss" already ends on a question, and
 * "Define" is a lookup, not a lesson — checking that a definition "landed"
 * would be pestering.
 */
const MODULES: Record<string, Module> = {
  simply: {
    probe: true,
    prompt: `The reader selected this passage because something in it didn't click. Explain what it's saying in the plainest language you can.
- Lead with the core idea in one or two sentences.
- Give exactly one analogy that maps onto it.
- Give one concrete example.
- Then stop. Don't restate the passage line by line, and don't stack on caveats.
Keep the whole thing to something they can read in under a minute.`,
  },
  friend: {
    probe: true,
    prompt: `Give the reader the words to teach this passage out loud to someone else. Not another explanation aimed at them — a short script they could actually say.
- Write it the way a person talks, not the way a book reads.
- Keep the real substance: if they repeat this, they should have genuinely explained the idea, not hand-waved it.
- One short spoken paragraph. No "so basically" filler, no throat-clearing.`,
  },
  discuss: {
    probe: false,
    prompt: `Don't explain this passage. Instead, ask the reader one good question about it — the kind that makes them think about what it means or why it matters. Pick the single most interesting thing in the passage and open a real conversation about it. Warm and specific, not a quiz, not a test. Ask one question, then stop and wait for their answer.`,
  },
  define: {
    probe: false,
    prompt: `The reader selected a word or short phrase. Explain what it means right here, in this passage — not its full dictionary range, but the sense it carries in this context. If the word is doing something special here (a technical use, an older meaning, irony), point that out. Two or three sentences. Don't explain the whole passage; just the term.`,
  },
  stilltrue: {
    probe: true,
    search: true,
    prompt: `This passage makes a factual claim. Help the reader see whether it still holds up today.
- First, name the specific claim or claims worth checking.
- If a claim is the kind that could have changed since the book was written — science, statistics, "recent" anything, current events — use web search to check it against what's known now.
- If it's timeless or clearly dated to its era, answer from your own knowledge. Don't search when there's nothing to update.
Tell the reader plainly: still true, outdated, or disputed — and what the current understanding is. Note where your check came from.`,
  },
  historical: {
    probe: true,
    search: true,
    prompt: `Situate this passage in its time and place. What was going on when it was written, or when it's set, that a reader today would miss? Give the context that makes the passage land differently — the assumptions, events, or conditions the original readers took for granted. A short paragraph. Only search if you need a specific date or fact you're unsure of.`,
  },
  happening: {
    probe: true,
    prompt: `The reader is disoriented in the story and selected this passage. Orient them: who's present, what just happened, and what this moment is doing in the scene — using only what they've read up to this point.
Do NOT reveal anything that happens after this passage. If a name or reference is confusing, clear it up. Keep it to just enough for them to find their footing and read on.`,
  },
  interpret: {
    probe: true,
    prompt: `This passage rewards close reading. Open it up: what is it really saying beneath the surface, and how is it saying it — imagery, structure, the moves it makes? Offer your reading as one way in, not the final word; texts like this hold more than one meaning, and the reader's own reading matters. Stay grounded in the actual words on the page rather than floating off into abstraction. Then invite them to sit with it.`,
  },

  /*
   * The four memory jobs, prompt file §§11–14. None of them talks to the
   * reader, so none of them carries a probe, and all four set `material` — see
   * `RECORDER_PROMPT` for why they must not get the tutor's base prompt.
   *
   * `recap` and `rollup` are a map and a reduce over one chapter. `confusions`
   * is the terse one, and deliberately: it is an index of what the reader got
   * stuck on, not prose. `welcome` is the only one fed digests rather than
   * book text, which is what makes it cheap.
   */
  recap: {
    probe: false,
    material: true,
    prompt: `You're digesting one block of a book so the reader can remember it later without rereading it. This is a faithful record for their own memory — capture what they'd want back.
- Preserve the actual content: the specific ideas, events, names, facts, and turns of argument, in the order they appear. A faithful record, not a vague gloss.
- Length follows content. Roughly 150–250 words for a full 3–4K-word block; scale down for a shorter section. Don't pad, and don't compress away substance.
- Plain, clear prose. No "in this section" framing, no editorializing — just the material itself, densely and accurately.
This may be stitched together with other block-digests later, so keep it self-contained and in order.`,
  },

  rollup: {
    probe: false,
    material: true,
    prompt: `You're given several block-digests from one chapter, in order. Stitch them into a single continuous chapter recap.
- Keep the specifics. This is the reduce step: your job is to JOIN, not to shrink. Preserve the names, events, facts, and the thread of the chapter.
- Make it read as one coherent piece, not a list of fragments. Smooth the seams; cut only true repetition across blocks.
- Length follows the chapter. Roughly 800–1,200 words for a long chapter, proportionally less for a shorter one. Long is fine when the chapter was long — fidelity matters more than brevity.
Write it so that reading it brings the whole chapter back.`,
  },

  confusions: {
    probe: false,
    material: true,
    prompt: `List the reader's confusions from these passage conversations and how each was resolved. One line per distinct question, in this shape:
what they were stuck on → what cleared it up
Terse and scannable — this is an index, not prose. Skip small talk; capture only real points of confusion and their resolution.`,
  },

  welcome: {
    probe: false,
    material: true,
    prompt: `The reader is coming back to this book after time away. Using the chapter digests provided, write a short, warm welcome-back that puts them back in the seat: where they are in the book, the main thread they're in the middle of, and just enough of what's happened to pick up without rereading. A few sentences to a short paragraph. This is orientation, not a full recap — the detailed digests are one tap away if they want more. Don't reveal anything past their current position.`,
  },
}

/* -------------------------------------------------------------------- wire */

type Role = 'system' | 'user' | 'assistant'
interface Turn {
  role: Role
  content: string
}

interface Body {
  anchor?: unknown
  excerpt?: unknown
  kind?: unknown
  /**
   * Where the passage sits: title, author, chapter, section, and the text
   * either side of it. See `web/src/reader/context.ts`, which builds it.
   */
  context?: unknown
  mode?: unknown
  intent?: unknown
  history?: unknown
  userMessage?: unknown
  /** Stage B: the reader's pick, put at the head of the fallback chain. */
  model?: unknown
  /**
   * How hard the model should think: `none`, `minimal`, `low`, `medium`,
   * `high`, `xhigh` or `max`. Anything else, including nothing at all, means
   * `max`.
   */
  effort?: unknown
  /**
   * Whether to search the web for this one question. The reader turns the globe
   * on in the composer. A task module may ask for search on its own, and either
   * one is enough.
   */
  search?: unknown
  /**
   * The whole chain the client wants tried, in order. It knows the roster and
   * which models on it are strongest; this file only knows a list it was
   * configured with. So when the client sends one, it wins.
   */
  models?: unknown
}

/** Two counts as one. Either may be missing. */
function added(one: Usage | undefined, two: Usage | undefined): Usage {
  return {
    input: (one?.input ?? 0) + (two?.input ?? 0),
    output: (one?.output ?? 0) + (two?.output ?? 0),
    total: (one?.total ?? 0) + (two?.total ?? 0),
  }
}

/**
 * What the exchange cost, read out of OpenRouter's own numbers.
 *
 * `total` is trusted when it is there and added up when it is not — some
 * providers send the two halves and no sum.
 */
function counted(usage: {
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
}): Usage {
  const input = Number(usage.prompt_tokens) || 0
  const output = Number(usage.completion_tokens) || 0
  return { input, output, total: Number(usage.total_tokens) || input + output }
}

/**
 * A list of model slugs from the request, made safe.
 *
 * Trusted for *order* and nothing else: a slug that is not on OpenRouter comes
 * back as an error from OpenRouter, which is already handled, and a slug is
 * never interpolated into a prompt. Length and count are still capped, because
 * this endpoint is reachable by anything that can sign in.
 */
function slugs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_CHAIN)
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  })
}

/** Same allowlist as `api/books/google.ts`. It matters only under `vercel dev`. */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (!origin || !allowed.includes(origin)) return {}

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

/** Mirrors `supabaseOrigin` in `api/books/google.ts`. */
function supabaseOrigin(): string | undefined {
  const raw = process.env.SUPABASE_URL?.trim()
  if (!raw) return undefined
  try {
    return new URL(raw).origin
  } catch {
    return raw
  }
}

/**
 * Whether the caller has a real session.
 *
 * A spend control, exactly as on the catalogue endpoint, and here it guards
 * real money rather than a rate limit: the Claude slug on this same path is
 * paid. Without this check the URL is an open, unmetered proxy to it.
 */
async function signedIn(token: string): Promise<boolean> {
  const url = supabaseOrigin()
  const key = process.env.SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return false

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` },
  })
  return response.ok
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : ''
}

/**
 * The reader's prior turns, in the model's own vocabulary.
 *
 * The app calls the two sides `you` and `claude`; the API calls them `user`
 * and `assistant`. The translation lives here rather than in the client so the
 * stored shape never has to follow a provider's naming.
 */
function priorTurns(history: unknown): Turn[] {
  if (!Array.isArray(history)) return []
  return history
    .slice(-MAX_HISTORY)
    .map((turn): Turn | null => {
      const entry = turn as { role?: unknown; text?: unknown }
      const body = text(entry.text, MAX_MESSAGE)
      if (!body) return null
      return { role: entry.role === 'you' ? 'user' : 'assistant', content: body }
    })
    .filter((turn): turn is Turn => turn !== null)
}

/**
 * Assemble one request.
 *
 * The order is the whole design: constant voice, then the specific job, then
 * everything already said, then the passage and what the reader wants of it.
 * The model is stateless — it remembers none of this between calls, and the
 * conversation exists only because we resend it every time.
 *
 * A typed question carries **no task module at all**. It is the reader's own
 * words, and wrapping them in "explain this simply" would answer a question
 * they did not ask.
 */
/**
 * Where the passage sits, written out for the model.
 *
 * Labelled lines rather than a sentence, and the two neighbours are labelled
 * as context in the label itself. A model that is handed three blocks of prose
 * with no labels will happily explain all three; one that reads "TEXT BEFORE
 * (context only)" mostly will not.
 *
 * Everything is optional. A reopened thread about a passage the reader has
 * read past carries the book but no neighbours, and a book with untitled
 * sections carries no section.
 */
function frame(value: unknown): string {
  const at = value as Record<string, unknown> | null
  if (!at || typeof at !== 'object') return ''

  const lines: string[] = []
  const field = (label: string, key: string) => {
    const said = text(at[key], MAX_FIELD)
    if (said) lines.push(`${label}: ${said}`)
  }

  field('BOOK', 'title')
  field('AUTHOR', 'author')
  field('CHAPTER', 'chapter')
  field('SECTION', 'section')

  const before = text(at.before, MAX_NEIGHBOUR)
  const after = text(at.after, MAX_NEIGHBOUR)
  if (before) lines.push(`TEXT BEFORE (context only, do not explain it): ${before}`)
  if (after) lines.push(`TEXT AFTER (context only, do not explain it): ${after}`)

  return lines.length > 0 ? `${lines.join('\n')}\n\n` : ''
}

function assemble(body: Body, module: Module | undefined): Turn[] {
  // A digest job carries a block of the book, which is several times longer
  // than any passage a thumb can select.
  const digesting = module?.material === true
  const excerpt = text(body.excerpt, digesting ? MAX_MATERIAL : MAX_EXCERPT)
  const asked = text(body.userMessage, MAX_MESSAGE)
  const where = frame(body.context)

  const turns: Turn[] = [{ role: 'system', content: digesting ? RECORDER_PROMPT : BASE_PROMPT }]
  if (module) turns.push({ role: 'system', content: module.prompt })
  turns.push(...priorTurns(body.history))

  // The passage comes last of the three, closest to the question, because it
  // is the thing being asked about. The anchor id is deliberately not sent:
  // `[ch02-s03-p013]` means nothing to a model, and a line it cannot read is a
  // line that teaches it the rest may be noise too.
  //
  // The label changes for a digest, because the usual sentence is a lie there:
  // nobody selected four thousand words with their thumb, and "explain this
  // one" is the opposite of the job.
  const label = digesting
    ? 'THE MATERIAL TO RECORD'
    : 'THE PASSAGE THE READER SELECTED — explain this one'
  const passage = excerpt ? `${label}:\n\n"""\n${excerpt}\n"""\n\n` : ''

  turns.push({ role: 'user', content: `${where}${passage}${asked}` })
  return turns
}

interface Completion {
  text: string
  model: string
  /**
   * The model's working-out, when it publishes one.
   *
   * Reasoning models think in a separate channel and OpenRouter hands it back
   * beside the answer rather than inside it. It is passed through unchanged and
   * drawn folded away, because it is interesting and it is not the answer — a
   * reader who wanted the thinking can open it, and one who did not never sees
   * it. Most free models publish none, and then there is nothing to draw.
   */
  reasoning?: string
  /** What the exchange cost, in tokens. Absent when OpenRouter reports none. */
  usage?: Usage
  /** The pages the web search fed in, when it ran. */
  sources?: Source[]
}

/** One page the search found, as OpenRouter reports it. */
export interface Source {
  url: string
  title?: string
}

export interface Usage {
  input: number
  output: number
  total: number
}

/**
 * One call to OpenRouter. Throws with a readable reason; never returns a
 * half-answer.
 */
/** A failure that came from OpenRouter, carrying the status it reported. */
class Upstream extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * How hard the model should think, as OpenRouter words it.
 *
 * The seven values are the ones the API accepts — see
 * https://openrouter.ai/docs/use-cases/reasoning-tokens. Each is a share of the
 * model's token budget: `max` and `xhigh` about 95%, `high` about 80%, `medium`
 * about 50%, `low` about 20%, `minimal` about 10%, and `none` turns thinking
 * off. A provider that does not know a level maps it to the nearest one it has,
 * so every value here is safe to send to every model.
 */
type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const EFFORTS = new Set<Effort>([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

/**
 * The default, and why it is the top one.
 *
 * Thinking is charged as output tokens, and every model this app offers by
 * default is free — so the usual reason to ration reasoning does not apply. A
 * reader asking what a paragraph of Jung means is better served by a model that
 * thinks first. A paid model is the reader's own money, which is why the client
 * can send something else.
 */
const DEFAULT_EFFORT: Effort = 'max'

function effortOf(value: unknown): Effort {
  const said = text(value, 12).trim().toLowerCase()
  return EFFORTS.has(said as Effort) ? (said as Effort) : DEFAULT_EFFORT
}

/**
 * The pages behind a searched answer.
 *
 * OpenRouter returns them on the message as `annotations`, each one a
 * `url_citation` — see https://openrouter.ai/docs/features/web-search. They are
 * passed on so the lamp can print where the check came from, which the
 * "Still true?" module promises the reader in so many words.
 *
 * The `content` field of each citation is dropped. It is the scraped page body,
 * it can be long, and it is already in front of the model — repeating it into
 * the reader's stored thread would cost far more than it gives.
 */
function sourcesOf(value: unknown): Source[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const found: Source[] = []
  for (const entry of value) {
    const cite = (entry as { url_citation?: { url?: unknown; title?: unknown } })?.url_citation
    const url = text(cite?.url, MAX_FIELD).trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    const title = text(cite?.title, MAX_FIELD).trim()
    found.push({ url, ...(title ? { title } : {}) })
    if (found.length >= MAX_SOURCES) break
  }
  return found
}

async function complete(
  turns: Turn[],
  models: string[],
  key: string,
  search: boolean,
  effort: Effort,
): Promise<Completion> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(OPENROUTER, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        // OpenRouter attributes usage by these two. Neither is a secret.
        'http-referer': process.env.TUTOR_REFERER ?? 'https://reading-buddy.app',
        'x-title': 'Reading Buddy',
      },
      body: JSON.stringify({
        models,
        messages: turns,
        max_tokens: MAX_TOKENS,
        // Warmth is the point, but a wandering tutor is worse than a plain
        // one — this is the middle of OpenRouter's range, not the top.
        temperature: 0.7,
        // Ask for the working-out. A model with no reasoning channel ignores
        // this, which is why it is sent to every model rather than guessed at
        // from the slug — the roster gives no way to tell them apart.
        reasoning: { effort, exclude: false },
        // Some providers report usage only when it is asked for.
        usage: { include: true },
        // OpenRouter runs the search itself and feeds the results in. The
        // model still decides whether the results are worth using.
        ...(search ? { plugins: [{ id: 'web', max_results: MAX_SOURCES }] } : {}),
      }),
    })

    const payload = (await response.json().catch(() => null)) as {
      choices?: {
        message?: { content?: unknown; reasoning?: unknown; annotations?: unknown }
      }[]
      model?: unknown
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown }
      error?: { message?: unknown; code?: unknown }
    } | null

    // A rate-limited provider comes back as HTTP 200 with an error envelope
    // and no `choices` at all. Without this it reads as an empty answer, which
    // sends the reader a "try again" for a problem retrying will not fix.
    if (payload?.error) {
      const reason = typeof payload.error.message === 'string' ? payload.error.message : 'refused'
      throw new Upstream(
        `OpenRouter answered ${reason}`,
        typeof payload.error.code === 'number' ? payload.error.code : 502,
      )
    }

    if (!response.ok) {
      const reason = typeof payload?.error?.message === 'string' ? payload.error.message : ''
      throw new Upstream(
        `OpenRouter answered ${response.status}${reason ? `: ${reason}` : ''}`,
        // OpenRouter reports a provider rate-limit as a 200-shaped envelope
        // with `error.code`, and a real HTTP status otherwise. Prefer whichever
        // one is actually there — the reader gets a different sentence for a
        // busy model than for a broken relay.
        typeof payload?.error?.code === 'number' ? payload.error.code : response.status,
      )
    }

    const answer = payload?.choices?.[0]?.message?.content
    if (typeof answer !== 'string' || answer.trim().length === 0) {
      // An empty completion is a failure wearing a 200. Saying so is better
      // than handing the reader a blank bubble.
      throw new Error('the model returned an empty answer')
    }

    const thought = payload?.choices?.[0]?.message?.reasoning
    const spent = payload?.usage
    const cited = search ? sourcesOf(payload?.choices?.[0]?.message?.annotations) : []

    return {
      text: answer.trim(),
      model: typeof payload?.model === 'string' ? payload.model : models[0],
      ...(typeof thought === 'string' && thought.trim().length > 0
        ? { reasoning: thought.trim().slice(0, MAX_REASONING) }
        : {}),
      ...(spent ? { usage: counted(spent) } : {}),
      ...(cited.length > 0 ? { sources: cited } : {}),
    }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405, origin)
  }

  const key = process.env.OPENROUTER_API_KEY?.trim()
  if (!key) return json({ error: 'the tutor relay has no API key' }, 500, origin)

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !(await signedIn(token))) {
    return json({ error: 'sign in to ask the tutor' }, 401, origin)
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json({ error: 'unreadable request' }, 400, origin)
  }

  if (!text(body.userMessage, MAX_MESSAGE).trim()) {
    return json({ error: 'nothing was asked' }, 400, origin)
  }

  // An unknown intent means no module, which is the same path a typed question
  // takes. Failing the request instead would strand a reader on an old client.
  const module = typeof body.intent === 'string' ? MODULES[body.intent] : undefined

  /*
   * Which models to try, in order.
   *
   * The client's chain wins when it sends one, because it is the only side that
   * knows what is on today's roster and how the models on it compare. This file
   * has a hardcoded list, which was fine as a floor and wrong as a fallback:
   * the reader picked GLM, GLM refused, and the question fell through to
   * whatever slug happened to be second in a server constant.
   *
   * Everything after is the same as before — the pick leads, duplicates go, and
   * the array is cut to three, because OpenRouter 400s a longer one.
   */
  const asked = slugs(body.models)
  const models = asked.length > 0 ? asked : chain()
  const picked = text(body.model, 120).trim()
  if (picked) {
    const rest = models.filter((slug) => slug !== picked)
    models.length = 0
    models.push(picked, ...rest.slice(0, MAX_CHAIN - 1))
  }

  const turns = assemble(body, module)

  /*
   * Whether this question goes to the web.
   *
   * Two sources, and either one is enough. The task module asks for it — "Still
   * true?" cannot do its job without it. Or the reader turned the globe on in
   * the composer, which is a choice about one question and is not remembered.
   *
   * A search costs money on every engine, so it never happens by default, and
   * never twice: the probe below is always asked with search off.
   */
  const wants = module?.search === true || body.search === true

  let answer: Completion
  try {
    answer = await complete(turns, models, key, wants, effortOf(body.effort))
  } catch (error) {
    // The upstream status is carried out, not flattened to 502. A busy free
    // model and a misconfigured relay both used to arrive as the same sentence,
    // which made a two-minute wait look identical to a broken deploy.
    const reason = error instanceof Error ? error.message : 'the tutor could not be reached'
    const status = error instanceof Upstream && error.status === 429 ? 429 : 502
    return json({ error: reason }, status, origin)
  }

  // The check that the explanation landed, as its own turn. Best-effort: a
  // failed probe costs the reader nothing, because the answer already stands.
  let probe: Completion | undefined
  if (module?.probe) {
    try {
      probe = await complete(
        [
          ...turns,
          { role: 'assistant', content: answer.text },
          { role: 'system', content: PROBE_PROMPT },
          { role: 'user', content: 'Now check that it landed.' },
        ],
        models,
        key,
        false,
        // The probe is one short question, not a problem to be reasoned about.
        'low',
      )
    } catch {
      probe = undefined
    }
  }

  return json(
    {
      text: answer.text,
      model: answer.model,
      ...(answer.reasoning ? { reasoning: answer.reasoning } : {}),
      ...(answer.sources ? { sources: answer.sources } : {}),
      // The probe's own tokens are counted in: the reader paid for both, and a
      // number that leaves half the exchange out is worse than none.
      ...(answer.usage || probe?.usage
        ? { usage: added(answer.usage, probe?.usage) }
        : {}),
      ...(probe ? { probe: probe.text, probeModel: probe.model } : {}),
    },
    200,
    origin,
  )
}
