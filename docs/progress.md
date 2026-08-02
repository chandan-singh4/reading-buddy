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
- **WP-42 · Links inside the text** — footnotes and cross-references are tappable.
  - **A link is a range of a paragraph** (`start`, `end`, plus `anchor` for
    inside the book or `url` for outside). Offsets rather than a copy of the
    words, because a paragraph can contain the same word twice.
  - **Resolved after assembly, not during it** (`parse/links.ts`, called from
    `assembleBook`). A footnote marker points at a paragraph that doesn't exist
    yet while its own chapter is being assembled.
  - **Epub qualifies ids and hrefs with their file** before assembly. Two
    chapters can each define `#note1`; unqualified, every footnote in the book
    would land in whichever chapter parsed first.
  - **Unresolvable links are dropped**, and `ids` are stripped once resolved so
    thousands of them never reach storage.
  - **Internal links render as buttons, external as anchors**, and following one
    offers *"↩ Back to where you were"* — without it a footnote is a trap.
- **Page turning (the core of WP-14)** — the reader turns pages instead of
  scrolling.
  - **CSS columns, one per screen**, `column-fill: auto`. The browser picks the
    breaks, so they land between lines; a font change re-flows on its own.
  - **`reader/columns.ts`** holds the arithmetic — page count, which page is
    showing, where to scroll — pure and unit-tested, because that is where
    off-by-ones and unreachable last pages live.
  - **`overflow: hidden`, not `auto`.** A hand-dragged strip strands you between
    two pages; every turn is programmatic and lands on a column.
  - **One `turnPage` for swipe, edge taps and Previous/Next**, falling through to
    the neighbouring section at either end. Turning *back* into a section lands
    on its last page.
  - Gutters live on the children: padding on a multi-column box indents only the
    first and last columns.
- **The app updates itself now.** Closing an installed app suspends it rather
  than ending it, so the page never loaded again and the injected registration —
  which only ran on `load` — could never find a new build. Registration is ours
  (`app/updates.ts`) and checks whenever the app becomes visible.
- **WP-32 · It is on a phone, installed, and it works.** Import worked, folder
  import brought a whole shelf in at once and felt smooth, and duplicate
  detection correctly caught the one book already there.
- **WP-41 (second round) · What the fixes themselves broke, and three more.**
  - **The Remove button had been off-screen all along.** The book row was a
    non-wrapping flex row, so on a phone the shelf picker and Remove sat past
    the right edge — reachable *only* by scrolling the page sideways. Removing
    the sideways scroll made them unreachable, which is how it was found. The
    row wraps now. A reminder that a layout bug can hide behind a second bug and
    look like a feature.
  - **Coming back from a book landed at the bottom of the shelf.** The browser
    restores scroll at mount, when the library is still loading and a fraction
    of its final height, so it restores against a page that doesn't exist yet.
    `history.scrollRestoration = 'manual'` plus `useScrollMemory`, which waits
    for the books before restoring.
  - **Opening a book was a hard cut.** A 200 ms fade with the text rising into
    place. Deliberately no `transform` on the reader itself — the overlay is
    `position: fixed`, and a transform on an ancestor redefines what "fixed"
    means, which would shift the bars for the length of the animation.
  - **The sheet's tabs answer to a sideways swipe** (`reader/swipe.ts`). The
    judgement — swipe vs scroll vs unsteady thumb — is pure and unit-tested;
    only the touch plumbing lives in the component. Stops at the ends rather
    than wrapping, because the row of tabs visibly doesn't loop.
- **WP-41 · Swipe and gesture fixes** — all three straight from that session.
  - **The page drifted sideways under a thumb.** `overflow-x: hidden` +
    `overscroll-behavior-x: none` on the document. Reading is vertical; there is
    never anything to the left or right, so any sideways movement is drift.
  - **A back swipe with the sheet open threw the reader onto the shelf.** It
    cannot be refused — in an installed app that gesture belongs to the system.
    So `useBackDismiss` gives it something of its own to close: an open panel
    pushes a history entry, Back consumes that, and the entry is taken back if
    the panel is closed by a tap instead (otherwise the *next* back gesture is
    silently swallowed).
  - **The sheet had nowhere to tap to dismiss it**, being `flex: 1` between the
    two bars. Capped at 65% with a dimmed scrim above it.
- **WP-30 + WP-31 · Installable, and reachable from a phone.** Everything the
  PC side needs; WP-32 (actually installing it) is now the reader's step.
  - **Manifest and service worker configured** — name, icons, standalone
    display, portrait, dark theme colour. `registerType: 'autoUpdate'`, Workbox
    `generateSW`; writing a service worker by hand would mean owning cache
    invalidation, and a stale build after an update is a bug with no visible
    cause.
  - **pdf.js and mammoth are excluded from the precache.** They are 934 kB
    between them; precaching would nearly triple the install download to
    support importing a format the reader may never use on the phone. App shell
    precache is **394 kB**, down from 1301 kB before the exclusion.
  - **`navigateFallback: 'index.html'`** — without it, an installed app
    reopening on `/book/abc` 404s offline.
  - **Icons are generated, not committed as blobs** (`web/scripts/make-icons.mjs`,
    `npm run icons`). An open book drawn from the theme's own colours, in ~150
    lines with no image library — PNG is a few chunks around a zlib stream and
    Node ships zlib. Includes a *maskable* variant, without which Android crops
    the launcher shape straight through the mark.
  - **iOS ignores the manifest**, so the `<link rel="apple-touch-icon">` and
    `apple-mobile-web-app-*` tags in `index.html` are not duplication — they are
    the only version iOS reads.
  - **mkcert installed and the local CA trusted on this PC**; certificate issued
    for `192.168.1.26`, `localhost`, `127.0.0.1` into `web/certs/` (gitignored —
    private key, and it names this machine). `vite.config.ts` picks it up if
    present and falls back to HTTP if not, so a fresh checkout still runs.
  - **`npm run lan`** prints this machine's address and the exact mkcert command,
    because the certificate names an address and the router's lease changes it.
  - **Verified over the LAN**: chain verifies against the mkcert root, and
    `manifest.webmanifest`, `sw.js`, all four icons and a deep link all serve
    200 over HTTPS on `https://192.168.1.26:4173`.
  - **`docs/phone.md`** is the install path end to end, including the iOS step
    everyone misses (a trusted profile still does nothing until it is enabled
    under About → Certificate Trust Settings).
- **WP-15 · Reopen where you left off** — every book used to open at chapter 1.
  - **A place is an anchor, not a page number.** Page numbers can be renumbered
    (change `WORDS_PER_PAGE`) or invalidated (re-import); `[ch02-s03-p013]`
    names a paragraph, so it's either still there or plainly gone.
  - **Its own `positions` table** (schema v4), one row per book. It's the only
    row written *while reading*; on `BookMeta` it would rewrite the whole book
    record every few seconds. `listPositions` is already there for WP-24's
    "Continue reading".
  - **Saved 800 ms after reading settles**, so a page of scrolling is one write
    rather than one per paragraph. **Restored before the first section is
    fetched**, so there's no wasted read, no flash of chapter 1, and no chance
    of saving chapter 1 over the position still being looked up.
  - **A stale place is refused, not repaired** — a malformed anchor, or a
    chapter the book no longer has, opens at the beginning. The alternative was
    landing the reader on "That part of the book is missing", which looks like
    the book broke rather than the bookmark aged.
  - **Deleting a book takes its place with it.** An orphaned position would be
    handed straight back on re-import — a fresh copy opening partway through
    someone's previous read.
  - **A bug found on the way:** the landing effect re-ran when the spine
    arrived, scrolling a reader back to the top of the section a moment after
    they got there. Now guarded on the section's path, so arriving happens once.
  - One quiet line — *"Picked up where you left off."* — shown only for a place
    saved a while ago, and gone at the first tap.
  - Gates: 344 tests, typecheck, build. Bundle 363.06 kB (was 361.61).
- **WP-40 · Navigation feel** — the reading screen now navigates like Google
  Books, which the reader uses daily and sent screenshots of.
  - **Page numbers came back, counted in words.** This reverses the previous
    day's "no page numbers anywhere". The old rule was right that a page derived
    from the *screen* describes the phone rather than the book; a page defined as
    a fixed 300-word slice of the text doesn't move when the font does. Kindle's
    "locations" under a name people know. Accepted, explicitly, by the reader: a
    visible page turn sometimes won't advance the number.
  - **Nothing measured or laid out.** `words` is recorded at import in
    `assemble.ts`; `reader/progress.ts` builds a *spine* of every section with
    its running offset, from the manifest plus chapter indexes. A chapter index
    is titles and paths, never prose — this is not the forbidden whole-book read.
  - **One-shot backfill** for books imported before counts existed
    (`repository.backfillWordCounts`). The only function that reads a whole book,
    fenced off and labelled as such. Atomic, idempotent, and it re-checks inside
    the transaction that the book still exists — otherwise deleting a book
    mid-migration resurrected its manifest.
  - **Three-state bottom bar** (`reader/bar.ts`): page → pages left in this
    chapter → nothing, with the percentage riding along and leaving with the
    third. The cycle closes, so the bare state is never a trap.
  - **The slider moves inside a section, not just between sections** — fixed
    after the reader hit it on the real book. Nudging 176 → 177 did nothing,
    then a little further jumped to 190. Cause: chapter 13 of that epub is a
    *single section* spanning fourteen pages, so every page in it resolved to
    the same place and `goTo` correctly dropped the move as a no-op. A page now
    resolves in two steps — `refAtPage` picks the section to load,
    `anchorAtPage` picks the paragraph inside it — and the reading page scrolls
    to that anchor. Paragraph offsets are computed from the section already in
    memory, so no schema change and no extra read.
  - **The page number follows your scrolling.** Once a page can be a spot inside
    a section, a bar frozen at the section's start would contradict the slider.
    A throttled scroll handler tracks the last paragraph past the reading line,
    and every figure — page, percent, pages-left — derives from that one word
    offset so they can't disagree.
  - **The fine slider moves one page at a time**; the coarse chapter slider
    survives as the fallback for a book with no counts, rather than being
    deleted. `goTo` now drops a move to where you already are, so dragging
    across a long section doesn't refetch it once per step.
  - **Nav sheet with Contents / Bookmarks / Notes tabs**, the latter two showing
    a one-line "not yet, and here's what it'll do" rather than being hidden.
  - Gates: 325 tests, typecheck, build. Bundle 361.61 kB (was 355.21).
  - **Verified on the real Jung epub** — the backfill ran, page numbers and the
    three-state bar were what the reader wanted. The long-section slider bug was
    found there and fixed; the fix itself has not been re-checked on the real
    book yet. Still nothing tried on an actual phone.
- **WP-13 · Nav overlay + Focus Mode** — `web/src/reader/Chrome.tsx`. Tap the
  text to show or hide the overlay; it layers *over* the page, so toggling it
  never moves a word. Contents list jumps to a chapter, a coarse slider moves
  you near one.
  - **Focus Mode is a toggle that hides, never removes** (the reader's own
    decision). It only sets what's showing when you arrive; a tap brings it all
    back, and Previous/Next never leave. Hidden chrome is `inert`, so an
    invisible control can't be tabbed to or announced.
  - **Progress is chapters, never pages.** A page number changes with the font,
    so it describes the device rather than the book.
  - **One `goTo`.** Next, Previous, the slider and the contents list all move
    through it — the single point WP-14's page transition plugs into.
- **WP-12 · Structured renderer** — `web/src/reader/`. Loads a manifest, one
  chapter index and one section, and nothing else; no "load the book" call was
  added, which is the token strategy rather than a gap.
  - Blocks render by kind, with every unknown kind falling through to readable
    text, so a kind added to the parser later can't silently vanish. Tables keep
    their grid and scroll inside themselves; figures degrade to their caption.
  - **Every block carries its anchor as a DOM id** — the contract WP-15 and
    WP-17 both depend on.
  - Navigation is pure and knows only the chapter count. Forward costs one
    lookup (the next chapter always starts at section 1); back across a boundary
    costs one too, because the previous chapter's last section could be its 3rd
    or its 30th.
- **WP-11 · In-app import + auto-parse** — `web/src/import/`. Pick files, pick a
  folder, or drop either on the page → parser chosen by extension → parsed →
  `repository.saveParsedBook` → the book appears. Verified on the real 15 MB
  Jung epub and the Springer PDF.
  - **Failure is always explained.** A distinct plain sentence per case, and the
    scanned PDF — which parses "successfully" into zero blocks — is caught
    *before* the write, so an empty book never reaches the library.
  - **Duplicates, two fingerprints.** `contentHash` (SHA-256 of the file) is
    checked before parsing; `textSignature` (SHA-256 of the opening text) after.
    The second exists because the first can't be backfilled — the original file
    is never kept, but the text is — and it catches what bytes can't: the same
    book from a different file. Under 200 characters of opening text it makes no
    claim at all, since a false "already on your shelf" locks a real book out.
  - **Delete**, cascading through sections → chapters → manifest → book.
  - **Three shelves** — books / research papers / documents, guessed at import
    from the format plus first-page signals (DOI, arXiv, abstract), inspected
    only for the two ambiguous formats. Every book can be moved, and a moved
    book is never re-guessed.
  - Beyond the original scope: multi-file, folder and drag-drop import,
    duplicates, delete, shelves. All reader-requested mid-task.
- **WP-38 · Non-prose blocks** — `Paragraph` gains a required `kind`
  (`prose | heading | quote | list | code | figure | table | formula | note |
  furniture`), plus `rows` for tables and `image` for figures. Each of those is
  now **one** block: a table keeps its grid instead of becoming one anchored
  paragraph per cell, a display formula stops exploding into one block per
  symbol, and `furniture` (ToC, running heads, index) is dropped *before*
  anchors are assigned so it never consumes one. Every block still carries a
  readable `text`, so nothing downstream has to understand a kind it hasn't met.
  Done before WP-11 deliberately — it changes paragraph numbering, and anchors
  are permanent once a book is imported.
  - Real-book check found the bug that mattered: epub producers write
    `<p class="image"><img/></p>`, and a paragraph was a leaf, so **131 of the
    Jung book's 141 images were being silently dropped**. All 131 now resolve to
    an archive path.
- **All five parsers + the shared assembler** — `web/src/parse/`. One pipeline:
  each format produces a flat `Block` stream, `assemble.ts` turns any stream
  into a `ParsedBook`. Heading-level resolution, the heading-free bucketing
  fallback and anchor assignment therefore exist in exactly one place.
  - **WP-08 markdown** — ATX headings, code fences can't fake a chapter break.
  - **WP-35 HTML → blocks** — browser `DOMParser`, no dependency. Shared by
    epub and docx.
  - **WP-06 epub** — own ZIP + OPF spine reader (`fflate`), *not* epub.js,
    which is a renderer and would fight our own. ToC titles are used only when
    the markup has no headings at all. Verified on the real 15 MB Jung epub:
    12 chapters / 32 sections / 1503 paragraphs in ~0.5 s.
  - **WP-36 txt** — conservative `CHAPTER`/`PART`/shouted-line detection,
    gated on word count so prose starting "Chapter four was…" isn't promoted.
  - **WP-37 docx** — `mammoth`, lazy-loaded; maps Word's *semantic* heading
    styles, plus Title/Subtitle. Aliased to its browser build in vite.config.
  - **WP-07 pdf** — `pdfjs-dist`, lazy-loaded. Split into `pdf.ts` (thin
    pdf.js wrapper) and `pdf-layout.ts` (pure geometry: line rebuilding,
    two-column ordering, running header/footer stripping, hyphen healing,
    heading inference by font size). Verified on the real research paper.
- **`SourceFormat`** widened with `'txt' | 'docx'`.
- **WP-04 · App shell + routing** — three routes (Library `/`, Settings, Reader
  `/book/:bookId`), bottom tab bar, Reader full-bleed outside the shell.
  `theme.css` holds all design tokens, dark follows the OS. Library reads real
  data via the WP-03 repository. 5 jsdom smoke tests.
- **WP-03 · Local storage layer** — Dexie `reading-buddy` v1: books /
  manifests / chapters / sections, one row per section keyed `[bookId+path]`.
  `storage/repository.ts` is the only door; import and delete transactional.
- **WP-05 · Shared structure schema (KEYSTONE)** — `web/src/structure/`:
  parsed-book types with book-type gating, strict `[ch02-s03-p013]` anchors.
  **Reordered before WP-03** so storage fit a settled schema.
- **WP-01 · Scaffold the stack** — Vite 7 + React 19 + TS, PWA plugin wired but
  unconfigured, `shell/`/`api/` placeholders.
- Repo published: **github.com/chandan-singh4/reading-buddy** (public). Product
  renamed Reading Buddy — *Wayfinder* was the planning method, not the product.

**Gates:** `npm test` (426), `npm run typecheck`, `npm run build` — all passing.
Main bundle 368.7 kB. The parsers are called now, but every one of them stays
behind a dynamic `import()`, so pdf.js (434 kB) and mammoth (500 kB) remain in
their own chunks and are fetched only when a file of that type is imported.

### Blockers
- None.

### Next up
**The reader's order, set 2026-08-02: make it a proper reading app first, then
AI.**
- **Page turning (the core of WP-14)** — the app scrolls; it should turn pages.
  CSS columns, and the horizontal swipe now that it no longer drifts or exits.
  This is the single biggest gap between what exists and something that feels
  like a reading app.
- **Reading comfort (rest of WP-14)** — font size, line spacing, margins, sepia.
- **WP-42 · Links inside the text** — footnotes and cross-references are dead
  text today; the parser discards every `href`.
- **WP-43 · Re-scan a folder + name what's new.**
- **WP-17 → 18 → 19 → 20 · the tutor loop** — select text → assemble a prompt →
  call Claude → stream an answer. This is the rest of the walking skeleton and
  the first time the app does anything an ordinary reader can't.
- **WP-14** holds the pagination work, and both decisions it needs are already
  written down in `backlog.md` (CSS columns; the page turn as a seam).
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
- **The live Anthropic key still sits in `Claude API/API.txt`** inside a public
  repo's folder. Gitignored, never committed (history scanned clean), but it
  should move outside the project and be read from an env var when `api/` is
  built.
- **It has now been used on a real phone** (2026-08-02): installed, books
  imported, folder import smooth, duplicates caught. What that session found is
  WP-41 (fixed), WP-42 and WP-43, plus page turning as the top priority.
- **Pictures need a re-import to appear.** Fixed 2026-08-02 for new imports;
  books already on the shelf have no bytes stored, so the shelf's "Update"
  (kept source file, `PARSER_VERSION` 3) is what fills them in. Storage grows by
  roughly the images again — the Jung epub's 141 plates are most of its 15 MB.
