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
  1909 tests across 105 files.
- **Define needs its keys wherever it runs.** `MW_COLLEGIATE_KEY` (required) and
  `MW_THESAURUS_KEY` (optional) are set locally and on Vercel. A new machine, or
  a new deploy target, needs them again. Two free and separate registrations at
  <https://dictionaryapi.com>. Never prefix either with `VITE_`.
- **Not proved from this machine: a live MW answer under test.** Every parser is
  tested against captured JSON. The network path was proved by hand on the
  phone, not by a test.

### Recently done

- **The speaker, properly this time, and a lie the dictionary was telling**
  (2026-08-25). Build green: 1938 tests across 107 files.
  - **Root cause of the vanishing speaker: the cache, not a race.** The word
    cache keeps the *parsed* entry and is read before the network, and the row
    had no version. So the audio-path fix of 2026-08-24 never reached any word
    the reader had already looked up. Measured: the old path answers 403, the
    new one 200. New `DEFINITION_VERSION` in `storage/words.ts`, now 2. A row
    from an older parser counts as a miss. The first guess — an unheld `Audio`
    element being collected — was wrong, and "it fails every time" is what
    ruled it out.
  - **The speaker never disappears again, for any reason.** It dims, disables
    and says "no recording" to a screen reader.
  - **A malfunctioning MW is no longer reported as "no dictionary entry".** A
    broken MW and a word MW lacks are the same 200 and the same array of
    strings. On 2026-08-25 the Collegiate endpoint answered that way for
    `cat`, `dog`, `water`, `person` and `fundamental` for about half an hour,
    then recovered on its own. `mwKnowsTheWord` reads MW echoing the word back
    as its own first suggestion, which a genuine miss cannot do, and the panel
    says "try again in a moment" instead of naming the word as unknown.
  - **The first explanation for that was wrong, and is recorded as wrong.** It
    was called a spent daily quota. The reader's usage report disproved it: 30
    hits in 30 days. Also ruled out by measurement — swapped keys, an invalid
    key, a rate limit, response caching, and common words being treated
    differently. See the note on `mwKnowsTheWord` in `reader/dictionary.ts`.
  - **No morphology work is needed.** The reader asked for "persons" to fall
    back to "person". MW does that itself: once the fault cleared, `persons`
    returned the `person` entry and `unnoticed` returned its own. The report
    was the fault above.

- **Four fixes off the phone** (2026-08-25). Build green: 1929 tests across 107
  files.
  - **Home paints once.** The greeting sat outside the load gate and the shelf
    inside it, so a cold launch showed the greeting alone for about a second
    while the covers loaded. Both are behind the gate now.
  - **The screen stays awake in a book.** New `reader/wakeLock.ts`. The browser
    drops a wake lock every time the page hides and does not give it back, so
    the module re-takes it on `visibilitychange` — a one-shot request would have
    worked until the reader's first interruption and then stopped silently.
  - **A sheet closes on a swipe down.** In `Sheet`, so every sheet gains it. The
    gesture is on the handle strip only: `ModelGrid` drags its own columns.
  - **The speaker stops vanishing.** `new Audio(url).play()` kept no reference to
    the element, and an unreachable media element that is still loading can be
    collected, which rejects the `play()` in flight. The panel now holds one
    element. It also no longer removes the button on any failure — only on
    `NotSupportedError`. Not the URL: "fundamental" maps to `fundam02`, which
    answers 200.

- **Define — the dictionary loupe** (2026-08-24, `f79cf19` … `0200625`). A
  reader selects a word, taps **Define**, and a glass panel opens beside it —
  headword, MW respelling, up to three senses, synonym chips, and the origin as
  a chain of roots from oldest to newest. Merriam-Webster is the source, through
  a new edge relay `api/define.ts` that holds the keys.
  - **The cache is checked before the network.** What is kept is the *parsed*
    entry, so a word looked up once opens instantly and works with no signal.
  - **The origin chain is reversed.** MW writes the newest form first; the
    reader wants the oldest first. It falls back to plain prose when it cannot
    find two clean hops.
  - **Four failures, four answers.** No entry, offline, out of lookups, and
    "something went wrong". Every one of them still offers Ask Veda.
  - **The glass follows the theme.** Forest is green glass, not amber.
  - **Save word keeps a word**, in a `vocabulary` table at Dexie v15. The Notes
    panel has a fifth tab, **Words**, listing them across every book. Tapping
    the button again lets a word go.
  - **Five faults found by using it, all fixed the same day.** The panel closed
    itself in the same frame (a second `useBackDismiss` fighting the Reader's);
    an empty rectangle list left it hidden; the speaker played nothing (MW
    serves audio from `/audio/prons/en/us/mp3/`, and the other documented path
    answers 403); every sense showed the same example (`def` is one entry per
    part of speech, not per sense); and a saved word could not be un-saved.
- **The tutor is named Veda, and five fixes off the phone** (2026-08-24,
  `f602f9e`). The selection excerpt scrolls; the Notes paper scrolls with the
  words and the red margin runs the whole page; tutor replies draw as markdown;
  an ask that fails while the app is in the background retries once on return.
- **A publisher's field name no longer shows as a subject tag** (2026-08-23,
  `e7c1b23`). A book listed `review_metadata` as its only subject. An EPUB's
  `dc:subject` is copied out of the file verbatim by `parse/epub.ts`, and
  nothing judged it. `subjectTags` in `pages/BookInfo.tsx` now drops a tag that
  has no space *and* contains an underscore. The rule is narrow on purpose:
  `Self-Help` and `Philosophy` keep their place. It runs at display time, so
  the stored record stays a true copy of the file.
- **Study Lamp round two — the reader's first-use feedback** (2026-08-21).
  Four fixes off one report:
  - **A slip per sentence.** `TutorMarks.tsx` places each thread's slip at the
    end of its own last inked line, clamped inside the paragraph. Two threads
    in one paragraph no longer stack their slips on the same corner.
  - **Notes can be deleted.** Every row in the Notes tab carries a small ×.
    A tutor row's × deletes the whole thread and its page marks
    (`dropNoteRow` in `Reader.tsx`).
  - **Tutor threads show under Notes → Claude.** `Reader.tsx` merges threads
    into `noteRows` through `inNoteOrder`. A row shows the elided passage and
    Claude's last reply; a tap reopens the thread under the lamp, not the page.
  - **Larger fonts** in the Study Lamp and the Notes slips. The Caveat
    handwriting stayed at 22 px — its line height must equal the 32 px rule.
  - 4 new NotesPanel tests; 1512 total, all green. The slip positions and the
    delete feel still need the phone.

- **The Study Lamp — Ask Claude is a room now** (2026-08-21). This is the first
  visible piece of the tutor loop (WP-17 → 20).
  - The selection menu's four Ask rows became one bronze `✦ ASK CLAUDE` entry.
  - It opens a full-screen, always-dark room over the page: the passage in
    Cormorant Garamond, four question chips, and a composer. A long passage
    fades into shadow with `▴ TAP TO PIN`; after the first exchange the passage
    collapses to a one-line pinned bar.
  - Your words are handwriting; Claude's are a printed slip with a ✦ badge.
  - Threads live in a new `tutor` table (Dexie `version(12)`), device-local
    like notes. One thread per passage — asking again reopens it.
  - Closing the room leaves a hand-drawn ink line under the passage and a tiny
    tucked slip at its corner. `TutorMarks.tsx` paints them with the same
    column-fold measuring machinery as `HandDrawn.tsx`, now shared via exports.
  - `askTutor` posts to `/api/tutor`. No relay exists yet, so a canned reply
    says the tutor is offline. It never fakes an answer. The system prompt and
    the key belong to the relay, server-side only, never a `VITE_` variable.
  - The lamp counts as a layer: back swipe and Escape close it first.
  - Proved in the running app: the full loop, persistence across a reload, and
    the marks returning from the database. 8 new tests cover `elide`,
    `passageKindOf` and the store. Deleting a book now clears its notes and
    tutor threads too — the notes cascade was a pre-existing gap.


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
