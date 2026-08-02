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

**Gates:** `npm test` (281), `npm run typecheck`, `npm run build` — all passing.
Main bundle 355.21 kB. The parsers are called now, but every one of them stays
behind a dynamic `import()`, so pdf.js (434 kB) and mammoth (500 kB) remain in
their own chunks and are fetched only when a file of that type is imported.

### Blockers
- None.

### Next up
Two sensible candidates, and they answer different questions:
- **WP-15 · Reopen where you left off** — small, and the most obviously missing
  thing in daily use: every book currently opens at chapter 1. Anchors are
  already in the DOM, so this is mostly storing one and restoring it.
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
- Nothing has been checked on a real phone yet — WP-31/32 territory, and now
  overdue: there is something to render, and the reader is a touch interface
  that has only ever been used with a mouse.
- **Figures show captions but no images.** Epub records an archive path
  (`OEBPS/images/fig1.png`) which the browser can't fetch — resolving those to
  displayable bytes is WP-39. Affects all 141 images in the Jung epub.
