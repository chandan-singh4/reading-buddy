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
- **Nothing in the code.** WP-54 is merged and on Vercel across five commits,
  the last four of them the reader's own corrections made live in the same
  thread. They have seen and steered the filter row itself; **they have not yet
  seen the scroll fix, the folders, or the reading-progress bands on the phone.**

### Recently done
- **WP-54 · Scroll positions, the filter row, and folders that hold a book
  twice** — 2026-08-08, merged to `main` (`378b43f` → `d304ef1`). Four asks,
  and then four rounds of the reader correcting the controls by eye.
  - **Home opened at the bottom, looking like a refresh.** Root cause, and it
    was neither the covers nor the animation: **there is one scroller and it is
    the document**, so a hidden screen has no height and the document is only
    ever as tall as the screen on show. Leaving a long Library for a short Home
    shrinks it and the browser *clamps* `scrollY` to Home's last pixel — the
    jolt against the document edge is what read as pull-to-refresh. Library then
    came back to the clamped number, because the two screens shared one. Now
    `app/scrollMemory.ts` keeps one offset per path, saved on scroll and
    restored in a layout effect. The outgoing screen is also shifted by the
    difference between the two, or it would spend its 300 ms fade showing its
    own top.
  - **The filter controls came out of the sheet** onto the shelf
    (`library/FilterBar.tsx`), and the search bar's duplicate filter button went.
    Then four corrections, each shipped on its own: **two options is a switch**
    (Title, Author, Recently and List/Grid change on the tap, no panel);
    **reading progress became a filter in bands** (0–25%, …) rather than a sort;
    **the accent follows the tap** — exactly one chip lit, the last one touched;
    and **any open panel closes** when the reader moves to a control without one.
  - **Unread and Finished are computed folders.** No rows, no syncing: they are
    a question asked of the progress map when the shelf is drawn, so "moving
    between them" is what the answer changing looks like.
  - **A book can be in several folders** — schema **v9**, `*folderIds`
    multiEntry, with the first migration in this project's history that has to
    do real work. Tested against a database genuinely written at v8 and reopened.
  - Gates at close: **742 tests**, typecheck, build. Every fix was checked to
    fail without it, including the reported ones.
- **WP-53 fast-follow · three faults from the phone** — 2026-08-06, merged to
  `main`. Reported within the hour of shipping; two shared one cause.
  - **The floating "+" was fixed to the document, not the screen**, so it was
    only visible after scrolling to the end of the shelf — and **the filter
    sheet rose from below the fold**, so its button appeared to do nothing.
    Same cause: `AppShell`'s `.frame` carries a `filter` at all times (at no-op
    values, so the drawer blur animates rather than snapping), and **an element
    with a filter is a containing block for every `position: fixed`
    descendant.** The drawer and `UpdatePrompt` already dodge this by being
    siblings of the frame; there was no way for a component *inside* a page to
    do the same, so `app/Portal.tsx` now exists and the "+", the sheet and the
    folder dialog all render into `<body>` through it, below the drawer's
    z-index. **This is the second round this trap has cost** — it is now a rule
    in `active-task.md`, not a caution.
  - **Swiping did nothing at all on a phone.** Two causes, both invisible to
    jsdom. The distance was measured at `pointerup`, but a browser seizes a pan
    after a few pixels and fires `pointercancel` instead — so the handler
    either never ran or ran with stale coordinates. And `touch-action` was left
    at `auto`, which is what let the browser claim the horizontal drag in the
    first place. Now: movement tracked on `pointermove` and judged on whichever
    end arrives, and `touch-action: pan-y pinch-zoom` on `.content` — the
    mirror image of the `pan-x` the reading screen needed for the same reason.
    Panels opt out of page swipes with `data-no-swipe`.
  - **All three shipped under 656 green tests.** jsdom has no layout and never
    cancels a pointer. The swipe tests now reproduce a real event sequence —
    down, moves, then a cancel carrying stale coordinates — and fail against
    the old handler. The standing conclusion is recorded: layout and gestures
    are verified on the phone or not at all.
  - Gates at close: **658 tests**, typecheck, build.
- **WP-53 · The library, redesigned** — 2026-08-06, merged to `main`. Asked for
  against two reference screenshots (a Kindle-like list and a two-column grid).
  Eight parts, shipped together at the reader's call.
  - **The screen is now a shell over `src/library/`.** `Library.tsx` holds state
    and talks to storage; everything that can be *wrong* rather than merely ugly
    is a pure function beside it — `filter.ts` (search → filter → sort),
    `status.ts` (unread/reading/finished), `prefs.ts` (what is remembered). That
    split is the whole reason the ordering rules are unit-tested at all; the old
    850-line screen had no seam to test at.
  - **List and grid are one component, not two.** `BookShelf` renders the same
    children in the same order either way and only the CSS differs — which is
    what makes the scroll position survive the switch, and what stops a future
    badge being added to one view and forgotten in the other. Grid is
    `auto-fill minmax(9.5rem, 1fr)`, so two columns on a phone becomes three or
    four on a tablet with no media query.
  - **Folders are real now, and they are a *folder*, not a tag.** New `folders`
    table (schema v8) plus an indexed `folderId` on a book: **at most one
    folder per book, deliberately.** A book in three places is a tag — different
    shape (join table), never partitions the library, and would leave "sort by
    folder" with nothing to sort by. **Deleting a folder never deletes the books
    in it**; they are unfiled in the same transaction. No migration: a book with
    no `folderId` is loose, which every book already was.
  - **"Add a folder" was two different things and both are in the + menu.**
    Importing every book inside a device folder (what the old button did) and
    making a folder to file books into (what the feature needs). Named apart:
    picking the wrong one either imports nothing or waits three minutes.
  - **Long press replaces the Select button and the per-row controls.** Pointer
    events, 500 ms, cancelled by >10px of movement — without that guard,
    flicking down a long shelf selects books at random. The tap the browser
    fires afterwards is swallowed, or holding a book to select it would also
    open it.
  - **"Empty means all" runs through every filter.** Unticking the last status
    is a request to stop filtering, not a request for an empty shelf — and a
    folder filter pointing at a deleted folder hides nothing, because an empty
    library behind a name that no longer exists reads as "my books are gone". A
    line above the shelf says *Showing 3 of 40* whenever anything is narrowing
    it, with one tap to clear.
  - **Sort is one flat list, not a field plus a direction.** Two fields would
    allow "recently added, A→Z", which is not a thing. **"Last Modified" was
    dropped on the reader's call** — nothing records it, and a menu item that
    silently duplicates "recently added" is a menu item that lies.
  - **Swiping moves between Home ↔ Library ↔ Stats ↔ Settings**, and the ends
    do not wrap — an edge is how a reader learns where they are. Guarded by the
    same ratio test the reading screen needed: a finger arcs, and a curved
    scroll must not navigate. Mouse drags are ignored outright or text could
    never be selected. **Home is in the drawer now** — it was left out when
    Home was simply the screen the ☰ sat on, but "swipe right three times" is
    not a way home.
  - **Not a scroll-snap carousel**, though that would animate for free: it would
    mount all four screens at once, and Library builds cover thumbnails while
    Stats reads every position. One screen mounts; the transition is CSS.
  - **Dead CSS removed rather than left**: the importer panel, the old select
    bar, the per-row shelf picker and the old search all went with the screen
    they belonged to. Bundle CSS 49.7 kB → 47.4 kB.
  - **Not seen by eye.** jsdom has no layout and headless Chrome renders this
    app's root empty, so every judgement about how it *looks* is unverified —
    see the two questions in `active-task.md`.
  - Gates at close: **656 tests** (40 new), typecheck, build. Precache 500.66 KiB.
- **WP-51 · A shelf of real books, and a page that turns** — 2026-08-06, merged
  to `main` (`f5e4bf7`). Four UI complaints from a phone screenshot, plus the
  page-flip that had been an open slot since WP-14.
  - **Covers are books now.** A spine down the left edge, a block of page edges
    down the right, and the weight of a solid object on the plank — built from
    a stack of hard `box-shadow`s and two pseudo-elements on `.tileMedia`,
    **deliberately not a 3D transform**: a rotated element carries its own width
    with it and would undo the row alignment fixed in the same commit. Scoped to
    `Home.module.css`, so `Cover.tsx` stays the printed face and Library/BookInfo
    are untouched.
  - **The missing cover was a parser gap, not a display bug.** An epub declares
    its cover two standard ways (`properties="cover-image"`, `<meta
    name="cover">`) and conversion tools drop both routinely — the book then
    imports fine and shows a coloured placeholder forever with nothing to say
    why. Two *guesses* added behind the two declarations: a manifest image
    plainly called "cover", and the lone picture on the book's own cover page.
    Both strict — a page with >12 words is a chapter, several pictures is a
    title page, and a single-document book has no separate cover page at all
    (that last guard is what stopped the figure tests going red).
    **`PARSER_VERSION` → 9**, so the shelf offers the rebuild.
  - **Alignment: `align-items: flex-end` was the bug.** Aligning tiles by their
    *bottoms* pushes a one-line-title book down — that is why "Breath" sat low.
    Now `stretch` with `grid-template-rows: auto 1fr`, so every tile shares a top
    edge and (same width, same 2:3 shape) one baseline under the covers.
  - **Padding: the bleed cost the thing it decorated.** The row was pulled to the
    panel edges with negative margins so a cover would slide under the rounded
    corner; the first book of every shelf ended up flush with the border while
    its heading kept its inset, which is the "title touching the edge" report.
    Bleed removed — the row lives inside the shelf's own padding.
  - **The page turns over instead of sliding.** A slide is what a *scroll* looks
    like and paper pivots about the binding. Forwards: one copy of the outgoing
    page rotates over the spine (`rotateY` 0 → −118°, `perspective(1600px)`,
    origin `0% 50%`) and uncovers the strip beneath. **Backwards is not a mirror
    image** — the *arriving* page is the one that moves, so it needs two copies:
    the page being left sitting still, and a copy of the strip flipping onto it,
    played with `direction: 'reverse'`. Both dropped at the end. A shade overlay
    fades to `--color-bg` as the sheet goes edge-on, so what shows past halfway
    is the blank back of the page rather than its own text mirrored.
  - **`copyOf` now returns a wrapper, not the bare clone.** The strip is a
    *scrolling* box, so an overlay at `inset: 0` inside a copy of it lands at the
    copy's scroll origin — thirty-nine screens off to the left on page forty. The
    shade hangs on a non-scrolling wrapper with the scrolled copy inside; the
    wrapper is also what gets rotated. `playTurn` is gone, replaced by `playFlip`.
  - **Now cloning per tap, not per section.** Within-section turns used to be a
    pure scroll; they take a `cloneNode(true)` of the laid-out section now. The
    reader was told to watch for stutter on a long chapter — **the named fix is
    to cache the clone per section and reset its `scrollLeft`, not to rebuild the
    animation.** Don't guess at it without their device as evidence.
  - **`CLAUDE.md` gained a ship-at-end-of-thread ritual** at the reader's
    request: build, commit, merge to `main`, push, so work reaches Vercel rather
    than sitting on a branch. Note this **contradicts `/wrap-session`'s "do not
    commit or push unless I ask"** — the ritual is newer and explicit, and won.
  - Gates at close: **616 tests** (3 new, on the cover rules), typecheck, build.
- **WP-52 · Drawer navigation and the bookshelf Home** — 2026-08-05, merged to
  `main`. Asked for against a reference screenshot the reader shared; purely
  UI and navigation, no data or repository change.
  - **The bottom tab bar is gone.** Four tabs spent the screen's most reachable
    strip on three screens a reader visits occasionally. Home is the front door
    and stays the front door; All Books / Stats / Settings moved into a left
    drawer behind a ☰ in a new sticky top bar. Home is deliberately *not* in
    the drawer — it is the screen the ☰ is sitting on.
  - **The frosted-glass blur is on a sibling of the drawer, not its parent.**
    A CSS `filter` makes an element a containing block for fixed-position
    descendants, so a drawer nested inside the blurred wrapper would be blurred
    along with the page. The filter is also written at no-op values rather than
    `none`, so the browser has two filter lists of the same shape to
    interpolate between — `none → blur()` snaps.
  - **Open means open**: body scroll locked, page behind `pointer-events:
    none`, drawer `inert` while closed so a keyboard user can't tab into
    off-screen links, focus moved in on open and back to the ☰ on close.
    Escape, the scrim, and any navigation all close it. Reduced-motion keeps
    the dim and drops the blur and the slide.
  - **Home is three shelves** — Current Reading, Up Next, Unread — each its own
    card with a gradient "plank" drawn under the covers, which is the edge that
    makes the screen read as a bookshelf rather than a list of cards. Covers
    carry a shadow and press down on tap. **Finished no longer appears on
    Home** (still on `/library`) — the reader asked for three shelves, and the
    reference screenshot does show a Finished shelf, so this is the one thing
    here worth a second look.
  - **"View All" is on Unread only**, going to `/library` — Unread is the only
    capped shelf (ten of however many are owned), so it is the only one
    actually holding anything back.
  - `--tab-bar-height` deleted from `theme.css`; nothing else read it.
  - Gates at close: **613 tests**, typecheck, build. Precache 475.54 KiB.
- **Text escaping the page, twice — both merged to `main`** — 2026-08-05
  (`1f450f9`, `bbeb6b8`). Two separate causes behind one symptom the reader
  reported as "letters from the previous page". Both were reproduced and
  measured in headless Chrome before being fixed, which is what separated them.
  - **Ink from the previous page at the left margin.** The columns sat flush
    against each other, so a turn that lands short of a column edge leaves the
    tail of the previous page on screen. It lands short on the **last page of a
    section**: the browser caps `scrollLeft` at `scrollWidth - clientWidth` and
    rounds both to whole pixels while the real column is fractional (392.72px on
    a phone). Measured: the last page parks 0.44px short and 0.44px of the
    previous column shows. **The fix is a `column-gap`**, not better rounding —
    with a gap the same misalignment lands on blank paper, whatever its size. It
    costs no reading width: the column is still exactly one box wide, so the gap
    is scrolled past. A page is now a column *plus its gap*; `Strip.pageWidth`
    was always documented that way. Verified 0.44px → 0.00px, page count
    unchanged.
  - **Long contents entries cut off at the right edge.** Two holes.
    (a) **The guard only reached direct children.** `.page > *` caps the
    outermost element of a block and nothing inside it — and `min-width` is the
    one that bites: a grid child defaults to `min-width: auto`, "never narrower
    than my contents", and `.list` is a grid. Every contents entry was a grid
    item refusing to shrink, so a long chapter title made the track wider than
    the column and the line was sliced. Measured with real chapter titles:
    **215.7px of text past the column → 0.0px** with the guard applied at every
    depth. `.tableScroll` keeps its exemption.
    (b) **A link was still a box.** The previous round's note claimed
    `display: inline` had made the `<button>` behave like a word. It had not —
    measured, a button holding a long entry reports **one** line box where the
    same text in a span reports **two**. A box is laid out whole and cannot
    break across a line or a column. Internal links are `<span role="link">`
    now, with Enter/Space handled to give back what the element loses.
  - **Not fully closed:** the reader's exact clipped line could not be
    reproduced on desktop Chrome — desktop shrinks that button where Android
    apparently does not. The *mechanism* is fixed and measured; if clipping
    survives, the epub (Nestor, *Breath*) is needed to finish it.
  - Gates at close: **611 tests**, typecheck, build. Precache 468.69 KiB.
**Gates:** `npm test` (658), `npm run typecheck`, `npm run build` — all passing.
Main bundle 426.7 kB, CSS 47.4 kB, precache 501.28 KiB. Every parser stays
behind a dynamic `import()`, so pdf.js (434 kB) and mammoth (500 kB) remain in
their own chunks and are fetched only when a file of that type is imported.

### Blockers
- **None.** The `autoUpdate` → `prompt` crossing that stranded installed clients
  is closed: the reader confirmed on 2026-08-05 that the phone is on the current
  build and that the stale client was a desktop-app session, not a deploy or
  worker problem. Don't raise it again.

### Next up
**The reader's order, set 2026-08-02: make it a proper reading app first, then
AI.** Nothing is in flight. **Expect another round of reaction and treat it as
the real next task** — the last round produced three faults within the hour, and
none of the *looks* of the new library has been reacted to yet.
- **Waiting on the reader's eye, in likely order of what they hit first.**
  (a) The library's list and grid — proportions, the progress bar, whether the
  "+" clears the last book now. (b) The long press: 500 ms, 10 px. (c) Whether
  swiping fights scrolling. (d) Run **Update** to pull covers forward to
  `PARSER_VERSION` 9 — the fix does nothing for books already on the shelf until
  it runs. (e) Does the page flip stutter on a long chapter? The fix is named
  already; don't guess at it without their device.
- **Cheap follow-ons the redesign made cheap**, if the reader wants them:
  favourites (a boolean, one filter clause, one chip) and renaming/deleting a
  folder from the filter sheet — `repository.renameFolder` and `deleteFolder`
  both exist and have no UI yet.
- **Reading comfort (rest of WP-14)** — in-book search and real bookmarks are
  what is left; font size, line spacing, margins, sepia and the page turn are
  all done.
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
