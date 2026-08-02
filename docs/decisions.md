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

### UX misc
- **Select → inline popup** (not a side panel). Ask is the only action that calls
  Claude; every Ask auto-saves a plain-language Q&A note.
- **Nav overlay** is Google-Books-style (tap-fade, bottom slider, left ToC icon).
- **Reader ships:** font/spacing, day/night, bookmarks, in-book search,
  reopen-where-left-off, read-aloud (phone TTS).
- **Cost visibility** = detailed per-book / per-session / per-model-tier screen.
- **Google Drive backup/restore** is opt-in, off by default.
- **Install path:** mkcert local HTTPS, one-time manual trust per phone.
