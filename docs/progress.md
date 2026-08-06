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
- **Nothing in the code.** Four rounds are now merged and on Vercel awaiting the
  reader's eye: the library redesign below, the shelf/page-flip round, the
  nav/Home redesign, and the second of the two text-escaping fixes.

### Recently done
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
    on a page. **Both halves of that turned out to be half-true** — see the
    2026-08-05 entry above: `display: inline` does not stop a `<button>` being
    a box, and `.page > *` never reached anything *nested* inside a block.
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
- **None.** The `autoUpdate` → `prompt` crossing that stranded installed clients
  is closed: the reader confirmed on 2026-08-05 that the phone is on the current
  build and that the stale client was a desktop-app session, not a deploy or
  worker problem. Don't raise it again.

### Next up
**The reader's order, set 2026-08-02: make it a proper reading app first, then
AI.** Nothing is in flight. The phone is on the current build, so the whole of
the last four sessions is now open to reaction — expect a round of it, and treat
that as the real next task ahead of anything listed here. The bookshelf and the
page flip are what they will land on first.
- **Two things from this round need the reader's eye specifically.** (a) Run the
  library's **Update** to pull covers forward to `PARSER_VERSION` 9 — the fix
  does nothing for books already on the shelf until it runs. (b) Does the flip
  stutter on a long chapter? See the clone-caching note above.
- **Reading comfort (rest of WP-14)** — in-book search and real bookmarks are
  what is left; font size, line spacing, margins, sepia and the page turn are
  all done now.
- **WP-43 · Re-scan a folder + name what's new.**
- **WP-17 → 18 → 19 → 20 · the tutor loop** — select text → assemble a prompt →
  call Claude → stream an answer. This is the rest of the walking skeleton and
  the first time the app does anything an ordinary reader can't.
- ~~**The page-flip animation**~~ — **done 2026-08-06**, see WP-51 above.
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
