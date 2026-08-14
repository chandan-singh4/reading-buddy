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
  **1195 tests across 68 files**, precache 34 entries / 1358.68 KiB
  (2026-08-14).
- **One chore only the reader can do: redeploy on Vercel** so the newly added
  *Production* `GOOGLE_BOOKS_KEY` takes effect, then press Refresh on one book
  before letting the 32-book backfill run. The probe reads: 401 = key present,
  503 = key missing, 404 = endpoint not deployed.
- **Steps 2 and 3 of the Google Books arc are shipped.** Only **step 4, Stats**,
  is left. Migration `0007` has been run.
- **Two older Supabase migrations still need pasting into the SQL editor** —
  `0003_finished_at.sql` and `0006_position_within.sql`. Both fail softly.
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
- **A book's own page stopped looking like a database record** — 2026-08-14
  (`0fb3e76`, `c02e87c`, `6370d91`, `8ce41d5`, `79a6de8`). The reader's brief,
  with a Google Play Books screenshot: hero cover, title, author, a genre pill
  where the mock says "Pre-Order"; a three-cell spec strip (Format · Pages ·
  Published); one glass CTA reading **Continue reading** or **Read**; the
  description folded to five lines behind a chevron; a tinted details card
  carrying Added, Last read, Publisher, ISBN, readers' rating + count and the
  Google subjects; a filled Refresh button; the way home drawn as a house.
  Progress is stated **once**, under the button it describes.
  - **The mock is dark-only; this app has seven themes.** Every colour is
    `color-mix(in srgb, var(--color-accent) N%, …)`, so one rule is warm brown
    on the light themes and gold on the dark with no per-theme override. Where a
    solid fill was wanted, the `--color-accent` / `--color-accent-contrast` pair
    is legible in all seven by construction.
  - **Subjects and ISBN needed no schema work** — both were already parsed,
    stored and synced, and had simply never been shown. Existing books show them
    with no re-fetch.
  - **No glyphs.** The chevron is CSS borders; every icon is an SVG path. A
    Unicode character a system font lacks renders as an empty box, silently.
- **Home asks a question instead of narrating the shelf** — 2026-08-14
  (`b4bb54c`). "Pick up where you left off" described the shelf directly beneath
  it, which the shelf was already doing; "What book are you picking up today?"
  replaces it, set in the reading serif and hung off a short accent rule so it
  reads as a designed line rather than a caption.
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
- **Older rounds — the offline shelf, the four phone-tested pieces, — WP-53, WP-54, WP-55, the first cloud write-up, the sign-in
  toggle and the first live setup — dropped
  from here to keep this file short.** Each has a full entry in `docs/backlog.md`
  and its reasoning in `docs/decisions.md`; the traps they cost are in
  `active-task.md` under "Carried forward".

**Gates:** `npm test` (1195, 68 files), `npm run typecheck`, `npm run build` — all
passing as of 2026-08-14. Precache 34 entries / 1358.68 KiB. **Run the suite as
`npm test --workspace web`** — from the repo root it misses `web/`'s Vite config
and reports phantom import failures. Every
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
