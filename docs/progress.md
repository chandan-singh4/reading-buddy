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
- Nothing. **The walking skeleton now walks on the reading side**: import →
  store → list → *read*. What remains of the original loop is select → Ask →
  streamed answer (WP-17 → 18 → 19 → 20).

### Recently done
- **Two phone-reported bugs fixed, and the first real deploy** — 2026-08-03.
  - **Figure captions no longer repeat "[Figure]" next to a picture that
    rendered fine.** `reader/blocks.tsx`'s `Figure` always showed `block.text`
    (the parser's `[Figure: caption]` / `[Figure]` placeholder, written for
    before a picture could be shown at all) as the caption, regardless of
    whether the image itself rendered. Now, once a picture shows, the caption
    is the real figcaption (`block.label`) if the book had one, or nothing —
    the placeholder is reserved for the genuinely degraded case (no picture
    shown at all).
  - **The reading screen no longer bobs up and down mid-swipe.** A page-turn
    gesture that isn't perfectly horizontal (a finger arcs) was being read by
    the browser as an attempt to scroll, which on a phone also animates the
    address bar in and out. `touch-action: pan-x` on the page-turn element
    (`Reader.module.css` `.page`) plus `overscroll-behavior: none` on
    `html`/`body` (was `-x` only) keep every touch on the reading screen
    inside the app's own handlers. Both fixes merged to `main` (`a7da06e`).
  - **First production deploy, on Vercel** — connected to GitHub, auto-deploys
    on every push to `main`. Root Directory set to `web/` in the Vercel
    project (the app isn't at the repo root), which let Vercel auto-detect
    Vite with no custom build config needed. Live at
    `reading-buddy-web-nu.vercel.app`, verified serving the current build.
    This replaces the LAN/mkcert dance for phone testing going forward.
  - **`.env.example` added** at the repo root; `api/README.md` now says where
    the Anthropic key belongs once `api/` has code — a local `.env`
    (gitignored) for dev, Vercel's own Environment Variables setting for
    production, never a committed file. On branch `deploy-vercel`, not yet
    merged to `main`. The real key still needs moving by hand into a local
    `.env` from `Claude API/API.txt` — the reader's own machine, not
    something a cloud session can reach.
  - **A garbled-diacritics report chased but not resolved**: a book's
    title-page text was missing accented letters and the space between two
    words. Traced to the source epub's own SVG `<title>` markup — nothing in
    the parse pipeline strips non-ASCII characters — but unconfirmed without
    the actual file. Waiting on the reader to share it.
  - Gates: 473 tests, typecheck, build — all passing after the merge.
- **WP-39 (first half) · Books show their pictures** — 2026-08-02. Figures had
  captions and no image: an epub figure records an archive path
  (`OEBPS/images/fig1.png`) and the archive is gone by reading time.
  - **Extracted at import, stored beside the text.** `parse/epub.ts` pulls the
    bytes of every picture an *assembled* paragraph points at — referenced only,
    each once, media type from the extension — into `ParsedBook.assets`. A new
    `assets` table (schema v6) keys them `[bookId+path]`, the same shape as a
    section, so the reading screen looks a figure up without resolving anything.
  - **Written outside the import transaction**, like the kept source file, on
    the same rule: *the text is the book and the pictures are a convenience.* A
    phone too full for 141 plates still gets a readable book with captions.
  - **Fetched per section, revoked per turn.** `reader/figures.ts` resolves only
    the handful of paths the current section names into `blob:` URLs and revokes
    every one on the way out — otherwise a reader turning through a picture book
    pins the whole book in memory. Keyed on the paths, not the array, so a
    re-render doesn't re-fetch. `data:` and `http(s)` srcs (docx, markdown) pass
    through untouched.
  - **A picture that isn't there is a caption**, never a broken-image icon.
  - **`PARSER_VERSION` → 3**, so the shelf offers to update existing books from
    their kept files. Books never re-imported keep captions only.
  - **A figure is kept whole and capped at 70dvh** — a page is a CSS column with
    `overflow: hidden`, so a plate taller than the column is sliced off, not
    scrolled to.
- **Third phone round · the reading screen goes bare** — 2026-08-02. Measured
  against Google Books, on the reader's own comparison.
  - **The overlay starts hidden and the status line left it.** "Page 84 of 350"
    is now a permanent, background-less line at the foot (`--status-line`),
    outside the overlay; everything else waits for a tap in the middle of the
    page. Following a link no longer raises the bars.
  - **Previous/Next are gone** — swipe, edge tap, or arrow keys (the keyboard
    route is also what drives the tests, since jsdom can neither swipe nor be
    wide enough to edge-tap).
  - **No blue tap flash** on the status line (`-webkit-tap-highlight-color`),
    with keyboard focus still shown.
  - **"Back to page N" lands on the exact screen.** Third and final cause: the
    landing scroll was applied the instant React committed, before columns had
    re-flowed. `settleOn` re-checks over two frames and a move counter stops a
    late correction overriding a newer move.
- **WP-45 · Second phone session: four fixes** — 2026-08-02.
  - **Links inside lists were being thrown away.** `readList` and
    `containerText` built their block from `textContent`, which keeps the words
    and drops every `<a>` in them. A book's own contents page *is* a list, and
    so is most of a notes section — which is exactly the symptom reported:
    footnotes inside prose worked, contents entries were dead. Both now go
    through `textAndLinks` per child and are joined by a shared `joinParts`,
    which shifts each piece's link offsets by where that piece landed in the
    finished string. The renderer's half is `lineRunsOf`, cutting the runs at
    each newline so every `<li>` gets its own links.
  - **A jump now says where it put you.** `returnTo` carries the page number it
    will return to, so the button reads "↩ Back to page 250" — a promise the
    reader can check rather than one they must trust — and the bar reappears on
    a jump unless Focus Mode is on. This meant moving the `pages` calculation
    above `jumpToAnchor`: the page you are *leaving* has to be read while you
    are still on it.
  - **Shelf search** (`matching`), shown only above 8 books. Every word must
    match, in title or author, so "jung red" finds *The Red Book*. **Select all
    means everything on screen** — ticking books hidden behind a search and then
    deleting them would be the worst bug this screen could have.
  - **Coming back to the shelf lands on the book you left.** `useScrollMemory`
    is gone, replaced by `useRowMemory`. A pixel offset is only meaningful
    against the page it was measured on: restore it while the list is short and
    the browser clamps it; restore it after a book was removed and it points
    somewhere else. A row id has neither failure mode — the row is there and the
    scroll is exact, or it isn't and the reader stays at the top.
- **WP-44 · Select several books and remove them** — added 2026-08-02, after the
  reader imported 35 books and found one-at-a-time deletion punishing.
  - **`repository.deleteBooks`** — one transaction for the lot, not a loop of
    `deleteBook`. Thirty-five separate transactions means thirty-five round
    trips, and a failure halfway leaves an arbitrary subset gone with no way to
    tell which. Deletes by the `bookId` index rather than collecting keys first,
    so a book's thousands of sections are never pulled into memory to be
    thrown away.
  - **Selection is a mode, `null` when off.** "Not selecting" and "selecting
    nothing" have to look different, and a shelf permanently covered in
    checkboxes is a poor default for the thing people do most.
  - **While selecting, the title ticks the book instead of opening it**, and the
    per-book Remove steps aside — two delete controls on one row, acting on
    different sets, is a trap.
  - **The confirmation names the number** ("Remove 35 books for good?"). There
    is no undo: the original files were never kept.
  - **`Library.test.tsx` is new** — the screen had no tests, and it is the one
    screen that destroys things.
**Gates:** `npm test` (473), `npm run typecheck`, `npm run build` — all passing.
Main bundle 383.4 kB. The parsers are called now, but every one of them stays
behind a dynamic `import()`, so pdf.js (434 kB) and mammoth (500 kB) remain in
their own chunks and are fetched only when a file of that type is imported.

### Blockers
- None.

### Next up
**The reader's order, set 2026-08-02: make it a proper reading app first, then
AI.** Page turning and links (WP-42) are both done now — see `active-task.md`
for the task in flight.
- **Reading comfort (rest of WP-14)** — font size, line spacing, margins,
  sepia, the page-turn animation (seam is built, only instant is wired),
  in-book search, real bookmarks. **This is the active task.**
- **WP-43 · Re-scan a folder + name what's new.**
- **WP-17 → 18 → 19 → 20 · the tutor loop** — select text → assemble a prompt →
  call Claude → stream an answer. This is the rest of the walking skeleton and
  the first time the app does anything an ordinary reader can't.
- **Merge `deploy-vercel` into `main`** whenever convenient — just the
  `.env.example` + a doc note, no functional change, low risk.
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
