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
- **Nothing in the code.** One thing is unverified on the phone: the reader was
  still on an old build at the end of the session — see "Blockers".

### Recently done
- **Four phone rounds in one session, all merged to `main`** — 2026-08-05.
  Every fix below came from a screenshot of a real book, and each one's root
  cause turned out to be somewhere other than where the symptom was.
  - **An epub's own page divisions were being flattened** (`PARSER_VERSION` 7).
    A spine is separate XHTML documents — cover, copyright page, dedication,
    preface — and that is the publisher's own page break. The documents were
    concatenated into one block stream, correctly, but the *seam* went with
    them, so the cover plate ran straight into the title beneath it. Recorded
    now as `startsPage` on the first surviving block of each document (never
    the first document — that would open the book with a blank page — and
    never on furniture, which is dropped before anchors are assigned), and
    honoured as `break-before: column`. Deliberately **not** a section split:
    sections are the navigation and the anchor grammar, and books that spread
    one chapter over three files would shred the contents list.
  - **Titles are titles now** (`TITLE_CLEAN_VERSION` 3). Author names without
    the citation comma, `null`, years, bindings, university presses, edition
    and volume brackets, and — on the reader's explicit call, after being shown
    what it costs — **run-together subtitles**. The signal is a *capitalised*
    article mid-string: English title case leaves them lowercase mid-title
    ("the Middle Way", "a Hat"), so a capital "A" or "The" partway through is a
    second phrase starting. Guarded by a minimum of words either side, by a
    preceding comma ("The Good, The Bad") and by a preceding preposition. Nine
    real titles are locked into tests as must-not-cut. An orphaned "(" left by
    a cut is now removed — that was how round two came back.
  - **Dead footnote markers: the cause was never the marker, it was the
    target.** A heading that opens a chapter is consumed by the assembler as
    that division's *title*, and its ids went into the bin with it — and
    headings are the commonest link target in a book. Those ids now pass to the
    first block underneath. Alongside: legacy `<a name="fn1">` is recognised,
    ids resolve case-insensitively, and a link whose fragment is unknown falls
    back to the document it points into rather than being dropped.
  - **`<br>` was invisible to the text walker**, so the words either side were
    pasted together ("Published byDell Publishinga division of"). It writes a
    real newline now, not a space — the lines of an imprint or a verse are not
    one sentence — honoured by `white-space: pre-line`.
  - **It reads like a book**: justified with hyphenation (useless apart on a
    phone column), first-line indents on continuing paragraphs with the blank
    line stepping back, and dedications/epigraphs centred with air above them.
    That last needed a parser change — `epub:type="dedication"` marks the
    enclosing *section*, so the type is carried down the walk.
  - **A letter hanging off the page edge**, and the margins with it. Root
    cause: **a link is a `<button>`, and a button is not a word.** Its default
    `display: inline-block` makes it one box, and a box cannot break across a
    line or a *column* — so a long contents entry hung past the edge and the
    overhang was clipped, which is the stray letter that appeared at the left
    of the next page. Its default `text-align: center` centred every wrapped
    contents entry, which read as broken margins. Links follow the prose now,
    and `.page > *` can no longer exceed its column, refuse to shrink, or keep
    a word whole at the gutter's expense — general, whatever a future book puts
    on a page.
  - **The camera-shutter flash on every navigation** was the reading screen
    fading up from *zero* opacity: the background flashes through the gap and
    the eye reads it as the screen being switched off and on. There was nothing
    to cover — the page beneath is the same colour. Gone; the two remaining
    animations start at 0.6.
  - **The page turn was whipping past.** The curve was `0.32, 0.72, 0, 1` —
    almost the whole distance in the first third, which on text reads as the
    words being snatched away mid-line. Now `0.4, 0, 0.2, 1` over 380 ms.
  - **WP-50 · the update panel** — the app asks before it reloads.
  - Gates at close: **611 tests**, typecheck, build. Precache 468.27 KiB.
- **Shelf/detail redesign (WP-46→49) shipped, then fast-followed against the
  reader's live reaction** — 2026-08-03, all merged straight to `main`.
  - **WP-46→49**: bigger cover-forward Home tiles with a raised
    currently-reading card; a new `/book/:id/info` detail page (title,
    author, format, status/dates, a 1–5 rating); typed-in favorite quotes
    (`quotes` table, schema v7); notes/reflections. Mood tags and
    multi-axis secondary ratings shipped as part of WP-49 too, then were
    **removed again the same day** once the reader saw them live and called
    them clutter — UI, repository methods and the `BookMeta` fields all
    pulled, not just hidden.
  - **The garbled-title bug, in full.** First fix: strip a stray hash from
    filename-guessed and epub-`<dc:title>` titles (`PARSER_VERSION` → 5).
    Second, deeper fix once the reader showed a worse case: some epubs
    (Anna's Archive-style downloads) carry a `<dc:title>` that's a whole
    citation dump — title run into author/publisher/ISBN/hash/source-credit
    with no punctuation between fields. `cleanTitle` now recognises each
    field and cuts at the earliest one found (`PARSER_VERSION` → 6) — a best
    effort, not a guarantee, since a subtitle with none of those markers
    can't be told apart from the real title algorithmically. A manual
    rename (pencil on the detail page, `repository.renameBook`) is the
    guaranteed fallback.
  - **A real theme bug, found and fixed.** `data-theme` on `<html>` used to
    be applied only inside `Reader.tsx`, so Home showed the OS's
    `prefers-color-scheme` guess until a book was opened for the first
    time, at which point the reader's actual saved choice suddenly took
    over globally — read as "opening a book changed my theme." Fixed with
    `applyStoredTheme()` called once at boot in `main.tsx`; verified with
    Playwright against the dev server in both directions before shipping.
  - **Tabs are now Home / All Books / Stats / Settings.** `Journal.tsx`
    (an unused placeholder) deleted outright. The All Books list
    (`Library.tsx`) gained cover thumbnails and "N% read" per row.
  - Gates re-run after each change; final state 525/525 tests, typecheck
    and build clean.
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
**Gates:** `npm test` (525), `npm run typecheck`, `npm run build` — all passing.
Main bundle 402.8 kB. The parsers are called now, but every one of them stays
behind a dynamic `import()`, so pdf.js (434 kB) and mammoth (500 kB) remain in
their own chunks and are fetched only when a file of that type is imported.

### Blockers
- **The reader's installed app was still on an old build when the session
  ended, and none of this had been seen on the phone yet.** Not a deploy
  problem — that was verified end to end: `main` and `origin/main` are both
  `af5111d`, and the live bundle at `reading-buddy-web-nu.vercel.app` was
  checked for strings only the newest commit introduces ("Something new",
  `text-align:inherit`, `textSettles`) and for the removal of the old
  `textRises`. All correct.
  - **The cause is the `autoUpdate` → `prompt` switch itself.** The installed
    client is the *old* code, which expects a new worker to activate itself.
    The new worker deliberately waits to be asked, and the old client has no
    way to ask. A one-time crossing; every update after it is fine.
  - **The way through, in order:** fully close the app from the app switcher
    (backgrounding does not release the worker) → open the site in a browser
    tab and hard-refresh → uninstall and reinstall (books live in IndexedDB,
    so nothing is lost).
  - **If none of those work**, the fallback discussed with the reader is to
    make the new worker claim old clients on its own, at the cost of one
    silent reload. Not built — don't build it until the three steps above are
    known to have failed.

### Next up
**The reader's order, set 2026-08-02: make it a proper reading app first, then
AI.** Nothing is in flight. **Start by asking whether the phone is on the new
build yet** — see "Blockers"; four rounds of fixes are shipped but unseen, and
picking new work before that is confirmed risks building on top of something
that turns out to be wrong.
- **Reading comfort (rest of WP-14)** — font size, line spacing, margins,
  sepia, the page-turn animation (seam is built, only instant is wired),
  in-book search, real bookmarks. The natural next task once the shelf/detail
  work is settled.
- **WP-43 · Re-scan a folder + name what's new.**
- **WP-17 → 18 → 19 → 20 · the tutor loop** — select text → assemble a prompt →
  call Claude → stream an answer. This is the rest of the walking skeleton and
  the first time the app does anything an ordinary reader can't.
- **The page-flip animation** — the reader named it explicitly this session as
  still to come. The seam (`turnPage`) is untouched and still where it plugs
  in; the motion work done this round was timing and curve only.
- ~~Merge `deploy-vercel` into `main`~~ — **already done**; it went in via
  `61cc272` and every remote branch is now an ancestor of `main`. Nothing is
  outstanding to merge.
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
