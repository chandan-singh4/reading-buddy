> **What's in here (read at every startup).** A living snapshot of where the
> build stands — recently finished work, what's in flight, current blockers, and
> the immediate next moves. It's the "you are here" pin: read it first every
> session so you know the state without inspecting git history or the codebase.
> Kept deliberately short — only the last handful of done items survive, older
> history is dropped. Updated at the end of every session by `/wrap-session`. If
> this file and the code ever disagree, trust the code and fix this file.

---

**Current leg:** Leg 0 — Basecamp
**Near-term arc:** the *walking skeleton* — import a `.md` → render → select →
Ask → streamed answer (WP 01 → 03 → 04 → 05 → 08 → 11 → 12 → 17 → 18 → 19 → 20).
Get that loop working before building any breadth.

### In flight
- Nothing. **Leg 0 complete** (bar WP-02, skipped) and **the whole parsing side
  of Leg 1 is complete**: every format now parses. WP-09/10 (summaries,
  classification) and WP-11 (import UI) are what remain in Leg 1.

### Recently done
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

**Gates:** `npm test` (168), `npm run typecheck`, `npm run build` — all passing.
Main bundle still 333.74 kB: nothing imports the parsers yet (WP-11), and pdf
and docx stay behind dynamic imports so they never enter the main chunk.

### Blockers
- None.

### Next up
- **WP-11 · In-app import + auto-parse** — now unblocked (WP-38 done), so the
  anchors a real import produces are the ones we intend to keep. The parsers
  exist but nothing in the app calls them yet. This is the step that makes them real: file picker →
  pick parser by extension → `repository.saveParsedBook` → land in the library.
- Then WP-12 (renderer) to finish the walking skeleton. WP-09/10 (summaries,
  classification) need a model call and can follow. WP-02 (Tauri) stays skipped.

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
- Nothing has been checked on a real phone yet — WP-31/32 territory, but worth
  an early look once something renders.
