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
 * Where the fallback chain comes from, and what it falls back to.
 *
 * `openrouter/free` auto-routes to whatever free model is up right now, which
 * makes it the right *last* entry and a poor only entry — it gives up the
 * reader's choice of voice. Stage B's picker puts a real slug at the head of
 * this chain; until then this is the whole list.
 */
function chain(): string[] {
  const configured = (process.env.TUTOR_MODELS ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
  return configured.length > 0 ? configured : ['openrouter/free']
}

/** How long an answer may take before we stop waiting. Free models are slow. */
const TIMEOUT_MS = 60_000

/** Ceilings, not targets. The prompts ask for short answers; these stop runaways. */
const MAX_TOKENS = 1200
const MAX_EXCERPT = 8000
const MAX_MESSAGE = 4000
const MAX_HISTORY = 40

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
- You're given the exact passage the reader selected and where it sits in the book. Explain THAT. Don't wander beyond it, and never reveal what happens later in the book.
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
  mode?: unknown
  intent?: unknown
  history?: unknown
  userMessage?: unknown
  /** Stage B: the reader's pick, put at the head of the fallback chain. */
  model?: unknown
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
function assemble(body: Body, module: Module | undefined): Turn[] {
  const excerpt = text(body.excerpt, MAX_EXCERPT)
  const anchor = text(body.anchor, 120)
  const asked = text(body.userMessage, MAX_MESSAGE)

  const turns: Turn[] = [{ role: 'system', content: BASE_PROMPT }]
  if (module) turns.push({ role: 'system', content: module.prompt })
  turns.push(...priorTurns(body.history))

  const where = anchor ? ` (${anchor})` : ''
  const passage = excerpt
    ? `The passage the reader selected${where}:\n\n"""\n${excerpt}\n"""\n\n`
    : ''

  turns.push({ role: 'user', content: `${passage}${asked}` })
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
      error?: { message?: unknown }
    } | null

    if (!response.ok) {
      const reason = typeof payload?.error?.message === 'string' ? payload.error.message : ''
      throw new Error(`OpenRouter answered ${response.status}${reason ? `: ${reason}` : ''}`)
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

  const models = chain()
  const picked = text(body.model, 120).trim()
  if (picked && !models.includes(picked)) models.unshift(picked)

  const turns = assemble(body, module)

  let answer: Completion
  try {
    answer = await complete(turns, models, key, module?.search === true)
  } catch (error) {
    // Passed through rather than flattened. The client turns this into a line
    // that says the tutor could not be reached — it never invents an answer.
    const reason = error instanceof Error ? error.message : 'the tutor could not be reached'
    return json({ error: reason }, 502, origin)
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
