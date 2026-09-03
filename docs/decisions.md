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

### Settled 2026-08-05 (four phone rounds: divisions, titles, links, feel)
- **An epub's spine boundary is a page break, not a section break.** The
  publisher's own division (cover, copyright, dedication, preface are separate
  documents) is recorded as `startsPage` on a block and rendered as
  `break-before: column`. Making it a *section* would have shredded the
  contents list on books that spread one chapter over several files, and
  sections are the navigation and the anchor grammar. — 2026-08-05
- **A run-together subtitle is cut from a shelf title**, on the reader's
  explicit instruction after being shown the cost. The signal is a
  *capitalised* article mid-string — title case leaves them lowercase
  mid-title — guarded by a minimum of words either side, a preceding comma and
  a preceding preposition. It is a guess and will occasionally be wrong; the
  manual rename on the detail page is the way back. — 2026-08-05
- **`TITLE_CLEAN_VERSION` is separate from `PARSER_VERSION` and this is why
  it earns its keep:** three title rounds shipped this session and every one
  reached the reader's existing 32 books at next boot, with no re-import and no
  kept source file. — 2026-08-05
- **A consumed heading's ids are inherited by the block beneath it.** A heading
  that opens a chapter becomes that division's title and the block is
  discarded; headings are the commonest link target in a book, so this was
  silently killing links that had nothing wrong with them. — 2026-08-05
- **An unresolvable link falls back to the document it points into** rather
  than being dropped. The right page beats nowhere, and a marker that renders
  as plain text looks like a bug in the book. — 2026-08-05
- **A `<br>` is a real newline in `text`, never a space.** The lines of an
  imprint, an address or a verse are not one sentence; `white-space: pre-line`
  honours it, the same newline lists already use. — 2026-08-05
- **Nothing on the reading screen animates from zero opacity.** Fading a whole
  screen up from nothing lets the background flash through, which reads as a
  camera shutter rather than as motion — the reader's own description. The page
  beneath is the same colour as the page above it, so there was never anything
  to cover. — 2026-08-05
- **A page turn is eased at both ends** (`0.4, 0, 0.2, 1` over 380 ms), not
  front-loaded. Words are the thing being looked at, not a UI element being
  dismissed: the motion has to respect that a line is still being read as it
  starts. — 2026-08-05
- **The app asks before it updates** (`registerType: 'prompt'`), and the book
  stays visible behind the panel, blurred rather than blacked out, so no place
  looks lost. Known one-time cost: clients installed under `autoUpdate` cannot
  ask a waiting worker to activate and need one manual app close. — 2026-08-05
- **A link is a `<button>`, and a button is not a word.** `display: inline`,
  `text-align: inherit`, `white-space: inherit` — the browser defaults make it
  a box that cannot break across a line or a column, which is how text escaped
  the page edge. Paired with a general rule that no child of `.page` may exceed
  its column, since there is no gap between columns for anything to spill
  into. — 2026-08-05
- **The reading columns have a gap, and a page is a column *plus* its gap.**
  Superseding the line above: flush columns had nothing to absorb a turn that
  lands short, and one always does — the browser caps `scrollLeft` at
  `scrollWidth - clientWidth`, rounding both to whole pixels while the real
  column is fractional, so the last page of a section parks a fraction short and
  the previous page's ink shows. A gap costs no reading width (the column is
  still one box wide) and turns any residual misalignment into blank paper,
  which is why it beats better rounding — it does not depend on the error being
  small. `Strip.pageWidth` is the pitch; `measure()` reads the gap off the
  computed style so the stylesheet stays the only place it is set. — 2026-08-05
- **An internal link is a `<span role="link">`, never a `<button>`.** Also
  superseding the line above, which was wrong on the point it turned on: a
  button is a *box* whatever its `display` says. Measured in Chrome — a button
  holding a long contents entry reports one line box where the same text in a
  span reports two — and a box is laid out whole, so it cannot break across a
  line or a column and the column edge cuts off the rest. Enter and Space are
  handled by hand to give back what the element loses. — 2026-08-05
- **The no-wider-than-the-column guard applies at every depth, not to direct
  children.** `.page > *` never reached anything *inside* a block, and the
  default that bites is `min-width: auto` on grid and flex children — "never
  narrower than my contents" — which is why the contents list (a grid) could
  push its own items past the page. `.page *` sets `max-width: 100%` and
  `min-width: 0`; a table is exempted by element selector because
  `.tableScroll` means it to be wider. — 2026-08-05
- **Navigation is a left drawer, not a bottom tab bar.** Home is the front door
  and All Books / Stats / Settings are occasional — they do not each earn a
  permanent quarter of the bottom edge, and four tabs on a reading app spend
  the screen's most valuable strip on things a reader touches rarely. Home is
  therefore not *in* the drawer either: it is the screen the ☰ is sitting on.
  — 2026-08-05
- **The frosted page behind the drawer is blurred on a wrapper that is a
  *sibling* of the drawer, never its ancestor.** A CSS `filter` makes an element
  a containing block for fixed-position descendants, so a drawer nested inside
  the blurred element would be blurred along with the page it is supposed to sit
  in front of. The same rule already governs `UpdatePrompt`'s blur. The filter is
  written out at no-op values (`blur(0) saturate(1) brightness(1)`) rather than
  left as `none`, because a browser interpolates between two filter lists only
  when they have the same shape — `none → blur()` snaps. — 2026-08-05
- **Only a shelf that is holding something back gets "View All".** Unread is
  capped at ten of however many are owned; Current Reading is one book by
  definition and Up Next is three. A link on all three would promise more where
  there is no more. — 2026-08-05
- **A page turn is a rotation about the spine, not a slide.** A slide is what a
  *scroll* looks like, and it is the wrong metaphor for a thing with a binding.
  The two directions are not mirror images: turning forwards, the *outgoing*
  page moves and the arriving one is already on the strip beneath it, so one
  copy suffices; turning back, the *arriving* page moves and the page being left
  has to stay visible underneath for the whole turn, so it takes two copies —
  one still, one flipping onto it. Done with copies laid over the strip rather
  than by transforming the strip itself, so nothing here restyles or re-stacks
  an element React owns. — 2026-08-06
- **A copy of the strip is wrapped, never used bare.** The strip is a scrolling
  box, so anything laid over a copy of it at `inset: 0` lands at the copy's
  scroll *origin* — pages away from what is on screen. The flip's shading hangs
  on a non-scrolling wrapper with the scrolled copy inside it, and the wrapper is
  what gets rotated. — 2026-08-06
- **A book on the shelf is drawn with shadows and pseudo-elements, never a 3D
  transform.** A rotated element carries its own width with it and pulls the row
  out of alignment, which is the exact fault the same change was fixing. Spine
  and page edges — the asymmetry — are what make a rectangle read as a book;
  shadow alone never does. — 2026-08-06
- **Covers may be guessed at, but only strictly.** Behind the two standard
  declarations (`properties="cover-image"`, `<meta name="cover">`), which
  conversion tools drop routinely, sit two inferences: a manifest image plainly
  called "cover", and the lone picture on the book's own cover page. The guards
  matter more than the guesses — a page with more than a dozen words is a
  chapter, several pictures is a title page, and a book that is a single
  document has no separate cover page at all. A publisher's colophon on the
  shelf is worse than a placeholder. — 2026-08-06
- **Shelf tiles align by their tops, never their bottoms.** Bottom alignment
  pushes a book with a short title down; every cover is the same width and the
  same 2:3 shape, so one top edge gives one baseline under the covers for free.
  — 2026-08-06
- **Work ships at the end of every thread.** Build, commit, merge to `main`,
  push — Vercel deploys from `main`, so anything left on a branch is invisible to
  the reader. This deliberately overrides `/wrap-session`'s older "do not commit
  or push unless I ask". — 2026-08-06
- **A book belongs to at most one folder.** A book in several places is a *tag*,
  which is a different feature with a different shape — a join table, no
  partition of the library, and nothing for a "sort by folder" to sort by.
  Building the first as though it were the second gets neither right. The seam
  for tags is left open: the search haystack is built in one function so tags
  become one more line in it. — 2026-08-06
- **Deleting a folder never deletes the books in it.** A folder is a label on a
  shelf, not a box with a bottom; the books are unfiled in the same transaction.
  This is the single most destructive misreading the library could make, and
  there is no undo — the original files were never kept. — 2026-08-06
- **An empty filter list means "all", never "none".** Unticking the last reading
  status is a reader asking to stop filtering, not asking for a blank shelf —
  and a folder filter pointing at a folder since deleted hides nothing, because
  an empty library behind a name that no longer exists reads as "my books are
  gone". Whenever a filter is narrowing the shelf, the screen says so and offers
  one tap to clear it. — 2026-08-06
- **Sort is one flat list, not a field plus a direction.** Two fields would
  allow "recently added, A→Z", which is not a thing. Direction only means
  something for title and author, and a menu offering meaningless combinations
  is a menu the reader has to think their way past. "Last modified" was declined
  outright rather than faked: nothing records it. — 2026-08-06
- **List and grid are one component, not two.** They show the same facts and
  differ only in layout, so two components would mean adding every future badge
  twice and finding out from a screenshot that the second was forgotten. It is
  also what makes the scroll position survive the switch, since the same
  elements stay in the same order. — 2026-08-06
- **`position: fixed` does not work inside the app frame — use `app/Portal.tsx`.**
  `AppShell`'s frame carries a CSS `filter` permanently, at no-op values, so the
  drawer's blur animates rather than snapping; an element with a filter is a
  containing block for every fixed descendant. "Fixed to the screen" therefore
  means "fixed to the whole scrolling document". This cost two rounds — the
  drawer, then the library's floating "+" and filter sheet — so it is a rule
  now, not a caution. Portalled things stay below the drawer's z-index. — 2026-08-06
- **A touch gesture is judged on `pointermove`, not on `pointerup`.** A browser
  seizes a pan after a few pixels and fires `pointercancel` instead, carrying
  stale coordinates — so measuring at `pointerup` measures nothing. A screen
  that owns horizontal gestures must also claim them with `touch-action`
  (`pan-y pinch-zoom` on the shell, `pan-x` on the reading screen) or it is
  fighting the browser and losing. — 2026-08-06
- **Layout and gestures are verified on the phone or not at all.** jsdom has no
  layout and never cancels a pointer, and headless Chrome renders this app's
  root empty in every mode tried. Three faults shipped under 656 green tests
  because of this. A gesture test is only worth writing if it reproduces the
  real event sequence, cancel and all. — 2026-08-06
- **Tab screens are kept mounted, never rebuilt.** The shell used to key its
  content on the path, so every tab change destroyed the screen and built a new
  one — and a new `<img>` must be decoded again before it can paint, which is
  asynchronous. That is one frame of empty boxes where the covers were, on every
  single return, and it is what the reader called "the page refreshing". It cost
  five rounds because caching answers one layer at a time (covers, then Home's
  shelf, then the library's data) improves it at every step without ever
  reaching it: the data was never the problem, the teardown was. Three things
  follow and are not optional — arriving replaces mounting as the trigger to
  re-read (`useOnVisit`), the page slide moves to `animate()` because CSS
  animations need an element to be *created*, and `Portal` renders nothing from
  a hidden screen or its content follows the reader off its own page. — 2026-08-07
- **Inside the shell, `useLocation` is the lagged location, not the live one.**
  `<Routes location={…}>` overrides the location context for everything beneath
  it, and the shell is deliberately held one step behind while a book opens. So
  at the moment the reader leaves for a book, code in the shell sees the *tab's*
  path alongside the *book's* history index. Anything asking "where is the
  reader actually" must read `window.location`; `useLocation` answers "what is
  being rendered". Getting this wrong produced a Back that retraced a tab move
  when closing a book, and a first fix that looked right and changed nothing.
  — 2026-08-07
- **Back retraces one tab move per stretch of navigation, then re-arms.** Not
  once per session: pressing Back and then navigating again earns another one,
  and two presses in a row still leave the app. Spending it forever, or never
  spending it, are the two failures that shipped before this. The mechanism is
  one flag — whether the level is holding its second, rewritable history entry —
  because the History API can append an entry or rewrite the top one and nothing
  else, so "the entry below me should be the tab I was just on" can only be
  arranged after a Back has landed. — 2026-08-07
- **Every tab screen keeps its own scroll position, because they share one
  scroller.** The four screens are kept mounted and the inactive ones are
  `hidden`, which means zero height — so the document is only ever as tall as
  the screen on show, and a tab change *changes the document's height*. The
  browser then clamps `scrollY` to the new screen's maximum, which is why a
  short Home arrived at its own bottom with a jolt that read as pull-to-refresh,
  and why Library came back wherever Home had left the one number they shared.
  Caching, animation and pull-to-refresh were all innocent. Corollary: the
  outgoing screen is offset by the difference between the two positions for the
  length of the slide, or it fades out showing its own top. — 2026-08-08
- **Unread and Finished are computed, not stored.** Two real folder rows plus
  code that moves books between them would make membership a *copy* of the
  reading position, and every copy needs every writer to remember it. Miss one
  path and a book shows "✓ Finished" on its cover while sitting in Unread, with
  no way for the reader to tell which is lying. Asked of the progress map at
  render time it cannot drift, and "moving between folders" is not an operation
  the app performs — it is what the answer changing looks like. — 2026-08-08
- **A book may be in several folders, reversing WP-53.** The reader asked for
  it directly. What keeps it a folder rather than a tag is one property, kept
  deliberately: **the shelf shows each book once**, however many folders it is
  in — the folder list narrows the library, it never multiplies it. The price,
  paid knowingly, is that "sort by folder" had no single answer per book and was
  dropped. — 2026-08-08
- **Two options is a switch, not a menu.** A panel earns its extra tap by having
  something to decide; offering a choice of two asks a question the reader
  answered by reaching for the control. Title, Author, Recently and List/Grid
  change on the tap. Tapping a sort chip that isn't the current sort gives its
  *first* option, not the direction it was left in last time — a control whose
  first tap gives you something you didn't ask for takes two taps to trust.
  — 2026-08-08
- **The accent marks the one chip the reader is working on — the last one
  tapped — and never anything permanent.** It first meant "this control is doing
  something", which lit a filter only once it was already hiding books and lit
  *nothing* when a panel opened: the screen answered a tap by highlighting a
  different control. And with sort always set, it lived on a sort chip forever.
  A mark that cannot move says nothing. What it stopped carrying is carried
  better elsewhere — an active filter says so in its own label ("Unread", not
  "Reading status") and the line beneath says "Showing 3 of 12" next to the tap
  that clears it. — 2026-08-08
- **The app's scroller is the root element, and WP-54's "the document is the only
  scroller" diagnosis was wrong.** `overflow-x: hidden` written on `html, body`
  together is not the same rule twice: the root's overflow is *propagated* to the
  viewport, and once it has been, the body's own overflow applies to the body —
  so the body became a scroll container one viewport tall with all four screens
  inside it. Everything that reads or writes a position talks to the `window`, so
  two rounds of scroll-memory work never executed a single line that mattered
  (`window.scrollY` measured 0 always; a window scroll listener never fired). The
  clamping theory explained the symptom plausibly and was never tested against
  the question *is this code running at all* — the cheaper question, and the one
  worth asking first when a fix changes nothing the reader can see. — 2026-08-08
- **Headless Chrome renders this app fine; the standing note saying otherwise was
  a certificate error.** The dev server's self-signed cert was what produced an
  empty `#root`, not the app. Real layout is testable again — the scroll fix was
  verified against a genuine 9000px screen. — 2026-08-08
- **A bookmark points at an anchor, never a page number.** Pages are laid out
  from the reader's own type size and this app puts that control two taps away,
  so a stored page number names a different sentence the moment the text grows.
  Marking a page and then enlarging the text keeps the mark on the sentence.
  — 2026-08-08
- **To make the page look smaller, scale it — never resize it.** The text is laid
  out in CSS columns, so a box that genuinely changed size would re-flow and the
  browser would re-decide every page break: the page a reader is standing on
  would change under them the moment they tapped. A transform moves nothing. The
  price is paid explicitly — measured rectangles come back scaled while
  `scrollLeft` and the column gap do not, so every rectangle is divided by the
  factor on the way in, and the factor is a constant in TypeScript handed to CSS
  because the two must be the same number and one of them has to own it. It is
  *not* derived from `offsetWidth`, which is rounded to a whole pixel — a
  fraction of a per cent of a forty-thousand-pixel strip is a page and a half.
  — 2026-08-08
- **A wide table wraps; it does not get its own scroller.** Anything with
  `overflow` other than `visible` is monolithic — the browser will not break it
  across a column, because a scroll container has no seam to cut — so the one
  line meant to stop a wide table scrolling the page was what made a *tall* table
  run off the bottom with no gesture that could reach the lost rows. Cramped text
  can be read; text below the fold cannot. Code blocks could not take the same
  fix, since wrapping a line of code changes what it means, so they are capped
  under a page height and scroll within themselves. — 2026-08-08
- **A re-flow lands the reader on the same words, not the same page number.**
  Every control in the Aa tab re-decides where page breaks fall while the strip
  stays scrolled to a pixel offset that no longer sits on a column edge. Landing
  on the paragraph is not merely the fix — it is the only behaviour that means
  anything once the number of pages has changed underneath you. — 2026-08-08
- **The launch screen lives in `index.html`, inline, and leaves on first paint.**
  Anything in the bundle arrives after the wait it exists to cover. It leaves
  when the first screen is actually on the glass rather than on a timer — nobody
  opened the app to look at the logo — with `MIN_VISIBLE` guarding only against
  the opposite failure, a logo that appears and vanishes in 60ms and reads as the
  screen glitching. The HTML also carries a watchdog: a fixed lid at z-index 9999
  whose remover is inside the bundle would, on a failed boot, sit over an
  invisible error. — 2026-08-08
- **Three motion durations, chosen by how much of the screen changed meaning.**
  Ten hand-picked values were each defensible alone, but a reader meets them in
  sequence — tap a filter, open the sheet, pick an option, watch the shelf reflow
  is four speeds in a second. Inside a book `reader/motion.ts` still rules and is
  untouched: a 400ms page turn was reported as too fast twice, and that is not a
  UI-transition question. — 2026-08-08
- **Anything drawn over the reading page that changes the page is a layer, and
  every layer owes Back an answer.** The toolbar took two rounds of the same bug
  to be recognised as one, because it does not *look* like a panel — but it
  covers the page and resizes it, and a reader who raised it has somewhere to
  come back to. Back peels one layer at a time rather than clearing the screen:
  closing a sheet should leave the toolbar it was opened from, not discard the
  state the reader was in. — 2026-08-09
- **`history.back()` is asynchronous; `pushState` is not — never rebuild a
  history entry from a React effect that a `popstate` can also be changing.**
  The teardown's queued traversal can land *after* the replacement push, undo
  it, and deliver a `popstate` that closes the layer just opened. So
  `useBackDismiss` re-arms inside its own `popstate` handler, where the push is
  synchronous, and holds its callback in a ref so the effect depends on `open`
  alone — a handler that closes over which layers are open changes identity
  whenever one does, which would have rebuilt the entry on every change.
  — 2026-08-09
- **Verify a headless-browser fix by whether the app's own state survives, not
  by whether the gesture fired.** jsdom's history is shared across a test file,
  so a second `history.back()` always finds an older entry and fires a
  `popstate` — a test asking "did it fire?" passes against the broken code. The
  first draft of one test in this round did exactly that. Assert on whether an
  entry of *ours* is still on top. — 2026-08-09
- **Headless Chromium is now the first stop for layout, and the reader's phone
  is for feel.** Serving the built app over plain HTTP and driving it with the
  pre-installed Chromium measured twelve WP-55 behaviours in one pass, including
  the 85% page scale that had shipped as an admitted guess. What it still cannot
  answer is unchanged: a synthetic click is not a finger, so gestures and
  anything about *feel* remain a phone question. — 2026-08-09

### Settled 2026-08-09 (the cloud backend — Supabase + R2)

Written but **not wired in**. `storage/index.ts` still exports the Dexie
repository as the app-wide one; `storage/cloud/` is a complete second
implementation of the same `Repository` shape, waiting on accounts and a
sign-in screen.

- **Two services, split by weight.** Postgres holds the records (books,
  manifest, chapters, sections, positions, folders, quotes, bookmarks); R2 holds
  the two heavy things (the original file, the pictures). The deciding factor is
  egress: R2 charges nothing to read bytes back out, and the library is roughly
  90% bytes by size and 10% records. `sources` and `assets` keep a key, a size
  and a media type — enough for "what are the kept files costing me?" to stay
  one cheap query, exactly as the denormalised `size` did under Dexie.
- **The parser stays in the browser.** It works offline, needs no server CPU,
  and the phone already does it. Only the results travel.
- **Row Level Security is what makes a public key safe.** The Supabase anon key
  is compiled into the bundle and is meant to be — it names the project, not a
  person. Every table has one policy matching `user_id` against `auth.uid()`,
  so signed out the whole database reads as empty. The `service_role` key must
  never appear in `web/`.
- **R2 gets a signing endpoint because it has no anon key.** R2 credentials are
  all-or-nothing, so they live on the server. `api/r2/sign.ts` verifies the
  caller's Supabase session, checks every key requested starts with their own
  `users/<id>/`, and mints URLs that expire in ten minutes. The bytes go phone →
  Cloudflare directly; nothing large ever passes through the function.
  **The prefix check is the whole security model** — a signed URL is a
  capability, so what Postgres would have shown the caller is irrelevant.
- **`..` is refused, in two places.** A key is a literal string to R2, but the
  signing endpoint builds a `URL` from it and the URL constructor *normalises*
  traversal. So `users/<me>/../<someone-else>/…` would pass a `startsWith` check
  and then resolve elsewhere. `keys.ts` strips traversal segments and the
  endpoint rejects them outright.
- **Transactions become Postgres functions.** IndexedDB let one `transaction`
  span four tables; HTTP gives one statement per request. Everything that must
  not half-happen is an RPC in `0002_functions.sql`, all `security invoker` so
  RLS still applies inside them — a function makes statements atomic, it is
  never a way around the policies.
- **A new import is written in three steps; a re-parse in one.** A large book's
  sections don't reliably fit in one request. A *new* book can be written hidden
  (`ready = false`), filled in, then revealed — if it fails, nothing existed to
  lose, and the next attempt at the same file sweeps the dead row up. A
  *re-parse* cannot work that way: `reparseBook` promises a failure leaves the
  old book exactly as it was, and that dies the moment the old sections are
  deleted in one request and the next one fails. So it pays for a single atomic
  call and fails cleanly on an enormous book, which is the right way round.
- **Deletion is rows first, objects after, and the objects are best-effort.**
  Foreign keys cascade from `books`, so there is no way to half-delete. Doing
  R2 first would leave a book on the shelf whose pictures had gone; this way the
  worst case is an unreferenced object costing a fraction of a penny.
- **`null` and absent are not the same thing, and `rows.ts` is where that is
  kept true.** SQL has no missing column; the app's types are full of optionals
  whose *absence* means something (`folderIds` absent = loose in the library).
  Reads omit rather than assign `undefined`, so the objects are indistinguishable
  from the ones IndexedDB returns.
- **Every timestamp is normalised on read.** Postgres returns
  `2026-08-09T10:00:00+00:00`; the app has always written `…000Z`. They name the
  same instant and **sort differently as strings** — and the library sorts them
  as strings, so left alone the recently-added shelf would come back in the
  wrong order.
- **Unbounded reads page explicitly.** PostgREST caps a response invisibly: you
  get 1000 rows and no signal there were 1200. It matters most for
  `listSections`, which feeds in-book search — a silently truncated book would
  just stop matching half way through.
- **There is no offline, and that is why this is not the default.** Every call
  is a network call. A cache that reads locally and writes through to here is
  the natural next layer, and `cloud/` holds no state between calls so that it
  can sit underneath one. — 2026-08-09

### Settled 2026-08-09 (turning the cloud on — sign-in and the toggle)

- **Switching backends is a change of view, not a migration.** Nothing is
  copied, moved or deleted, so a reader with 32 books on the device can switch
  to the cloud, find it empty, and switch back to find everything intact. That
  property is what makes it safe to ship the toggle *before* there is any way to
  copy books between the two — and it is why the settings screen shows a book
  count under the option that is **not** selected. An empty shelf and a lost
  library look identical from the outside; the count is what tells them apart.
- **The choice is read once at load, and changing it reloads the page.** Around
  thirty modules import `repository` from `storage/index.ts` as a plain value,
  and several cache what it returned — covers, shelf memory, library memory, the
  reading position. Swapping the object underneath all of that at runtime would
  leave one library's covers over another library's books and need an
  invalidation path per cache. A reload costs about 300 ms and cannot be
  half-applied.
- **A build with no Supabase keys ignores a remembered `cloud` choice.** A fork,
  a preview deploy or a fresh checkout would otherwise boot straight into a
  sign-in screen it can never satisfy. `resolveBackend(stored, configured)` is
  pure and tested for exactly this.
- **The sign-in screen always offers the way back to the device library.** It is
  not a courtesy: turning the cloud on before the Supabase project exists — or
  simply not receiving the email — otherwise locks the reader out of books that
  are still sitting in the browser underneath that screen. A gate in front of a
  library you already own needs a door on both sides.
- **A session has three states, not two.** Supabase reads its stored session
  asynchronously, so a boolean starts `false` and flashes the sign-in form at a
  perfectly signed-in reader on every single launch. `loading` renders the page
  background rather than `null`, because the launch screen is removed as soon as
  React has rendered once and an empty render is a white flash on a dark phone.
- **The Supabase client is imported statically, and the bundle pays 21 kB.**
  Loading it dynamically would make `repository` an async value at every one of
  its ~30 call sites — a change to the whole app to save a fifth of what one
  font file costs. — 2026-08-09

### Settled 2026-08-09 (deploying it — the routing hole)

- **`vercel.json` rewrites every non-asset path to `index.html`.** The app draws
  `/settings` and `/book/<id>` itself; only `/` is a real file on disk. Without
  the rewrite, opening one of those addresses directly — a refresh, a bookmark,
  a shared link — reaches Vercel, which finds no such file and shows its own
  `404: NOT_FOUND`. This was hidden for weeks because the service worker's
  `navigateFallback` answers exactly the same question offline, so it only
  surfaces where the worker isn't: a first visit, or right after clearing it.
  Vercel's Vite preset does not add this; it has to be written down.
- **`/api/` and `/assets/` are excluded from that rewrite, for opposite
  reasons.** `/api/` must reach the function. `/assets/` must be allowed to
  **fail** — a request for a hashed bundle that no longer exists should be an
  honest 404, not `index.html` served with a JavaScript content type, which
  turns a missing-file problem into an unreadable parse error.
- **A stale service worker can outlive the files it names.** An old cached
  `index.html` points at `assets/index-<old-hash>.js`, and a later deploy
  deletes it — so the page loads, requests a bundle that 404s, and paints
  nothing. Under `registerType: 'prompt'` the old worker keeps serving until the
  update is accepted, which widens that window. The recovery is Unregister +
  delete Cache storage, and it is now written down in `cloud-setup.md`;
  the rewrite above at least means the fallback lands on a real page. — 2026-08-09

### Settled 2026-08-10 (the words move to R2)

- **Postgres holds pointers; Cloudflare holds bytes — for the text too.**
  Measured on a real import (Jung, *Man and His Symbols*), `sections` was 584 kB
  of the 700 kB that one book cost the database. The app never queries *into*
  those paragraphs — it fetches a section whole and renders it — which makes
  them bytes, not data. They now live in R2 and `sections.r2_key` is the
  address. Per book: ~700 kB → ~200 kB, so the 500 MB free tier goes from about
  650 books to about 2,500. That is 3.5×, not the 100× it first looks like: the
  rows themselves stay, and reading order, titles and counts are still queried.
  The reason to do it now rather than at book 200 is that the migration deletes
  cloud books, and deleting one is cheaper than deleting two hundred.
- **One object per chapter, not per section.** A page turn is a single GET
  either way and latency dominates, so the grain is chosen by the *other* two
  paths: in-book search drops from ~300 requests to ~20, and an import from
  ~300 uploads to ~20. The object is keyed by section path, never by position —
  a re-parse that divides a chapter differently would otherwise shift every
  index and hand the reader another section's words under this one's name.
- **The key carries a per-parse token.** `…/text/<parse token>/<chapter>.json`.
  This is what preserves `replaceParsedBook`'s promise that a failed re-parse
  leaves the old book exactly as it was: new chapters are uploaded to addresses
  no row mentions, one transaction swaps every row onto them, and only then are
  the old objects released. Overwriting the old keys in place would mean a
  crash mid-upload leaves rows pointing at half a book.
- **Bytes before rows, everywhere.** Same rule `saveAssets` already followed. A
  crash between the two leaves orphaned objects — a few kilobytes nobody
  references — rather than rows pointing at nothing, which is a book that opens
  and won't turn. Orphans are swept on the next successful write.
- **A missing chapter object throws in `getSection` and is survivable in
  `listSections`.** Reading is the promise: a blank page rendered as though it
  were the book is worse than an error a reader can act on, so the reader gets
  *"Couldn't load the words on this page"* — a `CloudError`, which every caller
  already handles. Search is best-effort by nature, so it skips what it can't
  fetch and still searches the rest.
- **Accepted cost: one extra hop on the first read of a chapter,** roughly
  +150 ms. The objection that "text has no fallback" was weak and was dropped:
  the cloud backend has never had an offline copy, so a dropped signal already
  stopped the reading. This trades a little latency for a database that stays
  slim for years. — 2026-08-10

### Settled 2026-08-10 (offline for the cloud library — WP-58)

- **The cloud stays the source of truth; the device keeps a copy of what you
  have read.** The alternative — two equal libraries reconciling with each
  other — is a distributed-systems problem, and this is a reading app. One side
  is authoritative, the other is a convenience that can be thrown away and
  rebuilt at any time without anyone losing anything.
- **The cache is its own database, not the device library.** `reading-buddy-cache`,
  the same schema as `reading-buddy`, opened through the same `createRepository`
  so it is a full `Repository` with no new interface to learn. Caching cloud
  books into the device library instead would have been fewer lines and quietly
  catastrophic: the two shelves the whole design keeps separate would start
  blending, "32 books here" under the unselected option would stop meaning
  anything, and a reader who switched back would find books they never imported
  there. Separate database, invisible on the device shelf, safe to delete.
- **This is what WP-57 was secretly for.** Filling the cache is
  `copyBook(cloud, cache, …)` — the engine written for the copy button, pointed
  at a different target. It was written against `Repository` so it would never
  learn direction; the payoff arrives one waypoint later than expected.
- **Books you open are kept; the least recently read is dropped first.** Not a
  per-book "keep offline" switch. A switch is only correct if you remember to
  press it before you lose signal, which is exactly the moment you won't — and
  the book you want on the train is almost always the book you were reading
  yesterday. Automatic is wrong less often than a button nobody presses. A pin
  that protects a specific book stays available as a later addition, and the
  eviction rule is the only thing it would need to change.
- **Offline you can read, mark and bookmark. You cannot delete.** Highlights and
  bookmarks are *additive* — two devices each adding one means you end up with
  both, which is not a conflict but the correct answer arriving by itself. That
  removes the hard case for free and leaves exactly one single-valued field.
- **Reading position: the most recent write wins, not the furthest.** `at` is
  already an ISO timestamp on `ReadingPosition`, so no schema change. Furthest-
  wins reads better on paper and is wrong in practice: deliberately going back
  to re-read chapter two would be undone by a stale laptop, forever, with no way
  to make it stop.
- **A delete needs a signal.** It is the one action with no honest automatic
  merge — a delete on one device racing an edit on another can only be resolved
  by asking, and a reading app should not have a conflict UI. Refusing the
  action offline costs a reader almost nothing and removes the entire class.
- **Twenty books, and the reading order lives in `localStorage`.** A count
  rather than megabytes, because a count is the thing a reader could be told and
  would understand; twenty is past what anyone has in flight, so in normal use
  nothing is dropped and the whole mechanism is invisible. The bookkeeping is
  not a table because the schema is shared with the *device* library — a new
  table means a migration running over the reader's 32 real books to support a
  copy that can be thrown away — and because it is read on every page turn,
  where `localStorage` is synchronous and IndexedDB is not.
- **`navigator.onLine === false` skips the network; `true` proves nothing.**
  Added after the first phone test, which disproved this file's own earlier
  claim that asking a dead network was free: with Wi-Fi off, opening the app is
  dozens of requests each with its own DNS attempt, and the library visibly
  crawled. The flag is specified as a promise about *failure*, so `false` is
  trustworthy enough to skip the fetch while `true` (a captive portal reports
  it) is not trustworthy enough to skip the fallback.
- **Everything bundled with the reading path has to survive offline too.** The
  library screen opens four reads in one `Promise.all`; three were cached and
  the fourth — a check about the *Update* button — was not, so its failure binned
  three good answers and showed *"Couldn't open your library"*. `Promise.all`
  fails as a group, which makes "is this a reading call?" the wrong question.
  — 2026-08-10

## The day a book was finished, and the shape of Stats

- **`finishedAt` is written once and never moved.** "Finished" was already
  derivable from a 100% position, but a position's `at` is the *last page turn*,
  so opening a finished book months later to check a quote silently changes the
  day it was finished. Harmless on a shelf; in a yearly total it is a lie that
  carries a book out of one year and into the next. Same rule
  `titleOverridden` and `shelfOverridden` already set: once a fact is
  established, no later automatic pass overwrites it. Re-reading a book does not
  clear it, because it did not un-finish it. — 2026-08-10
- **Finishing is kept out of `savePosition`, and guarded in the WHERE clause.**
  `savePosition` runs on every paragraph and is a bare single-row put with no
  read-before-write; a write-once field has to look before it writes. On the
  cloud the guard is `.is('finished_at', null)` inside the update rather than a
  read-then-write, so two devices finishing the same book settle it in Postgres
  with the *first* date winning. — 2026-08-10
- **`backfillFinishedAt` runs at boot and replaces an outbox entry.** It dates
  the books finished before the field existed, from the position's own `at` —
  the best evidence there is. It is also the recovery path for a book finished
  in a tunnel: the page turn to 100% is queued like any other write, so the fact
  arrives even when the date doesn't, and the next launch turns it back into
  one. That is why finishing needs no queue entry of its own. — 2026-08-10
- **Pages read needs no reading log.** The reader's own simplification, and it
  cut a planned append-only reading-events table out of the design entirely:
  a finished book means its whole page count was read, so a year's total is a
  sum over finished books × the print edition's page count from Google Books.
  A part-read book is shown as an approximation (percent × page count) rather
  than tracked. — 2026-08-10
- **Catalogue metadata comes through `api/`, never a `VITE_` variable.** A
  `VITE_`-prefixed value is compiled into every visitor's JavaScript. The same
  rule that keeps the Anthropic key server-side applies to the Google Books key,
  and to anything added later. — 2026-08-10

## Two small ones the reader chose

- **A wash, not a stripe.** The boxes that want noticing use
  `--color-accent-wash`, one token mixed from `--color-accent` with
  `color-mix`. Custom properties are substituted at *use* time, so a single
  `:root` line follows all seven themes instead of seven hard-coded colours —
  and it stops reading as a side-tab, which the design hook was right about.
  — 2026-08-10
- **A shelf holds its place when it is empty.** All four of Home's shelves —
  Current Reading, Up Next, Unread, Finished — are always drawn, with a heading,
  a plank and one quiet line in the gap. A shelf that vanishes makes the page
  jump around as books move between states, and gives no hint that the category
  exists. — 2026-08-10
- **The update panel assumes its own signal may never arrive.** Taking an update
  waits on `controllerchange`, which can simply not fire; the panel now shows a
  busy state so it never looks dead, refuses a second tap, and reloads on a
  4-second timer regardless. — 2026-08-10
- **A saved place is a paragraph *and* an offset into it.** The anchor still
  names the paragraph the visible page begins in — naming the next one is an old
  bug — so `ReadingPosition.within` carries how many pages past that paragraph's
  first column the reader was. Without it, a paragraph longer than a column
  reopens pages early, worst at the end of a book. Absent and null both read as
  zero, which is the old behaviour and the right answer for a position saved
  before this or a project that has not run migration `0006`. — 2026-08-12
- **A book opens onto its cover, not onto a spinner.** The reader's idea, from
  Google Books: the fraction of a second before the text is ready is held on the
  cover for 550 ms and faded out, so the wait reads as a book opening rather
  than as loading. — 2026-08-12
- **A dark-only mock is a shape, not a palette.** The book-page redesign came
  from a Google Play Books screenshot and a second dark mock-up; every colour in
  it is `color-mix(in srgb, var(--color-accent) N%, …)` instead, so one rule
  reads warm brown on the light themes and gold on the dark. Where a solid fill
  was wanted, the `--color-accent` / `--color-accent-contrast` pair is legible in
  all seven themes by construction. — 2026-08-14
- **Never rely on a Unicode glyph a system font might not carry** — it renders as
  an empty box, silently, and only on the device that lacks it. The half-star,
  the chevron and every icon on the book page are CSS borders or SVG paths.
  — 2026-08-14
- **The reader's own ISBN wins over Google's.** The file's `isbn` identifies the
  edition actually on the shelf; `googleIsbn13` / `googleIsbn10` record the
  edition Google *matched*, and the two disagree often. — 2026-08-14
- **Say a thing once, next to the thing it describes.** Reading progress was
  printed under the star rating and again under the Read button; a progress bar
  beside the reader's own rating implies the two are related, and they are not.
  It lives under the button. — 2026-08-14
- **A line under a heading has to earn its place.** "Pick up where you left off"
  narrated the shelf directly beneath it; Home asks "What book are you picking up
  today?" instead — a question, set in the reading serif and hung off a short
  accent rule so it reads as designed rather than as a caption. — 2026-08-14
- **Google Books has no author entity.** `volumeInfo.authors` is a `string[]` of
  names — no bio, no nationality, no bibliography. "More by this author" is one
  `q=inauthor:"…"` query away; an author biography needs a second source
  (Wikidata or Open Library). — 2026-08-14
- **A theme is colour; a reading face is a separate axis.** Vintage and Paperback
  ship their fonts (Libre Caslon, Merriweather) as *reading fonts*, not as part
  of the theme — a reader who chose OpenDyslexic must not have it overridden by
  picking a page colour. — 2026-08-14
- **`:root:not([data-theme='light'])` is (0,2,0) and beats a bare `:root`.** File
  order does not save you: defaults written in `:root` lose to the dark override
  on any OS-dark phone, which bound every pale theme in black. Per-theme values
  must be written per theme. Caught twice now — vignette, then the decks — and
  both times only by reading computed values out of a live browser. — 2026-08-14
- **The running head is on by default, in every theme.** It arrived as a Vintage
  period detail; knowing which book you are in turned out to be useful on every
  page. One token, `--running-head`. — 2026-08-14
- **Page furniture either flips or holds still, and which one says what it is.**
  The gutter shadow carries `data-page-furniture` because it *is* the sheet seen
  edge-on; the decks do not, because a binding does not swing away when you turn
  a page. — 2026-08-14
- **The deck channel is a constant; only the fill moves.** The text is set in CSS
  columns, so a column box that changed width as you read would re-decide every
  page break and repaginate the book under the reader on each turn. — 2026-08-14
- **A section break is a labelled block, never a new `BlockKind`.** Same reason
  as `subheading`: anchors are permanent and a new block kind would shift every
  anchor after it, moving the highlights pinned to them. — 2026-08-14
- **Notes live in their own Dexie table, not on `Repository`.** `repository.setNotes`
  is one free-text field on the book, not a list. A method on `Repository` would
  force a Supabase table, a cached read, an outbox entry and a remote migration
  in the same breath, so `storage/notes.ts` owns the table at v11 and notes stay
  device-local until the cloud side is built. — 2026-08-15
- **A note says who wrote it by how it looks, not by a label alone.** Your notes
  are handwriting on the rules; Claude's are a typeset slip taped on the page.
  A reader must never mistake the machine's words for their own. — 2026-08-15
- **"By chapter" groups; it does not filter.** A chip that hid notes would lose
  work the reader can see under "All", so the mode only adds headings. — 2026-08-15
- **What each of the four Notes tabs holds — the reader's own definition, set
  2026-08-15.** The tab row is a set of four different *kinds* of record, not
  four filters over one kind:
  - **All** — every row below, in the book's order.
  - **Quotes** — the passages the reader highlighted. Renamed from "Yours",
    which named the author of the row and told the reader nothing about what was
    in it. Nothing in this tab is written by the reader; it is all the book's own
    words. The stored `author` stays `'you'`, because that fact is still true.
  - **Claude** — every question the reader asked and the answer they got, kept
    as a pair. A question with no answer beside it is not a record of anything.
  - **By chapter** — two rows per chapter, and only these two: **one summary
    written by Claude**, and **"what I learned"**, built from the questions the
    reader asked in that chapter and the answers they got. The purpose is a
    complete picture of the chapter to come back to, so this tab is a *digest*,
    not a grouping of the other three. This reverses the 2026-08-15 line above
    it — "By chapter groups; it does not filter" — which described the panel as
    first built, before the reader said what the tab was for.

  **Only Quotes and All are buildable today.** Claude and By chapter both need
  the tutor loop (WP-17 → 20), because neither has a source of rows until the app
  can be asked a question. They are written down here so the panel is built
  towards them rather than around them. — 2026-08-15
- **The system's edge band is not the book's to answer.** Android's back gesture
  is an inward swipe from an edge, and the reading page answered a horizontal
  swipe with its whole width — so leaving a book turned a page on the way out,
  every time. A stroke that begins within 24 px of either edge cannot turn a
  page. Asked once, at `pointerdown`, exactly as the brightness gate is: a stroke
  that starts mid-page must not become a back gesture by *ending* at the edge,
  which is what every completed forward turn does. — 2026-08-15
- **The contents page shows sections under chapters, and that is also the fix
  for a book with no chapters in it.** Two reasons, and the second is the one
  that turned a thin list into a broken one. The plain one: a chapter is a long
  way, so a list offering page 1 and then page 300 cannot be navigated with. The
  titles were in storage all along — `listChapterIndexes` loaded them for the
  spine and threw them away.

  **Correction, same day.** This entry first said the change also fixed a book
  whose chapters were missing. It said the chapters sat one heading level below
  CONTENTS and NOTES, so showing sections would reveal them. That was wrong. The
  book's chapters have no heading of any level, and the cause was in the epub
  parser — see the next entry. Sections are worth showing on their own merit, so
  the change stands. — 2026-08-15
- **Only a section the book named earns a row.** An untitled section is the
  parser's own bucket — the prose before the first heading, or a slice of the
  heading-free fallback. It is a real division of the text and not a thing the
  book calls anything, so a contents page has nothing to print beside its page
  number. A chapter of one section stays a single row for the same reason a
  printed contents page does not indent a line under itself. — 2026-08-15
- **Exactly one row says "reading now".** The deepest row that matches wins: the
  section when the list names it, the chapter when it does not. Marking both
  would print the line twice, a few lines apart, which reads as the list
  contradicting itself. — 2026-08-15
- **One history entry per open layer, each pushed by the tap that opened it.**
  The back gesture closes what is over the book by consuming a history entry
  this app puts there. That used to be a single entry, re-armed from inside the
  `popstate` handler: the gesture consumed one, and the handler pushed a
  replacement. It failed on the phone. From the contents page the first swipe
  worked and the second left the app. Chrome on Android treats an entry pushed in
  answer to a back navigation, with no user gesture behind it, as a page trying
  to trap the reader, and its history-manipulation intervention *skips* that
  entry on the next Back. jsdom has no such rule, so every test passed and the
  bug was only visible on a real phone. Nothing is pushed during `popstate` now.
  The hook is told how many layers are open and keeps that many entries, adding
  one as each layer opens — a tap, so every push has a gesture behind it.
  Removing entries when a panel is closed by tapping still uses `history.go`, and
  those `popstate` events are counted and ignored so they do not read as the
  reader's own gesture. — 2026-08-16
- **Contents opens at the reader, not at page one.** A long book's list is
  hundreds of rows. A reader on page 260 opens it to ask what comes next, and a
  list that opens at the top answers by making them scroll past everything they
  have read to find themselves first. The row they are on is set a third of the
  way down, not centred, because the question is what comes *next* — so the room
  belongs below the row. The list is left alone when that row is already on the
  first screenful: scrolling would push the ornament and the word CONTENTS out of
  sight and gain nothing. Done with `scrollTop` in a layout effect, not
  `scrollIntoView`, which can scroll the overlay around the list as well. —
  2026-08-16
- **A section named after a chapter is left out of Contents.** A book's NOTES
  division repeats each chapter's title as a subheading, so its notes can be
  found and so each note can link back to the chapter. Those subheadings are
  cross-references and not places to go. Printed as outline rows they read as a
  second, wrong copy of the contents list: the same chapter names again, out of
  order, several sharing one page number, and every one of them landing in the
  endnotes instead of in the chapter it names. The chapter's own row is already
  in the list and goes to the right place. Titles are compared by their letters
  and digits with case ignored, because the endnote heading is set from the same
  words as the chapter heading but rarely from the same characters. This is a
  render rule, so no book has to re-parse. — 2026-08-15
- **A missing title is asked per document, not per book.** `parse/epub.ts` can
  take a chapter's title from the epub's own contents when the chapter's markup
  has no heading. Many books need this: the title is set as artwork, so the file
  holds a picture and not an `<h1>`. But the parser asked the question once for
  the whole book — if *any* document anywhere had a heading, no document got a
  title. Almost every book has a heading somewhere, usually in the endnotes or a
  glossary. So the back matter switched the fallback off for the chapters. Every
  chapter arrived with no title, the body fused into one untitled division, and
  the contents page listed the front and back matter and not one chapter of the
  book. The question is now asked per document. The original worry was that a
  synthesised title could compete with a real one and split a chapter in two.
  Asking per document answers it: a document that already has a heading is left
  exactly as it was, so only the documents with nothing to compete with change.
  `PARSER_VERSION` goes 19 → 20, so each book re-parses when you open it, and
  the idle trickle rebuilds the rest of the shelf. — 2026-08-15

- **A chapter opening is chosen by the book, then by the chapter.** Four
  settings exist. The first two are chosen from the publisher's own subject
  headings, because how a book letters its chapter openings is a fact about the
  book: a spiritual text ornaments every one, a novel gives every one a
  nameplate. Only the books that match neither fall through to the per-chapter
  rule, which is simply whether the chapter's title carries a number. The
  headings arrive as "Religion / Spirituality", so they are cut at the slashes
  and each piece becomes a tag. `ChapterOpening` takes a `style` prop, so a
  theme or a setting can force one later without any of the rules moving.
  — 2026-08-16

- **The selection menu takes the prototype's actions and the platform's look.**
  The actions are the prototype's, unchanged. The card is the phone's own text
  menu — an icon row, hairline rows, a labelled block at the foot. A reader who
  has used a phone already knows how to read that shape, and that is worth more
  than a menu that matches the book. Six of its actions have no home yet:
  Define, Translate and the four under Ask Claude. They are still listed, and
  tapping one says so. Hiding half a menu would settle a design question that is
  not settled. — 2026-08-16

- **A highlight is a note that keeps its colour.** No second table, and no
  second type. The Quotes tab already lists rows whose text is the book's own
  words, which is exactly what a highlight is. Two unindexed fields carry the
  rest: `quote`, the words the note is about, and `colour`. The colour is stored
  rather than derived because readers put meaning in it — yellow for important,
  blue for look this up — and a theme change must not rewrite what they meant.
  Unindexed, so no schema version was needed. — 2026-08-16

- **A book's own navigation decides its structure; the styling is the fallback.**
  Every epub ships a `toc.ncx` or a `nav.xhtml` in which the author states the
  divisions, their titles, their nesting and the exact position of each one. We
  read that file before and kept only a title per document, so the parser was
  inferring what the file had spelled out. Inference cannot win here: three short
  centred lines of a dedication are, as evidence, identical to three chapter
  titles. The stylesheet pass stays, as the answer for a file whose navigation is
  missing or unusable. — 2026-08-16

- **Silence in a navigation is not denial.** A navigation that lists the front
  matter and then one late chapter has said nothing about the chapters between,
  not that they are prose. So the navigation is authoritative only over the
  documents it points into. A document it never reaches keeps the headings the
  styling pass found. Reading silence as denial emptied a whole book's contents
  on the word of a file that had given up. — 2026-08-16

- **The navigation decides structure; the markup keeps its own words.** A real
  `<h1>NOTES</h1>` is not rewritten to "Notes" because the contents page spells
  it that way. Both are the author, and only one of them is on the page. A
  guessed heading has no authority over its own text, so it does take the label.
  — 2026-08-16

- **The book's printed contents page stays in the book.** The app's Contents tab
  is built from the navigation and is a separate thing; it does not replace a
  page that belongs to the book as a dedication does. The rule that dropped it
  also could not tell where the list ended, so it ate the "PREFACE" title after
  it — one reason of two, and either would be enough. — 2026-08-16

- **A trailing number marks a contents entry only after a title of two words or
  more.** "An Example of Growing Toward Self-Leadership 130" is a contents line.
  "Chapter 1" and "Part 1" are the commonest chapter titles in print and have the
  same shape. A contents line names something and so has a name to give; a
  numbered title is a label and a figure. This needs no list of label words. —
  2026-08-16

- **A numbered section opens like a chapter.** Where a book is cut into parts,
  the part becomes the division and "Chapter 1" arrives as a section — the words
  print gives a full opening to. Only when the title carries a number: a full
  opening on every subdivision would be relentless. — 2026-08-16

- **A page the reader can turn onto must be laid out before the turn starts.**
  Both neighbour sections are mounted offscreen, hidden with `visibility` rather
  than `display`, so they keep their columns and can answer "which page would I
  land on". They must be drawn from the same function as the live page and given
  the same pictures, or they break their lines in different places and the page
  revealed is not the page that arrives. — 2026-08-17

- **A turn across a section is a turn, not a jump.** It loads a section the same
  way a link or the contents list does, so it collected the jump's fade as well
  and flashed after it had landed. A jump fades because it has no direction; a
  turn has already shown the reader where the book went. — 2026-08-17

- **A `blob:` URL is held per picture, not per page.** Holding them per request
  meant every page turn revoked every URL at once, while the replacements
  arrived an `await` later. The promise this keeps — that a reader going through
  a picture book does not accumulate it — is kept by revoking what falls out of
  reach, not by revoking everything. — 2026-08-17

- **A page turn announces itself to nothing, so a live selection watches the
  geometry instead.** `pages.page` does not reliably change on a turn, and the
  strip fires no `scroll` event because its overflow is hidden. Both were
  measured, not assumed. An 80 ms timer on the anchor paragraph's own rectangle
  is the only signal that proved real. Not `requestAnimationFrame`: a frame
  callback stops in a page that is not being drawn. — 2026-08-17

- **A DOM Range does not fail loudly when its text is removed.** It re-points to
  the end of its container, so a windowed strip turns a five-line selection into
  the whole page. A selection that must outlive a turn is therefore stored as
  anchor plus words and rebuilt, never carried as a live Range. — 2026-08-17

- **The turning sheet may lose paint, never geometry.** Dropping a filter, a mask
  or a background during a turn is free to the eye because nothing moves.
  Dropping an inset, a radius or a transform makes the ink twitch as the sheet
  lifts. — 2026-08-17

- **A saving during a turn belongs to the page being *left*, not to the sheet
  that is moving.** The two directions are not mirror images: forwards the moving
  sheet is the page being left, backwards it is the page being arrived at. Anything
  taken off a page the reader ends up looking at has to come back, and the eye
  reads that as the highlight arriving late. — 2026-08-17

- **When a phone feels slow, measure on the phone.** Remote profiling over USB
  never connected (`chrome://inspect` stayed "Offline"), and the desktop test
  browser does not composite, so paint cost cannot be read there at all. A small
  temporary in-app readout, screenshotted by the reader, answered in two rounds
  what four rounds of reasoning had not. Build it, read it, delete it. —
  2026-08-17

- **The pen has two halves, and only the grain comes off a page the reader lands
  on.** The shape of the ink (the mask) must stay, or the highlight appears at
  the hand-over. The grain inside that shape (a repeating gradient) may go,
  because the shape it sits in is already right. A backward turn drags the
  arriving page, so its bands drop the grain only. That took the worst frame of a
  backward turn from 150 ms to 50 ms, level with a forward turn. — 2026-08-18

- **Time the worst frame, not the start of the gesture.** Build and paint numbers
  describe one frame — the first. A turn that stutters the whole way through
  costs its money later, and two fixes were shipped against the wrong number
  before a `worst` column existed. Ask the reader when it feels slow, then
  measure that moment. — 2026-08-18

- **On a touch screen the app selects the word, not the phone.** A phone raises
  its own text menu the moment it holds a selection, and no page can stop it.
  Dropping the selection after the fact removed the menu, but the reader saw it
  flash first. So `.page` sets `user-select: none` under `@media (pointer:
  coarse)`, and a long press finds the word with `wordAt`. A mouse keeps the
  browser's selection: a desktop has no such menu, and drag-select is how a
  desktop chooses text. — 2026-08-19

- **Anything drawn over the page is a layer, and the selection menu is one.**
  `useBackDismiss` holds one history entry per open layer, so a back swipe eats
  an entry instead of leaving the book. The selection menu is the topmost layer,
  above the panels and the toolbar, because it is drawn over them and it is
  always the last thing raised. — 2026-08-19

- **A `useEffect` with an empty dependency list cannot read `strip.current`.** A
  callback ref fills that ref when the book mounts, long after the first render.
  A listener bound that way binds nothing. Put such listeners on `document` and
  read the ref at the event. — 2026-08-19


- **Tutor threads list as note rows, not a second panel.** Threads merge into
  the Notes tab through `inNoteOrder`; a `threadId` on the row routes taps to
  the lamp and delete to the thread store. One list, one order, two shapes. — 2026-08-21
- **A slip is anchored to its passage's last inked line.** Not to the paragraph
  corner — two threads in one paragraph must wear two visible slips. — 2026-08-21
- **A file's `dc:subject` is stored verbatim and filtered at display time.** A
  publisher's tooling leaves field names such as `review_metadata` in the
  metadata; the record must stay a true copy of the file, so the rule lives in
  `subjectTags`, where one line can undo it. — 2026-08-23
- **The live host is `reading-buddy-web-nu.vercel.app`.** The shorter
  `reading-buddy-web.vercel.app` is a dead alias with no API functions. Probe
  the `-nu` host. — 2026-08-23

- **Only one `useBackDismiss` per screen.** `Reader` counts every open layer and
  keeps one history entry for each. A panel that ran a second copy of the hook
  kept a rival count of the same stack, and the two closed each other. Anything
  drawn over the page is added to the Reader's count instead. — 2026-08-24
- **MW audio lives at `/audio/prons/en/us/mp3/`.** The other path in MW's own
  documentation, `/audio/pronunciation/mp3/`, answers 403 to every request.
  — 2026-08-24
- **MW's `def` is one entry per part of speech, not per sense.** The senses are
  a level down, in `sseq`. Reading `def[i]` gives every sense after the first
  the same example. — 2026-08-24
- **The parsed dictionary entry is what is cached, not MW's JSON.** A word is
  parsed once ever, and a word looked up once works offline. — 2026-08-24
- **A kept word is not scoped to a book.** A word is learned once, so the Words
  tab shows the whole list wherever the reader is. — 2026-08-24
- **Every small decision the panel offers is reversible.** Save word un-saves on
  a second tap; a button that disables itself makes a mis-tap permanent.
  — 2026-08-24

- **The tutor's world is the page in front of the reader.** Every question
  carries the title, the author, the chapter, the section, and the paragraph
  before and after the selection — see `reader/context.ts`. That answers
  "explain this", which is the question the reader asks. It cannot answer a
  question that leaves the page: "where did she first mention the shadow?"
  Retrieval across a book was the point of WP-09 and WP-18, and both are
  declined. Half-built retrieval is worse than none. If the need appears, this
  is reopened as its own decision, and the chapter gists are written while a
  chapter is digested — never at import, which costs a model call per chapter
  before the reader has read a word, and holds a description of every chapter
  they have not reached. — 2026-08-25
- **The tutor's persona and its teaching modes are prompts, not data.**
  `BASE_PROMPT` in `api/tutor.ts` is the persona; the eight task modules are the
  modes. Nothing about them is derived from the book, so classifying a book as
  fiction or dense earns nothing — WP-10 asked for a tag that no code reads.
  `reader/genre.ts` is named in a comment in `api/tutor.ts` and was never
  built; `BookGenre` is declared and unused. The relay offers every module for
  every book on purpose: the relay is not the place to enforce a taste
  judgment. — 2026-08-25

- **The voice reads a sentence at a time, not a section.** One long utterance
  is simpler, and it fails three ways: nothing can follow it, because progress
  comes back as a character offset; a pause is not heard until the paragraph
  ends; and several engines stop part way through a few thousand characters and
  say nothing. A sentence *is* the place in the book, so `readAloud.ts` cuts a
  section into sentences and the place in that list is the place on the page.
  Tables, code and figures are skipped. Headings are read — a listener needs to
  hear that a new chapter started. — 2026-08-25
- **`cancel()` fires `onend`.** So "when a sentence ends, say the next" starts
  the book up again the moment a reader presses stop. Every utterance carries
  the generation it was made in, and one that ends from an older generation is
  ignored. Pause, stop, skip and a change of voice all move the generation on.
  This is the single rule the whole read-aloud module is built around. — 2026-08-25
- **A pause says its sentence again on resume.** The engine is not trusted to
  carry on: desktop Chrome has stopped a resumed utterance after a timeout for
  years. A repeated sentence is a fault a listener forgives. A silent stop is
  not. — 2026-08-25
- **"Stopped" and "finished" are two different endings.** Both leave the voice
  quiet with no place in the book, and a single callback for the pair is a real
  fault, reported from the phone: pressing stop was read as "this section is
  done", so the app moved to the next chapter and started reading it. Pressing
  stop again moved on again. `AloudReader` now reports the place through
  `onPlace` and the end of the plan through `onFinished`, and only `onFinished`
  turns the page into the next section. — 2026-08-25
- **A sentence that runs off the page is said in two utterances.** A sentence
  that starts at the foot of a page is often read to its end on the page after
  it, so following the *sentence* left the reader looking at the wrong page for
  as long as the sentence lasted. Two other ways were tried and both failed. The
  engine's own `onboundary` reports the character each word starts at and is
  exact, but many engines — iOS most of all — never fire it, and a page that
  never turns is the fault itself. A clock, timed from an estimate of how fast
  prose is spoken, turns something on every engine, but it is a guess: early on
  a page of long names, late on a page of dialogue. So the sentence is cut
  instead. The part that fits on the page is one utterance and the rest is
  another, and the engine's `onend` says exactly when to turn. No estimate and
  no engine-specific event. The cut is backed up to a space, so no word is said
  in halves. The cost is a small pause at the break, which falls where the page
  turns and reads as the turn. — 2026-08-25
- **A spoken utterance carries the language as well as the voice.** Choosing a
  voice changed nothing on the phone. Several engines pick a voice from `lang`
  and ignore `voice` when the language is unset or disagrees with it. Both are
  set together now, from the chosen voice's own language tag. Picking a voice in
  the Aa tab also says one short line in it, so a reader can hear the choice —
  and can tell "the app ignored me" apart from "this phone has one voice under
  many names". — 2026-08-25
- **A reading starts at the sentence the reader picked.** An anchor names a
  paragraph, so starting from the anchor read the paragraph from its first word
  however far down the reader had selected — reported from the phone. `startOf`
  now takes the selected words too and finds the sentence they begin in.
  Selections come in three sizes — part of a sentence, one sentence, several —
  and all three begin in the same place, so it matches either way round.
  Unmatched words fall back to the paragraph's opening. — 2026-08-25

## Settled 2026-08-26 — keeping a line Veda said

**The reader can keep one sentence out of one of Veda's answers.** Select words
inside an answer, and a small card gives two choices: **Save** and **Ask**.

- **Save** writes a note with `author: 'claude'` and a new field, `fromThread`.
- **Ask** puts the words in the question box as a block quote, and stops.

### Why `fromThread` and not a new author

The author is who said the words, and Veda said them. `fromThread` names the
conversation the line came out of. Its presence is the whole difference between
a kept line and a whole conversation, and it is a stored fact, not a guess at
the text. It also sends a tap on the quote back into the conversation. A line is
worth keeping because of what it answered.

### Why Ask writes no question

A prefilled question is a question the reader did not ask, and a canned question
earns a canned answer. The block quote is enough: Veda is sent the whole thread,
so she sees her own line in the place she said it.

**The model needs no prompt change.** This is an ordinary next turn.

### Why the popup is not `SelectionMenu`

The book's menu carries drag handles, sentence and paragraph snapping, and five
highlight colours, and every one of them is filed against a paragraph's anchor.
An answer is markdown in a bubble. It has no anchor grammar and nothing to
highlight it with.

### "By chapter" stopped being a chip

The chips ask *which notes*. "By chapter" asked *arranged how*, and it showed
exactly what All showed — two of five chips looked like one button. It is now a
switch beside the chips, and it applies to whichever chip is on. **Quotes by
chapter** is a thing a reader wants, and the chip could never offer it.

**Veda quotes** took the empty place. The chips now read: All · Quotes · Veda ·
Veda quotes · Words. Quotes are the book's best sentences; Veda quotes are hers.

The switch is hidden on **Words**. A word has no anchor, so it belongs to no
chapter.

### The phone's own selection bar — fixed 2026-08-26

The first build let the browser select the words and put a card above them. On
Android the phone's own Copy/Share bar goes in exactly that place and covered
the card. **No page can ask a phone not to raise that bar.** The book met this
first; the note at the foot of `Reader.module.css` says so.

So Veda's answers are **not selectable on a touch screen**. A long press picks
the word under the finger, and the app paints it. The phone never holds a
selection, so it has nothing to raise a bar over. A mouse keeps the browser's
selection: there is no bar to hide on a desktop.

The card carries three actions now: **Copy · Save · Ask**.

`selection.ts` grew an anchor-free half — `describeSpan`, `wordAtIn`,
`spanBetween` — because every step except the anchor is the same work. An answer
has no anchor: it is markdown in a bubble, not part of the book.

`AnswerPick.tsx` draws it. It is not `SelectionMenu`, which carries five
highlight colours, sentence and paragraph snapping, and a Define that only means
something on a word in a book.

**Known, and left alone:** a pick that runs across two paragraphs joins them with
no space — "did.And that". A Range's text is the characters it covers, and there
is no character between `</p>` and `<p>`. The book's highlights have always read
this way. Changing it means building the words some way other than from the
range, in code the book shares.

### Dragging a pick, and the glass over the finger — fixed 2026-08-26

The reader's report: "I cannot drag my selection, and I cannot select more than
a word."

**Cause.** The listener that puts a pick down when a finger lands outside the
answer counted the app's own handles as "outside". `AnswerPick` draws them into
`document.body`, so they are outside every answer. Touching a handle destroyed
the selection before the drag began. One word was the most anybody could take,
because the handles are the only way to grow a pick.

**Fix.** Everything `AnswerPick` draws now carries `data-pick`, and the listener
honours it. The mark is load-bearing, not decoration.

**Also added:**

1. **Slide without lifting.** After the long press, keep sliding and the pick
   grows. That is how a phone's own long press behaves. Finding a three-pixel
   handle was the only way before.
2. **One range per frame.** A finger reports faster than the screen redraws.
   Moves are coalesced to animation frames, in the handles and in the slide.
3. **`touchmove` is refused while a pick grows.** `touch-action` cannot do this:
   the browser reads it when the finger lands, and at that moment nobody knows
   whether this is a long press or a scroll. Declaring the answers unscrollable
   would take away the ordinary swipe.
4. **A magnifier.** A fingertip is nine millimetres across and the text under it
   is two. Chrome draws its magnifier in the compositor, which no web page can
   reach, so this scales a `cloneNode` copy of the answer, shifts it so the
   finger's point sits in the middle, and clips it. The wash is drawn again
   inside from the same rectangles, so the reader sees the boundary move.

   It is a still copy, not live pixels. Close, not identical.

### The wash stayed behind when the conversation scrolled — fixed 2026-08-26

The reader picked several paragraphs, scrolled to read the rest, and the violet
stayed where it was while the words slid out from under it.

Everything the picker draws sits in **viewport coordinates**, because that is
what `getClientRects` answers in. Those numbers are true when they are taken and
false as soon as anything moves.

The range does not go stale. It is a pair of nodes and offsets in a document
that has not changed, so it is measured again on every scroll and resize — on an
animation frame, and with `capture`, because the conversation is what scrolls and
a scroll event does not bubble.

**The listener depends on whether a pick exists, and on nothing about which one.**
`describeSpan` clones the range, so both the selection and its range are a new
object after every re-measure. Depending on either would tear the listener down
and build it again on every frame it ran.

### A kept line keeps its marks, and knows its way home — 2026-08-26

The reader saved a line out of one of Veda's answers. Under Notes it arrived as
flat prose: the bold, the bullets and the headings were gone. A tap on it opened
the right conversation, but at the top, not at the line.

**Two readings of the same words are stored.** `text` holds the markdown, and
`quote` holds the plain words. Each does a job the other cannot:

- The Notes tab draws `text`, so the line reads as the reader saw it.
- The lamp searches its answers for `quote`. The marks are not on the page — the
  page holds a `<strong>`, never two asterisks — so the markdown could not be
  searched for.

**The marks are written back from the drawn words, not cut out of the source.**
The answer's markdown source is on the message, so cutting the picked piece out
of it looks simpler. It does not work. Rendering is not reversible: a `#` becomes
a heading with the hash gone, a table becomes a stack of terms and values in a
different order, and a pick across two paragraphs is one run on screen and two
blocks apart in the source. `reader/pickMarkdown.ts` walks `cloneContents()` and
puts the marks back on, keyed on the `data-md` attributes the renderer writes.

**Tables are not written back.** The renderer draws a table as a stack, because a
grid on a phone is unreadable. Writing `|` rows back would invent a shape the
reader never saw. The words are kept as the paragraphs they were drawn as.

**Failing to find the line must not cost the reader the thread.** An answer can
be edited away. When the words are not there, the conversation still opens.

**The chapter now sits above a kept line**, as it does above a Quote. Where a
line came from is how the reader finds it again.

### The chapter name goes above every note — 2026-08-26

The reader asked for it over Veda's conversations, after it moved over Veda's
Quotes. All three kinds now read the same way: chapter first, then the words.
Where a note came from is how the reader finds it again, so it goes where the
eye lands first.

A numbered list in Veda's hand also got a rule of its own. The bullets are drawn
by hand because `::marker` draws a dot too small to see; a number is large
enough, and it is already violet because `.item::marker` reads `--md-mark`. What
it needed was room — Kalam's digits are wide, and the shared indent was measured
against a serif face.

### The saved line was still flat, and the tap still missed — 2026-08-26

Two real faults, both found by tests that go through the whole road rather than
a part of it.

**1. `cloneContents()` loses the ancestry.** The fragment it returns keeps
everything *below* the range's common ancestor and nothing above it. Pick from
inside the first item of a numbered list to inside the last, and the common
ancestor is the `<ol>` — so the fragment holds bare `<li>` elements with no list
above them. Nothing was left to tell an ordered list from an unordered one, and
every numbered step came out as a bullet.

This is not an edge case. A finger picks *inside* text, never around it, so it
is what happens every time.

`pickMarkdown.ts` now walks the **live page** and clips each text node to the
part the range covers. An element there still knows its parents.

**The lesson, and the reason the first fix looked right.** The tests built their
HTML by hand and selected whole nodes. Both choices hid the fault. A test now
renders a real answer with `Markdown` and builds the range the way a finger
builds one — `flatten` plus `rangeOfSpan` — which is the only shape a phone ever
produces.

**2. A line kept before the plain words were stored could never be found.**
`quote` is new, so every note the reader already had has only its markdown, and
the marks are not on the page. The search matched nothing and the reader landed
at the top of the conversation each time.

`wordsIn` now tries three things, each more forgiving: the plain words, the same
words with the marks stripped off, then the longest opening that is really
there — a word at a time, because a note and an answer can differ by a comma. A
scrap under 12 characters is refused: "A s" is in half the sentences in the book,
and landing on the wrong one is worse than not moving.

A conversation row is never sent hunting. Its text is the excerpt and the answer
glued together, which is in no answer on the page.

### Why four fixes changed nothing on the phone — 2026-08-26

The reader sent the same picture four times. Two reasons, and neither was in the
saving path after the second fix.

**1. A note already written cannot be fixed by fixing the writer.** The line was
saved as plain prose, and every later change touched only how *new* lines are
saved. The stored note is the note. This was said but not acted on, which is the
same as not saying it.

`recoverMarkdown` in `pickMarkdown.ts` now mends the old ones. A kept line names
its thread, the thread holds what Veda actually wrote, and that is markdown — so
the words are found in the answer and the marks are read off around them. Only
when the stored line has no marks of its own; a line kept today is left exactly
as it was saved.

It compares with **every space removed from both sides**. The stored line came
from `range.toString()`, which puts nothing between two blocks — "noticed."
and "Unconscious" are one word to it — while the source has a line break, a list
marker and asterisks. Taking the whitespace out is what makes the two meet.

**2. The app on the phone was probably not the app that was built.** This is a
PWA with `registerType: 'prompt'`. A new build waits for the reader to accept an
update; until they do, the phone keeps running the old bundle from its precache.
Four deploys can therefore change nothing at all on the device.

**The lesson for verifying.** "Built and pushed" is not "running on the reader's
phone", and a test that builds its own HTML is not a test of what the renderer
draws. Both failures were failures of verification, not of the fix.

### A mended line must close the marks it opens — 2026-08-26

The reader's last bullet showed its asterisks and no bold. A match ends on the
last character the reader can *see* — the full stop — and the `**` that shuts a
bold run sits just past it. Cutting there gave a line that opened bold and never
closed, so the renderer drew the marks themselves.

The slice now takes the marks immediately after the last word, and only those:
never across a line break, because the marks that open the following block
belong to it.
## Settled 2026-08-27 — the chapter summary page

One read-only page. It shows a book by chapter. Each chapter has two sections:

1. **The chapter, in plain words** — what the **Librarian** model wrote about
   the chapter, and the tags it gave the chapter.
2. **What we worked through** — what the **Scribe** model wrote about the
   reader's questions to Veda about that chapter.

The two models are not built. See "the stubs" below.

### The first build was larger, and the reader cut it back

The build prompt asked for two pages: this one, and a **Commonplace Book** that
filed each distilled claim under a concept heading. Both were built. The reader
then removed the second one.

**Why.** The concept index needed a lot of machinery to earn its place: a
controlled vocabulary of concept names, a status for each name, a candidate
state for a name the passes had not confirmed, a per-claim passage anchor, and
two-way crossings between the pages. All of it existed to serve one index.

The reader wanted something simpler: a chapter summary, and a summary of the
conversation. Two models, two sections, nothing else. So the Commonplace Book,
the concept type, the claim items, the anchors and the candidate state are all
gone. The tags stayed, because the Librarian gives them anyway.

It is all in git. `web/src/pages/Commonplace.tsx` and its test were deleted, not
rewritten.

### The tags are chips, and they are not links

A tag says what the chapter is about. There is no page behind it to open. A
tappable chip would promise one. So the tags render as a plain list, styled in
the same violet the rest of the page uses.

### The fonts are self-hosted, not loaded from Google

The build prompt says to load Playfair Display, EB Garamond and Caveat from
Google Fonts. `web/src/styles/fonts.css` forbids this. The rule at the top of
that file is clear: a font from a CDN does not exist on a train, and it sends a
third party a request each time a reader opens a book.

The reader chose to keep the rule. So:

- EB Garamond and Caveat were already in the bundle. They needed no work.
- Playfair Display is now `@fontsource-variable/playfair-display`. The Latin
  file only, as `fonts.css` does for every other face.

Playfair is **not** in the `--face-*` list in `theme.css`. Those tokens feed
`--font-reading` and the reader's own font picker. Playfair is a display face
with high contrast. It is good for a heading and bad for a page of prose. No
reader should be able to choose it for a chapter.

One thing this fixed by accident: `Home.module.css` named Playfair for years
without the font being in the bundle. That heading fell back to Merriweather.
It now shows Playfair.

### This page ignores the reader's theme

Every other screen takes its colour from `theme.css` and follows one of the ten
themes. This one does not. It uses one fixed palette: paper `#F4EEDF`, page
`#EAE2CE`, ink `#302C24`, violet `#5D4F9E`, bronze `#A9814B`.

The reason: the design is a paper object. It has a spine crease and a thumb
index. Mapped onto `--color-bg` the page stops being that object and becomes one
more screen.

**The known cost.** A reader in Dark who opens this at night gets a bright page.
The reader chose this with the cost stated. If it turns out to be wrong, the fix
is a dark set of these tokens only. Every rule already reads them through
`var()`.

### The page sits outside `AppShell`

`/book/:bookId/chapters` is full-bleed, like Reader and BookInfo. The shell's
top bar and drawer are in the app's own colours. Wrapped around a page that
pretends to be paper, they undo the thing the design does. The page carries its
own way back instead.

### The way in is one link on Book Details, not a drawer entry

The page shows sample content. Neither model is built. A navigation entry would
advertise a feature whose data is invented.

So `BookInfo.tsx` has a section, "Chapter summaries", with one link. It is built
like the "Coming back to it" section above it, so it looks native.

### What a model wrote is parsed, never set as HTML

Both summaries carry a little inline markup: `<em>`. `summary/claimNodes.ts`
turns that string into a list of pieces. The page renders real elements from
them.

`dangerouslySetInnerHTML` would be shorter. It is wrong here. Today the text is
hand-written and safe. Tomorrow it is what a model wrote about what a reader
pasted into a book. A model asked for `<em>` will sometimes give more than
`<em>`. By then the hole is in shipped code that nobody looks at.

Two tags are understood. Everything else is text. A `<script>` renders as the
characters `<script>`.

### The fixture answers for any book, and this is temporary

`summary/fixture.ts` gives its sample chapters for **every** book it is asked
about, not only for *Memories, Dreams, Reflections*.

This is a deliberate lie and it is marked as one in the file. The page is
reached from a button on a book's own details page. A reader opens it on the
book in front of them. Keyed strictly by title, the sample content would only
appear for a book nobody owns. The page would be blank exactly when someone went
to look at it. That defeats the reason for shipping the page early.

A real data source keys by book, and this goes away with it. The page prints the
reader's **own** book title above the sample chapter, so nothing claims to be
Jung's book.

### The page opens on the first chapter that has something in it

Not on chapter 1. Most of a book has no summary for most of its life. Opening on
chapter 1 shows an empty page and reads as a feature that does not work.

`ChapterListEntry.distilled` says which chapters a model has been through. The
rail still lists every chapter, done or not — a reader needs to see the whole
book, not only the finished parts.

### An empty second section is normal, not a gap

A reader can finish a chapter and ask nothing. The page then says so in its own
italic ink. It does not treat silence as missing data.

### The stubs, and where the two models join

`summary/dataSource.ts` holds the one seam. It is an interface with a swap
function. The fixture is the only implementation today.

Not built, and marked `TODO: the Librarian and the Scribe`:

1. The **Librarian** — reads one chapter and gives the plain-language summary
   and the tags.
2. The **Scribe** — reads the reader's conversation with Veda about that
   chapter and gives the summary of it.
3. **When they run** — at the end of a chapter, and after a conversation.
4. **Where the output is kept** — the storage writes, and the Obsidian export.
5. **Model routing** — best available model through OpenRouter, or the existing
   `api/` endpoint.

The reader will supply both prompts. Nothing should be built until they land.


## Settled 2026-08-27 — the Librarian and the Scribe run

The two models are wired in and they run. The reader supplied both prompts.

### The prompts are golden, and this is enforced

Both prompts came from outside this repo. The reader's instruction was plain:
copy them, do not change a single word.

`api/prompts/librarian.md` and `api/prompts/scribe.md` are the source. They were
copied byte for byte and checked with `cmp`.

`api/prompts/text.ts` is generated from them by `scripts/build-prompts.mjs`, so
the serverless functions can import the text. Reading a file at runtime is the
part Vercel makes fragile.

Three things protect the bytes:

1. The text is written with `JSON.stringify`, not a template literal. A template
   literal needs the backticks inside these prompts escaped by hand, and a
   hand-written escape is how a golden file quietly changes.
2. `.gitattributes` pins all three files to LF. Both prompts arrived LF-only. On
   Windows, git's default hands them back as CRLF at checkout, which changes the
   text of a file nobody may change.
3. `web/src/summary/prompts.test.ts` regenerates and compares. It fails if
   anyone edits the generated file, or edits a `.md` and forgets the script.

### Each golden prompt is the whole system prompt

The relay puts a base prompt in front of every job: `BASE_PROMPT` for the tutor,
`RECORDER_PROMPT` for the digest jobs. The Librarian and the Scribe get neither.

They are marked `standalone` in `MODULES`. The reason is that a base would argue
with them. `RECORDER_PROMPT` says "never editorialise"; the Librarian is told to
use analogies and a warm voice. Sending both would have the relay contradict a
file nobody is allowed to edit.

### The schema is sent with the material, not written into the prompt

Both prompts end by saying they return "the exact schema requested by the
application". So the application requests it. The JSON shape rides in the user
message beside the material and the concept list.

This is what makes "do not change a word" and "return the shape we can parse"
both true at once.

### The prompts wanted the concept model that was deleted that morning

This session deleted the Commonplace Book, the controlled vocabulary and the
candidate state. Reading the prompts showed they specify all three. The Scribe
does not return a paragraph; it returns a list of claims, each with a concept
name and a source pointer.

The reader then explained the destination: **Obsidian**. The concepts are meant
to become links between notes in a vault. That resolved it.

**The decision.** Store everything, show a little.

- Every claim, concept name and anchor is stored in `summaries`.
- The page shows the recap, the concept names as chips, and the claims one to a
  line.
- The concept names and anchors are not drawn. They are what the Obsidian export
  will be built from.

Nothing is wasted and nothing was rebuilt. The concept index is not coming back
into the app: Obsidian is that view, and it is the tool the reader wants.

### The claims are laid out one to a line, not welded into a paragraph

The page has one section for what the Scribe returns, and the Scribe returns a
list. Joining them into a single paragraph would need connective sentences, and
nothing in this app may write words and present them as a model's.

### Which chapters are finished is worked out, not recorded

Nothing in the database records chapter completion. `percent` is a whole-book
number.

`summary/queue.ts` derives it from the stored anchor: the reader is inside a
chapter, so every chapter before it is done. The chapter they are in is not —
being on the last page of chapter four is not finishing it, and summarising a
chapter in progress spends a call on a summary that is stale within the hour.

One exception. At 100 percent the chapter holding the anchor counts too, because
the anchor never moves past the last chapter of a finished book. Without it, the
final chapter of every book the reader finishes would never be summarised.

### One book runs on its own; every other book asks first

The reader's rule. The book they opened last summarises its finished chapters
automatically. Every other book raises a question in the bell and waits.

The reason is money. A shelf of forty half-read books would otherwise fire off a
hundred paid calls the first time the app came up.

Chapters inside a book run in reading order. Both prompts match concepts against
the vocabulary built so far, so running chapter nine before chapter four would
hand the Librarian a list missing names it should have matched — and the vault
would grow two notes for one idea.

### The vocabulary is library-wide and survives a deleted book

`concepts` is not keyed by book and does not cascade when one is deleted. A
concept met in a memoir and again in a neuroscience book must come back with the
same name, or the vault grows two notes for one idea. The vocabulary outlives
any one book, the same way saved words do.

### A model may not talk its way into the vocabulary

`summary/parse.ts` enforces two rules that the prompts only ask for:

- A concept whose status is missing is treated as `existing-match`. Guessing
  "new" would add an unvetted name to the controlled vocabulary.
- A Scribe item is only `linked` when its concept is actually on the supplied
  list. The prompt forbids inventing an approved concept; this is where that is
  enforced rather than trusted. A model that marks its own invention `linked`
  must not be able to write a new note into the vault.

### Nothing runs while the app is closed

This is a PWA. There is no server-side job and no push subscription.

`startSummaries()` sweeps at launch and again whenever the app returns to the
front. That second trigger is the ordinary case: finish a chapter, lock the
phone, come back later.

So a summary appears the next time the reader opens Reading Buddy, not the
moment they close the book. Anything better needs a server, and that is a
separate decision.

### The bell follows the theme; the chapter page still does not

The bell sits on the front door beside the greeting. It is app furniture, so it
takes its colour from `theme.css` like everything else there. A fixed cream
panel would look like a sticker on whichever of the ten themes is on.

The chapter page it leads to keeps its own paper palette, for the reasons under
"the chapter summary page".

### What is not built

- **The Obsidian export.** Deliberately last. The reader is new to Obsidian, and
  the export should be shaped by how they actually use it, not by a guess. The
  data it needs is being stored from today.
- **Promoting a candidate concept.** The Scribe raises candidates; nothing yet
  approves one into the vocabulary.
- **A cap on spending.** The queue skips work that is already done, and only one
  book runs unasked. There is no ceiling beyond that.


### The bell is the second door to an update — 2026-08-27

Reading Buddy asks before it updates itself. The reader reported the failure
this causes: they take the update whenever they are offered it, but one time the
prompt did not appear, and then there was no other way to get the new build.
Their phone kept running old code however many times `main` was pushed.

The bell now carries a waiting build as its top line, with an "Update now"
button that runs the same `applyUpdate()` the panel does.

Two details are deliberate:

- **It is live state, never a stored row.** A stored "an update is waiting"
  would outlive the update that answered it and sit there lying.
  `onUpdateReady` already tells a late subscriber immediately, so the bell
  learns about a build that was found before it mounted.
- **It stays in the unseen count after the bell is opened.** Every other line is
  marked seen the moment the reader looks. This one is not. The badge is the
  only thing between a missed panel and a phone that never updates again, so it
  clears when the update is taken and in no other way.


### A helper in `api/` broke five deploys, silently — 2026-08-27

The generated prompt module was first put at `api/prompts/text.ts`. Vercel
treats every file under `api/` as a serverless function and wants a default
export from each one. That file is two exported strings, so the build failed.

**What made it bad was the silence.** Five commits went to `main`, each after a
green local build and a green suite, and none of them deployed. The phone kept
running the last good build, so the reader saw sample content and no bell, and
reported it as a bug in the app. Nothing in this repo could tell the difference
between "deployed" and "pushed".

The folder is now `api/_prompts/`. A leading underscore is Vercel's documented
way to mark a helper that is not a route.

**The lesson, and it is the same one as the service worker.** "Pushed" is not
"deployed", and "deployed" is not "running on the phone". Three states, and this
project has now been bitten at both joins. Proving it took one command: fetch
the live `index.html`, read the bundle hash, and compare it with `web/dist`.
Do that before believing a deploy happened.

### The prompts are written into `api/tutor.ts`, not imported — 2026-08-27

The entry above moved the module to `api/_prompts/`. That failed too. Vercel
typechecks `api/` without `allowImportingTsExtensions`, so the `.ts` at the end
of the import path is an error there (TS5097), and the bundler then could not
resolve the module at all.

`api/tutor.ts` had no imports of local files before this work, and neither does
any other file in `api/`. There was no working example to copy. So the text is
now generated straight into `api/tutor.ts`, between two markers, beside the two
prompts that already live there. Nothing for a bundler to resolve.

The two `.md` files in `prompts/` stay the source of truth, outside `api/`.
`prompts.test.ts` re-runs the injection and compares, so an edited prompt that
was never regenerated fails the suite.

### A screen reads `storage/index.ts`, never `storage/repository.ts` — 2026-08-27

Every chapter summary page was empty. The cause was one import, repeated in four
files. `storage/repository.ts` is the device store. `storage/index.ts` picks the
device store or the cloud store from the reader's own setting. The reader's
library is in the cloud, so the pages queried an empty local database.

No unit test could see it: a test has no backend choice to ignore.
`summary/repository.test.ts` therefore reads imports, not behaviour. It fails
if any file in `summary/`, `pages/` or `tutor/` imports `repository` from the
device store.

**The lesson is about method, not code.** Two hypotheses were guessed and both
were wrong, and the reader paid for both. Grepping every `import { repository }`
in the tree found the answer in one step. Read the data first.

### A titled section is summarised as its own unit — 2026-08-27

Some books name sections inside a chapter. The reader asked for those to be
treated as chapters. They are summarised as well as the chapter, not instead of
it — a recap of the whole chapter is still what a reader wants first.

A part row lives in the same table as a chapter row. The primary key is already
`[bookId+chapterId]`, and the new fields (`section`, `sectionTitle`) are not
indexed, so this needed no schema change.

Parts are offered for the chapter the reader is still inside, not only for
finished chapters, because a part they have passed is finished even if the
chapter is not.

### The rail is two rows on a phone — 2026-08-27

The parts first appeared as a list on the page. The reader rejected it: parts
belong where chapters are. The rail now has two strips, chapters above and parts
below, each scrolling sideways on its own.

Two levels folded into one strip would make the reader read every label to learn
which level they were on. Two rows say it before a word is read.

**The bug it caused is worth remembering.** A grid child and a flex child report
the full width of their contents as their smallest size. So the strips, which
are wider than the screen on purpose, pushed the whole card off the screen and
took the text with it. The cure is three declarations: `minmax(0, 1fr)` on the
column, `min-width: 0` on the rail and each strip, and `flex: 0 0 auto` on each
tab. Without the last one the labels squeeze together and the strip never
scrolls at all.

### The model that writes summaries is chosen apart from Veda's — 2026-08-27

The reader asked for the best model on summaries. A summary is written once and
read many times, so it is worth more than a chat turn. Settings now holds a
second picker. Empty means "same as Veda", which keeps one setting for a reader
who does not care.

Every summary also records which model wrote it, and the page prints it. The
relay already returned the name; the client was throwing it away.

### A summary is written in two halves that run on their own — 2026-08-28

The Librarian writes the chapter recap; the Scribe writes the notes from the
reader's questions. They were always two calls, but one button ran both. Each
half now has its own Copy and its own Redo, and a redo of one shows its dots in
its own place. The other half stays on screen, because nothing is rewriting it.

### Every relay call streams, watched or not — 2026-08-28

The host gives an edge function about twenty-five seconds to send its first
byte. A recap of 800 to 1,200 words written whole before a byte leaves runs past
that, the host answers 504, and the finished words die with the connection. A
stream sends its first byte at once and holds the line open. This is why the
Scribe and the four memory jobs stream although nobody watches them write.

### Three failures, three different causes — 2026-08-28

Worth keeping apart, because each says something different about what to do
next. **413** is Groq refusing before it starts: a whole chapter is larger than
a free key may spend in a minute, so that rung is skipped. **429** is a model
that is busy. **504** was ours, and is fixed. A fourth, which looked like all of
them: a cut-off answer whose JSON would not parse. `JSON.parse` refuses the
whole string over one missing brace, so a recap the reader had watched appear
was thrown away. The live view's own walk now recovers it.

### The staleness test counts questions, not passages — 2026-08-28

A thread is one passage. A reader who asks three follow-up questions about the
same paragraph adds three exchanges to one thread, so a count of threads did not
move and the follow-ups were never summarised.

### The book screen is a paper object, like the summary page — 2026-08-28

Rebuilt from `design-inspiration/reading-desk-v2.html`. It does not follow the
reader's theme, for the reason the summary page gives: mapped onto `--color-bg`
it stops being a desk. **Violet is Veda's alone** — her block and the action
that opens what she wrote, never a generic control. The chapter summaries are
one door, so a finished book moves them into the violet slot and folds Veda's
block away rather than showing both.

The notes field and the quotes list left the screen. Both tables and every
repository method stay; only the UI is gone.

### Settled 2026-08-28 (the Statistics screen)

- **A reading session is one visit to a book.** It starts when the book opens
  and stops when it closes. The first build paused after two minutes with no
  page turn, scroll or tap; the reader removed it mid-build. A half-hour spent
  arguing with Veda about one paragraph is reading, and an idle detector cannot
  tell that apart from a phone on a table. The known cost is stated in
  `stats/clock.ts`: a book left open counts. The one guard is a six-hour cap on
  a single session, which catches a night on the nightstand and no honest
  sitting.
- **The session row is written every 30 seconds, not once at the end.** A phone
  can kill a suspended tab without running any teardown. Written only on close,
  every session ended by the operating system would vanish — and those are the
  long night-time ones. The id never changes, so this is one row that grows.
- **Sessions are device-local, and they do not follow the reader.** A new Dexie
  table outside `Repository`, the rule `tutor` and `notes` already follow: the
  cloud backend has no such table, and adding one is a Supabase table, a cached
  read and an outbox entry, not one method. The cost is accepted.
- **Deleting a book does not delete its sessions.** Every other per-book table
  cascades. This one follows `vocabulary`: you did read on those days, and a
  streak is a fact about the reader, not about a book still on the shelf.
- **"Tracking start" is derived, never stored.** It is the earliest session's
  day, one indexed lookup. A stored copy is a second version of a fact the rows
  already hold, and a second version is a thing that can disagree.
- **The delta compares equal *elapsed* lengths, not equal calendars.** On a
  Friday, five days of this week are compared with last Monday to last Friday.
  Comparing a part-week against a whole one is not a reading of "up 22%", it is
  an arithmetic guarantee of "down".
- **A delta against zero is not shown.** "Up 100% from nothing" looks measured
  and is not. The line says "nothing read last week" instead.
- **The scope toggle drives three cards and no others.** The period summary, the
  Veda card and the chart. Not the streak, not the heatmap, not the genres —
  those three answer questions about a habit and a shelf, and "this week" is not
  a sensible slice of either.
- **The fourth Veda tile is "tags created", not "revision flags cleared".** The
  design reference asks for the latter and nothing in the app sets or clears a
  revision flag. The tile counts the distinct concept names Veda wrote when it
  summarised a chapter in the period — the tags the reader takes to Obsidian.
- **One book counts under one genre.** Bars that sum to more than the library
  cannot be read: "3 Philosophy" has to mean three books. The top-level BISAC
  segment is matched first, across every heading, before any qualifier — without
  that pass "Business & Economics / Economic History" lands on History, a
  trailing qualifier outranking the shelf the book is filed on. A unit test
  found this, not a reading of the code.
- **A book with no usable heading is said out loud, never folded into "Other".**
  An unmatched book is a gap in the catalogue, not a reading habit.
- **The screen does not follow the reader's theme.** The same call the chapter
  summary page made, at the same known cost. Here the argument is sharper: the
  whole screen is a colour system — the warm ink ramp, the violet that means
  Veda alone, forest green for a primary action, amber for time. Remapped onto
  ten themes they stop being a key and become decoration.
- **The old Stats screen said "no streaks, no pressure". That was reversed on
  purpose.** Product Principle 4 declined streaks outright; the reader asked for
  one by name and it is now the first card.
- **A CSS lesson worth keeping.** `.seg button` is a class-plus-element selector
  and out-specifies a bare `.segOn`, so the selected pill rendered the same
  colour as the unselected ones. The same fault hit the chart legend and the
  calendar's Apply button. Every modifier in `stats.module.css` is now scoped to
  its parent. The browser found this; the code read as correct.

## The day's reading is drawn as a git log

Settled 2026-08-28. The reader proposed it, in these words: "it's like git where
we know every action."

**The problem.** A heatmap square said "63 min". That is true and the reader
cannot check it. It does not say which book, or how many sittings, or what they
did while they were there.

**The borrowed shape.** A git log is readable for three reasons, and a day of
reading has all three problems:

1. It groups by repository. Two books in a day are two repositories.
2. It hangs each change off one line, with a quieter diff line under it. A
   sitting is a commit; time, highlights and chats are its diff.
3. It squashes the noise. A ten-second look at the subject tags is the typo fix
   nobody needs to read.

**What each part maps to.**

| git | Reading Buddy |
|---|---|
| repository | a book |
| commit | one sitting |
| timestamp and message | the time it started, and the chapter reached |
| diff line | duration · highlights · chats with Veda · Q&A |
| squashed commits | sittings under a minute, folded and openable |

**The rules that came out of it.**

- A squashed session is hidden, never discounted. It still counts in every
  total. Squashing is a way to draw the day, not a way to shorten it.
- A count of zero is left out. "0 highlights" is noise.
- Q&A appears only beside the chats it happened in.
- Violet marks anything of Veda's, here as everywhere else in the app.
- Marks and questions are counted by *when they happened*, against the session
  that was running at that moment — never by a thread's own dates.

**What the analogy does not buy.** A git log can show a diff because a file has
lines. A reflowable book does not: it paginates at the reader's own text size,
so "+24 pages" would be arbitrary. The diff line therefore reports what the
reader *did* — marked, asked — and not how far the text moved. See
`docs/active-task.md` for the sections-advanced idea that would replace it.

## The goal changes with the period

A day and a year do not ask the same question. "Did I read for two hours?" is a
fact about today that the reader can still act on. "Have I read twelve books?"
is a fact about a year that one evening does not change. So the target under
"A closer look" follows the scope:

| Scope | Target | Unit |
|---|---|---|
| Day | 2 hours | minutes |
| Week | 14 hours (seven days of the daily target) | minutes |
| Month | 1 book | books finished |
| Year | 12 books | books finished |

Three rules hold it honest:

1. A custom range gets **no goal**. The reader invented the window, so no target
   was ever agreed for it. Prorating twelve books over a hand-picked stretch
   would make a number with nothing behind it.
2. The bar stops at full; the percent does not. A three-hour day reads "123%".
3. The year's pace is flat, not calendar-based. On 15 February the reader is due
   half a book. A half-book gap rounds to **on schedule**, never to "1 book
   behind" — the screen must not scold arithmetic.

The targets are constants in `stats/goal.ts`. They are the one thing here a
settings page would later own.

## The focus window shows when, not how much

The 24-hour spectrum is the only card that answers "when do I read?". It is the
part of a habit a person can move.

- A sitting is **spread** across every hour it touched, in proportion. Filing
  all 63 minutes of an 8:48 pm sitting to the eight o'clock hour would draw a
  spike at the wrong hour.
- The **active** minutes are spread, not the wall-clock span. Only the reading
  is a fact. Spreading it evenly inside the sitting is an assumption, and the
  honest one: we never recorded which minute the reader looked away.
- Bars are scaled against the busiest hour, not against the target. A morning
  reader and a night reader should see the same shape at their own scale.
- The peak window is stated as a description with a percentage, never as a
  target. There is no good hour to read.

## Minutes follow the clock; a sitting follows its start

A sitting that runs 11:41 pm to 12:25 am is 19 minutes of one day and 25 of the
next. Counting all 44 against the day it began made a reader who read past
midnight see nothing on the new day, and no progress on that day's goal.

So the screen answers two different questions two different ways:

- **Quantities** — the heatmap, the streak, the period total, the goal, the
  chart, the hours of the day — are measured against the clock. A session lends
  each window only the minutes that fell inside it. `stats/spread.ts` is the one
  place that rule lives.
- **Events** — the commit log — file a sitting under the day it began, the way
  a commit keeps its author date. One sitting is one row.

Two rules keep the two from contradicting each other:

1. A row that crossed midnight shows `19 min of 44 min`, so the day's total adds
   up in the reader's head.
2. A session counts toward a period if it *touched* it. Counting only sessions
   that *started* in the period produced "25 minutes read across 0 sessions".

The minutes inside a sitting are spread evenly across its span. We never
recorded which minute the reader looked away, so this is an assumption — and
because it is a proportion, the parts always add back up to the whole.

## The heatmap opens as one week

A year of squares is a third of a phone screen. The question a reader has on
most days is "how is this week going?", so the card opens as seven squares with
no controls, and one tap opens the year.

Collapsing keeps the reader's place: with a day selected, the strip shows *that*
day's week, not this one. The year is a way to travel, and a card should not
undo the journey when it shrinks.

## The range calendar turns its pages

The pickable window is still [tracking start, today] — that guardrail did not
move. But the month arrows always work. A calendar that will not turn its own
pages is not a calendar, and the line under the month name says when tracking
began, so an all-grey month explains itself.

## The finish date is worked out from the reading, not from a page count

A reflowable book has no fixed pages, so a forecast cannot divide pages by a
reading speed. It divides two things the app actually measures:

    estimated total = minutes logged / (percent read / 100)

Nothing is guessed. Both inputs improve with every session.

Three rules keep it honest:

1. **It refuses to answer early.** Under 5% read, or under 15 minutes logged,
   the card shows a calibrating state instead. Dividing by a small percentage
   multiplies its error — at 2%, one wrong minute becomes fifty — and a reader
   cannot tell a bad number from a good one by looking.
2. **The drawn curve is effort, not position.** The app has never recorded what
   percentage the reader was at last Tuesday. So the past line is cumulative
   *minutes*, scaled so today's point is today's real percentage: flat on days
   not read, steep on long evenings. The card says this under the chart.
3. **The dotted reference line is the monthly goal**, one book in 30 days from
   the day this book was started. It is the only target the app has, and it is
   drawn in the faintest ink because it is a reference, not a demand. `Ahead` /
   `On track` / `Behind` compare the projection against it, with two days of
   slack either way.

Pace is the last seven days, falling back to the all-time average when the last
week is empty. A reader with no pace at all gets no date, and is told why —
"Infinity days" is worse than saying nothing.

The card appears only on a book being read now: a finished book has no finish
to forecast, and an unopened one has nothing to forecast from.

## The heatmap lets a day go

A selected square used to stay selected for ever, and its log with it. Tapping
the square again clears it, and so does a tap anywhere on the card that is not a
control. Nothing else on the screen holds a selection, and a card that will not
let go quietly costs the reader the rest of the page.

## Every heading below the chapter divides the book

A book has more than two heading levels. *Man and His Symbols* sets Part 1 as
`<h1>`, its parts as `<h2>`, and "The soul of man" as `<h3>` — a real title, in
the publisher's own markup, over eleven pages of prose.

The parser read only the two shallowest levels. Anything deeper became prose
with a `subheading` label. It looked like a heading on the page and divided
nothing. So it was not in the contents, the reader could not jump to it, and
Veda could not be asked to summarise it.

**The rule now: every heading level below the chapter opens a section.** The
model has two tiers, so a third level lands in the second one. The outline is
flatter than the book's, and it is true. A reader looking for "The soul of man"
finds it.

**One exception: a guessed heading.** `parse/html.ts` infers headings from type
size when a document has none of its own, and ranks the sizes per document. Those
levels are our arithmetic, not the author's. *The Mountains of My Life* opens a
part with five centred lines at two sizes; letting the deeper guesses divide
would cut that book into titles nobody wrote. A guess divides only at the exact
section level.

Measured on the whole shelf, before and after: *Man and His Symbols* 35 sections
to 57, *Be As You Are* 44 to 78, *Nondual Love* 21 to 42. Five books did not
move. No book lost a chapter or a paragraph.

`PARSER_VERSION` is 34, so every book on the shelf re-parses. A re-parse keeps
the reading position and the reader's own title. Anchors inside the new sections
move, so a highlight in one of them can be lost.

## A re-parse carries the reader's marks with it

An anchor is a position — `[ch06-s07-p003]` — and that is what makes a highlight
survive a re-import. Parse the same file twice and every paragraph lands in the
same place.

The rule holds until the parser changes how a book is divided. It did, at
`PARSER_VERSION` 34. In *Man and His Symbols* the paragraph that was
`ch06-s06-p050` became `ch06-s07-p069`. Nothing was deleted. Every highlight and
every conversation with Veda in the changed books pointed at a place that no
longer held those words, so none of them could be drawn.

**The marks are now re-found by their words, not by arithmetic.** Every mark in
this app already stores the text it is about: a highlight keeps its `quote`, a
thread keeps its `excerpt`. That copy was made because character offsets die on
the first re-parse. It answers this too, and answers it better than any
comparison of the old division with the new one could — the words are what the
reader marked, so finding the words again is finding the mark. It needs no memory
of the old parser, so it will work for the next change to the divisions.

`storage/relocate.ts` holds it, and `reparseBook` calls it. Four rules:

1. **Nothing is ever deleted.** A mark whose words cannot be found keeps the
   anchor it has. A passage the parser stopped producing is a reason to look, not
   a reason to throw away what somebody wrote.
2. **The old anchor decides between duplicates.** A passage a book prints twice
   goes to the copy nearest the mark.
3. **A quote under 12 characters is matched inside its own chapter only.** A
   dozen characters can honestly appear anywhere.
4. **Typography is folded before comparing.** Curly quotes, dashes and runs of
   space differ between two parses without a word of the book changing.

Bookmarks carry no copy of the book, only a label, so one is moved when its label
is still the opening of a paragraph and left alone otherwise. Veda's section
summaries carry no anchor either; they are re-pointed by `sectionTitle`, because
the summary of "The role of symbols" belongs to that section whatever number it
now has.

## The notes list reads newest first

The list has two shapes and they want opposite orders. Grouped under chapter
headings it is a way through the book, so it follows the book — that is what a
heading promises. Flat, it is a record of what the reader has been doing, and the
row they want is nearly always the last one they made. Book order buried it: a
reader forty pages into a long book scrolled past everything they had ever kept
to reach this morning's highlight.

The kept words were already newest first. The four note chips now agree with
them.

## A tap on blank paper is a tap on the page

A highlight is ink, not an element: it is painted, and there is nothing under
the finger to receive a tap. So the hit test used to ask for the caret position
under the point and then ask each highlight whether that offset was inside it.

`caretPositionFromPoint` never answers "nowhere". It snaps to the nearest text.
On the last page of a section — four marked lines at the top and the rest of the
column empty — every tap on that emptiness snapped into the highlight. The
reader could not raise the toolbar at all. The page had become one large button
nobody asked for.

**A range's own client rects are the ink**, one box per line. The test is now
whether the point is inside one of them, with six pixels of slop for the width
of a finger. Blank space is blank again. It also fixed a thing nobody had
noticed: a highlight in an off-screen column can no longer be hit, because its
boxes are off screen.

## A mark's page is measured, not estimated

The notes and bookmarks lists numbered every mark with the page its *section*
opens on. The exact page needs the words inside the section counted up to that
paragraph, and that needs the section's text — judged too expensive to draw a
list with.

It was too expensive when a section was a whole chapter. Since `PARSER_VERSION`
34 a section is a named part of one, and the sections a reader has marked are a
handful of small rows in the same local table the reading screen reads all day.
The error, meanwhile, had grown into the thing the reader saw: every mark in one
section reported one number. A highlight on page 92 said 72.

The sections holding marks are now read once, in the background, and each marked
paragraph gets its own number. Nothing waits for it: until it arrives, and for
any section that fails to load, the section-opening estimate stands.

## A kept line of Veda's follows its conversation

A re-parse finds every mark again by the words it stores. This works for each
mark except one. A line the reader keeps out of Veda's answer quotes *Veda*,
not the book. Those words are in no paragraph, so the search finds nothing and
the line keeps the old, wrong anchor. That is why only "Veda's Quotes" showed a
bad page number.

The line now takes its anchor from the conversation it came out of. The thread
is anchored to the passage they discussed, and that is where the line belongs.
So `relocateMarks` moves the threads first, then gives each kept line its
thread's new anchor. A line whose thread is gone falls back to the word search.

## One shade of the heatmap is one hour

The shades before this were set by a share of the reader's best day. So 88
minutes and 203 minutes could look the same. A shade now means a fixed amount
of time: 1-60 minutes, 60-120, 120-180, and 180 or more. Four shades,
one hour each, and the fourth is the darkest. A day with no reading takes no
shade and stays blank. The scale does not move, so two days that look alike are
alike.

## A session says which screen of the book it was spent on

A visit to a book is one session across all of its screens. That is right, and
it made every row say "Reading" — even a visit that was only the book details
or only the notes.

Each session now also records an activity. The rule is *where the time went*,
not where the reader left from: the active time between two flushes goes to the
screen that was open, and the longest total names the session. So a chapter
read with a glance at the notes is still the chapter. The pages are the default
and are never named, so old rows need no repair.

The routes name themselves (`/info`, `/chapters`, `/last-time`). The reading
screen reports its own panels, because the contents and the notes are panels
over it and the address cannot see them.

## Spirituality is its own genre

The genre bars read the publisher's subject headings, but the twelve buckets
are ours. The Religion bucket matched the fragment `body, mind`, so every book
shelved under "Body, Mind & Spirit" became religion — an astrology book showed
under Religion with the word nowhere in its tags.

Those headings now make a Spirituality bucket: body mind & spirit, spiritual,
meditation, mindfulness, astrology, occult, new age, yoga. Religion keeps the
books that say religion.

The buckets stay because one book must make one bar. A publisher gives a book
six to twelve overlapping headings, so counting them as they come gives forty
bars of one and a chart that adds up to more than the shelf.

## A session records the last sign of life

The clock counts time in the book and cannot tell reading from a phone left
face-up. That is on purpose: an idle pause once threw away a long conversation
with Veda, and the reader had it removed.

Each session now also stores `lastSeenAt` — the last tap, key, scroll or touch,
watched at the document so no screen has to report it. It changes no total. It
is the fact the check-in needs: a session whose last touch came forty minutes
before it ended was not being read for those forty minutes.

## Veda's share of a sitting is read off the messages

Every message already carries its time, so the minutes spent in conversation
can be worked out for sittings that happened months ago. A gap between two
messages counts when it is short (five minutes or less); a longer gap means the
reader put the conversation down. Overlapping stretches are merged, because a
minute lived once is counted once. See `stats/vedaTime.ts`.

The day log now reads `1h 3m · 20 min with Veda · 6 Q&A`. No total changes.

## The app asks rather than guesses about sleep

The clock has no idle detector and still does not. After ten minutes with no
touch, a bar appears at the foot of the book: *Still reading?* The clock keeps
running while it waits, because the reader is probably reading.

The three answers:

- **Still here** gives every minute back.
- **I stepped away** takes off the silence from the last touch, not from the
  moment the question appeared. The reader knows when they put the book down.
- **No answer** takes off the silence from the moment the question appeared.
  This is the sleeper and the flat battery. The ten minutes before the question
  are always credited to the reader.

A touch anywhere on the page answers the question, because a touch is the proof
the question was asking for. A touch on the bar itself does not — the bar
carries `data-vigil`, and the clock ignores taps inside it, or answering would
erase the silence being answered for.

`awayMs` is subtracted from `activeMs` when the row is written, so every total
downstream — the day, the streak, the shade, the pace — is right without knowing
any of this happened. The raw time is `activeMs + awayMs`, which is what makes
the trim undoable.

## A sitting can be corrected from the day log

One control per row, and only one direction at a time. A sitting with time taken
off offers it back. A sitting that ended in ten minutes or more of silence
offers to take it off. It is deliberately not a time editor: a reader who can
type any number can write themselves a streak, and then the screen is a diary
and not a record.

## Time with Veda is measured, not inferred

The first version worked it out afterwards from the gaps between messages. That
is a floor and not a measurement: it cannot see the reader thinking about the
last answer, it counts nothing after the final message, and it drops any gap
longer than five minutes rather than trimming it.

The study lamp now reports itself as a screen of the book, the way the notes and
the book details do, and the clock times it. `StoredSession.vedaMs` is the
result. `reportPlace` also wakes the clock the moment a screen changes, because
a flush half a minute later would credit the wrong screen — which does not
matter to a day's total and does matter to a two-minute conversation.

Sessions older than this keep the estimate, and the day log prints them with a
tilde: `~13 min with Veda`. Two numbers of different kinds must not look alike.

## The pacing forecast counts reading minutes only

The forecast divides minutes by the fraction of the book they covered, so every
minute in it has to be a minute that moved the reader forward. Time under the
lamp is reading in every sense that matters and it advances no percentage; left
in, it makes the book look slower and walks the finish date away from a reader
who is doing their most engaged reading.

The minutes are not lost. The day totals, the streak and the heatmap all count
them. The trajectory card is about pace, and pace is pages an hour.

## The Obsidian export writes a folder of linked notes

One large Markdown file would carry the same words and lose the value. Obsidian
works on notes and on links between them. So the export writes one note for the
book, one note for each chapter, and one note for each concept. Every mention of
a concept is a `[[wikilink]]`. The reader opens "archetype" and sees each chapter
that raised it, in each book.

Links are written from the vault root, such as
`[[Reading Buddy/Books/Man and His Symbols/06 The archetype|06 The archetype]]`.
Short links break when two books both hold a chapter called "Introduction". The
cost is that the folder must sit at the top of the vault. The index note says
this in its first line.

## A second export must not make a second copy

The reader continues to read, so the export runs again. Two rules keep the vault
clean:

1. **Fixed paths.** A note's path comes from the book title and the chapter
   number. A later export lands on the same path, so Obsidian replaces the note.
2. **Fixed contents.** No note says when it was exported. Every date printed
   comes from the row it describes.

Rule 2 makes an unchanged chapter produce the same bytes each time. So the app
can remember a fingerprint of each note it exported and offer only the notes
whose words moved. That is the "Export what's new" button. "Export everything"
stays beside it for a new vault or a new phone.

The fingerprint list is a record of a download, not of the reader's vault. The
app cannot know what they did with the zip. Losing the list is harmless: the
next export is larger and replaces notes with the same notes.

## Every screen takes its colours and faces from `theme.css`

Statistics was built with its own palette: about a dozen literal hexes declared
on `.shell`. That had a small cost and a large one.

The small cost was that Statistics did not match. Its primary action was forest
green. Every other screen used `--color-accent`, which is warm brown by default.
A comment on the file claimed forest green was the rule "everywhere in this app".
It was the rule on one screen.

The large cost was that a hex cannot follow a theme. The app has eight themes.
Statistics was warm paper in all of them, so a reader in Dark got a bright page
at night, and a reader in High contrast got no extra contrast at all.

The local names are kept. Only their source moved:

```css
--paper: var(--color-bg);
--card: var(--color-surface);
--ink: var(--color-text);
--accent: var(--color-accent);
```

The names stay because the file below reads `var(--ink)` and `var(--card)`
several hundred times, and those names say what the thing is on that screen. A
rewrite would have touched every line and changed nothing the reader can see.

Three colours stay literal on purpose: the heat ramp (`--h1` to `--h4`), the
Veda violet, and the genre bars. Each is a scale or an identity, not a surface.
A theme must not be able to make one shade of the heat ramp equal another.

Two faces are now tokens as well, in `theme.css`:

- `--font-display` — headings, and a number that is the point of its card.
- `--font-figure` — the text face under them.

Before this, Statistics wrote its heading stack out nine times, Home wrote a
fourth variant of it, and Library used the system sans and no display face. The
same app had three ideas of what a heading looks like, one per screen.

## Progress on the front door is drawn on the book, not over it

The Home screen's Current Reading card said "28% read" and stopped. The one book
the reader is in the middle of was the book the app said least about.

The percentage is now a **lit fore edge**: the top part of the page block down
the right of the cover, lit as far as the reader has read.

The alternative was a fill over the cover art. It was rejected because it cannot
survive the art. A dark cover swallows it and a busy cover makes it read as
damage. The page block is drawn by the app, is the same pale colour beside every
cover, and is already there — so lighting part of it works on any book.

It is amber because amber is time in this app. It is drawn top-down because that
is the direction a stack of pages is worked through. **Nothing is drawn at 0%:**
a mark on an untouched book is a claim that it was started.

Only the hero carries one. A row of six small covers each with a lit edge is a
row of stripes, and those tiles still print the number instead.

The card also carries the estimated finish date and the daily pace, from
`trajectoryOf` — the same arithmetic the book's own details page uses. When
there is too little read to forecast, the strip says so in one line. It never
prints a date it would have to take back.

### One button, and the book stands on the shelf

The card first carried two buttons: *Continue reading* and *Chapter summaries*.
*Continue reading* is gone. The cover opens the book and so does the title, so
it was a third door onto the same room — and a card whose most prominent
control repeats what tapping anywhere else already does teaches the reader that
the buttons are decoration. *Chapter summaries* is the only thing on the card
that goes somewhere new.

Everything except the cover now sits in a column to its right: title, author,
the button, the forecast. That is not only an arrangement. The button and the
forecast used to be stacked *under* the book, which pushed the book up off the
plank drawn beneath it — so the one book the screen is about was the only book
on the page not standing on a shelf. With the column beside it, the cover's own
bottom edge is the bottom of the card, and the book touches the wood.

The column is half the width the card had, so the two forecast facts stack
instead of sitting side by side, and the kicker is one word.

Three `min-width: 0` declarations hold this up — on the card, on the row, and on
the column. The shelf panel is a grid and the row is a flex container, and both
kinds of child report their full content width as their smallest size. Without
them the card hung about 30px over the panel's right edge instead of shrinking
to it. This is the same fault the chapter rail hit, and the same fix.

## A book is renamed one at a time

`repository.renameBook` existed in all three storage layers from the start and
had no UI. It was on the list for deletion in migration `0008`. The reader asked
for the UI instead, so it stays.

Rename sits on the selection bar with the other management actions, but it is
the only one that is not a batch. It wants **exactly one** book: two books
cannot share a title, and a rename that quietly applied to thirty would be
unrecoverable. With two or more ticked the button goes grey rather than
disappearing — a button that comes and goes as you tick is a button you cannot
aim at.

The field opens on the current title rather than empty, because a rename is
nearly always an edit — a stray subtitle, or a filename that came through as a
title. A blank title and an unchanged one are both refused in the dialog. The
store already ignores a blank, which from the shelf looks like a rename that
did nothing.

`renameBook` sets `titleOverridden`, so a later re-parse of the file cannot put
the old title back.

## A day with no reading takes no shade

The heatmap's bands are one hour each: under 1, under 2, under 3, and 3 or more.
A day with no reading scored `level: 0` and was drawn in `--h0`, a pale beige.

That made "I read nothing" and "I read forty minutes" two shades of one colour —
the exact distinction the map exists to draw. A zero day is an empty square now,
held together by a faint outline so the grid stays legible.

The key shows four swatches, not five. The blank square is not the lightest
band. It is the absence of a band, and putting it in the key said otherwise.

The ramp itself then moved a rung lighter. Its old top shade was a near-black
brown, which on a card of warm paper read as a hole punched in the grid rather
than as the most of something. Each shade moved down one rung and a new lightest
was added at the foot, so a first hour is a tint rather than an already-strong
colour. Four shades and four one-hour bands are unchanged.

## A yes waits, and the app says so

The bell asks before it summarises a book that is not in hand. Before this, a
yes went straight to a model. If that model refused, the yes was lost. The
reader saw the question disappear and no summary arrive.

Now a yes writes a `pending` line. The line stays on the bell and says "Waiting
for a model". The app tries again every hour while it is open. It never gives
up, because the reader already said yes and a busy model is not busy forever.

The retry clock ticks every ten minutes and the code checks if an hour passed. A
timer set to one hour drifts past the hour and then waits two.

**A limit we cannot remove.** Reading Buddy is a PWA. Nothing runs while the app
is closed. "In the background" can only mean "while the app is open". A yes that
you give and then close the app on resumes at the next launch.

## One sweep removes the old summaries

The queue used to run ahead on its own. It wrote summaries for books the reader
never asked about. The reader wants one book kept — *Man and His Symbols* — and
the rest gone.

This is a one-time sweep, not a migration. It removes rows only. It runs at the
next launch, writes a flag to `localStorage`, and never runs again. A summary
written after the sweep is safe, whichever book it belongs to.

The sweep also removes the `ready` lines for the deleted summaries. It keeps
`approval` and `pending` lines, because those are still live.

The title match is loose. The same book arrives with a subtitle or an editor's
name attached. An exact match would delete the summaries the sweep exists to
keep.

## The trajectory is drawn, not listed

The strip on the front door showed a finish date and a pace. Both were true.
Neither answered the question the reader asks there, which is not "how fast do I
read?" but "is this going anywhere?"

The Pace Horizon draws the last seven days as a wave. It then continues the wave
as a dashed line to a pin at the finish. A number cannot show a slump. A line
can.

**It draws what the big chart draws.** The strip is a small copy of the pacing
card on a book's details page, not a second opinion. Both plot the same axes
from the same `Trajectory`: days across, percent of the book up. Solid where the
reading happened, dashed where the forecast takes over, ending where the book
ends.

The first version plotted minutes per day — a wave that rose and fell. It was an
honest picture of a different thing. Beside a chart that only ever climbs, it
made the app look like it held two views about one book. One question, one
shape, wherever the reader asks it.

The x-axis runs from the first session to the forecast finish. So where the
solid line stops is how far through the book's whole life the reader is.

**The pin is HTML, not SVG.** The chart stretches to the card. A stretched SVG
turns circles into ellipses and thins strokes on one axis. The wave uses
`preserveAspectRatio="none"`, where that is invisible on a smooth curve, and
`vector-effect: non-scaling-stroke` keeps the line one weight. The pin sits over
the box as a CSS dot, so it stays round at every width.

**The strip measures itself, not the phone.** It uses a container query. Beside
the hero cover it gets about 130px and stacks its two facts. Under a wide card it
gets 340px and splits them left and right. A viewport media query would get the
narrow case wrong, because the narrow case is a wide phone with a book on it.

**Colours are theme tokens.** The linen ground, the terracotta line and the moss
badge are the paper theme's own accent and surfaces, so the tokens draw the
requested palette exactly. On the other seven themes the strip follows the
reader. Only the moss green is a literal, because it is a verdict and not a
surface: "you are fine" must mean the same in every theme.


## Violet is Veda's on every screen

The "Chapter summaries" button on the front door is violet with a page icon. It
matches the same button on a book's details screen.

Violet belongs to Veda everywhere in the app and is spent on nothing else. A
reader who learns the colour once must be able to read it on any screen. An
outlined grey button said only "this is a control".

The violet is written as a literal, not a theme token. It is an identity, not a
surface. A violet that followed the theme would stop being Veda's on seven of
the eight themes, which is the whole of what it is for.

## The book stands on the shelf, at any column height

`.heroCard` gives up its bottom padding so the cover can touch the plank. That
was not enough. The column beside the cover — button, then forecast — is taller
than the cover is, so the row took the column's height and left the book hanging
above the wood.

The cover now takes `align-self: flex-end`. It drops to the row's baseline, so it
stands on the shelf whatever the column beside it grows to.

## Veda's Examination tests use, not recall

**2026-09-01.** The examination asks whether the reader can *use* an idea. It
does not ask them to remember a word.

Every question is a multiple-choice card with one correct option and three
wrong ones. Each wrong option is a named misconception a real reader could
hold. Filler options teach nothing, so the writer must name the misconception
for each one. After the answer, the app shows the note for the option the
reader picked and the note for the correct one. A reader who chose B needs to
know what pulled them to B.

## The confidence tap comes between the answer and the grade

**2026-09-01.** The reader picks an option. Then the app asks how sure they
are. Only then can they submit.

The order is the design. Ask before the choice, and the confidence changes the
choice. Ask after the grade, and the grade changes the confidence. Between the
two is the only honest moment.

A wrong answer means two different things:

- **Wrong and unsure** is ordinary learning. Nothing is flagged.
- **Wrong and sure** is a belief that will not correct itself. The app flags
  the concept and brings it back in a later sitting as a new question.

The app never asks again in the same sitting. A reader who has just learned
they were confidently wrong cannot reason about that idea well. A second
question would test their composure, not their grasp.

## A question must cite a paragraph that exists

**2026-09-01.** `challenge/validate.ts` rejects a question unless its
`sourceAnchor` is an anchor from the chapter the reader has read. The app never
repairs a bad question. It drops it.

The build prompt asked for passage ids of the form `ch2-p14`. This app has no
such ids. Every paragraph already carries an `Anchor`, and the anchor is
better: it resolves against the real manifest, so a question can be traced to
the exact paragraph on the reader's own screen.

## The examination does not touch the golden prompts

**2026-09-01.** The build prompt asked to extend the Librarian to emit a
concept map. The Librarian is golden and cannot change by one word.

It does not need to. The Librarian already stores concepts with the chapter
summary. The examiner reads those names and the chapter's own paragraphs. So a
chapter summarised months ago needs no migration.

The examiner is a new module in `api/tutor.ts`. It is not golden. It was
written for this app and it is tuned here.

## A bank of questions is written once, when the reader asks

**2026-09-01.** The app writes a chapter's questions the first time the reader
opens that chapter for examination. It then keeps them.

Writing them when a chapter is finished would cost real money for the many
chapters a reader completes and never tests.

## Focus Mode is removed

**2026-09-01.** Focus Mode is deleted. The lamp, the setting, the warm wash and
the `data-focus` rules are all gone.

It hid the chrome. But the chrome is already hidden: the reading screen shows
the book alone until the reader taps it. So the toggle removed something that
was not there, and it cost a corner of the bar, a stored setting and a set of
theme rules.

The top right of the bar now holds Veda's Examination. That is a place the
reader goes, and "did any of that stay?" is the question asked at the moment
they stop reading.


## The examination has no length

**2026-09-01.** There is no "5 of 5". The reader answers as many questions as
they want. When the written ones run out, the app asks Veda for more and tells
her every question she has already written for that chapter.

A fixed set of five taught the wrong lesson. It made a chapter a thing you
*complete*, and a chapter you have completed is a chapter you stop thinking
about.

Only when a refill comes back with nothing new does the sitting end. It ends by
saying the chapter is spent, not by saying the reader is finished. Nothing is
counted: no score, no tally of right answers. A score turns a sitting into a
test, and the confidence tap only works if a wrong answer is worth having.

The bank remembers which questions the reader has answered. A question is
retired for good. It also remembers when Veda ran dry, so the app does not pay
for the same empty call again.

## Questions are pitched at a graduate seminar

**2026-09-01.** The examiner prompt asks for graduate-seminar questions. An
undergraduate recall question is a failure, however well written.

Difficulty must come from reasoning, from ambiguity, and from telling two close
ideas apart. It must never come from rare words or from "according to page 4".
The prompt names the forms that work: apply the idea to a case the book never
mentions, ask which of two neighbouring ideas a situation turns on, ask what the
argument predicts, ask which objection the chapter has already answered.

The reader asked for this. They read non-fiction to learn, and an easy question
teaches nothing.

## The reader chooses the chapter, not the page they are on

**2026-09-01.** A picker at the top of the examination opens the book's chapter
list. Any chapter can be tested at any time.

The examination used to test whatever chapter the reader had open. That is the
right default and a poor rule. A reader who wants to revisit chapter two on a
Sunday should not have to navigate to chapter two first.

It is a sheet from the foot, not a dropdown. A book has thirty chapters, and a
dropdown under a button at the top of the screen would open over the question.
The list shows each chapter's own title, because a title is what a reader
recognises. A number alone is not.

## The examination reads the book, not the recap

**2026-09-01.** A question must be grounded in the author's own words. The
examiner is given the chapter's paragraphs, with their anchors. It is never
given the Librarian's recap instead.

The recap is a few hundred words. Questions written from it would be questions
about the recap, which is the opposite of a graduate-level test.

## The chapter is sent once, and in parts

**2026-09-01.** The chapter's prose used to go to the model **twice** in one
call: once as the excerpt, and again inside the message as the anchored passage
list. That is the same text with addresses on it. A long chapter is 30,000
characters, so five questions paid for 60,000. This was a plain mistake and it
is fixed.

The prose now goes once, anchored, as the material.

One call also carries only a **slice** of the chapter, about 12,000 characters.
Five questions do not need a whole chapter in front of them. A refill takes the
next slice, so Veda meets prose she has not seen and the chapter is covered
across several batches.

The cost is real and worth stating: a batch drawn from the middle of a chapter
cannot ask about the end of it. The gate in `validate.ts` checks against the
slice, so a question citing prose Veda was never shown is dropped.

**The chapter text is already on the device.** `repository.listSections` reads
it from IndexedDB. Nothing is re-parsed and no file is read again. Saving a
second copy for the examination would save nothing — the cost is the tokens
sent to the model, and only sending less can lower it.

## The examination opens on the chapter you last chose

**2026-09-01.** The reader picks a chapter, leaves, and comes back. It opens on
the chapter they picked.

It used to open on whatever chapter they were reading. That is the right first
answer and the wrong one every time after: it threw away the only choice the
reader had made on that screen. Where they are reading is now the fallback, for
a book they have never been examined on.

Kept in `localStorage`, per book, like the reading settings.

## Every link out of the reading toolbar replaces its entry

**2026-09-02.** The three links in the reading toolbar — back to the library,
the book's title, and Veda's Examination — all navigate with `replace`.

Raising the toolbar pushes a history entry. That is how a back swipe closes the
toolbar instead of leaving the book (`useBackDismiss`). The entry sits on top of
the reader's own entry, and it exists only while the toolbar is up.

A link that pushed from there stranded that entry underneath. Coming back from
the examination landed on the stranded entry, which carries the reader's own
URL. So the screen did not change and the swipe appeared to do nothing. It took
three swipes to leave a book instead of two, and every trip stranded another
one, so the loop grew the more the reader used it.

`replace` puts the destination on that entry instead of above it. The stranded
entry cannot exist. One swipe back to the book, a second out of it.

**The invariant:** these links are inside the toolbar, so they cannot be tapped
unless the toolbar is up, so there is always a layer entry to replace. Moving
one of them outside the toolbar breaks this. `reader/barLinks.test.tsx` guards
the rule.

**Not changed:** two back swipes in a row still leave the app from the tab
screens. The reader confirmed this on 2026-09-02, keeping the 2026-08-07 rule.
## The reading voice is a model on the device, not the browser's

**2026-09-02.** "Read aloud" used `window.speechSynthesis`. It now uses
Kokoro-82M, a small neural speech model. The model runs in the browser. It sends
nothing to a server. It costs no money for each use.

Reasons to change:

- The browser gave a different set of voices on each device.
- The voice names told the reader nothing. One example: "Microsoft Zira Desktop".
- Some Android phones show many names for one voice.
- The quality was poor for one hour of listening.

Kokoro gives the same 28 voices on every device. The app can name a default and
know it is there.

**The rules did not change.** `readAloud.ts` holds the rules. It decides what to
say and what comes next. Those rules hold three fixes that were hard to find:

1. A sentence that runs off the page is cut in two. The page turns on the correct
   word.
2. `cancel()` starts `onend`. Each utterance carries a generation number. Without
   it, the stop button starts the reading again.
3. A pause cancels. It does not pause the engine. An engine that is paused on
   Android swallows everything after it.

Only the engine under the rules changed. `narrator/speech.ts` is the adapter. A
new controller would have to find those three faults again.

**The voice is a `{ id, lang }` now.** It was a `SpeechSynthesisVoice`. The rules
never used more than those two fields.

## The narrator asks for a GPU adapter, it does not look for the API

**2026-09-02.** `'gpu' in navigator` is not proof that WebGPU works. The first
run of the new worker showed this. The object was there. The adapter request
failed. The narrator failed with "no available backend found" and did not fall
back.

The worker now asks for an adapter, and waits for the answer. It also tries wasm
a second time if the model fails to load on the GPU. A driver can refuse the
model after the browser has given out an adapter.

Cost: one `await`, one time, for the life of the worker.

## The model is cached on the way past, not at install

**2026-09-02.** The weights are 86 MB. The ONNX runtime is 21 MB. Neither is in
the app's install.

The service worker caches both the first time a reader presses Read aloud.
`CacheFirst`, for one year. The files have a fixed name for a fixed model
version, so there is nothing to check for.

A reader who never presses Read aloud downloads none of it.

## Cross-origin isolation stays off, and the measurement is still open

**2026-09-02.** Multi-thread wasm needs `COOP: same-origin` and a `COEP` header.
It would make the voice several times faster on a device with no GPU.

It is off. Two reasons:

1. `require-corp` would break the model download. Each cross-origin answer must
   carry its own CORP header. The Hugging Face hub does not send one.
2. `credentialless` avoids that problem. But Safari ignores it. And it changes
   how every cross-origin request in the app is made.

**The measurement failed, it did not pass.** The preview pane puts the page in a
frame. COOP does not apply to a framed page. `crossOriginIsolated` stayed false,
so the speed gain could not be measured.

**Open:** measure the speed on a real phone before you switch this on.

## The narrator is about five times slower than speech without a GPU

**2026-09-02.** Measured in the preview browser, on wasm, with no GPU:

- 12 words: about 10 seconds to make.
- 13 words: about 27 seconds to make.

This is the fallback path, not the usual one. A phone with WebGPU is much
faster. But a phone without one — an older iPhone, for example — will stop
between sentences.

The Settings panel says so when it happens. It names the processor as the cause.
A reader must not think the app is broken.

**Not settled:** whether the wasm path is good enough to keep. The answer needs
one test on the reader's own phone. See `active-task.md`.

## Three faults made the pause between sentences, and none of them was the model

**2026-09-02.** The reader said there was "an insanely long pause" between
sentences, "like the sentences are fed one at a time". They were.

The lookahead was there. It destroyed itself before it could be used.

1. **`prime` did not check for work it had already asked for.** The screen
   primes the next sentences each time the reading moves. So it asked the model
   for the same sentence two or three times. The copies competed with the
   sentence the reader was waiting for.
2. **The cap dropped the oldest unplayed sentence.** The oldest unplayed
   sentence is always the next one to speak. So the cap threw away the sentence
   that was about to be used, every time. Every sentence then arrived as a miss
   and was made from scratch while the reader waited.
3. **The lookahead reached the worker before the sentence being spoken.** The
   rules report a move, then speak. So three sentences nobody had reached went
   into the queue first. The worker takes one at a time and cannot stop in the
   middle of one.

Fixes:

1. `prime` returns the job that already exists.
2. The cap keeps the newest, and holds one more than the lookahead.
3. A sentence the reader waits for is marked `urgent` and goes to the head of
   the queue. The screen primes in a microtask, after the speak.

Measured on the slow path, with no GPU:

- First sentence: 57 seconds before, 24 seconds after.
- A sentence that was primed and ready: about 2 seconds, which is only the time
  it takes to say it.

`narrator/engine.test.ts` guards all three.

**Still true:** on a device with no GPU the model makes speech about five times
slower than speech is spoken. No lookahead can fix that. Playback catches up
with it. The fixes above remove waste; they do not make the model faster.

## Veda, the summaries and the notes can be read aloud

**2026-09-02.** A speaker button reads out:

- each of Veda's answers, under the thread;
- each summary on the chapter page, beside Copy and Redo;
- each note, on the line that names its chapter.

Press it again to stop. One button, not two. A separate stop button would have
to appear beside every bubble in a long thread, and then go away again. That is
movement in the part of the screen the reader is trying to read.

**Which voice speaks.** Veda's answers use Veda's voice, `bf_emma`. It is hers
alone, like her violet. A tutor who sounds the same as the narrator is a tutor
the listener cannot tell from the author.

A summary is about the book, so the reader's own narrator voice reads it. A note
follows who wrote it: Veda's words in her voice, the reader's highlight in the
narrator voice.

## One narrator, shared by every screen that speaks

**2026-09-02.** `NarratorEngine` owns a worker. The worker owns 86 MB of
weights. One engine for each screen was correct while only the reading screen
spoke. With four surfaces it would be four workers and four copies of the model,
on a phone.

`narrator/shared.ts` holds one engine and counts its holders. The model stays
while anything can still speak. It goes when the last screen goes.

**Counted, not kept forever.** An engine that is never released holds the model
for the life of the tab. Counting also keeps the model warm when the reader
moves from a book to its chapter summaries. A new engine for each screen would
throw it away and load it again.

The fault this prevents cannot be seen. Four engines work correctly. Every
button works. Every test passes. Only the memory is wrong.
`narrator/shared.test.ts` guards it.

## Markdown is stripped before it is spoken

**2026-09-02.** Veda writes markdown. The summaries are markdown. Given to the
speech model as they are, `**the shadow**` is spoken as "asterisk asterisk the
shadow asterisk asterisk".

`narrator/spokenText.ts` removes the marks. It keeps the words in a heading, a
bullet and inline code. It removes a code block, a table and an image. A link is
read by its name, never by its address: a URL spoken aloud is a minute of
punctuation.

**It adds a full stop to a line that has none.** The sentence splitter cuts on
terminal punctuation. Without this, a heading and the paragraph under it are one
utterance, said in one breath, with no pause where the page shows a gap.

**It does not use the markdown renderer.** Reading the text back out of the DOM
would tie speaking something to having drawn it. A summary could then not be
spoken from a screen that had not laid it out.
