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
Breadth is now allowed. The next foundation is WP-09, which four rows wait on.

### In flight
- **Nothing mid-edit.** Everything below is merged and pushed; build green:
  2,185 tests across 122 files.
- **Not proved yet: a real call to either model.** Every part around them is
  tested — the queue, the parser, the stores, the bell. The models themselves
  have never answered. The first real proof is the reader finishing a chapter
  and seeing a summary appear. Watch for a wrong shape coming back.
- **No ceiling on spending.** The queue skips finished work and only the most
  recently opened book runs unasked. There is no cap beyond that.
- **Waiting on the phone: the chapter summary page and the bell.** Both were
  judged on a desktop browser only. Open a book, then **Book details → Chapter
  summaries**. Judge the paper, the type sizes, and the sideways rail under the
  heading. On Home, check the bell is easy to hit with a thumb.
- **A design question the page leaves open.** It does not follow the reader's
  theme. A reader in Dark gets a bright page at night. This was chosen with the
  cost known. Only a look on the phone can settle it.
- **The update prompt now has a second door.** The reader reported that the
  prompt did not appear one time, which left the phone on old code with no way
  to move it. A waiting build is now the top line in the bell, and it keeps
  counting until the update is taken.
- **A flaky test teardown, not ours to blame on WP-16.** `vitest run` reports one
  unhandled error from `HandDrawn.tsx` — a coalesced measure fires after jsdom
  has been torn down and the stored range can no longer be measured. Every test
  passes. It reproduces on the untouched commit before WP-16, so it is older
  than this work. It makes `npm test` exit non-zero. Worth a small task of its
  own.
- **Define needs its keys wherever it runs.** `MW_COLLEGIATE_KEY` (required) and
  `MW_THESAURUS_KEY` (optional) are set locally and on Vercel. A new machine, or
  a new deploy target, needs them again. Two free and separate registrations at
  <https://dictionaryapi.com>. Never prefix either with `VITE_`.
- **Not proved from this machine: a live MW answer under test.** Every parser is
  tested against captured JSON. The network path was proved by hand on the
  phone, not by a test.

### Recently done

- **The Librarian and the Scribe run** (2026-08-27). Not a waypoint — the
  reader supplied both prompts. Build green: 2,185 tests across 122 files.
  - **Both prompts are copied byte for byte** into `api/prompts/`. They are
    golden: nobody may reword them. `scripts/build-prompts.mjs` generates the
    module the relay imports, `.gitattributes` pins the files to LF so a Windows
    checkout cannot rewrite them, and `prompts.test.ts` fails if the two ever
    drift apart.
  - **Each prompt is the whole system prompt.** The relay's two bases are not
    put in front of them — `RECORDER_PROMPT` forbids the analogies and the warm
    voice the Librarian is told to use.
  - **The prompts wanted the concept model deleted that morning.** The Scribe
    returns a list of claims, each with a concept and a source pointer, not a
    paragraph. The reader then explained the destination: **Obsidian**, where a
    concept name becomes a link between notes. The answer was to store
    everything and show a little. Nothing was rebuilt.
  - **Finished chapters are worked out, not recorded.** Nothing stores chapter
    completion, so `summary/queue.ts` derives it from the anchor: chapters
    before the one being read are done, plus the last chapter once the book hits
    100 percent.
  - **One book runs on its own.** The most recently opened. Every other book
    raises a question in the bell and waits for a yes. The reason is money.
  - **The vocabulary is library-wide** and survives a deleted book, so one idea
    met in two books comes back with one name.
  - **A model cannot talk its way into the vocabulary.** A Scribe item is only
    `linked` when its concept is really on the supplied list, whatever the model
    claimed.
  - **The bell is on Home**, beside the greeting, and follows the reader's
    theme. Both kinds of line were proved in the browser against seeded rows.
  - **Nothing runs while the app is closed.** A PWA has no background job. The
    sweep runs at launch and when the app returns to the front.

- **The chapter summary page, cut back to two sections** (2026-08-27). Not a
  waypoint — built from `design-inspiration/build-prompt-summary-views.md`, then
  simplified by the reader. Build green: 2,156 tests across 119 files.
  - **One page now, not two.** `/book/:bookId/chapters` shows a book by
    chapter. Each chapter has two sections: **The chapter, in plain words**
    (the Librarian's summary, with its tags under it) and **What we worked
    through** (the Scribe's summary of the reader's questions to Veda).
  - **The Commonplace Book is gone.** The first build also made a concept index
    across every book. The reader cut it. It needed a controlled vocabulary, a
    candidate state, passage anchors and two-way crossings — all to serve one
    index. Two models and two sections do the job the reader wanted. The page
    and its test were deleted; it is all in git.
  - **The tags are chips, and not links.** A tag says what the chapter is
    about. There is no page behind it, so it must not look tappable.
  - **The way in is one link on Book Details**, "Chapter summaries". Not a
    drawer entry: the data is sample content, and the app must not advertise a
    feature it cannot yet do.
  - **Neither model is built and neither is started.** `summary/dataSource.ts`
    is the one seam — an interface, a swap function, and a labelled
    `TODO: the Librarian and the Scribe`. A mock fixture holds the sample text.
  - **Playfair Display is now self-hosted.** The build prompt asked for Google
    Fonts; `fonts.css` forbids a CDN. The reader kept the rule. This also fixed
    `Home.module.css`, which named Playfair for years without it in the bundle.
  - **The page ignores the reader's theme** — one fixed paper palette, by
    choice, with the night-time cost stated in `decisions.md`.
  - **What a model wrote is parsed, never set as HTML** —
    `summary/claimNodes.ts`. Two tags are understood and everything else is
    text, because both summaries will one day be model-written.
  - **A flaky Reader test, diagnosed and fixed.** Adding test files made
    `Reader.test.tsx` fail about one run in three. The cause was in the test,
    not the code: the neighbour section's text appearing and its pictures
    having been asked for are two different moments, and it read the second
    once instead of waiting for it. It waits now.
  - **Two faults the browser found, not the tests.** A book with no summaries
    waited forever on a load that was never started, and showed a blank page.
    And the page opened on chapter 1, which is empty in most books. It now
    opens on the first chapter that has something in it.

- **Veda's Quotes: a kept line keeps its marks, and knows its way home**
  (2026-08-26). Not a waypoint — the reader asked for it. Build green: 2130
  tests across 116 files.
  - The reader picks words inside one of Veda's answers and gets **Copy**,
    **Save** and **Ask**. Saved lines live under a **Veda's Quotes** chip.
  - **"By chapter" left the chip row** and became a switch beside it, so
    grouping now applies to whichever chip is on.
  - The chapter name sits **above** the words on every kind of note.
  - **The marks are written back on** — `reader/pickMarkdown.ts`. A selection's
    text is plain, so a saved line arrived flat. It now walks the picked nodes
    and puts the bold, the bullets, the numbers and the headings back.
  - **Four fixes changed nothing on the phone.** Two reasons, both written up in
    `decisions.md`: a note already written is not touched by fixing the writer,
    and this is a prompt-to-update PWA, so a deploy does not reach the device
    until the reader accepts. Both cost the reader four rounds.
  - **`recoverMarkdown` mends the old notes.** A kept line names its thread, the
    thread still holds Veda's answer as markdown, so the words are found in it
    and the marks read off around them. Confirmed on the phone.
  - **The serializer read a copy that had lost its parents.** `cloneContents()`
    keeps what is below the range's common ancestor and nothing above it, so a
    pick starting inside the first list item gave bare items with no list — every
    number became a bullet. It walks the live page now.
  - **The tests hid both faults** by building their own HTML and selecting whole
    nodes. A test now renders a real answer and builds the range the way a finger
    builds one.
  - A tap on a quote lands on the saved line, not at the top of the thread. The
    search strips the marks off and falls back to the longest opening really
    there, so notes saved before the plain words existed still land.

- **The book reads itself out loud** (2026-08-25). WP-16 is closed. Build green:
  2053 tests across 112 files.
  - Read aloud was one sentence, said once, with no way to stop it. It is now a
    voice that keeps going: from the selection, through the section, into the
    next one, until the reader stops it.
  - **The engine is a plain object, not a hook** — `reader/readAloud.ts`. What
    plays next, what a pause means and which endings are real are rules worth
    testing without a renderer. 22 tests drive it through a fake engine.
  - **The rule the module is built around:** `cancel()` fires `onend`. Every
    utterance carries its generation, and an ending from an old one is ignored.
  - The sentence being said is washed in the app's own blue, painted by the same
    machinery as a highlight, so it survives a page turn for free.
  - The page follows the voice by the *sentence's* rectangle, not the
    paragraph's: a long paragraph crosses a column, and the voice crosses with
    it.
  - The transport is at the foot of the page: back, play or pause, next, the
    speed, stop. The voice itself is chosen in the Aa tab, where it is decided
    once.
  - **The defect it fixes:** nothing silenced the speech when the reader left
    the book. The hook's cleanup does.
  - `aloudRate` and `aloudVoice` joined the reader's settings, so both survive a
    reload.
  - **Fixed after a third phone report:** the page still turned a sentence late.
    Both earlier attempts depended on knowing where the voice was inside a
    sentence — first from an event many engines never send, then from an
    estimate of how fast prose is spoken. Neither is needed. A sentence that
    runs off the page is now said as two utterances, cut at the page break, and
    the engine's own "this utterance ended" turns the page at the exact moment.
  - **Fixed after the same report:** choosing a reading voice changed nothing.
    An utterance now carries the language as well as the voice, because several
    engines ignore the voice when the language is unset. Picking a voice also
    says one short line in it.
  - **Fixed after a phone report:** a reader who selected the fourth sentence of
    a paragraph was read the first. An anchor names a paragraph; the selected
    words now say which sentence.
  - **Fixed after a phone report:** the page turned a sentence late. A long
    sentence that began at the foot of a page was read to its end while the
    reader looked at the page above it. One page forward is also a real turn
    with its sheet now, rather than a silent jump.
  - **Fixed after a phone report:** stop moved the reader to the next chapter
    and started reading it, and a second stop moved them on again. "Stopped" and
    "read to the end" were the same event. They are two callbacks now, and only
    the second one turns the page.

- **A PDF's pictures, found without recognising them** (2026-08-25). WP-39 is
  closed. Build green: 2006 tests across 110 files.
  - The PDF parser read text and nothing else, so a book of plates imported as
    a book of captions. It now finds any band of a page taller than a fifth of
    it with no text in it, draws that strip, and keeps it as an ordinary figure.
  - **Nothing is classified.** `pdf-layout.ts` declined to recognise figures,
    and that stands. A gap is a fact about a page. A band that renders blank is
    discarded after the render, when the pixels can be counted.
  - It catches vector diagrams, which reading the embedded images would miss —
    a chart has no picture inside the file to find.
  - The margins stay out of it without measuring them: only the space between a
    page's own topmost and bottommost text counts. The cost is a figure with no
    text on one side of it, which cannot be told from a margin.
  - `PARSER_VERSION` 29, so PDFs already on the shelf re-parse and gain their
    pictures.
  - Two Library tests were racing and failed under the extra load of two new
    test files. Both asserted before a second read had landed; they now wait.

- **Ask about a picture — the epub half of WP-39** (2026-08-25). Build green:
  1983 tests across 108 files, up 35.
  - An **Ask** button under every plate that has a picture. A button and not a
    tap on the picture: the page already spends its taps, the edges to turn and
    the middle to raise the toolbar.
  - The plate is scaled to 1,024 pixels on its long edge and encoded as JPEG
    before it is sent — `reader/figurePicture.ts`. The arithmetic is a pure
    function, so it is tested without a browser.
  - **The roster now records which models can read a picture**, from each
    provider rather than a hand-written list. A blind model does not refuse a
    picture; it drops it and answers from the caption. So a picture question
    filters its whole fallback chain, not just its head, and with no seeing
    model the lamp refuses and says why.
  - A message in `api/tutor.ts` can now be text plus a picture. Text-only
    conversations go out byte for byte as before.
  - PDF regions stay open, so WP-39 stays `[~]`.

- **The tutor's reach is settled: the page, and not the book** (2026-08-25).
  No code changed. Five waypoints were read against the code and closed.
  - **WP-09 and WP-18 are declined.** Both exist to search across a book. The
    tutor does not: `reader/context.ts` sends the title, the author, the
    chapter, the section, and the paragraph either side. That answers "explain
    this", which is the question the reader asks.
  - **WP-28 goes with them.** It guards cross-book retrieval. There is none.
  - **WP-10 and WP-21 are closed as built, in a different shape.** The persona
    is `BASE_PROMPT` in `api/tutor.ts` and the modes are eight task modules.
    Nothing reads a book's kind, so classifying one earns nothing.
  - Two stale things found while reading: `reader/genre.ts` is named in a
    comment in `api/tutor.ts` and was never built, and `BookGenre` is declared
    and unused.
  - The build board learned a **cut** state, which counts in neither half of a
    tally, and a shift-tap now steps back one place instead of two.

> **Older entries are deleted, not archived.** Only the five newest survive —
> see this file's own header. Git holds every earlier version of this file, so
> nothing is lost: `git log -p docs/progress.md` brings back any entry ever
> written. Do not build a second copy of this history anywhere in the repo.

### Blockers
- **None.** Supabase's email allowance (a few sign-in messages an hour on the
  free mailer) bit once on 2026-08-09 and cleared itself; connect real SMTP
  under Authentication → Emails if it ever gets in the way again.
- The `autoUpdate` → `prompt` crossing that stranded installed clients
  is closed: the reader confirmed on 2026-08-05 that the phone is on the current
  build and that the stale client was a desktop-app session, not a deploy or
  worker problem. Don't raise it again.

### Next up
**The update prompt is worth a look of its own.** A prompt-to-update PWA cost
the reader four rounds of "still broken" on work that was already shipped. The
prompt may be too quiet on a phone. Deciding this is a small task, not a bug.

**Prove the reading voice on the phone.** WP-16 is built and tested, but three
of its faults were only visible on a device. `active-task.md` lists eight checks.
The voice choice is the one that still needs proof: the fix assumes the engine
ignores a voice when no language is set.

**Then choose the next waypoint with `/plan-task`.** WP-09 is the next
foundation — WP-10, WP-18, WP-21 and WP-28 all wait on it.

**Judge the parser on the phone.** Accept the rebuild to `PARSER_VERSION` 28 and
check the Contents tab. This needs no code. It is the only way to know if the
four parser rounds have landed.

**Then drop caps**, parked this thread and waiting on the reader's screenshot.

**Finish WP-25: something that writes a note.** The Notes tab reads a table that
nothing fills. Written out in `active-task.md`, with one question to settle
first: device-local or cloud. Device-local is the smaller step.

Then, still open:

**Google Books metadata, then the Stats tab** — the arc the reader chose on
2026-08-10, written out step by step in `active-task.md`. Import reads only
**title and author** today; everything Stats wants (page count, categories,
average rating) comes from a catalogue.
1. `finishedAt` — **done** (`4f9175c`).
2. ISBN, publisher and subtitle out of the EPUB's own OPF — **done**.
3. The Google Books lookup through `api/`, with the match guard, the shelf
   backfill and a per-book Refresh — **done** (`fbea9ad` → `a1cce60`). The key
   is server-side only; never a `VITE_` variable.
4. **Stats — the only step left.** Pages read = finished books × the print edition's page count — the
   reader's own simplification, and the reason there is no reading-events log.
   A part-read book shows an approximation: percent × page count.

**Then back to the reader's order, set 2026-08-02:** a proper reading app first,
then AI.
- **The reader's eye is no longer the blocker — signed off 2026-08-10.** The
  launch tempo, the 85% page scale, the gestures, the library's list and grid
  were all carried open for days and are now called good. Left as facts rather
  than questions: 557 ms is the measured splash, 85% clears both bars with
  budget to 90%, and **gestures are still verifiable on a phone or not at all** —
  a synthetic click is not a finger, so that stays true of any future change to
  them. One chore survives, unrelated to taste: run **Library → Update** to pull
  covers forward to `PARSER_VERSION` 9.
- **Offered, not yet answered (2026-08-14): "More by this author."** Google
  Books has **no author entity** — `volumeInfo.authors` is a plain `string[]`,
  with no bio, nationality or bibliography anywhere in the API. But a shelf of
  the author's other books is one query away on the endpoint that already
  exists (`q=inauthor:"…"`). A *biography* would need Wikidata/Wikipedia or
  Open Library — a second source, worth doing second if at all.
- **Cheap follow-ons the redesign made cheap**, if the reader wants them:
  favourites (a boolean, one filter clause, one chip) and renaming/deleting a
  folder from the filter sheet — `repository.renameFolder` and `deleteFolder`
  both exist and have no UI yet.
- **Reading comfort is done.** WP-14 closed with WP-55's bookmarks and in-book
  search; font size, line spacing, margins, sepia and the page turn were already
  in. Notes/highlights are WP-25 and need the tutor loop's selection work first.
- **WP-43 · Re-scan a folder + name what's new.**
- **WP-09 · the import manifest and crossrefs** — proposed 2026-08-25.
  WP-17, 19, 20, 25 and 29 are done: the tutor loop works end to end. Four rows
  now wait on WP-09 alone — WP-10, WP-18, WP-21 and WP-28.
### Known parser limits (accepted, not bugs)
- **PDF is lossy by nature** — it stores positioned glyphs, not paragraphs.
  Publisher furniture that appears on only one or two pages (e.g. Springer's
  `Vol.:(0123456789)` sidebar) survives the repeat-based filter, which needs 3+
  pages to act. Not worth over-fitting to one publisher.
- **Scanned PDFs yield nothing.** No text layer, and OCR is out of scope — this
  surfaces as an empty book, so WP-11 should catch and explain it.
- **`.azw3` / `.kfx` declined** — DRM; see the note in `backlog.md`.

### Open items
- **Migration `0008`, agreed and deferred:** drop `subject`, `type`,
  `type_overridden`, `title_overridden`; remove `repository.renameBook` (no UI)
  and the `healTitles` override skip. Note `subject` (the app's own tag, being
  dropped) is **not** `subjects` (Google's BISAC headings, now displayed).
- **The live Anthropic key still sits in `Claude API/API.txt`**, on the
  reader's own machine, gitignored and never committed. `.env.example` is
  ready at the repo root; the key itself still needs a manual copy into a
  local `.env` for dev, and into Vercel's Environment Variables for
  production. **More urgent now than "someday"** — the app has a real public
  URL as of 2026-08-03, not just a home LAN.
- **A garbled-diacritics report is open, waiting on the reader.** A book's
  title-page text was missing accented letters and a word-space; traced to
  the source epub's own SVG `<title>` markup (nothing in `web/src/parse/`
  strips non-ASCII), but unconfirmed without seeing the actual file or its
  title-page markup.
- **Pictures need a re-import to appear.** Fixed 2026-08-02 for new imports;
  books already on the shelf have no bytes stored, so the shelf's "Update"
  (kept source file, `PARSER_VERSION` 3) is what fills them in. Storage grows by
  roughly the images again — the Jung epub's 141 plates are most of its 15 MB.
