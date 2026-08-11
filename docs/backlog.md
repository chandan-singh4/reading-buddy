> **What's in here (read when planning the next task or on `/plan-task`).** The
> full build backlog — all 39 waypoints across the six legs, each with a status
> box, a one-line description, and its dependencies ("after N"). This is the
> master list `/plan-task` picks from; respect the dependency notes so nothing
> gets built before its foundation. Don't read this during a normal build session
> — `active-task.md` already holds the scoped work. Statuses are flipped by
> `/wrap-session` as waypoints move. Mirrors the interactive Wayfinder build
> board. `[ ]` = to do · `[~]` = in progress · `[x]` = done.

---

### Leg 0 — Basecamp (scaffold & stack)
- [x] **WP-01 Scaffold the stack** — Vite + React + TS, PWA plugin, monorepo web/shell/api · *start here*
- [ ] **WP-02 Wrap the Tauri dev shell** — disposable desktop harness · *after 01*
- [x] **WP-03 Local storage layer** — IndexedDB/Dexie seam for all persistence · *after 01, **05*** 
- [x] **WP-04 App shell + routing** — Library/Reader/Settings + theme tokens · *after 01*

### Leg 1 — Cartography (parsing pipeline)
- [x] **WP-05 Shared structure schema** — path-as-address, manifest, anchor grammar · *KEYSTONE, **before 03** (reordered 2026-08-01)*
- [x] **WP-06 Epub parser → structure** — unzip + OPF spine, chapters via WP-35 · *after 05,35*
- [x] **WP-07 PDF parser → structure** — pdf.js, lazy-loaded; reuse rule + running-header/footer filter · *after 06*
- [x] **WP-08 Markdown parser → structure** — resolve present heading levels · *after 05*
- [ ] **WP-09 Manifest + crossrefs at import** — per-chapter summaries, crossrefs once · *after 06,07,08*
- [ ] **WP-10 Import classification** — fiction vs dense, subject tag, concepts/vocab/themes · *after 09*
- [x] **WP-38 Non-prose blocks (KEYSTONE-ADJACENT)** — add `kind` to `Paragraph`; keep tables, figures, formulas, code, quotes, footnotes as *one* block each instead of shattering them · ***before 11** — anchors are permanent, and this changes paragraph numbering*
- [x] **WP-11 In-app import + auto-parse** — phone picker, parse-on-import, land in library · *after 06,07,08,**38***
- [x] **WP-35 HTML → structure (shared step)** — one heading/paragraph walker reused by epub + docx · *after 08 (inherits its level-resolution rule)*
- [x] **WP-36 TXT parser → structure** — conservative CHAPTER/PART detection, else WP-08's fallback · *after 08*
- [x] **WP-37 DOCX parser → structure** — mammoth (lazy-loaded) maps Word heading styles → HTML, then WP-35 · *after 35*

> **Declined: `.azw3` / `.kfx` (Kindle).** `.kfx` is a proprietary DRM-encrypted
> container — reading it means circumventing DRM, which we won't build, and
> Amazon's 2025 scheme change breaks even the third-party tooling. `.azw3` is
> technically parseable but has no maintained browser library. Users convert to
> EPUB in Calibre; the import UI (WP-11) should say so in one line.

### Leg 2 — Reading Room (reader UI & comfort)
- [x] **WP-12 Structured renderer** — anchored paragraphs, paginated · *after 05,11*
- [x] **WP-13 Nav overlay (Books-style)** — tap-fade, progress slider, ToC, Focus Mode toggle · *after 12*
- [x] **WP-14 Reader conveniences** — font/spacing, day/night, in-book search, bookmarks, **page turning (see below)** · *after 12* — **closed 2026-08-08** by WP-55: bookmarks (`d2f6fa2`) and in-book search (`2de66c1`) were the last two stubs.

> **Page turning shipped 2026-08-02**, exactly as the note below decided: CSS
> columns, one column per screen, `column-fill: auto`. `reader/columns.ts` holds
> the arithmetic (how many pages, which one is showing, where to scroll) and is
> pure and unit-tested — that is where off-by-ones live. `overflow: hidden`
> rather than `auto`, so a strip can't be dragged to a half-page; every turn is
> programmatic and lands on a column. Swipe, edge taps (outer quarter each side)
> and Previous/Next all go through one `turnPage`, which falls through to the
> neighbouring *section* at either end — the seam, working as intended. Turning
> back into a section lands on its **last** page.
>
> **WP-14 is closed as of 2026-08-08.** Its last two open pieces — real
> bookmarks and in-book search, the two stub tabs that had been a visible
> promise since WP-40 — shipped in WP-55. Font size, line spacing, margins and
> themes shipped 2026-08-03; the page-turn *animation* was carved out as
> **WP-51** and shipped 2026-08-06.
>
> **Book typography shipped 2026-08-05** and belongs here: justified text with
> hyphenation (the two are close to useless apart on a phone-width column),
> first-line indents on paragraphs that continue the flow with the blank line
> stepping back, and dedications/epigraphs centred with air above them. The
> reader's own framing was that it "does not feel like I'm reading a book" —
> the indent is what tells the eye a new paragraph began. One judgement call is
> **unconfirmed on the phone**: removing the blank line between paragraphs is
> authentic book setting but denser than what came before, and the reader was
> offered the choice of keeping both. If it reads as cramped, restore the
> margin and keep the indent — one line in `blocks.module.css`.

> **Pagination — decided 2026-08-02, after the reader brainstormed four options.**
>
> **Location is already solved, and not by page numbers.** Anchors
> (`[ch05-s03-p013]`) are the stable address, which is the CFI idea in a
> stronger form: a *character offset* is counted from raw text, so any later
> parser change shifts every stored offset and misplaces every highlight in that
> book. An anchor is assigned at import and stored beside the text it names, so
> it cannot drift. Open limitation: anchors are paragraph-level, so WP-17 will
> need a character range *within* an anchor for highlights — anchor + offset.
>
> **Pages come from CSS columns, not from JavaScript measurement.** Lay a
> section out in screen-wide columns and turn a page by scrolling one column.
> The browser's layout engine picks the breaks, so they are clean, nothing is
> measured, and a font change re-flows on its own — we then ask which column
> holds the current anchor. This also subsumes virtual pagination: the browser
> only renders columns near the viewport, so the memory win arrives with no
> cache to maintain.
>
> Rejected: **scroll by one viewport height**. It doesn't split a paragraph, it
> splits a *line* — every page would end mid-letterform, and fixing that needs
> exactly the measurement being avoided. Rejected for now: **JS virtual
> pagination** (previous/current/next) — sound reasoning, but only needed if we
> paginate ourselves, and it buys a cache, a rebuild schedule and edge cases.
>
> Accepted cost: columns break awkwardly around tall figures, wide tables and
> long code. A section is the unit, so the damage is bounded — keep plain
> scrolling as a per-section fallback, which is nearly free since it is what
> WP-12 already does.
>
> ~~**No page numbers anywhere.**~~ **Superseded later the same day — see
> `decisions.md`, session 3.** The diagnosis held (a *screen*-derived page number
> changes with the font, so it describes the phone), but the reader wants Google
> Books' "Page 250 of 338" and there is an honest version: count a page as a
> fixed chunk of the book's own **words**. That is stable under font changes and
> computable from word counts without laying anything out — the same sentence
> this note already used to argue the opposite. "Chapter 5, 40% through" survives
> as one state of the bottom bar rather than the only thing it can say.
>
> Ordering: this belongs in WP-14, next to the font and margin controls, because
> surviving a font change *is* the hard half. WP-13 stays scrolling.
>
> **The page turn is a seam, decided 2026-08-02.** Choosing *which* column comes
> next and choosing *how the move looks* are separate, and the navigation half
> must not know about the animation half. Not architecture for its own sake:
> Next/Previous, an edge tap, a keyboard shortcut, the progress slider and a
> jump from the ToC are five routes to the same move. Bake the animation into
> the button and four of them arrive unanimated, or the same code lands five
> times.
>
> Cost is lopsided, so ship accordingly:
> - **Instant** — already what WP-12 does.
> - **Slide** — essentially `scroll-behavior: smooth`.
> - **Fade** — a few lines.
> - **Page curl** — a project of its own, not a fourth item. Text can't be bent,
>   so it means snapshotting the page to an image, animating that, then swapping
>   real text back. Hence the soft edges and dead text selection mid-flip in apps
>   that do it. Leave a labelled slot; decide once real reading has happened.
>
> **Build the seam and two implementations, not a plugin system.** Empty
> extension points for animations nobody has written are maintenance with no
> payoff.
>
> Two requirements that are easy to forget:
> - **Honour `prefers-reduced-motion`** — fall back to instant automatically.
>   Sliding screens make some people motion sick and the OS already knows who.
> - **The animation must never make the reader wait.** ~200 ms ceiling, and a
>   fast tapper must be able to outrun it: the next turn starts even if the last
>   hasn't finished. A per-page delay is what makes a reader feel heavy after an
>   hour.
- [x] **WP-40 Navigation feel (Google-Books-style bar, fine slider, nav sheet)** — carved out of WP-14 on 2026-08-02 because WP-14 had grown to several sessions and this is the half the reader feels every minute. Three-state bottom bar (page → pages left in chapter → nothing), percentage riding with states 1–2, one-page-at-a-time slider, hamburger sheet with Contents / Bookmarks / Notes tabs · *after 13; **needs the word-count schema change below***

> **Resolved 2026-08-02 — both halves shipped.** `structure/words.ts` holds the
> counting and `WORDS_PER_PAGE = 300`; `assemble.ts` records a `words` count per
> section and per chapter at import; `repository.backfillWordCounts` fills in
> books imported earlier, once, atomically, and refuses to write if the book was
> deleted while it counted. `reader/progress.ts` gained a *spine* (every section
> with its running word offset, built from the manifest plus chapter indexes —
> no prose) which drives both the page number and the fine slider.
>
> The original note, kept because it explains the shape:
>
> **Blocker found 2026-08-02: nothing counts words yet.** `ManifestChapter` is
> `{chapter, title, summary}` and `ChapterIndexEntry` has no length either, so a
> word-derived page number has nothing to divide. Two halves:
> 1. **Record it at import.** `assemble.ts` already walks every block, so a
>    `words` field on each section entry (and a chapter total on the manifest) is
>    nearly free there. Metadata only — it touches no anchor, so it is safe to add
>    after books exist, unlike WP-38.
> 2. **Backfill the books already on the shelf.** The Jung epub and the Springer
>    PDF were imported without counts. Reading every section once, on first open,
>    to fill them in is a one-time local IndexedDB pass — it costs no tokens (the
>    token rule is about what reaches Claude, not what reaches the browser) but it
>    *is* the "load the whole book" call the architecture has deliberately avoided,
>    so it must be a clearly-labelled one-shot migration, never a read path.
>
> Until this lands, the bar can ship states 2 and 3 (pages-left is chapter-local)
> but not state 1.
- [x] **WP-15 Reopen where left off** — persist/restore anchor position · *after 12,03*

> **Shipped 2026-08-02.** A `positions` table (schema v4), one row per book,
> holding an anchor and a timestamp. Saved 800 ms after reading settles, so a
> page of scrolling is one write rather than one per paragraph; restored before
> the first section is fetched, so there's no wasted read and no flash of
> chapter 1. A saved place is refused if the anchor is malformed or names a
> chapter the book no longer has — otherwise re-importing a book would open it
> to "That part of the book is missing". Deleting a book takes its place with
> it, so re-importing the same book never resumes a previous read.
- [ ] **WP-16 Read-aloud** — phone built-in TTS via Web Speech API · *after 12*
- [x] **WP-41 Swipe and gesture fixes** — added 2026-08-02, straight off the first real phone session. The page drifted sideways under a thumb; a back swipe with the contents sheet open threw the reader out of the book onto the shelf; and the sheet filled the screen with nothing to tap to dismiss it · *after 32*
- [x] **WP-42 Links inside the text** — added 2026-08-02, from the phone session. `<a href>` is discarded by the HTML parser today, so footnote markers, cross-references and the book's own contents page are dead text. Resolve an epub's internal hrefs to anchors and render them as taps. **Note the trap:** restoring the book's internal ToC *page* would renumber every paragraph after it and invalidate saved positions and highlights — so links in prose first, and treat the in-book contents page as a separate decision · *after 12; needs 15's positions to be considered*

> **Folder import does not watch the folder — clarified for the reader
> 2026-08-02.** Folder import is a one-time scan. A web app is only alive while
> it is open and cannot look at the disk unprompted; the File System Access API
> can remember a directory handle, but still only notices changes when the app
> next opens and asks. iOS Safari doesn't support it at all. Hence WP-43 below
> being a *button*, not a watcher.

- [x] **WP-44 Select several books and remove them** — added 2026-08-02, straight from use: importing 35 books made one-at-a-time deletion punishing. Selection mode with select-all, one transaction for the whole batch, and a confirmation that names the number — there is no undo · *after 11*
- [x] **WP-45 Links in lists, the page you landed on, shelf search, and coming back to the right row** — added 2026-08-02 from the second phone session. Four findings: (a) list blocks were built from `textContent`, so every link inside one was silently discarded — and a book's own contents page *is* a list, which is why contents entries were dead while footnotes in prose worked; (b) after following a link a reader has no idea what page they landed on, so the way back now names the page it returns to and the bar reappears on a jump; (c) 35 books with no way to find one; (d) returning from a book landed at the bottom of the shelf — a remembered pixel offset is meaningless against a page whose height has changed, so the shelf remembers the *book* and scrolls that row into view · *after 44*
- [ ] **WP-43 Re-scan a folder + tell me what's new** — added 2026-08-02. Remember the folder that was imported from, offer "Check folder for new books", skip what's already on the shelf (duplicate detection already does this), and name what arrived: "2 new books: …". On iOS the handle can't be remembered between sessions, so it degrades to re-picking the folder · *after 11*

### Leg 3 — The Tutor (inline explain + Claude)
- [ ] **WP-17 Selection menu** — Highlight / Copy / Define (local) / Ask · *after 12*
- [ ] **WP-18 Retrieval assembler** — manifest + chapter index + one section + learner.md · *after 05,09*
- [ ] **WP-19 Claude API call shape** — Haiku→Sonnet tier, caching, streaming, retry · *after 18*
- [ ] **WP-20 Inline popup + streaming UI** — popup, follow-up box, auto-saved Q&A · *after 17,19*
- [~] **WP-39 Ask about a picture** — *the sourcing half shipped 2026-08-02: epub images are extracted at import into an `assets` table and shown on the page. What's left is the tutor half (tap a figure → send it to Claude), plus pdf.js region rendering.* — tap a figure/table/formula → send that image + surrounding text to Claude. Source image from the epub/docx archive where it exists; pdf.js renders the region for PDFs. The escape hatch for everything WP-38 can only describe · *after 19,20,38*
- [ ] **WP-21 Tutor persona + teaching modes** — subject-driven, 12 modes, dense books only · *after 19,10*
- [ ] **WP-22 learner.md adaptive model** — understood/struggled/analogies/misconceptions · *after 20*
- [ ] **WP-23 Chapter recap** — zero-token summary + things learned + cheap quiz · *after 21,22*

### Leg 4 — The Archive (library & persistence)
- [~] **WP-24 Multi-book library** — covers, progress, status grouping · *after 04,11*
  > Status grouping (Currently Reading / Up Next / Unread / Finished) and
  > progress % shipped with the Home redesign, 2026-08-03. Real cover
  > extraction (epub2/3) shipped 2026-08-03. **Left:** the shelf's visual
  > language itself — the reader wants it to feel like the reference design
  > they shared (illustrated, warm, cover-forward), not just "dark theme with
  > covers now filled in." Carved into **WP-46** below so it can move without
  > blocking the rest of this list.
- [x] **WP-46 Shelf visual redesign** — bring Home closer to the reference look
  the reader shared: cover-forward grid/card layout, warmer surface
  treatment, decorative touches. Purely visual — no new data. · *after 24*
- [x] **WP-47 Book detail page** — tap a book off the shelf to a dedicated
  screen (today a tap opens the reader directly): title, author, format,
  genre/subject tag, date-range read, **one overall rating** — the
  "single overall book rating prompted at Finished" already agreed as a
  future milestone. Foundation the next two waypoints hang their UI off of ·
  *after 46*
- [x] **WP-48 Favorite quotes on the detail page** — shipped 2026-08-03 as a
  typed-in MVP rather than waiting on WP-17/25: a `quotes` table (schema v7,
  `[bookId+id]`, cascades on delete) plus `addQuote`/`listQuotes`/
  `deleteQuote`, and a form + list on WP-47's screen. Selecting a passage
  *from the reading screen itself* is still real, unbuilt work — that needs a
  character range within an anchor (WP-17's job) — so this table just gains a
  second way to be filled once WP-17/25 land, nothing about its shape changes
  · *after 47*
- [x] **WP-49 Notes/reflections** — shipped 2026-08-03. `BookMeta.notes`
  (free text, saved on blur). Originally also shipped `.moods` (toggle
  chips) and `.secondaryRatings` (writing style / pacing / emotional
  impact, genre-neutral stand-ins for the reference design's romance-
  specific axes) — the reader saw the page live the same session and asked
  for both removed as clutter, so they're gone: UI, repository methods
  (`setMoods`/`rateBookAxis`) and the `BookMeta` fields/type all pulled
  rather than left dead · *after 47*
- [x] **WP-50 The update panel** — added and shipped 2026-08-05, asked for by
  the reader in the same breath as "I want to focus on giving character to my
  app". The app used to reload underneath whoever was reading with no
  explanation. `registerType` moves from `autoUpdate` to `prompt`;
  `app/updates.ts` keeps the plumbing (`onUpdateReady`, `applyUpdate`) and
  knows nothing about how it looks, `app/UpdatePrompt.tsx` is the other half.
  The book stays on screen behind it, blurred rather than blacked out, so it is
  visible that no place has been lost. Every way out — Later, Escape, tapping
  the blur — means the same thing, and a deferred build stays deferred rather
  than asking again on every check. **Carries a one-time cost:** clients
  installed under `autoUpdate` cannot ask a waiting worker to activate, so the
  crossing needs a manual app close. See `progress.md` Blockers · *after 30*
- [x] **WP-51 Page-flip animation** — added 2026-08-05, shipped 2026-08-06. The
  page now pivots about the spine instead of sliding: `rotateY` 0 → −118° under
  `perspective(1600px)`, origin at the left edge, with a shade that fades to the
  page colour as the sheet goes edge-on so what shows past halfway is the blank
  *back* of the page. Forwards moves one copy (the outgoing page); **backwards
  moves the arriving one and therefore needs two** — a still page to land on and
  a copy of the strip flipping onto it. Within-section turns scroll instantly
  now and take their movement from the flip instead. Same `MOVE_MS` and curve as
  every other move; reduced motion still gets the instant change. Page *curl*
  was never promised and is still not built · *after 14*
- [x] **WP-52 Drawer navigation + the bookshelf Home** — added and shipped
  2026-08-05, from a reference screenshot the reader shared. The bottom tab bar
  is gone: Home is the front door, and All Books / Stats / Settings are
  occasional, so they moved into a left drawer behind a ☰ in a new sticky top
  bar. Opening it frosts the page behind (blur + dim + `pointer-events: none`)
  and locks body scroll; Escape, the scrim and any navigation all close it, and
  focus returns to the ☰. Home is three shelves — Current Reading, Up Next,
  Unread — each its own card with a gradient "plank" under the covers, and only
  Unread carries **View All** (→ `/library`), because only Unread is capped.
  Finished no longer appears on Home. Purely UI/navigation; no data or
  repository change · *after 46*
- [x] **WP-53 Library redesign — views, filters, folders, swipe** — added and
  shipped 2026-08-06, from two reference screenshots (a Kindle-like list and a
  two-column grid). List and grid views from one component, so the scroll
  position survives the switch and a badge can't be added to one and forgotten
  in the other; search across title, author and folder name; filters for
  reading status, content type and folder, plus eight sort orders; a floating
  "+" replacing the import panel; long press for selection, replacing the
  Select button and the per-row shelf picker; and horizontal swipe between
  Home ↔ Library ↔ Stats ↔ Settings, with Home added to the drawer to match.
  **The one data change is folders** — a `folders` table (schema v8) and an
  indexed `folderId` on a book, one folder per book, and deleting a folder
  unfiles its books rather than deleting them. The rules that can be *wrong*
  (what shows, in what order, how far through) live in `src/library/` as pure
  tested functions; the screen is a shell over them. Fast-followed the same day
  with three phone-reported faults — see `progress.md` · *after 52*
- [x] **WP-54 Library navigation, filter row, and folders** — added and shipped
  2026-08-08, from a phone report plus a reference screenshot. Four parts. **The
  scroll bug**: every tab screen now keeps its own position, because the four
  share one scroller (the document) and a hidden screen has no height, so the
  browser clamped the offset on every tab change and the two screens overwrote
  each other. **The filter row**: sort, reading progress, folders, reading
  status and view moved out of the sheet onto the shelf; controls with exactly
  two settings switch on the tap; reading progress became a filter in quarters
  rather than a sort, and sorting by folder was dropped since folders have their
  own control. **Unread and Finished** are folders computed from reading
  progress — no rows, so nothing can drift out of step with a book's own
  progress bar. **A book can be in several folders** (schema v9, `*folderIds`
  multiEntry, migrated from v8's single `folderId`), which overturns WP-53's
  "one folder per book" — the shelf still shows each book once, which is what
  keeps it a folder and not a tag · *after 53*
- [x] **WP-55 The reading screen, the launch, and the scroller that was never
  there** — added and shipped 2026-08-08, eleven commits, all on `main`. Closes
  **WP-14**. Five strands. **The scroll bug was never what WP-54 said it was**:
  `index.css` carried `overflow-x: hidden` on `html, body` *together*, which
  propagates the root's overflow to the viewport and then leaves the body its
  own — making the body a scroll container one viewport tall. Every reader and
  writer of the position talks to the `window`, so none of it ran at all
  (`window.scrollY` measured 0 always, a window scroll listener never fired
  once). `overflow-x` on `html` alone; the drawer's lock had the same bug and
  now locks the root. **One toolbar**: back / search / Aa / ⋯ at the top,
  slider alone at the bottom, Contents-Bookmarks-Notes moved into the menu, and
  the bookmark became the page's top-right corner rather than a control for
  *the book* sitting among controls for *this page*. **Bookmarks and search**
  (schema **v10**, new table, cascade on delete) — bookmarks anchor to a
  paragraph, never a page number, because type size is two taps away.
  **The page scales back for the toolbar** instead of hiding under it or paying
  a standing margin: a transform, because a box that genuinely resized would
  re-flow the columns and change the page under the reader's thumb. **The
  launch screen and one tempo** — a splash in `index.html` (inline, or it would
  arrive after the wait it covers), the saved theme applied before first paint,
  and ten hand-picked durations collapsed to three motion tokens. **Measured**
  in headless Chromium on 2026-08-09 — twelve checks, all passing, and the 85%
  scale confirmed at 85.0% with both bars clearing the text. **Fast-followed the
  same day**: raising the toolbar shrinks the page, and a back gesture left the
  book instead of undoing that — the toolbar was the one layer never wired to
  `useBackDismiss`, and Back now peels one layer at a time · *after 54*
- [x] **WP-56 The cloud library — Supabase + Cloudflare R2** — added and shipped
  2026-08-09/10, never had a waypoint until now. A second `Repository`
  implementation behind the same interface `storage/db.ts` already satisfied, so
  ~30 call sites never learned it existed. Postgres holds the rows and Row Level
  Security holds the door; the bytes — the source file, the pictures, and as of
  2026-08-10 **the text itself** — live in R2, reached by presigned URL so they
  never transit our server. Email-link sign-in, a Settings toggle that reloads
  rather than swapping the object underneath thirty caches, and a book count
  under the option that *isn't* selected, because an empty shelf and a lost
  library look identical from the outside. **Switching is a change of view, not
  a migration** — which is exactly the gap WP-57 and WP-58 exist to close ·
  *after 03,30*
- [x] **WP-57 Copy a library between device and cloud** — shipped 2026-08-10
  (`7ff0415`). `storage/transfer.ts` reads through one `Repository` and writes
  through the other, so it never learns which direction it is pointing — which
  is what let WP-58 reuse it whole. An import writes to

  whichever backend is selected and only that one, so today the only way to have
  a book in both is to import the file twice. This is the "push my 32 books up"
  button, and its reverse. Reads through one `Repository` and writes through the
  other, book by book so a dropped signal costs one book rather than the run;
  skips what is already there by `contentHash`; re-uploads the source and the
  pictures from the device copy rather than re-parsing, since the parse is the
  expensive half and the bytes are already sitting there. **Needs a real
  progress screen** — 32 books is minutes, not seconds, and a silent spinner
  over a multi-minute upload is indistinguishable from a hang · *after 56*
- [x] **WP-58 Keep cloud books readable offline** — **closed 2026-08-10.**
  Reading offline landed first (`5476ac6`, `23e3787`, `39773be`): the conflict
  decision is settled in `decisions.md`, `storage/cache.ts` is a second database
  filled by WP-57's copier, `cloud/cached.ts` falls back to it on a lost-signal
  failure, and at most 20 books are kept, least recently read dropped first.
  **The write queue then closed it** (`50b3f94`, `cloud/outbox.ts`) and was
  verified on the phone: a bookmark made with no signal survived a force-quit.
  The shelf listing is kept for *every* book (`cloud/shelf.ts`), so an offline
  library shows all 33 with the unopenable ones greyed rather than 1 of 33.
  Original framing: today the toggle is a choice
  between "works on a train" and "follows me to my laptop", and WP-57 does not
  fix that: it copies once, it doesn't keep two libraries honest. The cloud
  stays the source of truth; books you have opened get kept on the device and
  served from there when the network is gone. **The seam already exists** — the
  2026-08-10 text move means every read of a book's bytes goes through one
  chapter-object fetch, which is the single place a cache belongs. The hard part
  is not the cache, it is deciding what happens when a bookmark is made offline
  and the same book is read elsewhere — so this waypoint owes a decision on
  conflict before it owes any code · *after 56, better after 57*
- [~] **WP-59 Book metadata from Google Books, and the Stats tab** — added
  2026-08-10, the reader's call. Import reads only **title and author** today;
  everything a Stats screen wants — page count, categories, average rating —
  comes from a catalogue, not from the file. Four steps: (1) **`finishedAt`** —
  *done* (`4f9175c`), the day a book was finished, written once and never moved,
  because a position's `at` is the last page turn and would silently carry a book
  out of one year into the next; (2) **ISBN and publisher out of the EPUB's own
  OPF** (`dc:identifier`, `dc:publisher`) — no network, no key, the parser simply
  ignores fields already sitting in the file, and this is the lookup key;
  (3) **the Google Books lookup through `api/`** — never a `VITE_` variable,
  which would compile the key into every visitor's JavaScript; (4) **Stats**:
  genres read, pages read this year, the reader's rating against the average.
  **Pages read = finished books × the print edition's page count** — the
  reader's own simplification, and the reason there is deliberately no
  reading-events log. A part-read book shows an approximation, percent × page
  count · *after 11; step 1 done, step 2 needs no API at all*
- [ ] **WP-25 Highlights & notes list** — dedicated per-book view · *after 17,03*
- [ ] **WP-26 Vocabulary / glossary view** — surfaced from learner.md · *after 22*
- [ ] **WP-27 Cost / usage visibility** — per-book/session/model-tier screen · *after 19*
- [ ] **WP-28 Books-stay-separate guard** — no cross-book memory/lookups · *after 18,22*

### Leg 5 — Landfall (deploy, install, backup)
- [ ] **WP-29 Tiny key backend** — one endpoint holding the API key · *after 19*
- [x] **WP-30 PWA manifest + service worker** — installable, offline caching · *after 04*
- [x] **WP-31 mkcert HTTPS + phone trust** — local cert, one-time trust, LAN serve · *after 30*
- [x] **WP-32 Install on iOS + Android** — add-to-home-screen, verify offline · *after 31*
- [ ] **WP-33 Google Drive backup/restore** — opt-in Settings toggle, off by default · *after 25*
- [ ] **WP-34 Retire the Tauri shell** — drop the disposable harness · *last, after 32*

---

## Reader's feature wishlist — captured 2026-08-02

> Raised by the reader after WP-11, to be discussed when the relevant leg comes
> up. Not scheduled. Most of it lands inside waypoints that already exist —
> the `→ WP-nn` notes say where, so this list stays a wishlist and the legs above
> stay the plan. Items marked **NEW** have no home yet and need a waypoint (or a
> decision to decline) before they can be built.

### Library — finding the next book
- Rename a book → **NEW** (small; pairs with reading real title/author out of EPUB and docx metadata, since titles are filename-derived today)
- ~~Search the library~~ → **shipped WP-53.** Title, author and folder name.
- ~~Filter by status (Unread / Reading / Finished)~~ → **shipped WP-53.**
- ~~Sort: recently read, recently added, title, author~~ → **shipped WP-53**;
  reworked in **WP-54** into one control per question, each switching on the tap.
  Sorting by *reading progress* became a filter in quarters and sorting by
  *folder* was dropped, both because they had become a different control on the
  same row. "Last modified" was declined — nothing records it, and a sort that
  silently duplicates "recently added" lies.
- ~~Cover images~~ → shipped; on the shelf, the grid and the detail page.
- Continue Reading → WP-24, needs WP-15
- ~~Reading progress (% and last location)~~ → **shipped WP-53** on the shelf:
  a bar in list view, a percentage in grid, "Finished" instead of "100%".
- Import folder / watch a directory → **NEW, low priority.** Folder *import* shipped in WP-11: a one-time scan when you point at a folder. *Watching* means new files landing in that folder appear on the shelf by themselves, and a web page can't do that — it can't look at the disk unprompted and isn't running with the tab closed. Possible via the Tauri shell, or via the File System Access API, which still only notices on next open. The gap it closes is one drag of a folder; revisit only if books start arriving often and to a fixed folder.
- Favourites / pin important books → **NEW** (small). **Cheap now**: a boolean
  on `BookMeta`, one field on `LibraryPrefs`, one clause in `matchesFilters` and
  a chip in the filter sheet. WP-53 built the filter chain to take exactly this,
  and WP-54's reading-progress bands are the worked example of adding one.
- Tags → **NEW, and now much closer than it was.** This used to read "folders
  are one-per-book, tags are many-to-many and need a join table" — but **WP-54
  made folder membership many** at the reader's request (`BookMeta.folderIds`,
  multiEntry index). The storage shape a tag needs already exists. What is still
  genuinely different is the *meaning*: a folder answers "where does this live"
  and shows one at a time; a tag answers "what is this about" and is asked in
  combination. Build it as a second field beside `folderIds`, not as a rename of
  it — the search haystack is still built in one function so tags are one more
  line there.
- Archive instead of delete → **NEW** (small, sits in WP-24)
- Recently opened list → **NEW** (small, needs WP-15)
- Rate a book on finishing, then 5 recommendations: 2 by the same author, 3 on the topic by others → **NEW, and the largest item here.** Needs a book-metadata source we don't have — the shelf only knows what's been imported, so recommendations must come from Claude. Worth its own waypoint, after WP-19.

  **Decided 2026-08-02 — the trigger and cost rules, which are the whole design:**
  - Reaching the last page shows a prompt only: *"Would you like recommendations?"* No API call happens until it's accepted. Landing on the last page by accident costs nothing.
  - On acceptance, Claude is called **once per book, ever**, and the answer is stored with the book. Reopening the finished book shows the saved list; it never calls again.
  - So the recommendation is a stored property of a finished book, not a live lookup. Design it that way from the start — a call-and-cache added afterwards tends to leak repeat calls.
  - Only ever at the end of a book. That is what keeps it clear of "no recommendations everywhere" below.

### Reading experience
- Adjustable font, line spacing, margins → WP-14
- Theme: light / dark / sepia → WP-14 (day/night exists; sepia is the addition)
- Full-screen reading → **Focus Mode**, below
- Keyboard shortcuts, plus mobile equivalents where they apply → WP-14
- Table of contents, chapter navigation → WP-13
- Estimated time remaining in chapter and in book → **NEW** (small once WP-12 knows section lengths)
- Reading streak → **NEW**, optional, and in tension with the "no streak pressure" rule below. If built, it must never nag.

### Navigation
- Back button (return to previous location) → WP-13
- Jump to page/location, jump to chapter → WP-13
- Reading history → **NEW** (needs WP-15)

### Bookmarks — kept separate from notes
- Bookmark a page, name a bookmark, list bookmarks → WP-14

### Highlights
- Four colours with fixed meanings: yellow = important, blue = question, green = insight, red = confusing → WP-17 (colour semantics are **NEW** on top of it)
- Tap a paragraph or drag across text → prompt offering highlight (by colour), define, pronounce, copy, search → WP-17. Pronounce leans on WP-16's TTS.
- Search opens a scrollable pop-up of results, each labelled with its chapter and page → **NEW**, overlaps WP-14's in-book search but the result-with-location pop-up is its own piece of work.

### AI notebook
- Collects highlights, notes, questions and AI conversations, organised by chapter automatically → WP-25 (highlights/notes) + WP-20 (saved Q&A). Auto-organisation by chapter falls out of anchors for free.

### Reading analytics — deliberately minimal
- Current book, progress, last read, reading time, books completed → **NEW** (needs WP-15)
- Reading challenge set by the reader, tracked by month and year → **NEW**
- Explicitly skipped: badges, XP, leaderboards, coins, daily rewards — they optimise for app engagement rather than reading.

### Quality of life
- Auto-save reading position → WP-15
- Undo an accidental highlight → WP-17
- Export notes, export highlights → WP-25
- Offline reading, with cloud sync that catches up when back online → WP-30 (offline) + WP-33 (sync). Note the ordering: the app is local-first and already works offline; the *sync* half is the new part.
- Open multiple books at once → **NEW**, and in tension with WP-28 (books stay separate). Separate *memory* and separate *tabs* aren't the same thing, but the guard needs checking first.
- Recently closed books → **NEW** (small)
- Persistent search within a book, find next/previous, remember last search → WP-14

### Explicitly declined
Social feeds · public comments · reading leaderboards · achievement badges ·
recommendations scattered everywhere · AI that interrupts on its own · daily
challenges · streak pressure · notifications while reading · infinite discovery
pages. All of these pull attention toward the app and away from the book.

### Focus Mode — **NEW**, and the reader's own idea
A toggle the reader turns on and off. While on, the screen is text and
Previous / Next: no library, settings, AI panel, progress statistics or chapter
list on display. AI stays available but only on an explicit selection or
shortcut — it never appears on its own.

**Decided 2026-08-02 — hidden, not removed.** Everything stays *reachable* while
Focus Mode is on: pages left, progress, current chapter, going back, highlights,
all of it, on demand. Focus Mode quiets the interface; it doesn't amputate it.

> Which settles the shape of the reader, and it's cheaper to settle now than
> after WP-12: build the bare page as the baseline and let the chrome appear on
> demand, rather than building full chrome and adding a switch that hides it.
> Both look identical with the toggle off — but only the first one makes
> "everything is still one gesture away" fall out naturally instead of needing to
> be retrofitted per control. **The goal: less a content platform, more a quiet
> reading desk.**
