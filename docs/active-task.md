> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-12 · Structured renderer

Books import, store and list, and cannot be read. This is the step that puts one
on screen: resolve a position → load **one section** → render its blocks with
their anchors → move to the next.

It closes the walking skeleton's second half. WP-13 (nav overlay), WP-15 (reopen
where you left off) and WP-17 (selection menu) all build directly on it.

### The two decisions that shape it

**1. One section on screen, scrolled — not true page-splitting.**
A section is already the unit of storage and retrieval (one row, keyed
`[bookId+path]`), so it is the honest unit of display. The reader scrolls within
a section and uses Previous / Next to move between them. Splitting a section into
screen-sized *pages* means measuring rendered text and reflowing on every font or
margin change; it is a real piece of work, it belongs with the font and spacing
controls in WP-14, and nothing before then depends on it. `backlog.md` says
"paginated" — this is the deliberate first half of that, not an oversight.

**2. Bare first; chrome is a layer on top.**
Focus Mode is a toggle that *hides but never removes* (see `backlog.md`, decided
2026-08-02). So build the bare reading page as the baseline and let controls
appear over it. Building full chrome and hiding it later means retrofitting a
route back to each control. Identical on screen with the toggle off; materially
different work afterwards. **WP-12 itself ships no toggle** — it ships the bare
page that makes the toggle trivial in WP-13.

### Definition of done
- [ ] `web/src/reader/blocks.tsx` renders a `Paragraph` by its `kind`. All ten
      are handled: prose, heading, quote, list, code, figure, table, formula,
      note. `furniture` never reaches storage, so it needs no case — but an
      unknown kind must still render its `text`, never nothing.
- [ ] Every block carries its anchor as a DOM `id`, verbatim (`ch02-s03-p013`).
      WP-15 restores a position by it and WP-17 reports a selection by it; both
      are cheap only if the anchor is already in the DOM.
- [ ] `web/src/reader/navigation.ts` — pure functions for the next and previous
      section, given a manifest and one chapter index. Crossing a chapter
      boundary is the case worth testing: the last section of ch02 is followed
      by the first of ch03, and the last section of the book is followed by
      nothing.
- [ ] `Reader.tsx` loads **manifest + one chapter index + one section**, and
      nothing else. No "load the book" call is to be added to the repository —
      that omission is the token strategy, not a gap.
- [ ] Previous / Next move between sections; both know when they're at an end.
- [ ] A section that fails to load says so in plain language, as import does.
- [ ] Readable by default: a measure of ~66 characters, generous line height,
      no chrome competing for vertical space.
- [ ] Tests: navigation across chapter boundaries and at both ends of a book;
      block rendering per kind including a table's grid and a figure's image;
      one jsdom test that renders a real stored section end to end.
- [ ] `npm test`, `npm run typecheck`, `npm run build` all pass.

### Files in scope
- `web/src/reader/blocks.tsx` (new — one component per `BlockKind`)
- `web/src/reader/navigation.ts` (new — pure next/previous section)
- `web/src/reader/navigation.test.ts` (new)
- `web/src/reader/index.ts` (new — public entry point)
- `web/src/pages/Reader.tsx` (rewrite — currently a placeholder that resolves
  the book and says WP-12 will do the rest)
- `web/src/pages/Reader.module.css` (edit — reading typography lives here)
- `web/src/storage/index.ts` (read only — `repository`, `StoredSection`)
- `web/src/structure/index.ts` (read only — `Paragraph`, `BlockKind`, `Manifest`,
  `ChapterIndex`, `SectionPath`, anchor helpers)
- *(create as needed — add any new path to this list)*

### Out of scope
- **The nav overlay (WP-13)** — tap-to-fade chrome, progress slider, table of
  contents, jump-to-chapter. WP-12 ships Previous / Next and nothing more.
- **Focus Mode's toggle (WP-13)** — but see decision 2: build so it's easy.
- **Reopening where you left off (WP-15).** WP-12 always opens at the start.
- **Font, spacing, margin and theme controls, and true page-splitting (WP-14).**
- **The selection menu (WP-17)** — no highlight, define, copy or Ask yet. Anchors
  in the DOM are what WP-12 owes it.
- **Read-aloud (WP-16), images fetched from the epub archive (WP-39).** A figure
  renders its caption and its `image.src` as recorded; resolving epub archive
  paths to displayable bytes is WP-39's problem, so a broken image must degrade
  to its caption rather than to a gap.

### Useful context (already known — don't re-derive)
- Gates: `npm test` (214 passing), `npm run typecheck`, `npm run build`, from the
  repo root.
- Retrieval path: `getManifest(bookId)` → `getChapterIndex(bookId, n)` →
  `getSection(bookId, path)`. Also `getSectionByAnchor`, and `countSections` for
  progress without loading rows.
- `Paragraph` always carries `text` — a readable form that is safe to render for
  *any* kind. `rows` (tables) and `image` (figures) are additions on top, so a
  kind that isn't specially handled still shows something correct.
- Anchors are `[ch02-s03-p013]` in bracketed form; `parseAnchor` / `formatAnchor`
  / `sectionPathOf` are in `structure/anchor.ts` via the index.
- The Reader route (`/book/:bookId`) renders **outside** `AppShell` on purpose —
  full-bleed, no bottom tab bar stealing vertical space.
- Vitest defaults to `node`; add `// @vitest-environment jsdom` per file for
  React tests.
- Real books to check against: the 15 MB Jung epub in `books/` (12 chapters, 32
  sections, 1503 paragraphs, 141 figures) and the Springer PDF in
  `research-paper/`. Both untracked; for manual checking, not tests.
