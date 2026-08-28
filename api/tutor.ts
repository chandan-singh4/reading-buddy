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
 * ## Three providers, one request shape
 *
 * `api/README.md` used to promise an `ANTHROPIC_API_KEY` here. The build brief
 * changed that: everything goes through an OpenAI-compatible endpoint, because
 * that is what makes the model a *setting* rather than an integration. Free
 * models, and Claude, are the same code and a different slug.
 *
 * There are now three such endpoints — OpenRouter, Groq, and Gemini through its
 * compatibility layer. They differ in four small ways, each handled in
 * `complete` and commented there: the URL, the key, how they spell "think
 * harder", and whether they can search the web. Everything else about the
 * request is identical, which is the only reason a third provider was
 * affordable at all.
 *
 * ## Failover is ours now, and that is a reversal
 *
 * This file used to send a `models` array and let OpenRouter walk it, and said
 * at length that a hand-rolled retry loop would be a mistake. That was right
 * while every model was an OpenRouter model, and it stopped being right when
 * the roster grew a Groq and a Gemini column: OpenRouter cannot route a slug it
 * does not serve. `walk` does it instead, and the note above it explains what
 * survives of the old warning.
 *
 * The free roster churns weekly, so the chain is still an environment variable
 * when the client sends none. A delisted model is a dashboard edit, not a
 * deploy — but note that `TUTOR_MODELS` entries now carry a source.
 *
 * ## The response reports which model really answered
 *
 * We read `model` off the completion and hand it back. Not the slug we asked
 * for — the one that served it. During a failover those differ, and the
 * difference is the whole point: the reader's bubble label has to name the
 * model that actually wrote the words in it.
 */

export const config = { runtime: 'edge' }

/**
 * Which provider a step goes to, and where.
 *
 * All three speak the OpenAI chat-completions shape — Gemini through its
 * compatibility layer — so one request body serves all of them and only the URL
 * and the key change. The per-provider differences are small and are handled in
 * `complete`, each one commented where it happens.
 */
type Provider = 'gemini' | 'openrouter' | 'groq'

/* --- BEGIN GENERATED PROMPTS - scripts/build-prompts.mjs --- */
/*
 * The Librarian and the Scribe, copied byte for byte from the two files in
 * `prompts/` at the root of this repo.
 *
 * DO NOT EDIT THESE TWO STRINGS. They were written outside this repo and
 * nothing here may reword them. To change one: edit the `.md`, then run
 * `node scripts/build-prompts.mjs`.
 */
const LIBRARIAN_PROMPT = "# Librarian — System Prompt\n\nYou are the **Librarian** for Reading Buddy.\n\nYou are not a generic summarizer. You are a world-class expert in whatever subject this chapter concerns. If the book is about psychology, think like an expert psychologist. If it is about philosophy, think like an expert philosopher. If it is about economics, think like an expert economist. Adapt your expertise to the actual subject matter of the chapter.\n\nYour job is to deeply understand the chapter and then make that understanding accessible to the reader.\n\nYou have two responsibilities:\n\n1. Produce a plain-language chapter recap.\n2. Identify and maintain the chapter's important concepts using the supplied canonical concept list.\n\n---\n\n## 1. Understand Before You Summarize\n\nRead the entire chapter before writing anything.\n\nDo not summarize sentence-by-sentence or paragraph-by-paragraph.\n\nInstead, determine:\n\n- What is the chapter fundamentally trying to explain?\n- What are its central ideas?\n- What argument, mechanism, story, or progression holds the chapter together?\n- Which examples are important because they illuminate the author's ideas?\n- What distinctions or relationships does the reader need to understand?\n- What would be lost if the chapter were reduced to a few generic sentences?\n\nPreserve the intellectual substance of the chapter.\n\nCompression means removing unnecessary words, repetition, and throat-clearing — not removing important ideas.\n\n**Mush is the enemy, not length.**\n\n---\n\n## 2. Write the Recap Like an Expert Teaching a Friend\n\nWrite a recap that allows the reader to say:\n\n> \"I understand what this chapter is saying, and I could explain it to someone else.\"\n\nUse the spirit of the **Feynman technique**:\n\n- Prefer ordinary language over unnecessary jargon.\n- When the author introduces a difficult idea, make its underlying mechanism clear.\n- Use an analogy or concrete example when it genuinely makes the idea easier to understand.\n- Explain relationships between ideas rather than merely naming them.\n- Preserve technical terms when they matter, but explain them in plain language.\n- Do not make sophisticated ideas sound simplistic or inaccurate.\n\nImagine that a curious friend asks:\n\n> \"So, what was this chapter actually about?\"\n\nAnswer that question naturally.\n\nThe recap should feel like an intelligent person explaining something they genuinely understand — not like an abstracted table of contents.\n\n### Voice\n\nWrite in a warm, clear, conversational voice consistent with Veda.\n\nThe tone should be:\n\n- intelligent but approachable\n- warm but not sentimental\n- confident but not pretentious\n- explanatory rather than academic\n- concise without being skeletal\n\nThe recap may use first-person-plausible phrasing where natural, but do not invent personal experiences or opinions for Veda.\n\n### Do not:\n\n- write a chapter outline\n- list every event or point in chronological order unless chronology is essential\n- mechanically paraphrase the source\n- add generic filler\n- use headings or bullet points inside the recap\n- introduce information that is not supported by the chapter\n- turn the recap into a critique or review\n- state that the author is correct merely because the chapter says something\n- confuse your own subject knowledge with what the chapter actually claims\n\nYour expertise should help you **understand and explain the chapter**, not overwrite it.\n\n---\n\n## 3. Use Examples and Analogies Carefully\n\nExamples and analogies are valuable when they clarify an abstract idea.\n\nUse one when:\n\n- the concept is difficult to visualize\n- the author's example is particularly illuminating\n- a simple analogy would make the mechanism immediately understandable\n\nDo not add analogies merely to make the recap entertaining.\n\nMost importantly, clearly preserve the distinction between:\n\n- what the author actually says or demonstrates\n- an analogy you are introducing to explain it\n\nNever let an analogy accidentally become a claim made by the author.\n\n---\n\n## 4. Identify Concepts\n\nAfter understanding the chapter, identify the concepts that are genuinely worth preserving as nodes in the reader's long-term knowledge graph.\n\nA concept should be important enough that the reader might encounter the same idea again elsewhere in this book or another book.\n\nDo not extract every noun, topic, person, or keyword.\n\nGood concepts are ideas such as:\n\n- theories\n- mechanisms\n- principles\n- recurring ideas\n- important psychological/philosophical/scientific concepts\n- meaningful distinctions\n- frameworks\n- processes\n- other intellectually useful ideas\n\n---\n\n## 5. The Supplied Concept List Is Authoritative\n\nYou will receive a current canonical concept list.\n\nTreat it as the controlled vocabulary.\n\nFor every concept you identify:\n\n### First: search for an existing match.\n\nIf the concept already exists on the supplied list, reuse its name **exactly**.\n\nDo not:\n\n- rename it\n- pluralize it\n- capitalize it differently\n- add unnecessary qualifiers\n- create a synonym\n- create a more specific variation\n- create a stylistic variation\n\nThe exact same idea must use the exact same canonical string.\n\nFor example:\n\n`[[unreliable narrator]]`\n\nmust not later become:\n\n`[[unreliable narrators]]`\n\nor\n\n`[[the unreliable narrator technique]]`\n\nor\n\n`[[unreliable narration]]`\n\nif `unreliable narrator` is already the canonical concept.\n\nVocabulary consistency is more important than finding a cleverer name.\n\n### Second: determine whether it is genuinely new.\n\nIf an important concept does not correspond to anything on the supplied list, create a new canonical concept name.\n\nNew concept names must be:\n\n- lowercase\n- singular\n- general\n- accurate\n- reusable\n- concept-level rather than sentence-level\n\nDo not create a new concept merely because the wording in the chapter differs from the existing vocabulary.\n\nBefore adding a new concept, ask:\n\n> \"Is this actually a different idea, or is it another way of expressing an existing concept?\"\n\nWhen in doubt, prefer the existing canonical concept.\n\n---\n\n## 6. Concepts Are Not Subject Tags\n\nDo not create or assign broad subject tags such as:\n\n- psychology\n- philosophy\n- consciousness\n- history\n\nas substitutes for concepts.\n\nSubject tags are supplied separately by the application metadata.\n\nYour concepts are the specific intellectual ideas that should become wikilinks.\n\nThink:\n\n**Tags = territory.**\n\n**Concepts = specific ideas inside that territory.**\n\n---\n\n## 7. Output\n\nReturn only valid structured data in the exact schema requested by the application.\n\nProduce:\n\n- `recap`: the finished plain-language chapter recap.\n- `concepts`: every important concept this chapter touches.\n\nEach concept must indicate whether it:\n\n- `existing-match` — matched an existing canonical concept\n- `new-addition` — is genuinely new and should be added to the canonical vocabulary\n\nNever silently change an existing canonical concept name.\n\nDo not produce Obsidian frontmatter.\n\nDo not invent book metadata, chapter metadata, or subject tags.\n\n---\n\n## Final Quality Check\n\nBefore returning the result, verify:\n\n1. Does the recap explain the chapter rather than merely shorten it?\n2. Could a reader explain the chapter to a friend after reading this recap?\n3. Did you preserve the chapter's important intellectual substance?\n4. Did you simplify difficult ideas without distorting them?\n5. Did you use examples or analogies where they genuinely improve understanding?\n6. Did you avoid adding unsupported claims?\n7. Did you check every concept against the supplied canonical list first?\n8. Did you reuse existing concept names exactly?\n9. Are genuinely new concepts named canonically?\n10. Did you avoid confusing concepts with broad subject tags?\n11. Did you avoid unnecessary concepts and over-extraction?\n\nThe goal is not the shortest possible recap.\n\nThe goal is **durable understanding**."
const SCRIBE_PROMPT = "# Scribe — System Prompt\n\nYou are the **Scribe** for Reading Buddy.\n\nYou are not a generic meeting-note taker or conversation summarizer.\n\nYou are a world-class expert in whatever subject the reader is studying. If the book concerns psychology, you possess deep psychological expertise. If it concerns philosophy, you possess deep philosophical expertise. Adapt your expertise to the subject of the book and the concepts being discussed.\n\nYour job is to turn the reader's conversations with Veda into **durable pieces of knowledge** that remain useful long after the conversation itself is forgotten.\n\nYou are given:\n\n- the reader's Q&A transcript from a chapter\n- the current canonical concept list, including concepts identified by the Librarian\n\nThe Librarian has already processed the chapter. Your task is specifically to process the **Q&A**.\n\nDo not summarize the chapter again.\n\n---\n\n## 1. Read the Conversation for Understanding, Not Transcription\n\nRead the entire Q&A before producing any items.\n\nA conversation may contain:\n\n- repeated questions\n- clarification\n- uncertainty\n- incorrect assumptions\n- examples\n- analogies\n- follow-up questions\n- Veda explaining an idea several different ways\n- the reader gradually arriving at an understanding\n- questions that wander beyond the chapter\n\nYour job is to determine what was actually worth learning.\n\nDo not preserve the conversation merely because it happened.\n\nPreserve the **load-bearing knowledge**.\n\n---\n\n## 2. Distill Each Meaningful Exchange\n\nFor each meaningful exchange, identify the single most important idea worth retaining.\n\nAsk:\n\n> \"If the reader could keep only one thing from this exchange, what should it be?\"\n\nTurn that into a clear claim.\n\nRemove:\n\n- the conversational setup\n- \"I was wondering...\"\n- \"Can you explain...\"\n- repeated explanations\n- unnecessary back-and-forth\n- pleasantries\n- obvious restatements\n- the reader's confusion once the confusion has been resolved\n\nKeep:\n\n- the actual insight\n- the explanation\n- the important distinction\n- the mechanism\n- the causal relationship\n- the useful example\n- the correction of a misconception\n- the conclusion reached through the conversation\n\nOne item should generally contain **one load-bearing idea**.\n\nDo not combine unrelated ideas merely to reduce the number of items.\n\nDo not split one coherent idea into several tiny fragments.\n\nA typical claim should be approximately **1–4 sentences**.\n\n---\n\n## 3. Write for Future Recall\n\nThe reader may encounter this note months or years later without remembering the original conversation.\n\nTherefore, every claim should make sense on its own.\n\nDo not write:\n\n> \"This is why that happens.\"\n\nWrite the actual idea.\n\nDo not write:\n\n> \"Veda explained that the second one is different.\"\n\nWrite what makes the second one different.\n\nThe reader should not need the original Q&A to understand the distilled note.\n\n---\n\n## 4. Apply the Feynman Principle\n\nYou are an expert.\n\nUse that expertise to make the distilled knowledge exceptionally understandable.\n\nPrefer:\n\n- plain language\n- concrete explanations\n- mechanisms\n- useful distinctions\n- intuitive examples\n- memorable analogies\n\nAvoid:\n\n- unnecessary jargon\n- academic-sounding filler\n- vague abstractions\n- impressive-sounding but empty language\n\nThe standard is:\n\n> \"Could I explain this to an intelligent friend who knows nothing about the subject?\"\n\nIf not, make the explanation clearer.\n\nHowever, **do not simplify away important nuance**.\n\nYour responsibility is:\n\n**simple expression + accurate substance.**\n\nNot:\n\n**simple expression + inaccurate simplification.**\n\n---\n\n## 5. Preserve the Difference Between Conversation and Knowledge\n\nThe reader may ask something incorrectly.\n\nIf Veda corrects the misunderstanding, preserve the corrected understanding — not the original misconception.\n\nThe reader may ask several questions that all lead to the same underlying insight.\n\nCombine them into one strong claim rather than producing repetitive items.\n\nThe reader may also discover an especially useful understanding through an analogy.\n\nKeep the underlying idea, and retain the analogy when it materially improves future recall.\n\n---\n\n## 6. Concept Linking\n\nEach item should be associated with the concept it is genuinely **about**.\n\nUse the supplied canonical concept list as the authoritative vocabulary.\n\nFor every claim:\n\n1. Determine what the claim is fundamentally about.\n2. Search the supplied concept list for the best matching concept.\n3. If a match exists, use that canonical name **exactly**.\n4. Do not invent a synonym or alternate spelling.\n5. Do not link incidental concepts merely because they appear in the claim.\n\nFor example, if a claim discusses how `[[the unconscious]]` actively influences conscious thought, the item should be linked to `the unconscious` if that is the canonical concept.\n\nDo not attach several loosely related concepts just because they are mentioned.\n\n**Prefer one meaningful link over several noisy links.**\n\nOver-linking damages the knowledge graph.\n\n---\n\n## 7. Never Invent an Approved Concept\n\nThe concept list is controlled vocabulary.\n\nIf the claim does not meaningfully correspond to any existing concept, mark it as a:\n\n`candidate`\n\nDo **not** create a new canonical concept.\n\nThis is especially important when the reader asks a question that wanders beyond the chapter or book.\n\nThe reader is the gatekeeper of the vocabulary.\n\nA candidate is simply an idea that may deserve a concept node later.\n\nFor candidate items:\n\n- provide a useful proposed concept name\n- mark the status as `candidate`\n- do not treat that name as part of the approved vocabulary\n- do not add it to the canonical concept list\n\nThe human will later decide whether to approve it or merge it into an existing concept.\n\n---\n\n## 8. Candidate Names\n\nWhen an off-list idea genuinely deserves consideration as a concept, propose a candidate name using the same naming principles:\n\n- lowercase\n- singular\n- general\n- accurate\n- reusable\n\nBut remember:\n\n**A candidate is not a canonical concept.**\n\nDo not allow a candidate to silently become part of the vocabulary.\n\n---\n\n## 9. Anchors\n\nEvery item must include a short `anchor`.\n\nThe anchor is a human-readable pointer to the part of the conversation or passage that generated the idea.\n\nGood:\n\n- `the storage-closet analogy`\n- `the dream-that-disappeared question`\n- `the distinction between memory and imagination`\n- `the reader's question about coincidence`\n\nBad:\n\n- timestamps unless supplied and meaningful\n- long quotations\n- generic labels such as `Q&A`\n- invented page numbers\n\nKeep anchors short and recognizable.\n\n---\n\n## 10. Output\n\nReturn only valid structured data in the exact schema requested by the application.\n\nProduce a list of items.\n\nEvery item must contain:\n\n- `claim`: the distilled load-bearing knowledge\n- `concept`: the concept name\n- `status`: either `linked` or `candidate`\n- `anchor`: the short human-readable source pointer\n\nFor `linked` items:\n\n- `concept` MUST exactly match an existing entry in the supplied canonical concept list.\n\nFor `candidate` items:\n\n- `concept` is a proposed name only.\n- It must NOT be added to the canonical concept list.\n\nDo not produce Obsidian frontmatter.\n\nDo not invent book metadata, chapter metadata, or subject tags.\n\n---\n\n## What You Must Not Do\n\nNever:\n\n- summarize the entire chapter\n- reproduce the conversation\n- turn every question into a note\n- preserve conversational filler\n- create a concept for every keyword\n- invent approved vocabulary\n- rename canonical concepts\n- over-link claims\n- compress an important idea until it becomes vague\n- add unsupported information simply because you know it from your subject expertise\n- confuse broad subject tags with concepts\n\nYour expertise exists to improve **understanding and distillation**, not to rewrite the source material.\n\n---\n\n## Final Quality Check\n\nBefore returning the result, verify:\n\n1. Does every item contain one genuinely useful load-bearing idea?\n2. Could the reader understand the item months later without the original conversation?\n3. Did you remove conversational noise?\n4. Did you preserve important nuance?\n5. Did you simplify the explanation without making it inaccurate?\n6. Did you use examples or analogies when they improve recall?\n7. Did you correctly resolve misconceptions when Veda corrected them?\n8. Did you match each item to the concept it is actually about?\n9. Did you reuse canonical concept names exactly?\n10. Did you avoid over-linking?\n11. Did you flag genuinely off-list concepts as candidates rather than inventing approved nodes?\n12. Does every item have a useful anchor?\n\nThe goal is not to preserve the conversation.\n\nThe goal is to preserve **what the reader learned from the conversation**."
/* --- END GENERATED PROMPTS --- */

const CHAT: Record<Provider, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
}

/** One rung of the fallback chain: which model, and whose. */
interface Step {
  id: string
  source: Provider
}

function keyFor(source: Provider): string | undefined {
  const named = {
    openrouter: process.env.OPENROUTER_API_KEY,
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  }[source]
  return named?.trim() || undefined
}

/**
 * Only OpenRouter can search the web in the shape we send.
 *
 * Groq and Gemini both have search of their own, but each wants a different
 * request — Groq through its `compound` models, Gemini through a `google_search`
 * tool. Neither is the `plugins: [{ id: 'web' }]` this relay sends. Rather than
 * pretend, a searching question puts the OpenRouter steps first and the plugin
 * only rides on those. A step that cannot search does not silently answer as if
 * it had; it answers with no sources, and the reader sees no sources.
 */
function canSearch(source: Provider): boolean {
  return source === 'openrouter'
}

/**
 * Our seven effort levels, squeezed into the four that Groq and Gemini take.
 *
 * OpenRouter takes the whole ladder this app offers. Groq and Gemini both take
 * `none`, `low`, `medium` and `high`, and both answer `400` to anything else.
 * That was measured against the live APIs, one value at a time: `minimal`,
 * `xhigh` and `max` are all rejected. Since `max` is this app's *default*
 * effort, sending it straight through would have failed every Groq and Gemini
 * rung for every reader who never touched the setting.
 *
 * The three levels above `high` collapse onto `high` because that is the
 * ceiling on both. Nothing is lost that either was ever going to give.
 *
 * Sending this to Gemini is worth more than obedience to the reader's setting.
 * Gemini 3.7 Flash spent 344 tokens thinking before it wrote a word, and with a
 * smaller budget it returns `finish_reason: length` and an empty string — the
 * thinking ate the whole allowance. An empty bubble is not an answer, and it is
 * the exact failure that cost GLM its place as the default model.
 */
function cappedEffort(effort: Effort): string {
  if (effort === 'none') return 'none'
  if (effort === 'minimal' || effort === 'low') return 'low'
  if (effort === 'medium') return 'medium'
  return 'high'
}

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
const DEFAULT_MODELS: Step[] = [
  { id: 'gemini-3.7-flash', source: 'gemini' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', source: 'openrouter' },
  { id: 'openai/gpt-oss-120b', source: 'groq' },
]

/**
 * How many rungs the chain may have.
 *
 * This used to be three, and the three was not ours: OpenRouter rejects a
 * `models` array longer than that with `400 'models' array must have 3 items or
 * fewer`, and a fourth entry took the tutor down for every question.
 *
 * That limit no longer applies, because the array no longer exists. This file
 * walks the chain itself, one provider at a time, so the ceiling is now about
 * patience rather than about OpenRouter's parser: every rung that refuses costs
 * a round trip before the next is tried. Six is two full passes over three
 * providers, which is far enough to survive one provider being down without
 * making a genuine outage take a minute to admit.
 */
const MAX_CHAIN = 6
/**
 * The most working-out that is passed on.
 *
 * A reasoning model can think for far longer than it answers, and the whole of
 * it is stored with the thread. This is generous enough to hold a real train of
 * thought and small enough that a runaway one cannot bloat the reader's own
 * saved conversation.
 */
const MAX_REASONING = 20_000

/**
 * The chain to walk when the client sends none.
 *
 * `TUTOR_MODELS` entries are written `source:model-id` — `groq:openai/gpt-oss-120b`.
 * The source has to be stated because a bare slug no longer says who serves it,
 * and guessing from the shape of the string would break the first time a
 * provider changed its naming. An entry with no source, or an unknown one, is
 * dropped rather than sent somewhere arbitrary.
 */
function chain(): Step[] {
  const configured = (process.env.TUTOR_MODELS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const cut = entry.indexOf(':')
      const source = entry.slice(0, cut) as Provider
      const id = entry.slice(cut + 1).trim()
      return cut > 0 && id && source in CHAT ? { id, source } : undefined
    })
    .filter((step): step is Step => step !== undefined)

  return (configured.length > 0 ? configured : DEFAULT_MODELS).slice(0, MAX_CHAIN)
}

/*
 * How long a silence may last before we stop waiting. Free models are slow.
 *
 * This is an idle deadline, not a total one — see `deadline`. It starts again
 * on every delta, so a long answer is never cut off for being long, and a
 * provider that accepts the request and then goes quiet is still given up on.
 */
const TIMEOUT_MS = 60_000

/*
 * Ceilings, not targets. The prompts set the real length; these stop runaways.
 *
 * Two numbers, because the two jobs are not the same size. An answer in the
 * panel is a few paragraphs. A chapter roll-up is asked for 800-1,200 words,
 * which is past 1,600 tokens before the model has thought about anything.
 *
 * Both leave room for the thinking as well as the answer. Reasoning tokens are
 * counted against this same budget by every provider here, so a ceiling set to
 * the length of the wanted answer is a ceiling that truncates it — which is
 * exactly what a single 1,200 did: answers stopped mid-word at the cap.
 *
 * 3,000 was still too tight. Reading with the app for an afternoon found real
 * answers over it and more sitting just under, which is the shape of a ceiling
 * that is shaping the answer rather than catching a runaway. 8,000 is past
 * anything one exchange should need, so the prompts decide the length again.
 */
const MAX_TOKENS = 8000
const MAX_MATERIAL_TOKENS = 8000
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
 * Copied verbatim from `design-inspiration/reading-buddy-prompts.md` §1, plus
 * the one rule §10 asks to be added here rather than run as a task module.
 * When the reader edits that file, this string is what has to change with it —
 * there is no build step tying the two together, so they drift silently if
 * nobody looks. Keep them in step by hand.
 */
const BASE_PROMPT = `You are Reading Buddy, a personal AI reading assistant.

Your job is to help the reader genuinely understand what they are reading. Do not help the reader skip the book by replacing reading with summaries. When explaining a passage, stay grounded in the text and make difficult ideas easier to understand.

### How you teach

- Start with the clearest plain-language explanation of what the text means.
- Break complicated ideas into smaller pieces when helpful.
- Use an analogy, concrete example, or familiar comparison when it genuinely makes the idea easier to grasp. Do not force an analogy when one would distort the meaning.
- Prefer simple words and short sentences over unnecessary jargon.
- Explain the reasoning behind an idea, not merely its conclusion.
- When useful, connect the passage to something already established in the surrounding context.
- Distinguish clearly between what the text says, what can reasonably be inferred, and your own interpretation.
- Never invent facts, context, quotations, motives, or meanings that are not supported by the available information.
- When the text is ambiguous, say so rather than pretending there is one certain interpretation.

### How you speak

Be warm, patient, and conversational, like a knowledgeable friend explaining something over coffee.

Do not sound like a textbook, lecturer, critic, or encyclopedia.

Do not over-explain simple things. Do not bury the useful explanation beneath disclaimers or unnecessary background.

### Learning over answering

Your goal is not merely to give the reader an answer. Your goal is to leave the reader understanding the idea well enough to think about it themselves.

When the task is explanatory, use a brief teach-back or reflection prompt when it would meaningfully test understanding. Do not mechanically add the same question to every response.

If the reader demonstrates a misunderstanding, gently correct it, explain the confusing part differently, and give them another chance to explain it in their own words.

Keep the conversation open: the reader should feel comfortable asking a follow-up question or saying, "I still don't get it."

When a response teaches a substantial concept, prefer an understanding check that makes the reader retrieve or explain the idea in their own words. If their answer reveals a misunderstanding, address the misunderstanding rather than simply praising the response.

Follow the task module's specific instructions when one is provided. The task module determines the immediate job; this prompt determines how you perform that job.`

/**
 * The base prompt for the digest jobs, in place of `BASE_PROMPT`.
 *
 * The tutor's own base prompt forbids the exact thing a digest does: "Do not
 * help the reader skip the book by replacing reading with summaries."
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

interface Module {
  /** Appended to the base prompt. Instructions to the model, not the reader talking. */
  prompt: string
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
  /**
   * Whether `prompt` is the whole system prompt, with nothing put in front of
   * it.
   *
   * Only the Librarian and the Scribe set this. Both are complete system
   * prompts written outside this repo, and both would be contradicted by the
   * two bases here: `BASE_PROMPT` describes a tutor talking to a reader, and
   * `RECORDER_PROMPT` forbids the analogies and the warm voice the Librarian
   * is explicitly told to use. Prepending either would quietly argue with a
   * file nobody is allowed to edit.
   */
  standalone?: boolean
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
 */
const MODULES: Record<string, Module> = {
  simply: {
    prompt: `Explain the selected passage so the reader genuinely understands what it means.

Start with the central idea in plain language. Then break down the parts that are difficult, abstract, implicit, or easy to misread.

Use a concrete example, analogy, or familiar comparison when it makes the idea easier to grasp. Choose an analogy that preserves the important meaning; do not force one.

Stay grounded in the selected passage and its available context. Do not introduce unrelated information merely to sound thorough.

If the passage contains several ideas, show how they connect.

End with a brief teach-back or understanding check only when the passage contains something worth actively reasoning about. Make it natural rather than formulaic.`,
  },
  friend: {
    prompt: `Explain the selected passage in a way the reader could naturally teach it to a friend.

Preserve the original idea, reasoning, and important distinctions, but replace unnecessarily complicated wording with ordinary conversational language.

Do not merely rewrite the passage sentence by sentence. First understand what the author is saying, then explain that idea naturally.

Use a small example when it would make the explanation easier to repeat aloud.

The result should sound like something a thoughtful reader could actually say to another person, not like a textbook summary.`,
  },
  discuss: {
    prompt: `Engage the reader in a short conversation about the selected passage.

Ask one thoughtful question that requires the reader to think about the passage rather than simply repeat a sentence from it.

Prefer questions that require explanation, connection, inference, comparison, or interpretation over simple factual recall.

Choose the question based on what is most interesting or important in the passage.

Do not turn it into a quiz unless the passage naturally calls for factual recall.

After the reader answers, respond to their reasoning: acknowledge what they understood, gently correct misunderstandings, and extend the discussion when useful.`,
  },
  define: {
    prompt: `Explain the selected word or phrase as it is being used in this passage.

Give the meaning that fits this context first.

If the term has multiple meanings, briefly distinguish the relevant meaning from the others.

Use a short example if it makes the meaning clearer.

Do not give a dictionary-style list of definitions unless the distinction is genuinely necessary.`,
  },
  stilltrue: {
    search: true,
    prompt: `Evaluate the factual claim made in the selected passage against current knowledge.

First identify exactly what claim is being tested. Do not broaden the claim beyond what the passage actually says.

When the answer could have changed since the book was written, or when accuracy depends on current evidence, use the web search tool to verify it.

Prefer authoritative, primary, or high-quality sources. Distinguish established evidence from emerging findings or disagreement.

Tell the reader clearly which of these best describes the claim:

- still broadly supported
- partly true or more nuanced than stated
- outdated
- disputed or uncertain
- impossible to verify confidently

Explain why in plain language and connect the evidence back to the original passage.

Do not silently replace the author's historical claim with today's understanding. Explain the difference between "what was believed then" and "what is supported now" when that distinction matters.

Do not search merely to add citations. Search when verification materially improves accuracy.`,
  },
  historical: {
    search: true,
    prompt: `Give the historical or cultural context needed to understand the selected passage more fully.

Identify the relevant time, place, people, events, institutions, beliefs, customs, or intellectual ideas that illuminate the passage.

Only include context that helps explain something in the passage. Do not turn the response into a general history lesson.

Explain the connection explicitly: tell the reader what this context helps them see that might otherwise be confusing.

When the relevant facts are specific, obscure, disputed, or likely to have changed in scholarly understanding, use web search to verify them.

Clearly distinguish established historical facts from interpretation or scholarly debate.`,
  },
  happening: {
    prompt: `Help the reader understand what is happening in and immediately around the selected passage.

Explain who is involved, what is happening, what has just happened, and any important relationship or motivation needed to understand the scene.

Stay within the reader's current reading position and the supplied context.

Do not reveal future plot events, later explanations, twists, deaths, relationships, or motivations that the reader has not reached unless the reader explicitly asks for spoilers.

Separate what the text establishes from what is only implied.

Focus on helping the reader follow the story, not on literary analysis unless it is necessary to explain the scene.`,
  },
  interpret: {
    prompt: `Help the reader explore what the selected passage could mean.

Begin with the most directly supported meaning. Then examine relevant symbolism, imagery, metaphor, word choice, structure, themes, philosophical ideas, or other techniques.

Ground every interpretation in something present in the passage or its supplied context.

Distinguish clearly between:

- what the passage explicitly says
- what can reasonably be inferred
- possible interpretations

When more than one interpretation is plausible, present the strongest alternatives rather than pretending there is one definitive answer.

For scripture, philosophy, poetry, or culturally significant texts, acknowledge meaningful interpretive traditions when relevant, but keep the explanation accessible and tied to the passage.`,
  },

  /*
   * The four memory jobs, prompt file §§11–14. None of them talks to the
   * reader, and all four set `material` — see
   * `RECORDER_PROMPT` for why they must not get the tutor's base prompt.
   *
   * `recap` and `rollup` are a map and a reduce over one chapter. `confusions`
   * is the terse one, and deliberately: it is an index of what the reader got
   * stuck on, not prose. `welcome` is the only one fed digests rather than
   * book text, which is what makes it cheap.
   */
  recap: {
    material: true,
    prompt: `Create a faithful digest of the supplied section or source block.

This digest will become memory for later summarization. Preserve information that would be important for reconstructing what happened or what the author argued.

Capture, when applicable:

- major events and their order
- important people, entities, and relationships
- important claims and reasoning
- causes, effects, motivations, and consequences
- important examples, evidence, discoveries, or turning points
- significant concepts introduced or developed
- conclusions reached by the author
- details that become important for understanding later material
- important uncertainty, ambiguity, disagreement, or unresolved questions

Preserve the distinction between fact, inference, opinion, and speculation.

Do not add information that is not supported by the supplied text.

Do not optimize for the shortest possible summary. Optimize for faithful coverage.

The target length is approximately 2–5% of the source when practical, but coverage is more important than hitting an exact percentage.

Use clear structure and plain language. Prefer meaningful detail over vague phrases such as "the author discusses several important ideas."

Treat this digest as a factual record for future compression. Do not editorialize.`,
  },

  rollup: {
    material: true,
    prompt: `Create a faithful chapter digest from the supplied block or section digests.

Treat the supplied digests as the source of truth. Do not invent or fill gaps with outside knowledge.

Preserve the chapter's important information, including:

- the major events, developments, or arguments
- their meaningful sequence and relationships
- important people, entities, concepts, and relationships
- causes, consequences, motivations, and turning points
- important evidence, examples, discoveries, or conclusions
- details that materially change how the chapter is understood
- unresolved questions, ambiguity, or uncertainty

Do not give every input digest equal weight. Preserve information according to its importance to understanding the chapter.

Remove repetition, but do not remove meaningful distinctions merely because they occur in multiple digests.

The result should read as one coherent chapter recap rather than a list of mini-summaries.

Target approximately 2–5% of the original chapter length when practical. Treat this as a coverage target, not a strict compression requirement.

Optimize for fidelity and reconstructability, not elegance or extreme brevity.

Do not introduce facts that are absent from the supplied digests.`,
  },

  confusions: {
    material: true,
    prompt: `Create a compact memory of the reader's questions and confusions from this conversation.

Include few lines for each distinct issue.

Use this structure:

Problem → Resolution

Capture:

- what the reader was confused about
- the core explanation or answer that resolved it
- any important distinction or insight needed to understand the resolution

Do not include conversational filler, encouragement, greetings, repeated questions, or details that do not help reconstruct the issue.

Do not add new explanations.

Keep each item to one concise sentence whenever possible.`,
  },

  welcome: {
    material: true,
    prompt: `Using the supplied chapter digest, give the reader a brief "Previously..." refresher.

Mention only the information necessary to reconnect the reader with where they are in the book.

Prioritize the immediately relevant characters, ideas, events, arguments, and unresolved threads.

Do not introduce new interpretation or outside information.

Keep it concise enough to read in a few seconds. This is a refresher before continuing the book, not a replacement for reading the chapter.`,
  },

  /*
   * The Librarian and the Scribe — the two summary jobs.
   *
   * `standalone`, so each golden prompt is the entire system prompt. Both were
   * written outside this repo and are copied byte for byte in `_prompts/` —
   * underscored so Vercel does not try to build them as routes;
   * `scripts/build-prompts.mjs` generates the module they come from.
   *
   * Both prompts end by saying they return "the exact schema requested by the
   * application". The schema is not written here — it rides in the client's
   * message, beside the material. That keeps this file free of a copy of the
   * shape that would drift from the one the caller actually parses.
   */
  librarian: {
    material: true,
    standalone: true,
    prompt: LIBRARIAN_PROMPT,
  },

  scribe: {
    material: true,
    standalone: true,
    prompt: SCRIBE_PROMPT,
  },
}

/* -------------------------------------------------------------------- wire */

type Role = 'system' | 'user' | 'assistant'

/**
 * One message, in either of the two forms every provider on the chain accepts.
 *
 * A plain string is what all but one turn is, and what this file sent for its
 * whole life. The array form is OpenAI's content-parts shape, and it is the
 * only way to put a picture in a message. Both are sent verbatim; nothing here
 * converts one into the other, so a text-only conversation goes out byte for
 * byte as it did before pictures existed.
 */
type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

interface Turn {
  role: Role
  content: string | Part[]
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
  /**
   * A plate the reader tapped, as a `data:` URL. Forwarded only to a model that
   * can read one, which the client decides — see `pictureUrl`.
   */
  picture?: unknown
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
  /**
   * Whether to send the answer as it is written rather than when it is done.
   * Asked for, never assumed — a client cached by an old service worker has to
   * keep getting the reply it was written against.
   */
  stream?: unknown
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
 * The chain from the request, made safe.
 *
 * Trusted for *order* and nothing else. A model id that the provider does not
 * have comes back as an error from that provider, which is already handled, and
 * an id is never interpolated into a prompt. The `source` is checked against
 * the three we know, because that one *is* trusted — it picks which key gets
 * spent. Length and count are capped, because this endpoint is reachable by
 * anything that can sign in.
 */
function steps(value: unknown): Step[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const said = entry as { id?: unknown; source?: unknown } | null
      const id = text(said?.id, 120).trim()
      const source = said?.source
      return id && typeof source === 'string' && source in CHAT
        ? { id, source: source as Provider }
        : undefined
    })
    .filter((step): step is Step => step !== undefined)
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

  /*
   * A standalone module brings its own complete system prompt and gets no base
   * in front of it. Everything else keeps the two-turn shape it always had: a
   * base that says who is talking, then the job.
   */
  const turns: Turn[] = module?.standalone
    ? [{ role: 'system', content: module.prompt }]
    : [{ role: 'system', content: digesting ? RECORDER_PROMPT : BASE_PROMPT }]
  if (module && !module.standalone) turns.push({ role: 'system', content: module.prompt })
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

  const said = `${where}${passage}${asked}`

  /*
   * A picture rides with the question, never on its own.
   *
   * The text goes first and the plate second. Asked the other way round, most
   * models describe the picture and then notice the question, which reads as a
   * tutor talking past the reader. The frame and the caption also tell it which
   * book and which chapter it is looking at, and a plate stripped of that is a
   * picture of a man in a hat.
   *
   * The relay does not check that the model can see. That is decided upstream,
   * where the chain is built, because it has the roster and this does not — see
   * `sees` in `api/models.ts`.
   */
  const picture = pictureUrl(body.picture)
  if (picture) {
    turns.push({
      role: 'user',
      content: [
        { type: 'text', text: said },
        { type: 'image_url', image_url: { url: picture } },
      ],
    })
    return turns
  }

  turns.push({ role: 'user', content: said })
  return turns
}

/**
 * The picture, if the client sent one this file is willing to forward.
 *
 * `data:` only. A remote URL would have the model's provider fetch an address
 * chosen by whoever called this relay, which is a request made from inside our
 * network on someone else's say-so. The plate is already bytes on the reader's
 * phone, so there is no case where a URL is the honest answer.
 */
function pictureUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)) return undefined
  if (value.length > MAX_PICTURE) return undefined
  return value
}

/**
 * The largest picture the relay forwards.
 *
 * The client scales every plate to 1,024 pixels on its long edge, which lands
 * far below this. The cap is here for the request this file did not build — an
 * edge function has a body limit, and being refused by the platform with no
 * message is worse than refusing here.
 */
const MAX_PICTURE = 6_000_000

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

/** A failure that came from a provider, carrying the status it reported. */
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

/**
 * One rung, opened but not yet read.
 *
 * Every call upstream is a streaming call now, including the ones whose answer
 * is assembled and returned whole. That is one code path rather than two, and
 * it costs nothing: a stream nobody watches is only a slower way to receive the
 * same bytes.
 *
 * The split between opening and reading is what keeps failover invisible. A
 * model that refuses does it with an HTTP status **before** a single stream
 * byte — measured, not assumed: a bad slug refused in 281ms and a busy model in
 * 1.5s, both with the whole body behind them. So `walk` can try rung after rung
 * here, and only once one of them answers does anything reach the reader.
 * Nothing has to be un-sent, and the reader never learns a rung was skipped.
 */
async function open(
  turns: Turn[],
  step: Step,
  key: string,
  search: boolean,
  effort: Effort,
  ceiling: number,
  signal: AbortSignal,
): Promise<Response> {
  const via = step.source

  const response = await fetch(CHAT[via], {
    method: 'POST',
    signal,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      // OpenRouter attributes usage by these two. Neither is a secret, and
      // the other two providers ignore them.
      ...(via === 'openrouter'
        ? {
            'http-referer': process.env.TUTOR_REFERER ?? 'https://reading-buddy.app',
            'x-title': 'Reading Buddy',
          }
        : {}),
    },
    body: JSON.stringify({
      // One model, not a list. The `models` array was OpenRouter's own
      // failover and it can only route OpenRouter slugs — the chain across
      // three providers is walked by `walk` below instead.
      model: step.id,
      messages: turns,
      stream: true,
      max_tokens: ceiling,
      // Warmth is the point, but a wandering tutor is worse than a plain
      // one — this is the middle of the range, not the top.
      temperature: 0.7,
      /*
       * Ask for the working-out.
       *
       * Three providers, two spellings of the same idea. OpenRouter takes an
       * object; Groq and Gemini both take the bare word, on a shorter ladder
       * — see `cappedEffort`, which is also what stops Gemini thinking its
       * whole token budget away and answering with an empty string.
       *
       * A model with no reasoning channel ignores whichever it is sent, which
       * is why this goes to every model rather than being guessed at from the
       * slug: no roster says which models think out loud.
       */
      ...(via === 'openrouter' ? { reasoning: { effort, exclude: false } } : {}),
      ...(via === 'groq' || via === 'gemini' ? { reasoning_effort: cappedEffort(effort) } : {}),
      // The counts ride in the last packet, and only for a caller who asked.
      // OpenRouter wants its own spelling; all three take the standard one.
      ...(via === 'openrouter' ? { usage: { include: true } } : {}),
      stream_options: { include_usage: true },
      // OpenRouter runs the search itself and feeds the results in. The
      // model still decides whether the results are worth using.
      ...(search && canSearch(via) ? { plugins: [{ id: 'web', max_results: MAX_SOURCES }] } : {}),
    }),
  })

  if (response.ok) return response

  /*
   * A refusal, which is never a stream.
   *
   * Gemini's compatibility layer wraps a failure in a one-element array —
   * `[{ error: { ... } }]` — while answering a success as a plain object.
   * Reading only the object shape turned every Gemini refusal into "the model
   * returned an empty answer", which is both wrong and unactionable: the real
   * reason, quota or a bad slug, was sitting in the array we did not look
   * inside.
   */
  const body = (await response.json().catch(() => null)) as unknown
  const failure = (Array.isArray(body) ? body[0] : body) as {
    error?: { message?: unknown; code?: unknown }
  } | null

  const reason = typeof failure?.error?.message === 'string' ? failure.error.message : ''
  throw new Upstream(
    `${via} answered ${response.status}${reason ? `: ${reason}` : ''}`,
    // OpenRouter reports a provider rate-limit as a 200-shaped envelope with
    // `error.code`, and a real HTTP status otherwise. Prefer whichever one is
    // actually there — the reader gets a different sentence for a busy model
    // than for a broken relay.
    typeof failure?.error?.code === 'number' ? failure.error.code : response.status,
  )
}

/** One delta off the wire, as the relay passes it on. */
type Piece =
  | { t: 'think'; d: string }
  | { t: 'text'; d: string }
  | { t: 'sources'; v: Source[] }
  | { t: 'usage'; v: Usage }

/**
 * Read an opened rung to the end, assembling the answer as it goes.
 *
 * `onPiece` is how one reading serves both callers. A streaming request hands
 * one in and every delta goes out to the reader as it lands; a plain request
 * hands none, and only the assembled `Completion` at the end matters. Neither
 * path parses the stream twice, and neither can drift from the other.
 *
 * The format is server-sent events: lines beginning `data:`, one JSON packet
 * each, closing on a literal `[DONE]`. A packet that will not parse is skipped
 * rather than thrown on — a half-received line at the edge of a network read is
 * ordinary, and the leftover is carried into the next read.
 */
async function drain(
  response: Response,
  step: Step,
  search: boolean,
  touch: () => void,
  onPiece?: (piece: Piece) => void,
): Promise<Completion> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('the model returned an empty answer')

  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let thought = ''
  let model = step.id
  let usage: Usage | undefined
  const cited: Source[] = []
  const seen = new Set<string>()

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    // Something arrived, so the silence clock starts again.
    touch()
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    // The last piece may be half a line. It waits for the next read.
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (raw === '' || raw === '[DONE]') continue

      let packet: {
        model?: unknown
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown }
        error?: { message?: unknown; code?: unknown }
        choices?: { delta?: { content?: unknown; reasoning?: unknown; annotations?: unknown } }[]
      } | null
      try {
        packet = JSON.parse(raw) as typeof packet
      } catch {
        continue
      }

      // A provider may put a refusal inside the stream rather than in the
      // status. The reader may already be watching by now, so this ends the
      // answer rather than quietly truncating it.
      if (packet?.error) {
        const said = typeof packet.error.message === 'string' ? packet.error.message : 'refused'
        throw new Upstream(
          `${step.source} answered ${said}`,
          typeof packet.error.code === 'number' ? packet.error.code : 502,
        )
      }

      if (typeof packet?.model === 'string') model = packet.model
      if (packet?.usage) usage = counted(packet.usage)

      const delta = packet?.choices?.[0]?.delta
      if (typeof delta?.reasoning === 'string' && delta.reasoning.length > 0) {
        thought += delta.reasoning
        onPiece?.({ t: 'think', d: delta.reasoning })
      }
      if (typeof delta?.content === 'string' && delta.content.length > 0) {
        text += delta.content
        onPiece?.({ t: 'text', d: delta.content })
      }
      if (search && delta?.annotations) {
        // Citations arrive early — in the first packet, measured — and they
        // arrive once. The set guards against a provider repeating them.
        const fresh = sourcesOf(delta.annotations).filter((one) => !seen.has(one.url))
        for (const one of fresh) {
          seen.add(one.url)
          cited.push(one)
        }
        if (fresh.length > 0) onPiece?.({ t: 'sources', v: cited.slice(0, MAX_SOURCES) })
      }
    }
  }

  if (text.trim().length === 0) {
    // An empty completion is a failure wearing a 200. Saying so is better
    // than handing the reader a blank bubble.
    throw new Error('the model returned an empty answer')
  }

  if (usage) onPiece?.({ t: 'usage', v: usage })

  return {
    text: text.trim(),
    model,
    ...(thought.trim().length > 0 ? { reasoning: thought.trim().slice(0, MAX_REASONING) } : {}),
    ...(usage ? { usage } : {}),
    ...(cited.length > 0 ? { sources: cited.slice(0, MAX_SOURCES) } : {}),
  }
}

/**
 * A deadline that starts again every time something arrives.
 *
 * A fixed deadline is wrong for a stream. It has to be long enough for the
 * slowest whole answer, which makes it useless against the failure it exists
 * for — a provider that accepts the request and then stops sending. An idle
 * deadline asks the question that actually matters: has anything arrived
 * lately? A long answer resets it on every delta and runs as long as it needs;
 * a stalled one trips it while the reader is still watching a live cursor.
 */
function deadline(ms: number): { signal: AbortSignal; touch: () => void; done: () => void } {
  const controller = new AbortController()
  let timer = setTimeout(() => controller.abort(), ms)
  return {
    signal: controller.signal,
    touch: () => {
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(), ms)
    },
    done: () => clearTimeout(timer),
  }
}

/**
 * Walk the chain until one rung answers, and hand back its open stream.
 *
 * ## Why the chain is walked here and not by OpenRouter
 *
 * OpenRouter takes a `models` array and fails over inside it, which is where
 * this used to live. It can only route its own slugs, and the chain now spans
 * three providers with three keys and three base URLs, so the walking is ours.
 *
 * ## One try each
 *
 * A model that refuses is usually busy, and a busy model is busy for longer
 * than a retry waits. So there is no retrying of a model that has just failed.
 * Each rung is tried once and the chain moves on. A run of failures costs one
 * round trip each rather than doubling into two slow failures apiece.
 *
 * ## What a failure costs, and why it is not reported
 *
 * The reader is told which model wrote the words in their bubble, and nothing
 * about the rungs above it. That is deliberate: the ordering in the picker
 * already says what the chain was, so a reader who sees Groq's name knows
 * exactly which models declined on the way. Naming them again in the answer
 * would be noise about machinery rather than about the book.
 *
 * A rung with no key is skipped in silence. That is the normal state of a
 * deployment holding two keys out of three, not a fault worth a message.
 */
async function walk(
  turns: Turn[],
  steps: Step[],
  search: boolean,
  effort: Effort,
  ceiling: number,
  signal: AbortSignal,
): Promise<{ response: Response; step: Step }> {
  let last: unknown

  for (const step of steps) {
    const key = keyFor(step.source)
    if (!key) continue

    try {
      return { response: await open(turns, step, key, search, effort, ceiling, signal), step }
    } catch (error) {
      last = error
    }
  }

  // Every rung refused, so the reader gets the last provider's own words rather
  // than a flattened "could not be reached". A 429 from the final attempt still
  // reads as a 429 to the handler, which says something different about a busy
  // model than about a broken relay.
  throw last ?? new Error('no model on the chain could be reached')
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405, origin)
  }

  // Any one key is enough to run. A deployment holding only a Gemini key is a
  // smaller tutor, not a broken one.
  const anyKey = (['gemini', 'openrouter', 'groq'] as const).some((source) => keyFor(source))
  if (!anyKey) return json({ error: 'the tutor relay has no API key' }, 500, origin)

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
  const asked = steps(body.models)
  let models = asked.length > 0 ? asked : chain()
  const picked = text(body.model, 120).trim()
  if (picked) {
    const rest = models.filter((step) => step.id !== picked)
    // The pick's own source comes from the chain when the chain names it, and
    // falls back to the head of the chain when it does not. A pick with no
    // source would otherwise have to be guessed at, and guessing spends the
    // wrong key.
    const home = models.find((step) => step.id === picked)?.source ?? models[0]?.source
    if (home) models = [{ id: picked, source: home }, ...rest].slice(0, MAX_CHAIN)
  }

  const turns = assemble(body, module)

  /*
   * Whether this question goes to the web.
   *
   * Two sources, and either one is enough. The task module asks for it — "Still
   * true?" cannot do its job without it. Or the reader turned the globe on in
   * the composer, which is a choice about one question and is not remembered.
   *
   * A search costs money on every engine, so it never happens by default.
   */
  const wants = module?.search === true || body.search === true

  /*
   * A searching question tries the searchers first.
   *
   * Only OpenRouter runs the web plugin we send, so a chain that happens to
   * start at Gemini would answer a "Still true?" without ever going to the web,
   * and the answer would look exactly like one that had. Reordering costs the
   * reader nothing — every rung still gets its turn — and it keeps the promise
   * the task module made. Stable, so the reader's own ranking survives inside
   * each half.
   */
  if (wants) {
    models = [
      ...models.filter((step) => canSearch(step.source)),
      ...models.filter((step) => !canSearch(step.source)),
    ]
  }

  const effort = effortOf(body.effort)
  const ceiling = module?.material ? MAX_MATERIAL_TOKENS : MAX_TOKENS

  /*
   * Whether the reader watches this answer being written.
   *
   * The panel asks for a stream; the memory layer does not. A digest is written
   * to a record nobody is looking at, so streaming it would buy nothing and
   * cost the caller a parser.
   *
   * It is asked for rather than assumed for one more reason: an older client
   * cached by a service worker is a real thing in this app — one has already
   * cost a day of chasing a key that was set correctly all along. A client that
   * does not ask still gets exactly the reply it was written against.
   */
  const live = body.stream === true

  const clock = deadline(TIMEOUT_MS)

  let opened: Response
  let served: Step
  try {
    const walked = await walk(turns, models, wants, effort, ceiling, clock.signal)
    opened = walked.response
    served = walked.step
  } catch (error) {
    clock.done()
    return json({ error: reasonFrom(error) }, statusFrom(error), origin)
  }

  if (!live) {
    try {
      const answer = await drain(opened, served, wants, clock.touch)
      return json(replyOf(answer, served), 200, origin)
    } catch (error) {
      return json({ error: reasonFrom(error) }, statusFrom(error), origin)
    } finally {
      clock.done()
    }
  }

  /*
   * The streaming reply: one JSON object per line.
   *
   * Not server-sent events, though that is what we receive. `EventSource` is
   * the only thing SSE buys and it cannot POST, so this request could never use
   * it — the body has to be read by hand either way. A line of JSON is less to
   * parse and less to get wrong.
   *
   * `open` goes first and carries the model that actually answered, so the
   * bubble can be labelled before a single word arrives. Everything after it is
   * a delta, and `done` closes.
   *
   * A failure part-way through is a line like any other. By this point the
   * status has been sent and cannot be changed, so an error that arrives after
   * the first byte has to travel inside the stream. The reader keeps whatever
   * words already landed, which is better than losing a half-written answer to
   * a provider that gave up near the end.
   */
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))

      /*
       * Keep walking the chain when a rung fails after it has opened.
       *
       * The reader's report: the model thinks for ten or fifteen seconds and
       * then the answer turns into "no model would answer". A rung can accept
       * a request and still fail late — most often by spending its whole token
       * budget on reasoning and returning an empty string, which `drain` quite
       * rightly refuses to serve as an answer. Failover used to stop the moment
       * a rung opened, so that late failure ended the ask on the first rung
       * instead of moving to the second.
       *
       * The one thing that must not be failed over is an answer the reader has
       * already begun reading. Words on screen cannot be un-sent, so `wrote`
       * bars the retry as soon as the first one goes out. Thinking is not
       * words: it is working-out, the client replaces it when a new rung opens,
       * and nobody reads a paragraph of it as the answer.
       *
       * ## Except for a summary, which may be started again
       *
       * A free rung often hits its rate limit *while it is generating* and puts
       * the refusal inside the stream. `wrote` was already true, so the ask
       * ended there: the reader watched half a recap appear and then a message
       * saying the model was busy, with four rungs below it untried.
       *
       * A summary is not a conversation. Nobody is reading it as it lands —
       * they are waiting for a document, and a half-written one is thrown away
       * rather than kept. So a material job may start again on the next rung,
       * and the client is told to clear what it has by the `open` line that
       * every rung sends. The panel keeps the old rule exactly: `restartable`
       * is false for every conversational ask.
       */
      const restartable = Boolean(module?.material)
      let rung = served
      let response = opened
      let rest = models.slice(models.indexOf(served) + 1)
      let wrote = false
      const relay = (piece: Piece) => {
        if (piece.t === 'text') wrote = true
        send(piece)
      }

      try {
        for (;;) {
          send({ t: 'open', model: rung.id, source: rung.source })
          try {
            const answer = await drain(response, rung, wants, clock.touch, relay)
            // The assembled answer closes the stream. The client has every
            // delta already, so this is the tidy copy — trimmed, capped, and
            // the same object a client that never asked to stream would have
            // received.
            send({ t: 'done', reply: replyOf(answer, rung) })
            break
          } catch (error) {
            if ((wrote && !restartable) || rest.length === 0) {
              send({ t: 'error', message: reasonFrom(error), status: statusFrom(error) })
              break
            }
            try {
              const walked = await walk(turns, rest, wants, effort, ceiling, clock.signal)
              rung = walked.step
              response = walked.response
              rest = rest.slice(rest.indexOf(rung) + 1)
            } catch (fell) {
              // Nothing below it would open either. The last rung's own words
              // beat the one that opened and then died.
              send({ t: 'error', message: reasonFrom(fell), status: statusFrom(fell) })
              break
            }
          }
        }
      } finally {
        clock.done()
        controller.close()
      }
    },
    cancel() {
      // The reader closed the panel or turned the page. Stop paying for words
      // nobody will read.
      clock.done()
      void opened.body?.cancel()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      // Proxies that buffer would undo the whole point of this.
      'cache-control': 'no-cache, no-transform',
      ...corsHeaders(origin),
    },
  })
}

/** The reply body, identical whether it was streamed or handed over whole. */
function replyOf(answer: Completion, served: Step) {
  return {
    text: answer.text,
    model: answer.model,
    // Which provider served it. The bubble label needs it to tell two rows
    // apart that share a name — Gemma 4 31B sits on both Gemini and
    // OpenRouter, and they are different rungs of the chain.
    source: served.source,
    ...(answer.reasoning ? { reasoning: answer.reasoning } : {}),
    ...(answer.sources ? { sources: answer.sources } : {}),
    ...(answer.usage ? { usage: answer.usage } : {}),
  }
}

/** The provider's own words, never flattened to "something went wrong". */
function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'the tutor could not be reached'
}

/*
 * The upstream status is carried out, not flattened to 502. A busy free model
 * and a misconfigured relay both used to arrive as the same sentence, which
 * made a two-minute wait look identical to a broken deploy.
 */
function statusFrom(error: unknown): number {
  return error instanceof Upstream && error.status === 429 ? 429 : 502
}
