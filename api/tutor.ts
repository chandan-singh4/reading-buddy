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
const MAX_MESSAGE = 4000
const MAX_HISTORY = 40
/**
 * Per side, for the text around the passage. The client caps this too; this is
 * the copy that has to hold, because the client is not the only caller.
 */
const MAX_NEIGHBOUR = 800
/** Title, author, chapter, section — a heading, not a paragraph. */
const MAX_FIELD = 200

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

/** The explain-back check, prompt file §10. Its own turn, never bolted on. */
const PROBE_PROMPT = `The reader just received an explanation. Now gently check that it landed — not with a test, but the way a friend would. Ask them to put the key idea in their own words, or to apply it to one small new case. Pick the single most important thing they should walk away understanding and build your check around that. One warm, low-pressure question — easy to answer if they've got it, revealing if they haven't. Never ask "did that make sense?" — that isn't a check.`

interface Module {
  /** Appended to the base prompt. Instructions to the model, not the reader talking. */
  prompt: string
  /** Whether a gentle check follows the answer as a second turn. */
  probe: boolean
  /**
   * Whether this job needs grounding in what is known now. Stage C turns this
   * on for "Still true?" and "Historical context"; nothing sets it yet, and
   * `plugins` below is already wired for the day something does.
   */
  search?: boolean
}

/**
 * The task modules, keyed by the intent the client sends.
 *
 * The four here are the genre-neutral ones — they suit any book. The
 * genre-conditional four (still-true, historical, happening, interpret) are
 * Stage C, and they need a genre on the book before the lamp can know which to
 * offer.
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
   * The whole chain the client wants tried, in order. It knows the roster and
   * which models on it are strongest; this file only knows a list it was
   * configured with. So when the client sends one, it wins.
   */
  models?: unknown
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
  const excerpt = text(body.excerpt, MAX_EXCERPT)
  const asked = text(body.userMessage, MAX_MESSAGE)
  const where = frame(body.context)

  const turns: Turn[] = [{ role: 'system', content: BASE_PROMPT }]
  if (module) turns.push({ role: 'system', content: module.prompt })
  turns.push(...priorTurns(body.history))

  // The passage comes last of the three, closest to the question, because it
  // is the thing being asked about. The anchor id is deliberately not sent:
  // `[ch02-s03-p013]` means nothing to a model, and a line it cannot read is a
  // line that teaches it the rest may be noise too.
  const passage = excerpt
    ? `THE PASSAGE THE READER SELECTED — explain this one:\n\n"""\n${excerpt}\n"""\n\n`
    : ''

  turns.push({ role: 'user', content: `${where}${passage}${asked}` })
  return turns
}

interface Completion {
  text: string
  model: string
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

async function complete(
  turns: Turn[],
  models: string[],
  key: string,
  search: boolean,
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
        // OpenRouter runs the search itself and feeds the results in. The
        // model still decides whether the results are worth using.
        ...(search ? { plugins: [{ id: 'web' }] } : {}),
      }),
    })

    const payload = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown } }[]
      model?: unknown
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

    return {
      text: answer.trim(),
      model: typeof payload?.model === 'string' ? payload.model : models[0],
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

  let answer: Completion
  try {
    answer = await complete(turns, models, key, module?.search === true)
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
      )
    } catch {
      probe = undefined
    }
  }

  return json(
    {
      text: answer.text,
      model: answer.model,
      ...(probe ? { probe: probe.text, probeModel: probe.model } : {}),
    },
    200,
    origin,
  )
}
