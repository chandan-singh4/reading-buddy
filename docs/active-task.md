# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Start here — 2026-08-23

**Nothing is mid-edit.** The build is green: 1739 tests across 100 files. The
last commit is `e7c1b23` and `main` is pushed.

**One thing waits on the reader.** They must tap "Refresh from Google Books" on
the phone and report what happens. The server is proved good, so the button
should now work. If it fails, the new code names the real cause. Ask for the
exact words before you change any code.

### The next task — WP-25, something that writes a note

The Notes tab reads a table that nothing fills. This is written out further
down this file. **One question is still open: device-local or cloud.**
Device-local is the smaller step. Ask the reader before you start.

Files in scope for WP-25:

- `web/src/pages/Reader.tsx` — the Notes tab and `noteRows`.
- `web/src/storage/notes.ts` — the store that nothing writes to.
- `web/src/storage/db.ts` — the note row's shape.

Add any other path to this list with a one-line reason. Do not grep the tree.

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

## Done after stage B — what the tutor is told about the passage

The reader asked what the model receives. The answer was: the selected words
and an anchor id, and nothing else. An id like `[ch02-s03-p013]` means nothing
to a model. So the model had no book, no author, no chapter, and no sentence
either side. It answered from what it knows about the world instead of from the
page. That is why it gave a fact from the end of the book.

Every question now carries a frame:

- book title and author;
- chapter title and section title;
- the text immediately before and after the selection.

A tapped paragraph takes the paragraph before and after it. A tapped sentence
takes the sentences either side inside its own paragraph. If it is the first or
the last sentence there, it reaches into the next paragraph.

Rules that hold this in place:

- Each side is capped at 600 characters in the client and 800 in the relay. A
  long neighbour must not crowd out the passage.
- The prompt labels the neighbours `TEXT BEFORE (context only, do not explain
  it)`. The model must explain the selection, not the frame.
- The anchor id is no longer sent to the model. It stays in the app.
- A thread reopened from Notes may name a passage on another page. The book and
  the author still go. The neighbours are left out, never guessed.

**New files in scope:**

- `web/src/reader/context.ts` — builds the frame. **New.**
- `web/src/reader/context.test.ts` — 15 tests. **New.**
- `web/src/pages/Reader.tsx` — `lampContext`, handed to the lamp.

## Done next — the lamp blinked, and marks can now be deleted from the page

**The blink.** The reader asked a question, the answer arrived, and the room
reset to the passage and the question with no answer. They had to open Notes to
read the reply.

Cause: `<StudyLamp key={lamp.threadId ?? lamp.passage.excerpt}>`. A fresh
passage has no thread id, so the key was the excerpt. The first answer saved the
thread. The save filled the id in. The key changed. React unmounted the lamp and
built a new one from `saved`, which was still empty.

Fix: the lamp state carries its own `key`, set once for each opening. `saved` is
also kept in step with each save, so any later remount still shows the
conversation.

**Delete from the page.** A hold on the ink or the slip raises a small menu:
*Continue the conversation* or *Delete the conversation*. A tap still reopens.
The hold is 500 ms with a 10 px slop, so a scroll that starts on a mark is not a
hold. The lift after a hold does not also count as a tap.

Deleting removes the thread, the ink, and the slip. If the lamp is open on that
thread, the lamp closes.

Both were proved in the browser, not by reading the file. The hold raised the
menu, delete took the marks from two to one, and a fresh question survived the
first save.

**New files in scope:**

- `web/src/reader/ThreadMenu.tsx` and `.module.css` — the held-mark menu. **New.**
- `web/src/reader/ThreadMenu.test.tsx` — 8 tests. **New.**
- `web/src/reader/TutorMarks.tsx` — hold detection on the ink and the slip.

## Done next — the slip alone takes the tap, and the chain is ranked

Four changes, all from one round of feedback.

**Only the slip takes a tap.** The ink under the words was also a button. A tap
on the words opened the lamp, so the reader could not select that sentence
again. Now the ink is decoration: `pointer-events: none`. The taped slip is the
one control.

**The slip covers no words.** It used to sit at the end of the passage, which is
in the middle of a paragraph. Now it goes after the last character of the
paragraph's last line. If that line has less than 30 px of room, the slip drops
under the paragraph instead. More than one slip on the same paragraph steps
34 px to the side. Proved in the browser: no character is under the slip.

**The menu looks like iOS.** A translucent card with a blur, rounded corners, a
quiet caption of the passage, and two rows with icons — *Continue* with a speech
bubble, *Delete* in red with a bin. It rises with a short animation, and the
animation stops under `prefers-reduced-motion`.

**The fallback model is ranked, not arbitrary.** The reader picked GLM 5.2 and
kept getting answers from Nemotron. The pick was honoured; GLM refused, and the
relay fell through to a **fixed list written into the server**. That list had
nothing to do with the roster the reader saw.

OpenRouter publishes no benchmark score and no parameter-count field. The only
real signal is the size a model states in its own name —
`nemotron-3-super-120b-a12b`, `qwen3-8b`. `sizeOf` reads it, and takes the
largest number, because a mixture-of-experts model writes its total and its
active size together. A model that states no size gets `ASSUMED_SIZE` and sorts
in the middle. Paid sorts first.

`chainFrom` then builds the chain: the reader's pick, then the largest models
after it, cut to three — OpenRouter refuses a longer array with a 400. The
client sends the chain, and the relay uses it when it is there.

**New files in scope:**

- `web/src/reader/models.ts` — `sizeOf`, `ASSUMED_SIZE`, a sorted `offerable`,
  `chainFrom`. 34 tests.
- `api/tutor.ts` — `slugs()` reads the client chain; `body.model` still works.
- `web/src/reader/TutorMarks.tsx` and `.module.css` — slip placement, dead ink.

## Done next — the model sheet, the fonts, and speaking a question

**The model sheet.** The picker was a native `<select>`. Tapping it threw a
white browser list over a dark room. `ModelSheet.tsx` draws it instead: a sheet
at the bottom edge, translucent, blurred, with iOS dark colours, a tick on the
current choice, and a Cancel row. Escape and the scrim both close it. Escape is
caught with a capture listener, so one press does not also close the lamp.

The closed control is now a line of text with a chevron. It carries the model's
name, so the reader reads their choice without opening anything.

**The fonts.** The reader's own words were Caveat, a handwriting face, at 23 px.
It read as decoration and it did not match the box the words were typed into.
Now it is the room's Garamond, italic, at 18 px. The tutor's answer went from
16 px to 17 px — it is the longest thing in the room.

**Speaking a question.** `dictation.ts` wraps the browser's Web Speech API. No
audio reaches this app or the relay: the phone hands back text. A microphone
button sits left of the box, and it is drawn only where the browser has the API.
Firefox does not, so Firefox sees no button.

A run remembers what was in the box when it started, and rewrites everything
after that point on each event. That is why interim words tidy themselves
instead of being typed twice. A refused microphone, no microphone, or silence
all end the run, so the button never stays lit.

**What I could not prove in the browser:** the sheet itself. The roster needs a
signed-in session and the dev browser has none, so the picker is not drawn
there. It is covered by 10 tests. The reader's font and the microphone button
were both proved live.

**New files in scope:**

- `web/src/reader/ModelSheet.tsx` and `.module.css` — the picker sheet. **New.**
- `web/src/reader/ModelSheet.test.tsx` — 10 tests. **New.**
- `web/src/reader/dictation.ts` — the Web Speech API wrapper. **New.**
- `web/src/reader/dictation.test.ts` — 13 tests. **New.**

## Done next — the marks, the keyboard, the reasoning, and the tokens

**The taped note went invisible.** The reader left the page and came back, and
the note flickered and disappeared. Cause: the measurer keeps its marks when a
measure finds nothing, because an empty measure is usually a bad moment during
a page turn. But the Reader had thrown the paragraphs away and built new ones.
The kept marks pointed at paragraphs no longer in the document, so they drew
into nothing, and nothing measured again.

Now the measurer looks at the paragraphs it is holding. If they are still in the
document, it keeps the marks — the old rule, unchanged. If they are gone, it
drops them and looks again, up to six times, 80 ms apart.

**The taped note sat at the foot of the paragraph.** Both notes did, away from
their own sentences. They were put there because a note at the end of a sentence
covers the words that follow. The room was measured wrong: it measured to the
paragraph's right edge, and all of that space is the next sentence.

Three places now, in this order, and none holds a word:

1. After the line's own last word, when that line ends short.
2. In the gap between that line and the next. The gap is about 9 px at the
   reader's own type size, so the note is drawn down to a small tab with no star
   on it. Its tap target stays a finger wide.
3. Under the paragraph, when the line-height is too tight for a tab.

Measured live on the reading page with three threads in one paragraph: 0 book
characters covered, all three inside the paragraph, each on its own sentence.

**The keyboard opened on its own.** Tapping a note opened the room with the
keyboard already up, covering the passage. The lamp focused the box on mount.
It now focuses the room itself, so Tab and Escape still work and the keyboard
waits to be asked.

**The reasoning.** The relay asks OpenRouter for it, and passes it through.
Each answer draws a folded line above it — "How it thought this through" — that
opens on a tap. It is stored with the message, so it is still there a week
later.

**The tokens.** The relay asks for `usage` and sums the answer and the probe.
The lamp prints the last exchange under the message bar: in, out, total. All
three zero counts as no answer and prints nothing.

**The effort.** A second control sits beside the model. It opens the same iOS
sheet. `Max` is the default for every model, because the free ones cost nothing
— thinking is billed as output tokens and there is nothing to ration. A paid
model adds "costs more" to the top row.

**Correction, 2026-08-22.** An earlier version of this paragraph said
OpenRouter's scale stops at `high`, and that no level called "Max" exists. That
was a guess, and it was wrong. The documented values are `none`, `minimal`,
`low`, `medium`, `high`, `xhigh` and `max`. The source is
<https://openrouter.ai/docs/use-cases/reasoning-tokens>. A live call with
`reasoning: { effort: 'max' }` returns `200` and reports reasoning tokens.
**Check a claim like this against the documentation before you write it down.**

**New files in scope:**

- `web/src/reader/Sheet.tsx` and `Sheet.module.css` — the iOS sheet, lifted out
  of `ModelSheet` so two sheets share it. **New** (the CSS was renamed).
- `web/src/reader/EffortSheet.tsx` + `.test.tsx` — 5 tests. **New.**
- `web/src/reader/effort.ts` + `.test.ts` — the stored level, 7 tests. **New.**
- `web/src/reader/TutorMarks.tsx` — the retry ladder and the slip placement.
- `web/src/reader/StudyLamp.tsx` and `.module.css` — the fold, the token line,
  the effort control, and the focus on open.
- `api/tutor.ts` — asks for reasoning and usage, and takes an effort.

## Done after stage C — search, the globe, and the genre chips

**Search is proved live.** A call with `plugins: [{ id: 'web', max_results: 5 }]`
came back with five `url_citation` annotations and a claim dated April 2026.
The relay drops the scraped page body and keeps the title and the URL. The lamp
prints them under the answer as links.

**The globe.** Search is not automatic. A globe button sits beside the message
bar. It is grey when off and blue when on. A tap turns it on for the next
question only. Two chips — "Still true?" and "Historical context" — turn it on
by themselves, because the answer is worthless without it.

**The genre.** The book gets a `genre` field: `fiction`, `nonfiction`, or
absent. The import guesses it instead of asking. A dropped folder can import
thirty books at once, and thirty questions is not a cheap step.

**Action for the reader.** Run `supabase/migrations/0008_tutor_genre.sql` by
hand in the Supabase SQL editor. Nothing runs it for you.

## Done after stage D — the digest and recap pipeline

Built as planned, with three deviations. Each one is written into the code it
affects.

1. **Recaps are off until the reader asks.** Every recap is a paid model call
   that starts on its own, while the reader reads. The checkbox is on the
   "Last time on…" screen. Plan step 6 did not say this, and it must.
2. **Only a closed block is digested, and the block digests are kept.** A block
   is closed when the reader has read past its end. This stops the recap from
   describing a page the reader has not turned. Keeping each block digest means
   reading on costs one call, not a rebuild of the whole chapter.
3. **One extra file.** `web/src/tutor/refresh.ts` holds the database and the
   network. `web/src/tutor/digest.ts` holds the rules and touches neither, so
   the block arithmetic is tested without a database.

**Not built yet.** Step 9, the warm paragraph. The `welcome` module is in the
relay and no screen calls it.

**The cost, in calls.** One `recap` call for each new closed block. One
`rollup` call to join them, and none when the chapter is one block. One
`confusions` call when the reader asks a new question in that chapter. At most
one chapter is built for each trigger.

**New files in scope — stages C and D:**

- `web/src/tutor/digest.ts` + `.test.ts` — the rules, 29 tests. **New.**
- `web/src/tutor/refresh.ts` + `.test.ts` — the wiring, 10 tests. **New.**
- `web/src/storage/digests.ts` + `.test.ts` — the store, 5 tests. **New.**
- `web/src/pages/LastTime.tsx`, `.module.css`, `.test.tsx` — the return screen,
  7 tests. **New.**
- `web/src/storage/db.ts` — `StoredDigest` and `version(14)`.
- `web/src/storage/repository.ts` — the delete cascade takes the new table.
- `web/src/pages/Reader.tsx` — the trigger, at a section boundary and on close.
- `web/src/pages/BookInfo.tsx` — the "Last time on…" link.
- `api/tutor.ts` — the recorder prompt and four memory modules.

## Done after stage D — four changes the reader asked for (2026-08-23)

1. **The conversation panel reads markdown.** A tutor answer showed its own
   asterisks. It now draws bold, italic, strikethrough, code, links, headings,
   lists, quotes, rules and formulas. Stored answers redraw formatted, because
   the raw text is what is stored and the formatting happens at draw time.
2. **Each exchange shows its own tokens.** The count sits in the row with the
   copy and retry buttons. The line under the message bar is now the sum of
   every exchange, not the last one.
3. **The globe moved.** It sits with the model and the effort, because all
   three change what the next question costs.
4. **"Refresh from Google Books" cannot stick.** See below.

**Why the markdown is written here and not installed.** The panel needs eight
constructs. One of the eight is raw HTML, and it must be **refused**: the text
comes from a model and lands in a page. Nothing in `web/src/reader/markdown.tsx`
builds HTML from a string. Every element is a React node, so a `<script>` in an
answer can only ever be text. A markdown library brings a document parser and
an HTML pass-through this app must not have.

**Formulas are set apart, not typeset.** `$x$` and `$$…$$` are drawn in a
monospaced face. Real typesetting means KaTeX, which is a large download for a
phone that is usually offline.

**The stuck Refresh button.** The reader reported that the button says
"Looking…" for ever. Two faults, and each one alone is enough to cause it:

- `fetch` has no timeout. A server that accepts the connection and then says
  nothing gives a promise that never settles. `web/src/catalogue/google.ts` now
  races every request against 20 seconds, and races `accessToken()` too,
  because a token refresh is a second network call that can hang.
- The page only left `busy` when a value came back. `lookupBook` reports a
  network failure as a value, so this looked safe. Anything that **threw**
  instead — an expired session, a failed save — left the button spinning, and
  the caller is `void refreshFromCatalogue()`, so the rejection went nowhere.
  `web/src/pages/BookInfo.tsx` now catches, and always says something.

The deadline is a race, not the abort signal. The signal is housekeeping: it
closes the socket after the race is lost. The guarantee the reader needs must
not depend on somebody else's promise settling.

**Files in scope — 2026-08-23:**

- `web/src/reader/markdown.tsx` + `.module.css` + `.test.tsx` — 25 tests. **New.**
- `web/src/reader/StudyLamp.tsx` + `.module.css` + `.test.tsx` — the token line
  and the globe, 22 tests.
- `web/src/catalogue/google.ts` + `.test.ts` — the deadline, 14 tests.
- `web/src/pages/BookInfo.tsx` + `.test.tsx` — the button that cannot stick,
  30 tests.

**Not proved on a real phone.** The timeout answers a hang. It does not make
Google answer. If the button now reports a reason, that reason is the next
thing to fix.

## Withdrawn — the book-kind guess (2026-08-23)

The Study Lamp offered four chips and worked out up to two more from the kind
of book. The kind came from a guess over `subjects`, `genre` and `type`, and
the reader could correct it on the book's page.

**All of it is gone.** Every book now gets all seven chips. Deleted:
`web/src/reader/genre.ts` and its test, the `tutorGenre` field, the
`tutor_genre` column mapping in both repositories, the "What kind of book" row
in `BookInfo.tsx`, and migration `0008_tutor_genre.sql`. **Do not run 0008.**

The reason is the trade. The feature cost a database column, a manual SQL step,
a row of controls on a screen, and a guess that could be wrong. It bought the
reader freedom from three chips that do not suit the book — and an unsuited
chip costs nothing, because nobody taps it. The chips are a scrolling column,
not a row, so seven is not crowded.

## A 503 is not proof of a missing key (2026-08-23)

`web/src/catalogue/google.ts` read the status number alone, so every 503 said
"the lookup service has no Google Books key". The host answers 503 as well, for
a deployment that is paused, cold, or over a limit — and it answers with an
HTML page, not with our JSON.

The client now reads the body. A 503 that carries our own function's JSON still
names the key. A 503 that does not says the host never answered, which also
proves the request never reached the function — so no setting on the function
can be the cause. Any other unexpected status now repeats the server's own
sentence rather than a number.

**This was reported, not imagined.** A reader saw "no Google Books key" with the
key correctly set in Production and the project redeployed.

## Carried forward — how to work on the reading page

Fourteen lessons earlier threads paid for. They are unchanged and still apply.
Read the git history of this file at commit `b826646` for the full list. These
three bite hardest:

1. **Measure in a real browser, not by reading the file.**
2. **The Browser pane does not composite.** `requestAnimationFrame` never fires
   there, and timers run at about 1 Hz. Wait seconds, not milliseconds.
3. **Test in the real app, not in a bench you built.** A bare page with the
   same CSS missed the reader's bug three times.
