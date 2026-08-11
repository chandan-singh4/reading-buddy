> **What's in here (read at every startup).** A living snapshot of where the
> build stands — recently finished work, what's in flight, current blockers, and
> the immediate next moves. It's the "you are here" pin: read it first every
> session so you know the state without inspecting git history or the codebase.
> Kept deliberately short — only the last handful of done items survive, older
> history is dropped. Updated at the end of every session by `/wrap-session`. If
> this file and the code ever disagree, trust the code and fix this file.

---

**Current leg:** Leg 2 — Reading Room
**Near-term arc:** the *walking skeleton* — import a `.md` → render → select →
Ask → streamed answer (WP 01 → 03 → 04 → 05 → 08 → 11 → 12 → 17 → 18 → 19 → 20).
Get that loop working before building any breadth.

### In flight
- **Nothing mid-edit.** Everything below is merged and pushed; build green,
  **984 tests**.
- **One chore the app cannot do for itself: apply
  `supabase/migrations/0003_finished_at.sql`.** Until it runs, finishing a book
  on the cloud backend errors — harmlessly, it is caught, and the boot backfill
  picks it up afterwards — but no finish date is stored.
- **The next arc is agreed and written up in `active-task.md`:** ISBN from the
  file → Google Books → Stats. Step 1 of that arc (`finishedAt`) is already
  shipped; step 2 needs no API at all.
- **Nothing is waiting on the reader. The queue is empty as of 2026-08-10** —
  the first time it has been, and worth not quietly refilling.
  - **The greyed-out offline shelf was seen and approved on the phone**, along
    with the four shelves that now hold their place when empty.
  - **The design-hook findings are triaged.** The side-stripe was softened to a
    wash on the reader's call (`--color-accent-wash`); the `LibraryCopy` "width
    animation" was closed as a false positive — that rule animates a transform.
  - **WP-55 is signed off.** The launch tempo (557 ms), the 85% page scale and
    the gestures were all carried unseen for two days and have now been used and
    called good. The 85% has budget to 90% if it is ever raised again, and the
    "I don't see the logo" report closes with it — a stale cached build, as
    suspected, which is also why the update panel got its safety net.

### Recently done
- **The day a book was finished is now remembered** — 2026-08-10 (`4f9175c`).
  Groundwork for Stats. "Finished" was already derivable from a 100% position,
  but only as a *fact*, never as a *date*: a position's `at` is the last page
  turn, so opening a finished book months later to check a quote moved the day
  it was finished — harmless on a shelf, a lie in a yearly total.
  `BookMeta.finishedAt` follows the rule `titleOverridden` already set: written
  once, never overwritten. **Kept out of `savePosition`** (that runs every
  paragraph and is a bare single-row put); on the cloud the guard is
  `.is('finished_at', null)` in the *where* clause, so two devices finishing the
  same book settle it in Postgres with the first date winning.
  `backfillFinishedAt` at boot earns its place twice — it dates the books
  finished before the field existed, and it is the recovery path for a book
  finished in a tunnel (the 100% page turn is queued like any other write), which
  is why finishing needs no outbox entry of its own.
  **Owes one manual step: `supabase/migrations/0003_finished_at.sql`.**
- **Four smaller pieces the reader asked for, all tested on the phone** —
  2026-08-10. All four shelves hold their place on Home when empty, with a
  heading, a plank and one quiet line in the gap (`64d77cb`). The update panel no
  longer looks dead while it works — a busy state, and a 4-second reload safety
  net for the `controllerchange` event that may never arrive (`2cb9b86`). The
  accent side-stripe on the boxes that want noticing became a soft wash
  (`ca878b7`) via one new token, `--color-accent-wash`, mixed from
  `--color-accent` — custom properties are substituted at *use* time, so a single
  `:root` line follows all seven themes. And every carried-open question in the
  docs was closed (`4dff543`).
- **The offline shelf lists every book, greying the ones it can't open** —
  2026-08-10, the reader's call after seeing 1 book of 33 with Wi-Fi off.
  Nothing was lost and it did not look that way, which was the whole problem.
  - **The listing is remembered separately from the books** (`cloud/shelf.ts`):
    titles and authors for all 33 are a few kilobytes, where the books are
    megabytes — which is exactly why the listing can be kept for everything when
    the books cannot. In memory *and* `localStorage`: the second is what
    survives a relaunch, the first is what works where `localStorage` doesn't
    (private mode, the test runner) and is why the tests can see it at all.
  - **"Can this be opened?" is answered by what happened, not by
    `navigator.onLine`** — the wrapper records whether the last shelf came from
    the cloud or the copy, because `onLine === true` is what a captive portal
    reports. `unavailableBooks()` in `storage/index.ts` is the one thing a
    screen may know about the copy, since it is the one thing a reader can see.
  - **Home filters instead of greying.** Its job is "pick up where you left
    off"; four dimmed tiles that all refuse to open is a worse front door than a
    shorter, true one. The full shelf is one tap away.
  - **A three-run-flaky test was fixed at the root**: `readAndCache` waited for
    the copied *sections*, but the copy writes pictures, the source file and the
    marks after them, so tests were cutting the signal mid-copy. `copyInFlight`
    now exposes the real "is it done?".
  - Gates: **976 tests**, typecheck and build green.
- **WP-58 step 5 · The offline write queue** — 2026-08-10. Bookmarks, saved
  passages and page turns now survive a tunnel: applied to the offline copy so
  the reader sees them immediately, recorded in `cloud/outbox.ts`, sent when
  there is a signal (the `online` event, launch, or any write that gets through).
  - **The queue is its own database, `reading-buddy-outbox`.** The obvious home
    was a table in the cache — and the cache is the one store in the app that is
    *safe to delete at any moment*, while a queued bookmark is the one thing here
    that exists nowhere else. Different lifetimes, different databases.
  - **The id map has to be durable, and a test is what proved it.** The cloud
    mints its own ids, so a bookmark made offline keeps the *copy's* id for as
    long as that copy lives — a delete queued a week later still names it.
    Rewriting whatever happened to be queued at drain time was the first attempt
    and it was wrong within one reconnect.
  - **`looksOffline` now decides whether a queued write is kept or dropped.** A
    refusal from a reachable cloud (RLS, a book deleted elsewhere) is dropped —
    a queue that retries the impossible never empties. A lost signal *stops* the
    drain rather than skipping ahead, because the order is part of the meaning.
  - **A page turn replaces the pending one.** Position is written every few
    seconds; an hour offline would otherwise be hundreds of rows saying
    increasingly stale versions of one fact.
  - **Two interface additions, each making a settled rule actually true.**
    `savePosition(…, at?)` carries the moment the page was turned, so a replayed
    tunnel can't outrank a newer write from a laptop; `addQuote` returns its row
    like `addBookmark` always did, so the id is knowable.
  - **Deleting a book still refuses** — now in words about books rather than
    about the network, and a successful delete drops that book's queued writes.
  - Gates: **967 tests** (24 new), typecheck, build.
- **WP-58 · Cloud books readable with no signal** — 2026-08-10, merged to `main`
  (`5476ac6`, `23e3787`, `39773be`). **Started with a decision, not an editor**:
  the waypoint said it owed a conflict rule before it owed any code.
  - **The conflict problem mostly dissolved when named properly.** Highlights
    and bookmarks are *additive* — two devices each adding one means you end up
    with both, which is the correct answer arriving by itself, not a conflict.
    That leaves exactly one single-valued field (position, settled by newest
    timestamp) and one action with no honest automatic merge (delete, which now
    needs a signal). Full reasoning in `decisions.md`.
  - **The cache is a second database, `reading-buddy-cache`** — same schema,
    different name, invisible on every shelf. Caching into the device library
    would have been fewer lines and quietly catastrophic: "32 books here" under
    the unselected option would stop meaning anything.
  - **This is what WP-57 was secretly for.** Filling the cache is
    `copyBook(cloud, cache, …)` — the copier written the day before, pointed at
    a different target, because it was written against `Repository` and never
    learns direction.
  - **Caching fires on `getSection`, not on `getManifest`.** The library screen
    touches every book, and a shelf that quietly downloaded thirty-two books
    because it was scrolled past is a bug the reader pays for in data.
  - **Two faults the phone found, both mine, both now rules.** (1) `loadLibrary`
    fires four reads in one `Promise.all`; three had a fallback and the fourth —
    a check about the *Update* button — did not, so its failure binned three
    good answers and the whole screen said *"Couldn't open your library."*
    **`Promise.all` fails as a group**, so "is this a reading call?" is the
    wrong question. (2) The code asserted that asking a dead network was free.
    With Wi-Fi off it is dozens of requests each with its own DNS attempt, and
    the reader watched the library crawl — `navigator.onLine === false` now
    short-circuits to the copy.
  - **A twenty-book ceiling, least recently read dropped first**, with the
    reading order in `localStorage` rather than a table (the schema is shared
    with the device library — a migration would run over 32 real books to
    support a copy that can be thrown away), plus a pressure valve for when the
    browser refuses a write for want of room.
  - Gates: **943 tests** (47 new), typecheck, build.
- **WP-57 · Copy a library between device and cloud** — 2026-08-10, merged to
  `main` (`7ff0415`, `af3a30c`). The "push my 32 books up" button and its
  reverse. `storage/transfer.ts` reads through one `Repository` and writes
  through the other, book by book so a dropped signal costs one book rather than
  the run, skipping what is already there. **Written against the interface with
  no notion of direction** — which is the only reason WP-58's cache fill cost
  nothing the next day. A real progress screen, because 32 books is minutes and
  a silent spinner over a multi-minute upload is indistinguishable from a hang.
- **The text moved out of Postgres into R2** — 2026-08-10 (`c31e54a`). Sections
  are one JSON object per chapter, keyed by book and parse token; the database
  keeps only the address. Costs one extra hop (~150 ms) on the first read of a
  chapter and keeps the database slim for years. This is also what made WP-58
  cheap: **every read of a book's bytes now goes through one fetch**, which is
  the single place a cache belongs.
- **Older rounds — WP-53, WP-54, WP-55, the first cloud write-up, the sign-in
  toggle and the first live setup — dropped
  from here to keep this file short.** Each has a full entry in `docs/backlog.md`
  and its reasoning in `docs/decisions.md`; the traps they cost are in
  `active-task.md` under "Carried forward".

**Gates:** `npm test` (984, 54 files), `npm run typecheck`, `npm run build` — all
passing as of 2026-08-10. Precache 34 entries / 1116.6 KiB. Every
parser stays behind a dynamic `import()`, so pdf.js (434 kB) and mammoth
(500 kB) remain in their own chunks and are fetched only when a file of that
type is imported.

### Blockers
- **None.** Supabase's email allowance (a few sign-in messages an hour on the
  free mailer) bit once on 2026-08-09 and cleared itself; connect real SMTP
  under Authentication → Emails if it ever gets in the way again.
- The `autoUpdate` → `prompt` crossing that stranded installed clients
  is closed: the reader confirmed on 2026-08-05 that the phone is on the current
  build and that the stale client was a desktop-app session, not a deploy or
  worker problem. Don't raise it again.

### Next up
**Google Books metadata, then the Stats tab** — the arc the reader chose on
2026-08-10, written out step by step in `active-task.md`. Import reads only
**title and author** today; everything Stats wants (page count, categories,
average rating) comes from a catalogue.
1. `finishedAt` — **done** (`4f9175c`).
2. **ISBN and publisher out of the EPUB's own OPF** (`dc:identifier`,
   `dc:publisher`). No network, no key — the parser simply ignores fields that
   are already in the file. This is the lookup key for step 3.
3. **The Google Books lookup, through `api/`** — never a `VITE_` variable, which
   would compile the key into every visitor's JavaScript.
4. **Stats.** Pages read = finished books × the print edition's page count — the
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
- **Cheap follow-ons the redesign made cheap**, if the reader wants them:
  favourites (a boolean, one filter clause, one chip) and renaming/deleting a
  folder from the filter sheet — `repository.renameFolder` and `deleteFolder`
  both exist and have no UI yet.
- **Reading comfort is done.** WP-14 closed with WP-55's bookmarks and in-book
  search; font size, line spacing, margins, sepia and the page turn were already
  in. Notes/highlights are WP-25 and need the tutor loop's selection work first.
- **WP-43 · Re-scan a folder + name what's new.**
- **WP-17 → 18 → 19 → 20 · the tutor loop** — select text → assemble a prompt →
  call Claude → stream an answer. This is the rest of the walking skeleton and
  the first time the app does anything an ordinary reader can't.
- WP-09/10 (summaries, classification) need a model call and can follow.
  WP-02 (Tauri) stays skipped.

### Known parser limits (accepted, not bugs)
- **PDF is lossy by nature** — it stores positioned glyphs, not paragraphs.
  Publisher furniture that appears on only one or two pages (e.g. Springer's
  `Vol.:(0123456789)` sidebar) survives the repeat-based filter, which needs 3+
  pages to act. Not worth over-fitting to one publisher.
- **Scanned PDFs yield nothing.** No text layer, and OCR is out of scope — this
  surfaces as an empty book, so WP-11 should catch and explain it.
- **`.azw3` / `.kfx` declined** — DRM; see the note in `backlog.md`.

### Open items
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
