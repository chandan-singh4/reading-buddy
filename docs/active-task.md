> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — none in flight

WP-12 and WP-13 both shipped. Books import, file onto shelves, open, render,
and can be moved through by Previous/Next, a contents list, a slider and a
Focus Mode toggle. Pick the next waypoint with `/plan-task` and rewrite this
file for it.

### The two candidates, and what each is for

**WP-15 · Reopen where you left off** — small, and the most obviously missing
thing in daily use: every book opens at chapter 1 today. Anchors are already in
the DOM (`ch02-s03-p013`), so this is mostly storing the current one and
restoring it — plus deciding *when* to save. Likely files: a new
`web/src/reader/position.ts`, a repository method, `Reader.tsx`.

**WP-17 → 18 → 19 → 20 · the tutor loop** — select text, assemble a prompt from
manifest + chapter index + one section, call Claude, stream the answer back.
This is the rest of the walking skeleton and the first thing the app does that
an ordinary reader can't. Much bigger, and WP-19 is where the API key question
below finally has to be answered.

### Decisions already made — don't re-derive these
- **Pagination (WP-14).** CSS columns, not JavaScript measurement. Anchors are
  the stable location; page numbers are never shown. Full reasoning, plus the
  two rejected options, in `backlog.md` under WP-14.
- **The page turn is a seam.** Navigation and animation stay separate; ship
  instant + slide, leave page curl a labelled slot. Same note.
- **Focus Mode hides, never removes.** Implemented in WP-13; anything added to
  the reading screen from here has to keep working with the overlay hidden.
- **Shelves** are guessed at import and always manually overridable; a moved
  book is never re-guessed.

### Useful context (already known — don't re-derive)
- Gates: `npm test` (281 passing), `npm run typecheck`, `npm run build`, from
  the repo root. Main bundle 355.21 kB.
- Retrieval path, and the whole of it: `getManifest(bookId)` →
  `getChapterIndex(bookId, n)` → `getSection(bookId, path)`. There is
  deliberately no "load the book" call — don't add one.
- `web/src/reader/` is the reader: `blocks.tsx` (one component per `BlockKind`),
  `navigation.ts` (pure next/previous section), `progress.ts` (chapters, never
  pages), `Chrome.tsx` (the overlay), `focusMode.ts`. All via `reader/index.ts`.
- **`Reader.tsx` has one `goTo`** — every move goes through it. That is the seam
  WP-14 plugs the page transition into; keep it that way.
- Anchors reach the DOM as ids with the brackets stripped (`ch02-s03-p013`),
  which is what WP-15 and WP-17 both build on.
- Vitest defaults to `node`; add `// @vitest-environment jsdom` per file for
  React tests. Testing Library needs an explicit `afterEach(cleanup)` here —
  `globals` is off, so nothing auto-cleans and `screen` otherwise accumulates
  every previous render.
- jsdom has no layout: stub `window.scrollTo` in any test that mounts Reader.
- Real books for manual checks: the 15 MB Jung epub in `books/`, the Springer
  PDF in `research-paper/`. Both untracked.

### Open items worth raising before they bite
- **The live Anthropic key is still in `Claude API/API.txt`**, inside a public
  repo's folder. Gitignored and never committed, but WP-19 is when it must move
  out and be read from an env var.
- **Nothing has been tried on a phone.** The reader is a touch interface that
  has only ever been used with a mouse. Tap-to-toggle, the slider and the 44px
  targets are all guesses until then.
- **Figures render captions without images** until WP-39.
