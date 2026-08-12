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
  **1080 tests across 60 files**, precache 34 entries / 1129.02 KiB
  (2026-08-12).
- **Two chores the app cannot do for itself, both Supabase migrations to paste
  into the SQL editor:**
  - `supabase/migrations/0003_finished_at.sql`. Until it runs, finishing a book
    on the cloud backend errors — harmlessly, it is caught, and the boot
    backfill picks it up afterwards — but no finish date is stored.
  - `supabase/migrations/0006_position_within.sql`. Until it runs the reopen
    offset works locally but is dropped on sync — no worse than before it
    existed, because absent reads as zero.
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
- **A book reopens on the page that was left, not the paragraph** — 2026-08-12
  (`7f6ef3d`). A saved place names the paragraph the visible page *begins in* —
  right to record, and the comment saying why is still there — but reopening
  scrolled to where that paragraph *starts*, which for anything longer than a
  column is pages early. Worst at the end of a book, where the last page sits
  deep inside a long closing paragraph: a finished book reopened eight pages
  short, identically, every time. Positions now carry `within`, the page offset
  past the paragraph's first column, end to end: Dexie, the Supabase row +
  migration `0006`, the cached wrapper, the outbox and export/import. The
  reading screen already measured this number for footnote round-trips; it was
  simply never written down.
  - **A second fault, visible only in a real browser:** the debounced write was
    keyed on the *paragraph* changing, so reading forty pages through one
    unbroken paragraph saved nothing at all. The offset is state now, and in the
    effect's deps, so that movement is something the write can see.
  - **Absent and null both read as zero** — the old behaviour, which is right
    for every position saved before this and for a project that has not run
    `0006`. Old positions can't heal themselves; they land short once more, then
    write the real number.
  - Verified in a browser on a book with one paragraph running 57 columns: the
    same row lands on page 30 with the offset and page 1 without it. **jsdom
    cannot prove this — it has no columns.**
- **A book opens onto its cover, the way a book does** — 2026-08-12 (`dbd1d62`).
  The reader's idea, from Google Books: the fraction of a second before the text
  is ready was a loading state, and is now the cover, held 550 ms and then faded
  out. `pages/Opening.tsx`, keyed on the book id so a second book gets a fresh
  hold. Reduced motion drops the fade to nothing.
- **The shelves rearrange while the book is still open** — 2026-08-12
  (`2b43402`). Coming back from a book no longer showed the old shelf order for
  a beat; `app/shelvesAhead.ts` seeds the shelf and library memories on the way
  in.
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
- **Older rounds — WP-53, WP-54, WP-55, the first cloud write-up, the sign-in
  toggle and the first live setup — dropped
  from here to keep this file short.** Each has a full entry in `docs/backlog.md`
  and its reasoning in `docs/decisions.md`; the traps they cost are in
  `active-task.md` under "Carried forward".

**Gates:** `npm test` (1080, 60 files), `npm run typecheck`, `npm run build` — all
passing as of 2026-08-12. Precache 34 entries / 1129.02 KiB. Every
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
