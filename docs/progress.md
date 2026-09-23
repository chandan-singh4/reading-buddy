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
- **The phone has now seen all of it (2026-09-05).** The reader checked every
  screen that was waiting: the Statistics screen and its timer, the rebuilt book
  screen in both states, the two-row chapter rail, the model picker, the chapter
  summary page, the bell on Home, and the new reading voice. All confirmed
  working. The bright summary page in Dark is accepted as it is.
- **A book left open counts.** The idle rule was removed on the reader's
  instruction, so the only guard is a six-hour cap per session. If a forgotten
  book starts inflating the numbers, the fix is a smaller cap, not a new pause
  rule.
- **The Stats numbers do not follow the reader to a second device.** Sessions,
  threads and summaries are all device-local; only the shelf is in the cloud.
- **Check the deploy, do not assume it.** A helper file under `api/` with no
  default export failed the Vercel build and five commits sat on `main`
  undeployed. To prove a deploy: fetch the live `index.html`, read the
  `assets/index-*.js` hash, and compare it with the one in `web/dist`.
- **Nothing mid-edit.** Everything below is merged and pushed; build green:
  2,487 tests across 149 files.
- **The Obsidian export is proved, both times.** The first export met a real
  vault on 2026-08-31. The reader confirmed the second export on 2026-09-05:
  "Export what's new" added the new chapter and made no copy of an old one.
- **`api/tutor.ts` has no tests.** The mid-stream failover added this session is
  proved by reasoning only. There is no test harness under `api/`, and the
  client half is covered instead (`watched.test.ts`, `askMemory.test.ts`).
- **Every already-summarised chapter will re-run the Scribe once.** The
  staleness test now counts the reader's questions rather than the passages, so
  every stored summary looks stale one time. It settles after that.
- **A screen must import `repository` from `storage/index.ts`.** Four screens
  imported `storage/repository.ts`, which is the device store only. The reader's
  library is in the cloud, so every summary page read an empty database and
  showed nothing. `summary/repository.test.ts` reads the imports of every file
  in `summary/`, `pages/` and `tutor/` and fails on a new offender.
- **Not proved yet: a real call to either model.** Every part around them is
  tested — the queue, the parser, the stores, the bell. The models themselves
  have never answered. The first real proof is the reader finishing a chapter
  and seeing a summary appear. Watch for a wrong shape coming back.
- **No ceiling on spending.** The queue skips finished work and only the most
  recently opened book runs unasked. There is no cap beyond that.
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

- **Everything the reader makes goes to the cloud** (2026-09-23). Not a
  waypoint. Build green: 2,583 tests across 161 files.
  - Android Chrome cleared the app's storage when the phone was low on space.
    Notes, highlights, Veda threads and sessions were lost. Only the shelf was
    in the cloud.
  - `web/src/storage/sync/` now copies eleven tables to a new Supabase table,
    `user_rows`. An emptied device gets them back when it opens.
  - **The reader must run `0008_user_rows.sql` in Supabase.** Until then the
    device queues the changes.
  - **Not proved yet:** a real sync against Supabase. The tests use a fake
    server with the same rules.
  - The lost data can come back only from the Obsidian export of 2026-09-05.
    A "restore from vault" import is not built.

- **The app stays signed in with no network** (2026-09-10). Not a waypoint.
  Build green: 2,575 tests across 160 files.
  - A sign-in token lives about one hour, and the app renews it over the
    network. With no network the renewal failed, so the app decided nobody was
    signed in. After one hour offline it showed the sign-in screen, which no
    reader can use with no signal.
  - It was worse than a locked door. Every write was refused as "you are signed
    out" instead of being queued, so the outbox never saw the page turns.
  - The app now writes down the reader who last signed in. It gives that reader
    back **only** when the renewal failed for want of a network.
  - Two kinds of proof count as "no network": the browser saying so, and a
    renewal that failed with a network error while the browser said it was
    online. The second is the train case.
  - A true sign-out still closes the app, offline or not.
  - **Not proved on a device.** The tests prove the rule. Nobody has yet flown
    with it.

- **WP-43 — check the folder for new books** (2026-09-05). Closed on the phone
  on 2026-09-10. The reader pressed the button and it works. Build green: 2,564
  tests across 158 files.
  - A new item in the "+" menu: **Check folder for new books**. It shows only
    after the reader has imported a folder one time.
  - On Chrome, Edge and Android Chrome the app keeps the folder and reads it
    again with no picker. On Firefox and iOS Safari the item opens the folder
    picker, because those browsers cannot keep a folder.
  - Books already on the shelf are skipped. Import did this before; the button
    only had to use it.
  - The report now names the new books: "Imported 2 books: The Red Book, Aion."
  - **Proved on a device** on 2026-09-10.

- **Veda, the summaries and the notes can speak** (2026-09-02). Not a waypoint.
  Build green: 2,551 tests across 157 files.
  - A speaker button under each of Veda's answers, beside Copy and Redo on each
    chapter summary, and on the line above each note. Press it again to stop.
  - Veda answers in her own voice, `bf_emma`. It is hers alone, like her violet.
  - A summary is read in the reader's narrator voice. A note follows who wrote
    it.
  - **One narrator now, shared by every screen.** Four speaking screens would
    have been four workers and four copies of the model, on a phone. The fault
    is invisible: everything works, only the memory is wrong.
  - Markdown is stripped first. Otherwise the model says "asterisk asterisk".

- **A reading voice of our own** (2026-09-02). Not a waypoint. Build green:
  2,533 tests across 155 files.
  - "Read aloud" no longer uses the browser's speech engine. It uses
    Kokoro-82M, a small speech model that runs on the device.
  - The same 28 voices on every device. American and British. Each one has a
    Preview button in Settings.
  - The model costs 86 MB, one time. It arrives when the reader first presses
    Read aloud, never at install. After that the voice works with no network.
  - The reading rules did not change. Only the engine under them did. See
    `docs/decisions.md`.
  - **A fault the browser found:** `'gpu' in navigator` is not proof that WebGPU
    works. The first run failed instead of falling back. The worker now asks for
    an adapter and waits for the answer.
  - **Three faults made a long pause between sentences.** The reader found
    them. The lookahead asked for the same sentence twice, the cap threw away
    the sentence about to be spoken, and the lookahead reached the worker
    before the sentence the reader was waiting for. All three are fixed and
    guarded by tests. The first sentence went from 57 seconds to 24.
  - **Still open, and it needs your phone.** Without a GPU the model makes
    speech about five times slower than speech is spoken. No lookahead can fix
    that. Read the steps in `active-task.md`.

- **The back swipe out of a book** (2026-09-02). Not a waypoint. Build green:
  2,510 tests across 152 files.
  - The toolbar's links now replace their history entry instead of pushing.
  - Leaving a book took three back swipes, and the middle one did nothing. Each
    trip to the examination or the About page added another dead swipe.
  - Now: one swipe back to the book, a second out of it.

- **Veda's Examination** (2026-09-01). Not a waypoint. Build green: 2,500 tests
  across 150 files.
  - The reader opens it from the top right of the reading screen. The icon is a
    question on a page, in Veda's violet.
  - The sitting has no length. Veda writes a batch, and writes more when the
    reader works through them. She is told what she has already asked.
  - "You are all caught up on this chapter" ends it, when she runs dry.
  - Questions are pitched at a graduate seminar.
  - Questions come from the book's own paragraphs, never from the recap.
  - One call sends the chapter once, not twice, and sends about 12,000
    characters of it. A refill reads the next part.
  - The screen opens on the chapter the reader last chose.
  - A picker at the top opens the chapter list. Any chapter, any time.
  - Each question has one right option and three named misconceptions. A
    question is dropped unless it cites a paragraph that exists in that chapter.
  - The reader picks an option, then says how sure they are, then submits.
  - A confident wrong answer flags the concept. It comes back in a later
    sitting as a new question, never in the same sitting.
  - "Discuss with Veda" opens a chat seeded with the question and both notes.
    Each bubble shows the model that wrote it.
  - Focus Mode is deleted. It hid chrome that is already hidden.
  - Difficulty exists in the data. It is never shown.
  - The golden prompts did not change. The examiner is a new module in
    `api/tutor.ts`.

Older entries were removed. `git log -p docs/progress.md` has every one.

### Blockers
- **None.** Supabase's email allowance (a few sign-in messages an hour on the
  free mailer) bit once on 2026-08-09 and cleared itself; connect real SMTP
  under Authentication → Emails if it ever gets in the way again.
- The `autoUpdate` → `prompt` crossing that stranded installed clients
  is closed: the reader confirmed on 2026-08-05 that the phone is on the current
  build and that the stale client was a desktop-app session, not a deploy or
  worker problem. Don't raise it again.

### Next up
**The reader travels on 2026-09-11 and reads offline.** The steps to take
before leaving are in `active-task.md`. The short form: open every book to read
on the trip while there is a signal, and press Read aloud one time.

**The update prompt is worth a look of its own.** A prompt-to-update PWA cost
the reader four rounds of "still broken" on work that was already shipped. The
prompt may be too quiet on a phone. Deciding this is a small task, not a bug.

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
- **WP-27 · cost and usage visibility.** Two models run unasked. Nothing tells
  the reader what that costs. WP-09 and WP-18 are declined, so this is now the
  largest open piece with WP-22.
### Known parser limits (accepted, not bugs)
- **PDF is lossy by nature** — it stores positioned glyphs, not paragraphs.
  Publisher furniture that appears on only one or two pages (e.g. Springer's
  `Vol.:(0123456789)` sidebar) survives the repeat-based filter, which needs 3+
  pages to act. Not worth over-fitting to one publisher.
- **Scanned PDFs yield nothing.** No text layer, and OCR is out of scope — this
  surfaces as an empty book, so WP-11 should catch and explain it.
- **`.azw3` / `.kfx` declined** — DRM; see the note in `backlog.md`.

### Open items
- **Migration `0008`, agreed and deferred — and now smaller.** Drop `subject`,
  `type` and `type_overridden`. **`title_overridden` and
  `repository.renameBook` are no longer on the list:** rename got a UI on
  2026-08-31, and `renameBook` sets `titleOverridden` so a later re-parse of
  the file cannot put the old title back. The `healTitles` override skip stays
  for the same reason. Note `subject` (the app's own tag, being
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
