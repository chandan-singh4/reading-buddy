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
- **Nothing in the code.** WP-55 and its fast-follow are merged and on Vercel
  (`7ac706d`). The 2026-08-08 session's notes were reconstructed from its
  commits on 2026-08-09 — the connection dropped before `/wrap-session` ran —
  and nothing was half-built when it did.
- **WP-55 was measured, not just shipped**: twelve checks in headless Chromium
  at 412×869, all passing. See the table in `active-task.md`. **The 85% is no
  longer a guess** (it measures 85.0%, with 14 px and 40 px of bar clearance).
- **Waiting on the reader — the one open question.** They reported *"I don't
  see the logo"*. **The most likely answer is that their phone is on an older
  build, not that the splash is broken**: the splash was the last commit of
  eleven (`4f96fb3`), their screenshot showed the toolbar and the page-shrink
  from commits five and seven, and `registerType: 'prompt'` means an installed
  app never updates itself. They were asked to take the update and look again.
  **Don't debug the splash until they confirm they are on a current build** —
  it is verified present, ~557 ms, and removed from the DOM afterwards.
- **Still unseen:** how it *feels* — whether 557 ms reads as arriving or as a
  toll gate, whether 85% looks like too much shrink, and every gesture (swipe,
  the 500 ms / 10 px long press). A synthetic click is not a finger.

### Recently done
- **The cloud backend can now be switched on · sign-in and the library toggle**
  — 2026-08-09. The reader has 32 books on the device, which is the constraint
  the whole design answers.
  - **Switching backends moves nothing.** It changes *which library you are
    looking at*, so the device's 32 books survive any amount of flipping back
    and forth. That is the only reason it is safe to offer the toggle before
    there is any way to copy books between the two — and Settings shows a count
    under the option you're *not* on, so an empty cloud shelf reads as
    reversible rather than as loss.
  - **The choice is read once at load and applied by reloading the page.**
    ~30 modules import `repository` as a plain value and several cache what it
    returned (covers, shelf memory, library memory, position). Swapping the
    object underneath all of that would need an invalidation path per cache; a
    reload costs ~300 ms and cannot be half-applied. `storage/backend.ts`.
  - **`storage/index.ts` is still the only switch** — `activeBackend() ===
    'cloud' ? createCloudRepository() : deviceRepository`. Every other call site
    is unchanged and unaware there is a choice, which is what the `Repository`
    type was for.
  - **A build with no Supabase keys falls back to the device library** even if
    `cloud` is remembered, so a fork or a preview deploy can't strand someone on
    a sign-in screen it can never satisfy. `resolveBackend` is pure and tested.
  - **The sign-in screen always offers the way back to the device library.**
    Without that button, turning the cloud on before the accounts exist locks
    the reader out of books that are sitting in the browser underneath the
    screen. Two of the five sign-in tests are about that button alone.
  - **Three session states, not a boolean.** Supabase reads its stored session
    asynchronously, so a boolean starts `false` and flashes the sign-in form at
    a signed-in reader on every launch. `loading` paints the page background
    instead — the splash is gone by then, so `null` would be a white flash.
  - Cost: the Supabase client is now a static import, so the main bundle moved
    **449.5 → 470.5 kB** (151.3 kB gzipped). Deliberate — a dynamic import would
    make `repository` async at all ~30 call sites.
  - Gates: **851 tests** (13 new), typecheck, build. **Still untested against a
    real database** — the SQL and the round trip have never run.
- **The cloud backend · Supabase + R2, written but not switched on** —
  2026-08-09. Asked for directly: keep the parser in the browser, move storage
  to a Postgres database and an object store.
  - **`web/src/storage/cloud/` is a second `Repository`, not a rewrite.** It is
    declared as returning `Repository`, so the compiler checks all 48 methods —
    which is how the first pass found its only two real mistakes. Swapping is
    one line in `storage/index.ts`; **nothing imports it yet**, and the main
    bundle moved 449.3 → 449.5 kB, which is the measurement that says so.
  - **The split is by weight**: records to Postgres, the original file and the
    pictures to R2, which charges nothing to read bytes back out. `sources` and
    `assets` keep a key and a size, so "what are the kept files costing me?"
    still never touches an object.
  - **Row Level Security is what makes the browser key safe**, and **R2 needs a
    signing endpoint because it has no equivalent** — `api/r2/sign.ts` checks
    the caller's session and refuses any key outside their own `users/<id>/`.
    Traversal (`..`) is refused in two places, because the `URL` constructor
    normalises it after a `startsWith` check would have passed.
  - **Transactions became Postgres functions.** A new import is written hidden,
    filled in and revealed (`ready`), because a big book's sections don't fit in
    one request; a *re-parse* is one atomic call instead, because `reparseBook`
    promises a failure leaves the old book untouched and that cannot survive
    being split. Full reasoning in `decisions.md`.
  - **Two traps found by writing it down**, both in `rows.ts` and both tested:
    `null` is not the same as *absent* (`folderIds: []` would file a loose book),
    and Postgres timestamps sort differently as strings from the app's own
    (`+00:00` vs `Z`) — which the library sorts on.
  - Gates: **838 tests** (29 new), typecheck, build. **Still needs**: the
    accounts made (`docs/cloud-setup.md`), a sign-in screen, and a decision on
    offline — there is none today, which is why Dexie is still the default.
- **WP-55 fast-follow · Back puts the toolbar away before it leaves the book**
  — 2026-08-09, merged to `main`. Reported from the phone with a screenshot.
  - **The toolbar was the one layer never wired to `useBackDismiss`.** Raising
    it shrinks the page to 85%, which is plainly a state to come back out of,
    but `Reader` asked the hook only about `sheetOpen || searchOpen` — so the
    gesture fell through to the router and left the book. The fix is to treat
    the toolbar as what it is: anything drawn over the page, that changes the
    page, is a layer.
  - **Back now peels one layer at a time.** Sheet over toolbar: the first Back
    closes the sheet and leaves the toolbar up, the second puts the toolbar
    away, the third leaves the book. Clearing everything in one gesture would
    throw away the state the reader was in.
  - **Re-arming happens inside the `popstate` handler, not by re-running the
    effect.** The effect's teardown calls `history.back()`, which is
    *asynchronous* — the queued traversal can land after the new `pushState`,
    undo it, and fire a `popstate` that closes the layer just opened. A
    synchronous `pushState` in the handler has no such race. For the same
    reason the hook now holds its callback in a ref and depends on `open`
    alone: `Reader`'s handler closes over which layers are open, so its
    identity changes whenever one does, and depending on it would have rebuilt
    the entry on every change.
  - **Verified in the browser, not only in jsdom**: page 412 → 350 on tap,
    → 412 and still in the book after one Back, → `/library` after a second.
  - Gates: **809 tests** (4 new), typecheck, build. Both new tests were checked
    to fail against the old behaviour — the first draft of one *passed* against
    it, because jsdom's shared history let a stray `popstate` through, so it now
    asserts on whether an entry of ours survives the gesture.
- **WP-55 · The reading screen, the launch, and the scroller that was never
  there** — 2026-08-08, merged to `main` (`d9a7c06` → `4f96fb3`). Eleven
  commits. **Closes WP-14.**
  - **The scroll bug was never what WP-54 said it was, and the previous fix had
    never run.** `index.css` carried `overflow-x: hidden` on `html, body`
    *together*. The root element's overflow is propagated to the viewport, and
    once it has been, the body's own overflow applies to the body — so that one
    extra selector made the **body** a scroll container, one viewport tall, with
    all four screens scrolling inside it. Everything that reads or writes the
    position talks to the `window`: `scrollMemory`, `AppShell`'s save/restore,
    `scrollRestoration`. Measured at 420×860: `window.scrollY` was always 0,
    `window.scrollTo` moved nothing, and a window scroll listener never fired
    once, because element scroll events do not bubble. `overflow-x` sits on
    `html` alone now; the drawer's scroll lock had the same bug in miniature and
    locks the root instead. **The clamping theory in WP-54 was plausible and
    untested** — see `decisions.md`.
  - **One toolbar, the Google Books shape.** A tap raises one top bar — back,
    search, Aa, ⋯ — and the bottom keeps the slider and nothing else, because a
    phone is held at the bottom and controls under a resting thumb were being
    hit by accident. Contents / Bookmarks / Notes moved into the ⋯ menu and the
    sheet swapped its tab row for a heading. **The bookmark became the page's
    top-right corner**: a control for *this page* had been sitting among the
    controls for *the book*, and marking a page cost two taps.
  - **Bookmarks and in-book search — the two stub tabs are real.** Schema
    **v10**, new table, cascade on `deleteBook`, tested by opening a database
    genuinely written at v9. Search scans the text rather than an index (an
    index would need building at import, versioning, migrating and rebuilding on
    every parser change, to save a few milliseconds of `indexOf` over text
    already in memory), one result per occurrence, literal rather than regex,
    case-insensitive but not accent-insensitive.
  - **The page steps back for the toolbar** instead of hiding under it or paying
    a permanent margin at both ends. A transform, not a resize — see
    `decisions.md` for the three costs and how each is paid.
  - **A re-flow keeps the reader on the same words.** Every Aa control re-decides
    where page breaks fall; the strip used to stay at an offset that no longer
    landed on a column edge, which is the tail-of-one-page-plus-next-page-off-
    the-right the reader photographed. Margins also did nothing on a phone (a cap
    wider than the screen) and now set the space either side of the text.
  - **A long table no longer runs off the bottom of the page**, and the cause was
    the line meant to help: a sideways scroller makes an element monolithic, and
    the browser will not break a scroll container across a column.
  - **The launch screen and one tempo.** A splash in `index.html` covering the
    `healTitles()` boot wait, leaving on first paint with an 8s watchdog; the
    saved theme applied before first paint, ending the light-flash on every cold
    start for a reader on Dark; and ten hand-picked durations collapsed to three
    tokens in `theme.css`. `styles/motionTokens.test.ts` now checks the two
    timings that still have to live outside the stylesheet — `transitions.css`
    had claimed for months to match `reader/motion.ts` while running 380 against
    its 400.
  - **Headless Chrome works after all.** The standing note that it renders this
    app's `#root` empty was the dev server's self-signed certificate, not the
    app. The scroll fix was verified against a real 9000px screen.
  - Gates at close: **805 tests**, typecheck, build.
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
**Gates:** `npm test` (838), `npm run typecheck`, `npm run build` — all passing
as of 2026-08-09. Main bundle 449.5 kB, precache 34 entries / 1072.01 KiB. Every parser stays behind a dynamic `import()`, so pdf.js
(434 kB) and mammoth (500 kB) remain in their own chunks and are fetched only
when a file of that type is imported.

### Blockers
- **None.** The `autoUpdate` → `prompt` crossing that stranded installed clients
  is closed: the reader confirmed on 2026-08-05 that the phone is on the current
  build and that the stale client was a desktop-app session, not a deploy or
  worker problem. Don't raise it again.

### Next up
**The reader's order, set 2026-08-02: make it a proper reading app first, then
AI.** Nothing is in flight. **Expect another round of reaction and treat it as
the real next task** — WP-55 was itself eleven commits of it, and the whole of
that round is still unseen on a phone.
- **First: did taking the update bring the logo back?** This is the live
  question and it has a likely answer already (an older cached build — see "In
  flight"). Everything else waits on it, because a reader on a stale build will
  report other absences too.
- **Then, waiting on the reader's eye.** (a) Does the launch screen read as the
  app arriving or as a toll gate — 557 ms is a healthy number, but whether it
  *feels* right is not a measurement. (b) Does 85% look like too much shrink? It
  clears both bars with room, so there is budget to raise it toward 90%.
  (c) Gestures: swipe between screens, the 500 ms / 10 px long press, whether
  swiping fights scrolling — **the only area still verified on the phone or not
  at all.** (d) The new tempo. (e) The library's list and grid, still never
  reacted to. (f) Run **Update** to pull covers forward to `PARSER_VERSION` 9.
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
