# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Task — the AI tutor engine, stage A of four

The reader gave a build brief and a prompt library on 2026-08-22:

- `design-inspiration/reading-buddy-claude-code-brief.md` — the engine.
- `design-inspiration/reading-buddy-prompts.md` — the prompt text. This is the
  source of truth for every word the model is told.
- `design-inspiration/tutor-memory-layer.html` — the recap layer's look.

The brief is large. We cut it into four stages. **Stage A is this thread.**
Stages B, C and D are written out below so a later thread can start cold.

### The state before this thread

The client half was already built. `askTutor` in `web/src/reader/tutor.ts` is
the single choke point. It posts to `/api/tutor`. No relay existed, so every
answer was an honest "the tutor is offline" placeholder.

### Three places the brief and this repo disagree

1. **The provider.** `api/README.md` said the endpoint holds an Anthropic key.
   The brief says OpenRouter. We follow the brief. Claude is one more slug on
   the same path.
2. **The task modules.** The lamp offered four chips that no prompt matched.
   The prompt file is the source of truth, so the chips now match it.
3. **The anchor.** The brief sketches `startOffset` and `endOffset`. This app
   stores the quote instead, on purpose. We keep the app's rule. The brief
   permits this.

---

## Stage A — the relay (this thread)

**Goal.** The tutor speaks for real. The reader taps a chip and gets a warm,
plain-language answer from a live model, followed by one gentle check that the
answer landed.

**Done when:**

1. `api/tutor.ts` holds the OpenRouter key and the whole prompt library.
2. A chip press returns a real answer, not a placeholder.
3. The explain-back probe fires after "Explain simply" and "Explain to a
   friend". It does not fire after "Discuss" or "Define a term".
4. A dead primary model fails over to the next one with no visible break.
5. The relay reports which model really answered. The client carries it.
6. Signed out, or offline, the reply says so plainly and invents nothing.

**What is proved.** Points 1, 3 and 6. The four new chips draw, a chip press
runs the whole path, and the reply is the honest offline line. Fourteen new
tests in `web/src/reader/tutor.test.ts` hold the failure paths down — every one
of them exists to stop a later refactor from adding a plausible guess.

**What is not proved.** Points 2, 4 and 5, and none of them can be proved from
this machine. Vite does not run `api/`, and no `OPENROUTER_API_KEY` exists here.
The relay has never reached a model. The steps to prove it are in
`docs/progress.md` under *In flight*.

**One slug to check.** The relay falls back to `openrouter/free`. That name
comes from the build brief and nothing in this project has ever called it. If
it is wrong, the reader sees the relay's own error and the fix is one
environment variable, not a deploy. That is why the chain is a variable.

---

## Stage B — the model picker and the bubble labels — DONE

**Goal.** The reader chooses the model, and every answer says who wrote it.

Steps, in order:

1. **New endpoint `api/models.ts`.** It calls
   `GET https://openrouter.ai/api/v1/models?supported_parameters=tools` and
   keeps only rows where `pricing.prompt == 0` and `pricing.completion == 0`.
   It returns `[{ id, name }]`. Do not hardcode a list — the free roster
   changes every week. Cache the answer for about an hour.
2. **Add the Claude row by hand.** It is paid, so it is not in the free list.
   The slug comes from `TUTOR_MODEL_CLAUDE`.
3. **Client store.** Keep the reader's pick in `localStorage`. Keep the fetched
   roster in memory with a timestamp. Refresh when it is stale.
4. **The dropdown.** It sits in the Study Lamp composer row. Warm-paper style,
   small and quiet. Match `study-lamp-conversation.html`.
5. **Send the pick.** `askTutor` already passes `model` through. The relay
   already puts it at the head of the fallback chain. Only the UI is missing.
6. **Store the model on the message.** `StoredTutorThread.messages[]` gains
   `model?: string`. Dexie `version(13)`. Old rows have no model. They must
   draw with no label, not with a wrong one.
7. **Draw the label.** A small muted caption above each tutor bubble, mirroring
   how "Chandan" sits above the reader's own. Read it from the stored `model`,
   never from what was asked for. During a failover the two differ, and that
   difference is the whole point of the label.

**Files:** `api/models.ts` (new), `web/src/reader/models.ts` (new),
`web/src/reader/tutor.ts`, `web/src/reader/StudyLamp.tsx` and `.module.css`,
`web/src/storage/db.ts`.

### What stage B changed from the plan

- **The roster endpoint also returns `description` and `contextLength`.** The
  plan said `[{ id, name }]`. That is not enough to judge a model. The choosing
  moved to `web/src/reader/models.ts`, because `api/` is built on its own and
  cannot hold a test. The judgment now has 19.
- **The picker hides models built for one narrow job.** A live probe found two
  free tool-capable models that answer a reading question in the wrong genre: a
  coding agent, and a safety classifier that answered "say the word: ok" with
  "User Safety: safe". Neither returns an error. A reader cannot see the
  failure. So `fitForReading` removes models that announce themselves as
  single-purpose, and removes models with less than 16k of context.
- **`openrouter/free` is gone from the relay.** It auto-routes across every
  free model, the two above included. `api/tutor.ts` now falls back through
  four named general models.
- **The picker sits above the input, not beside it.** Beside it, it takes room
  from the one control the reader uses every time.

### What stage B does not prove

The label is only correct if the relay reports the model. That path needs a
live answer, and no live answer has been seen yet — see the credit problem
below.

---

## Blocked — the OpenRouter account has no credits

A live probe of the key returned `402 Insufficient credits. This account never
purchased credits.` for two things:

1. The web plugin (`plugins: [{ id: 'web' }]`). Search is a paid add-on even on
   a free model.
2. `openrouter/auto` and any paid slug, Claude included.

Free models still answer. So stages A and B work, but two things wait on a
credit purchase:

- **Stage C's "Still true?" and "Historical context".** Both need search.
- **The Claude row in the picker.** It is drawn only when
  `TUTOR_MODEL_CLAUDE` is set. Leave it unset until credits exist, or the
  reader can pick a model that always fails.

Free models also rate-limit. `z-ai/glm-5.2:free` returned `429` during the
probe. This is why the relay carries a fallback chain and why the label names
the model that answered, not the one that was asked for.

---

## Stage C — web search and the genre chips

**Goal.** "Still true?" checks a claim against what is known now.

Steps, in order:

1. **Turn the search flag on.** `api/tutor.ts` already carries `search: true`
   on the modules that need it, and already sends `plugins: [{ id: 'web' }]`
   when the flag is set. Prove it end to end with a dated claim.
2. **Add the four genre modules** to the prompt table. The text is in the
   prompt file, sections 6 to 9: Still true?, Historical context, What's
   happening here?, Interpret this.
3. **Genre.** The book has no genre field yet. There are two ways:
   - Ask the reader once, on import. Cheap and certain.
   - Use the classifier prompt at the end of the prompt file.
   Prefer asking. A personal app has one reader and few books.
4. **Show the right chips.** The lamp shows the four neutral chips always, plus
   the genre ones the book earns. Keep the row to about six.
5. **Note the source.** A searched answer must say where the check came from.

**Files:** `api/tutor.ts`, `web/src/reader/StudyLamp.tsx`,
`web/src/storage/db.ts` (a genre field on `BookMeta`).

---

## Stage D — the digest and recap pipeline

**Goal.** Leaving a chapter leaves a faithful page-length recap behind, plus a
terse list of what the reader got stuck on. Coming back shows both with no
model call at all.

This is the largest stage. Steps, in order:

1. **New table `digests`.** Dexie `version(14)`.
   `{ bookId, chapterId, contentRecap, conversationDigest,
   coversNConversations, generatedAt }`. Device-local, like `tutor` and
   `notes`.
2. **The size branch.** Read the stored `words` count on each section.
   - Under about 4,000 words: digest the section as one unit. Map step only.
   - Over that: cut it into blocks of about 3,000 to 4,000 words. This is pure
     arithmetic over the stored section list. **Do not re-parse the book.**
     Digest each block, then stitch the block digests.
   - Under about 50 words, such as a bare heading: no digest at all.
3. **The block is not a reading unit.** It must never touch `positions`. Keep
   the two ideas of "chunk" apart, or the reader's place will move.
4. **Length is coverage, not brevity.** The map prompt targets 150 to 250 words
   per block. The reduce prompt targets 800 to 1,200 words for a long chapter,
   and it **joins** rather than shrinks. A vague half-page is a failure here.
5. **The conversation digest is the exception.** It stays terse. One line per
   distinct confusion, `problem → resolution`, duplicates merged.
6. **Triggers.** Generate at a section boundary, or when the reader closes the
   book. Do not wait for chapter end. A 70,000-word chapter spans many
   sittings.
7. **Staleness.** Rebuild a chapter digest only when it has gained
   conversations since `generatedAt`. Compare against `coversNConversations`.
8. **The "Last time on…" screen.** Assemble it from the stored digests plus the
   `positions` pointer. **Zero model calls. Ship this mode first.** The layout
   is the dark `.welcome` block in `tutor-memory-layer.html`.
9. **The optional warm paragraph.** One extra call that feeds only the chapter
   digests, never raw text, to the "Welcome back" prompt. A toggle, not the
   default.

**Files:** `web/src/tutor/digest.ts` (new), `web/src/storage/digests.ts` (new),
`web/src/storage/db.ts`, `api/tutor.ts` (three more modules), and a new return
screen under `web/src/pages/`.

---

## Files in scope — stage A

- `api/tutor.ts` — the relay, the prompt library, the fallback chain. **New.**
- `web/src/reader/tutor.ts` — `askTutor`, the intents, the honest fallback.
- `web/src/reader/StudyLamp.tsx` — the chips and the probe bubble.
- `.env.example` and `api/README.md` — the key.

## Carried forward — how to work on the reading page

Fourteen lessons earlier threads paid for. They are unchanged and still apply.
Read the git history of this file at commit `b826646` for the full list. These
three bite hardest:

1. **Measure in a real browser, not by reading the file.**
2. **The Browser pane does not composite.** `requestAnimationFrame` never fires
   there, and timers run at about 1 Hz. Wait seconds, not milliseconds.
3. **Test in the real app, not in a bench you built.** A bare page with the
   same CSS missed the reader's bug three times.
