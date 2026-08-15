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
  **1290 tests across 73 files** (2026-08-15).
- **The frozen-page report is answered but not explained.** The floor under it is
  in and proven; the *cause* is not confirmed. If a page ever freezes again, the
  question to ask first is whether one touch clears it — if it does, a teardown
  is still being missed somewhere and the backstop is catching it.
- **The finger-tracked page curl has never been under a finger.** The maths is
  covered by 24 tests and the wiring typechecks, but jsdom has no compositor and
  the preview tree has no book on its shelf, so no drag has ever been dragged.
  **This one is provable on the phone or not at all** — a synthetic pointer is
  not a thumb.
- **The 16 DOM clones a drag builds at `pointerdown` are unmeasured.** Each band
  is a full `copyOf` of the laid-out section. Layout is forced up front so the
  cost lands on the frame the gesture starts rather than mid-swing, and
  **`STRIPS` in `web/src/reader/pageCurl.ts` is the one lever** — lower it and
  the sheet degrades gracefully toward the old rigid flip. If the phone hitches
  on the first millimetre of a swipe, that is this.
- **The reading page's new furniture has never been *seen*.** The Browser pane
  would not composite frames all session, so the paper themes, the running head,
  the gutter shadow and the decks were verified numerically (computed tokens
  across all ten themes, deck widths 3px → 11px, gutter 24px) and by tests —
  not by looking. **Worth a minute on the phone.** The three numbers most likely
  to want tuning are `--page-deck` (11px), `--page-gutter` (24px) and
  `--running-head` (1.5rem), all in `styles/theme.css`.
- **`PARSER_VERSION` is 19.** Books on the shelf are behind until the idle
  trickle catches them up, which it does one book at a time on its own.
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
- **A frozen book, and the floor under it** — 2026-08-15. The reader opened a
  book onto a full-page map and the page would not turn at all — no swipe, no
  tap. **Root cause unconfirmed**, and worth saying plainly: the preview pane
  delivers no frames (rAF and the Web Animations API both never fire in it), so
  every copy strands there and it cannot tell a real leak from its own artefact.
  What is certain is the *shape* of the failure: a page-turn copy is an opaque
  photograph of the old page, so one left standing looks exactly like a book
  that has stopped responding — gestures keep working underneath and nothing the
  reader does changes what they see.
  - **Both teardowns waited on frames, and frames are not a promise.** `playFlip`
    waits on `animation.finished`; `settleDrag` waits on rAF. A tab backgrounded
    mid-turn stops being offered either. Both now carry a `setTimeout` backstop
    at duration + 600 ms, and both clears are idempotent so whichever arrives
    first wins.
  - **`clearSheets` is the floor.** Every scrap this module hangs on the page is
    branded `data-page-sheet`, and `pointerdown` sweeps them whenever nothing is
    legitimately in flight. Whatever drops the ball in future, the freeze cannot
    outlast one touch.
  - **A tap could be swallowed.** `swiped.current` was being set on eight pixels
    of horizontal movement even when no drag started, so a slightly-moving tap
    turned into nothing at all. Only a real turn sets it now.
  - Verified live: the same drag that left **17 stranded clones** in the pane now
    leaves **zero**, on the timer alone, with no frames at any point.
  - Module-level `concealed` leaks across tests — `pageTurn.test.ts` sweeps in
    `afterEach` now, or one test leaves the next unable to hide anything.
- **The page turns with the thumb now, and the paper is a notch darker** —
  2026-08-15. Two things off one brief.
  - **Paper down ~4.5%.** Every channel × 0.955, so the hue is untouched and
    only the luminance moves: `#f1e9db` → `#e6ded1`, with `--color-surface` and
    `--color-surface-raised` alongside it so the sheet does not float on
    furniture lighter than itself. Only Paper moved. The next nudge in either
    direction is this same three-line edit, which is why it was not made into a
    slider.
  - **A finger-tracked curl replaces the threshold swipe.** Pointer Events with
    `setPointerCapture`, so the release always arrives; horizontal travel maps
    **linearly** onto 0→1 with no smoothing, because a thumb held still must
    leave the page held still and any filter at all would let it creep.
  - **The browser has no mesh warp for live DOM text**, so the sheet is a
    snapshot cut into 16 vertical strips, each a flat quad with its own
    `rotateY`. Strip *i*'s left edge is placed where strip *i−1*'s right edge
    **computed out** (`xᵢ₊₁ = xᵢ + w·cos θᵢ`, `zᵢ₊₁ = zᵢ + w·sin θᵢ`) — any
    closed-form shortcut shows daylight through the paper the moment the curve
    is not uniform. A test asserts the joins at seven progress values.
  - **Rigid-plus-curl, not a scaled arc:** `θ = π·p · (0.55 + 0.45·mᵏ)` with
    `k = 1 + 1.4(1−p)`, so the sheet lifts at the corner early and evens out
    late — the shape at 20% is a different curve from the shape at 80%.
  - **The shadow is zero at flat by arithmetic, not by a guard** — it is derived
    from `(1 − cos θ)/2`, so there is nothing a later refactor can delete.
  - **Release is critically damped** (`1 − (1 + ωt)e^{−ωt}`, ω = 8, normalised
    so it lands exactly on 1). Paper settles; it does not wobble past flat.
    Velocity beats position **in both directions**: a page dragged past halfway
    and thrown back goes back.
  - **The strip scrolls to the destination at gesture *start*,** which is what
    reveals the next page from the first millimetre. That inverts the old logic:
    completing is now the case where nothing more happens, and it is the
    *abandoned* turn that has work to do.
  - **`touch-action` had to go from `pan-x` to `none`** — under `pan-x` the
    browser can claim a horizontal gesture and fire `pointercancel` a few pixels
    in. Harmless for a swipe decided at `touchend`; fatal for a dragged sheet.
    The cost is pinch-zoom, which this screen answers with the Aa tab.
  - **Section-crossing turns stay on the old path** on purpose: at a chapter
    edge the destination is not laid out, so there is nothing honest to scrub
    against. Reduced motion falls back too.
- **The reading page became a physical book** — 2026-08-14 (`52ed6d6`,
  `33c5960`, `4320b4e`, `2bd572e`). Four rounds off one brief and two mockups.
  - **Paper, Vintage and Paperback**, three page themes built from stacked CSS
    gradients plus an inline SVG `feTurbulence` grain — no image file, so no
    extra download, no precache entry and no fixed resolution to stretch.
    **Paper is the default theme now.** Vintage adds foxing (the brown blooms a
    damp page develops); Paperback keeps a trace of texture so it reads as clean
    rather than flat.
  - **Two reading faces** — Libre Caslon and Merriweather, self-hosted from
    `@fontsource*`, **Latin subset named by hand** (importing a package's own CSS
    pulls megabytes of alphabets into `dist/`, which the worker then precaches).
    Fonts are their own axis, not part of a theme.
  - **A running head** — the book's title in small capitals across the top
    margin. Built for Vintage, then made the default on the reader's ask; the
    book title, never the chapter, which is already printed at the chapter head.
  - **The book around the page** — a gutter shadow that flips with the sheet
    (`data-page-furniture`) and two decks of paper that do not, because a binding
    does not. The decks thin on the right and thicken on the left as you read:
    progress as weight in the hand rather than a percentage to read.
  - **Section breaks survive the parser now** (`PARSER_VERSION` 19). `<hr>` was
    dropped silently, running two scenes together; typed asterisks were printed
    as literal `* * *`. Both are `prose` labelled `break`, drawn by CSS so the
    ornament belongs to the theme.
  - **The cascade trap bit twice.** `:root:not([data-theme='light'])` is (0,2,0)
    and beats a bare `:root`, so on an OS-dark phone every pale theme took the
    dark values — a black vignette on cream paper, then a black binding on it.
    Both found by reading computed values out of a live browser, neither
    findable in the file.
- **Books catch up on open, and trickle in the background** — 2026-08-14
  (`95389e9`). The reader's question — "with every update it'll have to reload
  all the books every time?" A book re-parses the moment it is opened, and one
  stale book at a time is rebuilt while the app is idle and visible. One
  serialising promise lane, because parsing is main-thread; a session-scoped
  give-up set so an unfixable book cannot starve the queue.
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

**Gates:** `npm test` (1290, 73 files), `npm run typecheck`, `npm run build` — all
passing as of 2026-08-15. Precache 34 entries / 1172.01 KiB. **Two tests flaked
once under parallel load** (`Reader › goes to the next section`, `Library ›
unfiles a book…`) and passed on re-run and in isolation — timing, not a
regression, but they exist. **Run the suite as `npm test --workspace web`** — from the repo root it misses `web/`'s Vite config
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
