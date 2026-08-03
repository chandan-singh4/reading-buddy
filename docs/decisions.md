> **What's in here (read when a "why is it this way?" question comes up, or
> before changing an architectural choice).** The finalized, load-bearing
> decisions from the Wayfinder Map spec — the ones that constrain how features get
> built. Each is a one-liner: the decision plus, where it matters, the reason.
> Treat these as settled; if a session wants to reverse one, flag it to me first
> and append the change here with a date. Not needed during routine building —
> only when a choice is in question. Grouped by area.

---

### Architecture / retrieval
- **Address-based retrieval.** A book parses once into a folder tree where the
  path *is* the address (`/book/ch02/index.md`, `s03.md`, anchors like
  `[ch02-s03-p013]`). A query loads `manifest.md` + the chapter index + one
  section file — never the whole book. This is the entire token strategy.
- **Anchors are permanent** once assigned.
- **Books stay fully separate** — no cross-book memory or lookups, ever.
- **One shared parser, five front-ends.** epub / pdf / md / txt / docx all feed one
  structure. PDF adds a running-header/footer filter; md resolves to whichever
  heading levels exist; all fall back to fixed-size bucketing. *(Was three
  front-ends; txt and docx added 2026-08-02.)*

### Product / platform
- **Target is a mobile-first installable PWA.** The Tauri desktop shell is a
  disposable dev/test surface, retired at the end (WP-34). The web UI is the asset.
- **Import via in-app file picker**, never OS file-type association; books always
  reopen from the in-app library.
- **.epub / .pdf / .md all ship in the first build.**

### The tutor
- **Book-type gating.** Classified light-fiction vs dense/technical at import
  (manual override). Gating drives the whole tutor apparatus; a novel gets only
  Highlight / Copy / Define / Ask.
- **Persona** is a domain-expert tutor blend, teaching-first; prerequisite gaps
  identified by live judgment, not a precomputed dependency map.
- **12 named teaching modes** as quick-taps, dense books only.
- **learner.md** tracks understood/struggled concepts, working analogies, and
  misconceptions; read into every Ask; actively shortens re-explanations.
- **Chapter recap** = precomputed zero-token summary + "things learned" (from
  saved notes) + optional cheap live quiz; quiz misses feed learner.md.

### Claude API
- **Tiered models:** Haiku 4.5 for the first 5 exchanges per thread, then
  Sonnet 5. Prompt caching on. Errors surface as a retry button. Responses stream
  and stay concise regardless of selection length.
- **Key** lives in env-var / OS secret now, moving behind a small backend endpoint
  once the phone can reach it.

### Session tooling
- **Build board stays static, no live persistence.** `wayfinder_build_board.html`
  mirrors `docs/backlog.md`'s 34 waypoints for an at-a-glance view; its
  `window.storage` calls don't work unpublished, so clicking cards won't save.
  `docs/backlog.md` is the single source of truth — `/wrap-session` mirrors any
  flipped checkbox into the board's baked-in `state` object. — 2026-08-01

### Settled 2026-08-01 (build session 1)
- **WP-05 runs before WP-03**, reversing the backlog's order, so the storage
  layer is built to fit a settled schema rather than the reverse. — 2026-08-01
- **The parsed-book folder tree is a mental model, not a filesystem.** A browser
  PWA has no disk; paths are realised as IndexedDB keys (`ch02/s03`). The
  address rule is unchanged — only the lookup mechanism. — 2026-08-01
- **One row per section**, keyed `[bookId+path]`. Compound key so identical
  addresses in different books can't collide; direct lookup, no scan. Chosen
  over a per-book blob, which would defeat the token strategy *and* be slower on
  a phone. — 2026-08-01
- **No `loadBook()` in the repository, deliberately.** Retrieval is manifest +
  chapter index + one section. A whole-book read would get used the moment it
  existed and quietly undo the token strategy. — 2026-08-01
- **Anchors are strict, not forgiving.** `[ch2-s3-p13]` is rejected rather than
  repaired into canonical form: anchors are permanent, and two spellings of one
  paragraph would silently mis-address saved highlights. — 2026-08-01
- **Vitest is the test runner**; component tests opt into jsdom per file so pure
  unit tests stay on the faster node environment. — 2026-08-01
- **All styling flows from tokens in `web/src/styles/theme.css`** — no hard-coded
  colour or spacing in components, so WP-14's day/night toggle is one
  `data-theme` attribute. — 2026-08-01
- **Product is "Reading Buddy".** *Wayfinder* was the planning method used to map
  the build; it survives only in planning artefacts. — 2026-08-01

### Settled 2026-08-02 (build session 2 — the parsing front)
- **Waypoint numbers are never reused or renumbered.** New work is appended
  (WP-35…39) and build order is carried by the `after N` dependency notes, not by
  the number. Renumbering would have meant rewriting ~79 references across 13
  files including source, and every older note would silently point at the wrong
  task. — 2026-08-02
- **`.azw3` / `.kfx` declined.** KFX is a proprietary DRM-encrypted container;
  reading it means circumventing DRM. Users convert to EPUB in Calibre. — 2026-08-02
- **Epub is parsed directly (`fflate` + the OPF spine), not with epub.js.**
  epub.js is a *renderer* that wants to paginate into an iframe and own the
  screen; we have our own renderer and anchor grammar. ~200 lines we control beats
  fighting a library over layout. — 2026-08-02
- **One shared block stream.** Every format's front end emits `Block[]`;
  `parse/assemble.ts` turns any stream into a `ParsedBook`. Level resolution, the
  heading-free fallback and anchoring therefore exist in exactly one place. — 2026-08-02
- **PDF is split pure/impure**: `pdf.ts` wraps pdf.js, `pdf-layout.ts` is pure
  geometry. The heuristics are the risk, and this makes them unit-testable without
  a binary fixture. — 2026-08-02
- **pdf and docx are lazy-loaded**, and `mammoth` is aliased to its browser build
  in `vite.config.ts` so tests exercise the same path the phone runs. — 2026-08-02

### Settled 2026-08-03 (bug fixes + first deploy)
- **Vercel hosts the deployed app**, connected to GitHub, auto-deploying on
  every push to `main`. Root Directory is set to `web/` in the Vercel project
  (the app isn't at the repo root), which lets Vercel auto-detect Vite with no
  custom build/output config. — 2026-08-03
- **The Anthropic key's production home is Vercel's own Environment Variables
  setting, never a committed file.** A local `.env` (gitignored) covers dev;
  `.env.example` is the checked-in template for both. — 2026-08-03
- **A figure's caption shows the real `figcaption` (`label`) only once its
  picture actually renders.** The parser's `[Figure: ...]` placeholder text is
  for the degraded case (no picture shown at all) — showing it next to a
  working image just repeated "[Figure]" under every plate. — 2026-08-03
- **Every touch on the reading screen is handled by the app, never the
  browser.** `touch-action: pan-x` on the page-turn element and
  `overscroll-behavior: none` (both axes, was x-only) on `html`/`body` stop a
  not-quite-horizontal swipe from being read as a scroll attempt — which on
  mobile also animates the address bar and was making the screen visibly bob.
  — 2026-08-03
- **Theme and reading font are applied to `<html>` once at app boot**
  (`main.tsx`'s `applyStoredTheme()`), not only while the Reader is mounted.
  They're a whole-app setting, so every screen has to show the reader's
  actual choice from the first paint — not the OS's `prefers-color-scheme`
  guess until a book happens to be opened. `Reader.tsx` calls the same
  function for live updates while the Aa tab is open. — 2026-08-03
- **Automatic title cleanup is best-effort; manual rename is the guaranteed
  fallback.** Some epubs' `<dc:title>` is a citation dump with no
  punctuation between fields (title, author, publisher, ISBN, a hash, a
  source credit) — `cleanTitle` cuts at the earliest recognisable field, but
  a subtitle with none of those markers can't be told apart from the real
  title algorithmically. Rather than chase a heuristic that will never be
  perfect, the book's detail page got a manual rename
  (`repository.renameBook`) instead. — 2026-08-03
- **Plain-text heading detection is gated on word count**, not just length: a
  58-character sentence opening "Chapter four was…" otherwise became a chapter.
  False positives mis-anchor prose permanently; missed headings only cost a
  break. — 2026-08-02
- **Columns are separated before lines are formed** in PDF. Both columns share
  baselines, so grouping by `y` first welds text across the gutter. — 2026-08-02
- **`Paragraph.kind` is required, not optional** (WP-38). Ten values; finer
  distinctions go in `label`. Required forces every parser to say what a block is
  rather than defaulting silently. — 2026-08-02
- **Furniture is dropped before anchoring.** Running heads, page numbers, the ToC
  and the index are recognised only so they never consume a permanent anchor. — 2026-08-02
- **WP-38 runs before WP-11.** Block kinds change paragraph numbering, and anchors
  are permanent once a real book is imported — doing it after would silently
  mis-address every highlight following the first table in a book. — 2026-08-02

### Settled 2026-08-02 (build session 3 — the navigation feel)

- **REVERSAL — page numbers come back, but they are counted from words, not from
  the screen.** The 2026-08-02 rule "no page numbers anywhere" is superseded. It
  was right about the *failure* — a screen-derived page number changes with the
  font, so it describes the phone rather than the book — and wrong about the
  *remedy*, because the reader wants Google Books' "Page 250 of 338" and there is
  an honest way to give it: **a page is a fixed chunk of the book's own text**
  (Kindle's "locations" idea). Word counts don't move when the font does, so the
  total is a permanent property of the book, computable from the manifest without
  laying anything out. Accepted cost, and the reader accepted it explicitly: a
  visible page-flip will sometimes not advance the number, and sometimes advance
  it by two. Google Books behaves the same way and it did not bother them.
  — 2026-08-02
- **"Chapter 5 of 12" is not deleted, it is demoted.** `progressLabel` stays; it
  becomes one state of the bar rather than the only thing the bar can say. — 2026-08-02
- **The bottom bar is a three-state cycle**, driven by tapping the bar itself:
  *page position* → *pages left in this chapter* → *nothing at all*. The
  percentage rides with states 1 and 2 and disappears with state 3. Modelled
  directly on Google Books, which the reader uses daily. — 2026-08-02
- **Two sliders, two jobs — the coarse one was not a placeholder.** The
  chapter-coarse slider from WP-13 moves you *near* somewhere; the new fine
  slider moves one page at a time. Google Books shows the fine one; the contents
  list already covers the coarse jump, so the fine slider replaces it in the bar
  rather than joining it. — 2026-08-02
- **A page position is a paragraph, not a section.** Found by reading the real
  book: a chapter is often a *single* section running a dozen pages, so a
  slider that could only name a section sat still until it crossed a chapter
  boundary and then jumped fourteen pages. Resolving a page is therefore two
  steps — which section to load, then which paragraph inside it — and the second
  step is computed from the section already in memory, so it needs no stored
  data. The lesson generalises: **section granularity is not page granularity in
  a real book**, and WP-15 will want the paragraph anchor for the same reason.
  — 2026-08-02
- **Every page figure derives from one number: words behind you.** The bar, the
  percentage, the pages-left countdown and the slider all read the same offset.
  Computing any of them separately is how a bar ends up saying page 176 while
  the slider sits on 177. — 2026-08-02
- **The hamburger sheet ships with three tabs and only one filled.** Contents
  works now; Bookmarks (WP-14) and Notes (WP-25) render an empty state saying so.
  Building the shell once is cheaper than retrofitting tabs around a working
  contents list twice. — 2026-08-02

### Settled 2026-08-02 (build session 4 — reopening where you left off)
- **A reading place is an anchor, never a page number.** `WORDS_PER_PAGE` could
  change and a book can be re-imported by a better parser; every stored page
  number would then point somewhere slightly wrong with no way to tell.
  `[ch02-s03-p013]` names a paragraph, so either it's still there or it plainly
  isn't. — 2026-08-02
- **The place lives in its own `positions` table, not on `BookMeta`.** It is the
  only row written *while reading*, and putting it on the book row would rewrite
  the whole book record — title, fingerprints and all — every few seconds. It
  also keeps a reading habit separate from what a book *is*: "forget where I
  was" must not be able to damage the book. — 2026-08-02
- **Restoring blocks the first section fetch.** Loading chapter 1 and then
  hearing where the book should have opened costs a wasted read, shows a flash
  of the wrong page, and — worse — saves chapter 1 back over the position still
  being fetched. — 2026-08-02
- **A stale place is refused, not repaired.** An unparseable anchor, or one
  naming a chapter the book no longer has, opens the book at the beginning.
  Restoring it anyway lands the reader on "That part of the book is missing",
  which reads as the *book* being broken rather than the bookmark being old. A
  missing section or paragraph is deliberately *not* checked, because that would
  cost a chapter-index read to find out. — 2026-08-02
- **Arriving somewhere is guarded by the section's path, not by effect
  dependencies.** The spine loads a moment after the first section, and the
  landing effect re-running on it would scroll a reader back to the top — most
  visibly the one just restored. — 2026-08-02

### Settled 2026-08-02 (build session 5 — the phone)
- **The service worker is generated, not written.** Workbox `generateSW` via
  `vite-plugin-pwa`, `registerType: 'autoUpdate'`. Hand-writing one means owning
  cache invalidation, and a reading app serving a stale build after an update is
  a bug with no visible cause. — 2026-08-02
- **The parsers are excluded from the precache.** pdf.js (434 kB) and mammoth
  (500 kB) stay fetched-on-demand, which is what their lazy `import()` already
  arranges. Precaching them nearly triples the install download to support
  importing a format that may never be imported on the phone. App shell: 394 kB
  rather than 1301 kB. — 2026-08-02
- **Icons are generated by a script, not committed as PNGs.** `npm run icons`
  draws them from `theme.css`'s own colours, so the mark can't drift from the
  product, and a binary in a repo is a thing nobody can edit or explain later.
  No image library: PNG is a few chunks around a zlib stream and Node ships
  zlib. — 2026-08-02
- **iOS's duplicate meta tags are not duplication.** iOS ignores the web
  manifest's icons, display mode and theme colour entirely and reads
  `apple-touch-icon` / `apple-mobile-web-app-*` instead. Removing them as
  redundant gets you a screenshot for an icon. — 2026-08-02
- **Certificates are optional in `vite.config.ts`, not required.** They are
  gitignored (a private key, naming one machine), so the config falls back to
  HTTP when they're absent — otherwise a fresh checkout can't `npm run dev`.
  — 2026-08-02
- **`preview` is the phone target, not `dev`.** The service worker is off in
  development on purpose — one that caches while you edit is a lasting source of
  "why didn't my change appear?" — so anything about installing or offline has
  to be tested against the built app. — 2026-08-02

### Settled 2026-08-02 (build session 6 — the first phone session)
- **A back gesture must have something of its own to close.** In an installed
  app the back swipe belongs to the system: it cannot be refused by CSS or
  `preventDefault`. So an open panel pushes a history entry, and Back consumes
  *that* instead of leaving the book. The entry is taken back when the panel is
  closed by a tap, or the reader's next Back is silently swallowed — a dead
  gesture, which feels worse than the original bug. — 2026-08-02
- **Reading is vertical, so sideways movement is always a bug.** `overflow-x:
  hidden` and `overscroll-behavior-x: none` on the document. The second also
  stops Chrome's swipe-to-go-back, which on a reading screen meant a stray
  horizontal swipe leaving the book. — 2026-08-02
- **Any panel that covers the screen needs somewhere to tap to mean "no".** The
  contents sheet was `flex: 1` and ate every pixel between the bars, leaving the
  hamburger as the only way out. Capped at 65% with a dimmed scrim above it.
  — 2026-08-02
- **Folder import is a scan, not a subscription.** A web app cannot watch a
  folder: it is only alive while open and cannot read the disk unprompted. The
  answer is an explicit "check for new books" button (WP-43), never a promise of
  automatic import. — 2026-08-02
- **Build order set by the reader 2026-08-02: reading first, AI after.** Page
  turning, comfort settings and links come before the tutor loop. The app has to
  be worth opening as a *reader* before it is worth opening for anything else.
  — 2026-08-02

### Settled 2026-08-02 (build session 7 — page turning and links)
- **An installed app never loads again, so update checks can't hang off `load`.**
  Closing a PWA suspends it; the generated registration script only registered
  on the `load` event, so a new build was never found however many times the app
  was closed. Pull-to-refresh worked because it forced the load. Registration is
  ours now (`app/updates.ts`) and checks on `visibilitychange`. — 2026-08-02
- **Auto-update is only tolerable because WP-15 exists.** The new worker takes
  over and the page reloads without asking; a reload puts the reader back on the
  same paragraph. Without saved positions this would have to be a prompt.
  — 2026-08-02
- **The page strip is `overflow: hidden`, not `auto`.** Dragging a column strip
  by hand strands you between two pages. Every turn is programmatic and lands
  exactly on a column; `scrollLeft` still works when set from code. — 2026-08-02
- **`turnPage` is the seam, and it has two halves.** Within a section a turn is
  one column; at either end it becomes the section move it always was. Swipe,
  edge tap and Previous/Next all go through it, so none of them knows which
  happened. Turning back into a section lands on its **last** page — otherwise
  back-then-forward arrives somewhere the reader has never been. — 2026-08-02
- **A link is a range of a paragraph, not a block of its own.** Splitting a
  sentence around its links would shatter one thought into three and anchor each
  piece separately. Offsets, not a copy of the link's text — a paragraph can
  contain the same word twice. — 2026-08-02
- **Links are resolved after assembly, never during it.** A footnote marker
  points at a paragraph that does not exist yet while its own chapter is being
  assembled. `parse/links.ts` is a second pass over the finished book, called
  from `assembleBook` so no parser can forget it. — 2026-08-02
- **Epub qualifies ids and hrefs with their file.** Two chapters can each define
  `#note1`; unqualified, every footnote in the book would resolve to whichever
  chapter parsed first. — 2026-08-02
- **A link that resolves to nothing is dropped, not rendered.** A link that
  silently goes to the wrong place is worse than one that was never offered.
  — 2026-08-02
- **Internal links are `<button>`, external ones are `<a>`.** An internal link
  goes to a paragraph, not a URL; dressing it as an anchor would put a
  meaningless address in the status bar and offer "open in new tab" on something
  that cannot be opened in one. — 2026-08-02
- **Following a link must offer the way back.** A footnote throws you across the
  book; without a return, links are a trap. — 2026-08-02

- **A block assembled from several elements must join their links too.** Lists
  and multi-paragraph quotes were built with `textContent`, which keeps the words
  and drops every `<a>` — and a book's own contents page is a list, so contents
  entries were dead while footnotes in prose worked. One `joinParts` does the
  offset arithmetic for both. — 2026-08-02
- **The way back from a link names its page** ("Back to page 250"). "Where you
  were" is a promise the reader has to trust; a number is one they can check —
  and after a jump, the page you left is most of knowing where the jump put you.
  — 2026-08-02
- **Screen position is remembered by identity, never by pixel offset.** An offset
  is only meaningful against the page it was measured on: restore it while the
  list is still loading and it gets clamped, restore it after a book was removed
  and it points at a different one. The shelf remembers *which book* was opened.
  — 2026-08-02
- **"Select all" means everything currently on screen.** With a search typed,
  ticking books the reader cannot see and then deleting them would be the worst
  bug the library screen could have. — 2026-08-02

### Pictures
- **A book's images are stored as blobs in their own table**, keyed by the
  archive path the figure already carries — not inlined into the section, which
  is read on every page turn and would then carry a megabyte of base64. Fetched
  per section and revoked on the way out. — 2026-08-02
- **Images are written outside the import transaction**, like the kept source
  file: the text is the book and the pictures are a convenience, so a full phone
  loses plates, never the book. — 2026-08-02

### UX misc
- **Select → inline popup** (not a side panel). Ask is the only action that calls
  Claude; every Ask auto-saves a plain-language Q&A note.
- **Nav overlay** is Google-Books-style (tap-fade, bottom slider, left ToC icon).
- **Reader ships:** font/spacing, day/night, bookmarks, in-book search,
  reopen-where-left-off, read-aloud (phone TTS).
- **Cost visibility** = detailed per-book / per-session / per-model-tier screen.
- **Google Drive backup/restore** is opt-in, off by default.
- **Install path:** mkcert local HTTPS, one-time manual trust per phone.
