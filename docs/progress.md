> **What's in here (read at every startup).** A living snapshot of where the
> build stands — recently finished work, what's in flight, current blockers, and
> the immediate next moves. It's the "you are here" pin: read it first every
> session so you know the state without inspecting git history or the codebase.
> Kept deliberately short — only the last handful of done items survive, older
> history is dropped. Updated at the end of every session by `/wrap-session`. If
> this file and the code ever disagree, trust the code and fix this file.

---

**Current leg:** Leg 3 — The Tutor
**The walking skeleton is standing (2026-08-25).** Import → render → select →
Ask → a streamed answer works end to end. WP-17, 19, 20, 25 and 29 are closed.
Breadth is now allowed.

### In flight

- **The reader's marks now survive a re-parse (2026-10-16).** They did not
  before. Two parser updates stranded the highlights two times, and the reader
  redid them by hand two times. The cause was not the anchors: it was the
  quote match. See "Recently done" below.
  **One chore is left:** run **Library → Update** one time. It moves the shelf
  to `PARSER_VERSION` 39 and brings back the marks that versions 37 and 38
  stranded. Nothing was ever deleted.
- **Not proved yet: rows from the phone in `user_rows`.** `storage/sync/` copies
  eleven tables to Supabase. The reader ran `0008_user_rows.sql` and the table
  exists. Nobody has seen one row from the phone in it. This is the oldest open
  proof in the build.
- **Not proved yet: a longer free model list.** The roster asked each provider
  for tool-capable models only, which cut OpenRouter's free column to six rows.
  The filter is gone. This container has no provider keys, so only the phone can
  show whether the list grew.
- **OpenRouter has deprecated the `web` plugin.** "Still true?" uses
  `plugins: [{ id: 'web' }]`. The replacement is the `openrouter:web_search`
  server tool, which *does* need a tool-capable model. Nothing is broken today.
  It is a real ticking item and it is its own task, not a filter change.
- **Check the deploy, do not assume it.** A helper file under `api/` with no
  default export failed the Vercel build and five commits sat on `main`
  undeployed. To prove a deploy: fetch the live `index.html`, read the
  `assets/index-*.js` hash, and compare it with the one in `web/dist`.
- **Nothing mid-edit.** Everything below is merged and pushed. Build green:
  2,613 tests across 162 files.
- **No ceiling on spending — accepted, because every model is free.** Two
  models run unasked (the Scribe and the digest). The queue skips finished work
  and only the most recently opened book runs by itself. There is no cap beyond
  that. The reader deferred WP-27 on 2026-10-16 for this reason. **Watch two
  things:** Gemini 4 Argon is a paid model and it sits in the picker for a key
  that can pay, and a free tier caps requests, not money. If a quota starts to
  bite, reopen WP-27.
- **A book left open counts.** The idle rule was removed on the reader's
  instruction, so the only guard is a six-hour cap per session. If a forgotten
  book starts inflating the numbers, the fix is a smaller cap, not a new pause
  rule.
- **One Veda's Quote stays under Veda, by the reader's choice.** The vault held
  one kept line, and no thread matched it. Do not try to link it again.
- **A screen must import `repository` from `storage/index.ts`.** Four screens
  imported `storage/repository.ts`, which is the device store only. The reader's
  library is in the cloud, so every summary page read an empty database and
  showed nothing. `summary/repository.test.ts` reads the imports of every file
  in `summary/`, `pages/` and `tutor/` and fails on a new offender.
- **`api/tutor.ts` has no tests.** There is no test harness under `api/`. The
  client half is covered instead (`watched.test.ts`, `askMemory.test.ts`).
- **The update prompt now has a second door.** The reader reported that the
  prompt did not appear one time, which left the phone on old code with no way
  to move it. A waiting build is now the top line in the bell, and it keeps
  counting until the update is taken.
- **Define needs its keys wherever it runs.** `MW_COLLEGIATE_KEY` (required) and
  `MW_THESAURUS_KEY` (optional) are set locally and on Vercel. A new machine, or
  a new deploy target, needs them again. Two free and separate registrations at
  <https://dictionaryapi.com>. Never prefix either with `VITE_`.
- **Two test flakes, neither ours.** `HandDrawn.tsx` reports one unhandled error
  at jsdom teardown in a full run; it makes `npm test` exit non-zero although
  every test passes, and it reproduces on the commit before WP-16, so it is
  older than the work that found it. `Reader.test.tsx` → "crosses into the next
  chapter" failed one time on 2026-09-25 and has passed since. Cause not found
  for either. The first is worth a small task of its own.

### Recently done

- **The reading half, redesigned on the mockup (2026-10-20).** Build green:
  2,703 tests across 171 files. The mockup the reader approved first is
  `docs/mockups/reading-open.html`.
  - The book in hand sits in a card: cover on the left, words on the right, one
    edge around both.
  - The cover is back at `7.25rem`. The growth was for the shelf books.
  - "Continue reading" is now the amber button. "Chapter summaries" stays an
    outlined pill under it.
  - The progress bar closes the card, under the finish figures, with
    "N% complete" beneath it.
  - Each book on the shelf has a card of its own, `8.75rem` wide, with the same
    measure drawn thinner.
  - The reading streak is in the top bar, on the front door only. It steps out
    while the journal half is open.
  - Fixed on the way past: two rules in `Home.module.css` lost their `.read` and
    `.write` scope in an earlier edit, so both halves took the last one and the
    board's footer link read in the reader's accent.
  - The journal half, the bridge and the fold are untouched.

- **The front door, after the first look on a phone (2026-10-19).** Build
  green: 2,698 tests across 171 files.
  - The cover now fills the left of the reading half and bleeds to the edges.
    The space above the title is gone, and so is the rule below it.
  - The button says "Continue reading". The book name is in the title already.
  - The reading half shows the streak and the two hours a day. Both numbers
    come from the Statistics screen's own functions, so they cannot disagree.
    The journal half still counts no streak.
  - The bridge takes its own row on the seam. It hides nothing, and it is now
    the only place the last mark appears.
  - The words "inhale" and "exhale" leave the screen. A filled dot marks the
    reading half. An open ring marks the journal half.

- **WP-65 — the split front door (2026-10-19).** Build green: 2,693 tests
  across 171 files.
  - The home page is now two halves. The book is the dark board above. The
    journal is paper below. Both doors are open at once, and the split is even
    at every hour.
  - Each half is a surface with zones. The cover and Resume go straight to the
    saved page. The question and the circle go straight into a new entry.
    Library and Archive sit in each half's footer. Anywhere else opens that
    half, and the other folds to a lip that still reports its state.
  - The reading half shows the minutes read today, the percent, the title, the
    reader's last mark, and one line of finish forecast. Opened, it adds the
    shelf.
  - The journal half asks a question chosen by the hour and the date. Opened,
    it adds today's entries. The footer names the last entry.
  - The bridge sits on the seam and carries the last mark into a new entry. It
    goes when a half opens.
  - `SpeakSheet` gained two props: `prompt` (shown, never saved) and
    `listenAtOnce`.
  - **The greeting is gone.** The halves name themselves and report real state.
    Say so if you want it back.
  - New: `web/src/journal/prompts.ts`. New tokens: `--color-board`,
    `--color-board-ink`, `--color-board-mark` in `theme.css`.
  - `PaceHorizon` and the four curated shelves left the front door. The shelf
    is in the opened half and in `/library`; the pace strip is on the book's
    own details page.

- **The reader's marks survive a re-parse, and PDF bullets keep their level**
  (2026-10-16). Not a waypoint. Build green: 2,613 tests across 162 files.
  - **The real cause of the lost highlights.** A mark is stored as its words,
    not as an offset, so `relocate` can find it again after a re-parse. But a
    selection that crossed two paragraphs was stored with **no space at the
    join**, because that is what the browser's `range.toString()` gives. The
    stored words then matched nothing and the mark stranded.
  - `structure/quote.ts` is now the one rule both sides use. `softenQuote`
    folds curly quotes and dashes; `bareQuote` also drops every space. The
    finder falls back to the bare form, so a missing space no longer loses a
    mark.
  - `relocate.ts` and `reader/selection.ts` both use it. Nothing was ever
    deleted: `relocate` keeps the old anchor when the words are not found.
  - **PDF bullets are labels, not headings.** A dark bullet is a `bullet-1`
    prose block, a light `o` is `bullet-2`. A heading would divide the book,
    turn a page of bullets into a page of sections, and move every anchor.
    The marker characters stay in the text so stored quotes still match.

- **PDF headings read like headings (2026-10-16).** Not a waypoint.
  - **Mid-sentence text stopped becoming a heading.** The line's font size was
    the tallest glyph in it, so one parenthesis or one capital made a body line
    look big. `dominantSize` now weights each size by how many characters carry
    it.
  - **A sentence stays whole.** A hanging indent in a bulleted list looked like
    a new paragraph. A line that opens lower-case after a line that does not
    end a sentence now joins it.
  - **A heading stands over its own content.** `applyOutline` searched three
    paragraphs for the outline's title and gave up; it now searches to the end
    of the page.

- **Open the model roster up (2026-10-16).** Not a waypoint.
  - The rosters are fetched live, every hour. Nothing is hardcoded.
  - **Why only six free OpenRouter models:** both OpenRouter and Groq were
    asked for tool-capable models. The relay sends no tools, and "Still true?"
    uses a plugin that needs none. Both filters are gone.
  - `gemini-3.5-flash` and `gemini-3.7-flash` are deprecated but Google still
    routes them, so they kept passing the probe and showed a second name for
    one model. A short maintained list drops them.
  - The default moved to `gemini-3.8-flash`. **Gemini 4 Argon is not the
    default on purpose:** it is off the free tier ($2/$10 per million). The
    `limit: 0` probe already drops a model the key cannot reach, so it appears
    only for a key that can pay. Its rank now sits above Pro.

- **The cloud is the only library** (2026-10-12). Not a waypoint.
  - Settings no longer shows "Where your library lives" or the library copy.
    The sign-in screen no longer offers the device library.
  - The offline copy and the backup sync are unchanged.

- **Restore from vault** (2026-09-23). Not a waypoint.
  - Settings → "Bring your notes back from Obsidian". The reader picks the
    export zips or the chapter `.md` files.
  - The app finds each passage by its words (`relocate`) and puts back the
    highlights, the notes and the Veda threads. A second run adds nothing.
  - The vault kept no colours and no dates. Restored highlights are yellow.
  - Run on the phone on 2026-09-25.

- **Everything the reader makes goes to the cloud** (2026-09-23). Not a
  waypoint.
  - Android Chrome cleared the app's storage when the phone was low on space.
    Notes, highlights, Veda threads and sessions were lost. Only the shelf was
    in the cloud.
  - `web/src/storage/sync/` now copies eleven tables to `user_rows`. An emptied
    device gets them back when it opens.
  - The lost data can come back only from the Obsidian exports.

### Blockers
- **None.** Supabase's email allowance (a few sign-in messages an hour on the
  free mailer) bit once on 2026-08-09 and cleared itself; connect real SMTP
  under Authentication → Emails if it ever gets in the way again.

### Next up

**The journal — designed 2026-10-18, building now.** The reader speaks a
thought. The app writes the words down and keeps them. A free model can then
give the words a shape to read later. The raw words always stay.

The design is settled. `decisions.md` holds it under seven headings dated
2026-10-18. `architecture.md` holds the `entries` table and the `Entry` shape
under "The journal (WP-60 onward)". `backlog.md` holds Leg 6, waypoints WP-60
to WP-66.

Three mockups hold the look: `docs/mockups/journal.html`,
`docs/mockups/front-door.html` and `docs/mockups/inhale-exhale.html`.

**WP-60, speak an entry — built 2026-10-18, not yet tried on the phone.** The
app can now listen. `journal/useDictation.ts` wraps the browser's recogniser and
keeps the settled words apart from the guess. `journal/useWakeLock.ts` holds the
screen awake and asks again after the page hides. `journal/SpeakSheet.tsx` is
the sheet. Dexie v20 holds `entries`, and only the raw transcript is saved.

Reach it at `/journal`, or by the link under the greeting on Home. **The reader
must try it on the phone**, because the recogniser needs a signal and asks for
the microphone the first time.

The first try on the phone found a bug, fixed on 2026-10-18. The transcript
repeated every part of the sentence: "hey, hey how's, hey how's it going".
Chrome on Android sends a phrase again each time it revises it, and marks the
revisions final. The first code added each one to the text. Now each event
rebuilds the session's text in full and replaces it, so a phrase that comes
twice writes over itself. `useDictation.ts` explains this at the top, under
"Why nothing here is appended".

**WP-61, the journal screen — built 2026-10-18, not yet tried on the phone.**
`pages/Journal.tsx` is now the stream: every entry, newest first, cut by the
day the reader spoke on. A card shows the shaped words when a shape exists and
says which copy it is showing. `pages/Entry.tsx` is one entry, at
`/journal/:entryId`. It holds the raw words and the shaped words as an equal
pair, opens on the shaped copy when there is one, and says under each copy what
it is. Delete asks twice. `journal/shapeMark.ts` names the state in one word,
so the two screens cannot disagree.

The pair switch appears only when a shape exists, so today it never appears.
WP-62 writes the first shape and the switch lights up on its own.

Tests: `pages/Journal.test.tsx` and `pages/Entry.test.tsx`, 11 of them. Note
that this repo *does* have a test runner — Vitest, 2600+ tests. `CLAUDE.md`
said it did not; that line is now corrected.

**WP-62, give the words a shape — built 2026-10-19, not yet tried on the
phone.** The entry screen now offers three strengths under the words.

- **Tidy** adds punctuation, capitals and paragraph breaks, and repairs the
  grammar that speaking breaks — a hanging sentence, a stray connective, a
  dropped word, a slipped tense. It may not improve the reader's style,
  shorten a sentence, or change their vocabulary. See the 2026-10-19 reversal
  in `decisions.md`.
- **Shape** adds a title and groups the ideas into paragraphs.
- **Unpack** adds headings, anything the reader said they would do, and two or
  three questions to sit with.

`api/tutor.ts` holds the three task modules. Tidy and Shape sit on the recorder
base prompt, which already says "work only from what you are given, never add".
Unpack is `standalone`, because that base forbids addressing the reader and
Unpack must ask them questions. Unpack speaks as the Scribe, which is who the
reader is told they are speaking to.

`journal/shape.ts` makes the call. It streams, for the reason the digests do.
It rejects rather than returning a canned line: an apology stored as the shape
of an entry would be read a month later as something the reader wrote.

`storage/journal.ts` gains `setShaped` and `clearShaped`. **Neither writes
`raw`, and no function in that file does.** That is how the promise is kept.

The shaped copy renders through `reader/markdown.tsx`, which builds React
nodes and never HTML, so a model cannot put markup on the page. The raw copy
still prints exactly as the recogniser left it.

**The entry screen, after the first try on the phone — 2026-10-19.** Three
changes the reader asked for.

1. **A heading now looks like a heading.** The shaped copy renders through the
   shared markdown renderer, which is written for the tutor's lamp: warm gold
   ink, chat-bubble spacing, one size for every heading level. On paper that
   gave a heading the reader could not tell from the body. `Entry.module.css`
   now re-names the renderer's `--md-*` inks and dresses `[data-md='heading']`
   in the display face, with air above it and a hairline under it.
2. **The shaping prompts must write real markdown.** The model wrote the title
   as a plain first line and broke paragraphs with one newline, so neither
   arrived as a heading or as a paragraph. Shape and Unpack now say, in words,
   that a heading starts with "# " and that a paragraph break is an empty line.
3. **Marks on the controls.** `journal/marks.tsx` holds four small drawings:
   lines on a page that gain structure from Tidy to Shape to Unpack, and a
   waveform for the reader's own words, which were spoken and never written.
   The words stay beside the marks. The attribution line is now only "Written
   by <model>", and `reader/tutor.ts` gains `modelName`, which says a slug the
   way a person would: `nvidia/nemotron-3-super-120b-a12b:free` becomes
   `NVIDIA: Nemotron 3 Super`. `modelLabel` is untouched, because the caption
   above a chat bubble has one line and the maker is understood there.

A note for the next session, because it looked like a fault and is not one:
**Shape writes one H1 and the client lifts it into the page title.** So a
shaped entry shows its heading at the top of the screen, above the date, and
none inside the body. Headings *within* an entry are Unpack's job.

**Typing and correcting — 2026-10-19.** The reader tried to say "Om" and the
recogniser wrote "umm", with no way to fix it. Now the transcript in the speak
sheet is a text box whenever the recogniser is not listening. The reader can
type an entry with no microphone at all, which the unsupported-browser message
had been promising and the app had not been keeping.

`useDictation` gains `replace(text)`. It makes the typed words the base and
aborts the running session, because that session's `results` list still holds
every phrase it settled and the next event would rebuild it over the top of
the correction. `SpeakSheet.test.tsx` is new and holds the order that matters:
the correction is handed over *before* the recogniser starts again.

**A saved entry can be corrected, and re-shapes itself — 2026-10-19.** Under
the reader's own words there is now "Correct it". `storage/journal.ts` gains
`setRaw`, the one function in it that writes `raw`. When the entry has a shape,
the same strength is asked for again from the corrected words. The order is the
promise: the words are saved first, the model second. A model that will not
answer cannot cost the reader their edit, and the screen says plainly that the
shaped copy still comes from the older words.

**The entry screen is the entry now — 2026-10-19.** The raw/shaped switch stood
between the title and the first line, where it was read before the words were.
It is now one quiet line *under* the entry: the mark, "Tidied by <model>", and
the way to the other copy. The three shape cards are a drawer that opens on
"Give it a different shape", and they stay open only while the entry has no
shape at all.

**A card shows words, not notation — 2026-10-19.** The shaped copy is
markdown, so a card on the journal list opened with `## Dream recollection`.
`journal/plain.ts` takes the marks off for the one place that has no room to
render them. It drops heading lines, because a label costs a third of a
three-line preview and says less than the sentence it labels — unless headings
are all there is, when it keeps them. It is not a parser and must not become
one: `reader/markdown.tsx` renders markdown everywhere there is room.

**A stale shape says so — 2026-10-19.** The reader corrected an entry and the
Unpacked copy did not change. The auto re-shape works; the test proves it at
every level. What failed was that nothing on the screen could say when it had
*not* run — after a model refused, or on an installed app still running a build
from before it. `setRaw` now sets `editedAt` and `setShaped` clears it, so
`editedAt` beside a `shaped` is the fact that the shape is older than the
words. The credit line reads "Unpacked from your earlier words", with one press
to make it again. A flag, not two dates: a phone's clock can move, and a
current shape must never read as stale because of it.

Tags are **not** in this waypoint. `decisions.md` says Shape proposes tags, and
WP-64 is where they land, with the saved filters that make them useful.

**WP-63 · Tell the Scribe, from the book — shipped 2026-10-19.** A passage can
now become an entry.

"Tell the Scribe" sits beside "Ask Veda" in the selection menu, the same size
and the same bronze. One asks a question of the book. The other says something
about it. The speak sheet rises over the page with the passage shown above the
circle — the sheet covers the words it is about, so without that the reader is
answering a sentence they can no longer see.

The saved row carries `link`: the book, the paragraph's anchor, and the book's
own words copied. A copy, for the reason `StoredNote.quote` is one — a re-parse
moves offsets and does not move words.

Three things worth knowing about how it is built.

1. **The sheet is one component, not two.** `SpeakSheet` takes an optional
   `link`. Given one it changes its name, shows the passage, and ties the
   entry. That is the whole difference between a thought from nowhere and a
   thought about a sentence.
2. **It is portalled to the body now.** The reader page scales its column box
   with a transform when the toolbar comes up, and `position: fixed` inside a
   transformed box is fixed to *that box*. A sheet rendered in place would be
   scaled and clipped with the page it rose over. The study lamp already
   portals for the same reason.
3. **The entry screen names the book by reading it**, not from a copy of the
   title. A renamed book must not leave a wrong name on an entry. A deleted
   book leaves the passage readable and says the book is no longer on the
   shelf — the thought outlives the book.

**Not in it: jumping back to the line.** `Reader.tsx` reads no anchor off the
URL, so the entry links to the book and does not promise the passage. Giving
the reader route a deep link is its own piece of work.

**WP-67 · a professional opinion on an entry — shipped 2026-10-19.** The
Counsel.

The reader asked for a professional opinion, and then asked for the role to be
all-round rather than a niche. Both are the same answer, because **there is no
specialist model to call: the specialisation is the prompt.** A shelf of named
lenses would be one model wearing hats, and would make the reader pick a frame
before they know which frame fits.

So the model picks the frame, and then **says which frame it picked**. That is
the whole honesty of the feature. The same entry read as a dream and read as a
decision gives two different answers, and a reader who is not told the frame
cannot weigh what sits inside it. The angle is the first line of the reply,
lifted off an H1 exactly as a shape's title is.

Four choices worth keeping.

1. **A fourth persona, not the Scribe.** Tidy, Shape and Unpack reorganise the
   reader's own words and add nothing. This adds. Two different acts need two
   different names, so the reader can tell them apart at a glance.
2. **It reads `raw`, never `shaped`.** An opinion on a model's rewrite of what
   the reader said is an opinion on the wrong text.
3. **A correction marks a reading stale and never remakes it.** A shape is
   remade automatically, because it is the same words in an order the reader
   already asked for. An opinion is not the same words.
4. **The guard rails are the feature, not the trim.** The prompt forbids
   diagnosis and any claim of credentials, requires a qualified person wherever
   health, money, law or safety are in the entry, and requires an actual view —
   a reading that only reflects the entry back is of no use.

`journal/relay.ts` is new: the stream reader, the failover rule and the failure
wording, extracted from `shape.ts` so two callers do not hold two copies. The
second copy is the one that goes stale.

**Next: WP-65, the split front door.** WP-63 unblocked it. WP-64 (tags and
saved filters) and WP-66 (the journal in the backup) are the other two open
journal pieces — a reading is not in the backup or the export yet.

**WP-22 · `learner.md` adaptive model.** Held, by the reader's choice, while
the journal is built.

**WP-27 · cost and usage visibility — deferred, see `backlog.md`.** Every model
is free, so the screen would show zero and a price table would go stale.

**Three chores for the reader. None needs code, and none blocks WP-27.**
1. Run **Library → Update**. It takes the shelf to `PARSER_VERSION` 39 and
   recovers the marks that 37 and 38 stranded.
2. Prove the backup on the phone. Supabase → Table Editor → `user_rows` must
   show rows with `tbl` = `notes` and `tbl` = `tutor`. If the table stays
   empty, look at `remote.ts` first: `userId()` returns nothing without a live
   session, and every push error is swallowed.
3. Open the model picker and say whether the free list grew past six.

Then, still open:

**The `HandDrawn.tsx` teardown flake.** `npm test` exits non-zero although
every test passes. A small task of its own.

**Stats — the last step of the Google Books arc.** `finishedAt`, the OPF
fields and the catalogue lookup are all done. Pages read = finished books ×
the print edition's page count — the reader's own simplification, and the
reason there is no reading-events log. A part-read book shows percent × page
count.

**The update prompt is worth a look of its own.** A prompt-to-update PWA cost
the reader four rounds of "still broken" on work that was already shipped. The
prompt may be too quiet on a phone. Deciding this is a small task, not a bug.

**Then drop caps**, parked and waiting on the reader's screenshot.

**Offered, not yet answered (2026-08-14): "More by this author."** Google Books
has **no author entity** — `volumeInfo.authors` is a plain `string[]`. But a
shelf of the author's other books is one query away on the endpoint that
already exists (`q=inauthor:"…"`). A *biography* would need Wikidata or Open
Library — a second source, worth doing second if at all.

**Cheap follow-ons the redesign made cheap**, if the reader wants them:
favourites (a boolean, one filter clause, one chip) and renaming or deleting a
folder from the filter sheet — `repository.renameFolder` and `deleteFolder`
both exist and have no UI yet.

### Known parser limits (accepted, not bugs)
- **PDF is lossy by nature** — it stores positioned glyphs, not paragraphs.
  Publisher furniture that appears on only one or two pages (e.g. Springer's
  `Vol.:(0123456789)` sidebar) survives the repeat-based filter, which needs 3+
  pages to act. Not worth over-fitting to one publisher.
- **The bullet levels are fitted to one PDF.** `BULLET_LEVELS` maps `•` to
  level 1 and `o` or `◦` to level 2. A book that uses other marks, or the same
  mark at two depths, gets one flat level. The reader accepted this.
- **Scanned PDFs yield nothing.** No text layer, and OCR is out of scope — this
  surfaces as an empty book, so WP-11 should catch and explain it.
- **`.azw3` / `.kfx` declined** — DRM; see the note in `backlog.md`.

### Open items
- **Migration `0009`, agreed and deferred.** (`0008` is now `user_rows`.) Drop
  `subject`, `type` and `type_overridden`. **`title_overridden` and
  `repository.renameBook` are no longer on the list:** rename got a UI on
  2026-08-31, and `renameBook` sets `titleOverridden` so a later re-parse
  cannot put the old title back. The `healTitles` override skip stays for the
  same reason. Note `subject` (the app's own tag, being dropped) is **not**
  `subjects` (Google's BISAC headings, now displayed).
- **The live Anthropic key still sits in `Claude API/API.txt`**, on the
  reader's own machine, gitignored and never committed. `.env.example` is ready
  at the repo root; the key itself still needs a manual copy into a local
  `.env` for dev, and into Vercel's Environment Variables for production.
- **A garbled-diacritics report is open, waiting on the reader.** A book's
  title-page text was missing accented letters and a word-space; traced to the
  source epub's own SVG `<title>` markup (nothing in `web/src/parse/` strips
  non-ASCII), but unconfirmed without the file.
- **Pictures need a re-import to appear.** Fixed 2026-08-02 for new imports;
  books already on the shelf have no bytes stored, so "Update" fills them in.
  Storage grows by roughly the images again.
- **Not proved from this machine: a live MW answer under test.** Every parser
  is tested against captured JSON. The network path was proved by hand on the
  phone, not by a test.
