> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — react to the bookshelf and the page flip

Shipped 2026-08-06 (WP-51, `f5e4bf7`) and on Vercel; **not yet seen on the
phone.** Nothing is half-built. The next task is whatever the reader says when
they open it, and there are two questions to put to them before anything else.

### Ask these two first

1. **Did the covers come back?** They will not have, on their own. The fix is in
   the *parser*, and a parsed book is a snapshot — so it reaches books already on
   the shelf only when **Library → Update** is run (`PARSER_VERSION` 9, rebuilt
   from the kept source file). If the reader runs it and *Beyond Mindfulness in
   Plain English* still shows a placeholder, **ask for the epub before
   diagnosing.** All four cover rules are unit-tested; a fifth guess without the
   file is not worth the tokens.
2. **Does the page flip stutter on a long chapter?** A turn *inside* a section
   used to be a pure scroll and now takes a `cloneNode(true)` of the laid-out
   section on every tap — dozens of pages of multi-column DOM, re-laid-out. It
   may be perfectly fine; it is the one place this round could have cost
   performance, and jsdom cannot tell us. **If it does stutter, the fix is named
   already: cache the clone per section in a ref and just reset its `scrollLeft`
   before each flip, rather than rebuilding the animation.** Invalidate on
   section change, resize, and any reader-settings change.

### Also unconfirmed by eye, from earlier rounds
- **The three other Home fixes** — books with spines and page edges, tiles
  aligned by their tops, and the row's edge-bleed removed so titles stop touching
  the panel border.
- **Long contents entries cut off at the right edge** (2026-08-05, `bbeb6b8`).
  The mechanism was measured in headless Chrome (215.7px overhang → 0.0px) but
  the reader's exact line could not be reproduced — desktop Chrome shrinks that
  button where Android apparently does not. The book is Nestor, *Breath*, not in
  the repo. **Ask for the file rather than guessing again.**
- **Finished is deliberately not a shelf on Home.** The reader asked for three;
  their reference screenshot has four. Putting it back is a `<Shelf>` block in
  `Home.tsx` plus `shelves.finished` in the cover list. They were told — wait for
  their call.
- **The blank line between paragraphs is gone**, replaced by a first-line indent.
  One line in `blocks.module.css` to restore.
- **Subtitle cutting is a guess** and will occasionally take a real title too
  far. The manual rename on the detail page is the way back.

### Files in scope

*For a reaction to the shelf:*
- `web/src/pages/Home.tsx` + `Home.module.css` — the three shelves, the tiles,
  and the book shape (spine, page edges, gloss) on `.tileMedia`.
- `web/src/app/Cover.tsx` + `Cover.module.css` — the printed face only. The book
  *shell* is in `Home.module.css` on purpose, so Library and BookInfo keep plain
  covers.

*For a reaction to the flip:*
- `web/src/reader/pageTurn.ts` — `copyOf`, `holdOutgoing`, `playFlip`. Where the
  clone-caching fix would go.
- `web/src/pages/Reader.tsx` — `turnPage` and the arrival effect, the two places
  `playFlip` is called.
- `web/src/reader/motion.ts` — the single `MOVE_MS` and curve. If a move ever
  feels out of step, the answer is here and only here.

*For a reaction to covers:*
- `web/src/parse/epub.ts` — `findCoverPath` (four rules), `coverFromFirstPage`,
  `coverPageOf`, `readCoverAsset`.
- `web/src/parse/version.ts` — the stamp and the log of what each bump changed.

### Out of scope
The tutor loop (WP-17→20), WP-43 folder re-scan, WP-39's second half, in-book
search and real bookmarks (the rest of WP-14).

---

## Carried forward — things that will bite

- **Ship at the end of every thread.** Build, commit, merge to `main`, push —
  Vercel deploys from `main`. This is in `CLAUDE.md` at the reader's request and
  it **overrides `/wrap-session`'s older "do not commit or push unless I ask".**
- **Books imported before a parser change keep the old parse, silently.**
  `PARSER_VERSION` is 9 and the shelf offers the update — but it needs the kept
  source file, and a book imported without one can never be brought forward.
- **A title fix reaches everyone; a parser fix does not.** `TITLE_CLEAN_VERSION`
  recomputes from what is already stored, at boot, for free. Keep new work on the
  title side of that line wherever there is a choice.
- **A copy of the strip is a scrolling box.** Anything laid over one at
  `inset: 0` lands at its scroll origin, not on screen — hang it on the
  non-scrolling wrapper `copyOf` returns.
- **A page is a column plus its gap.** Anything that scrolls or measures the
  strip must use `measure().pageWidth`, never the element's width, and the gap is
  set once in `Reader.module.css` and read back from the computed style.
- **No 3D transform on a shelf tile.** A rotated element takes its own width with
  it and breaks the row alignment. Spine and page edges are shadows and
  pseudo-elements for exactly this reason.
- **A blurred wrapper cannot contain the thing it is blurring *behind*.** A CSS
  `filter` makes an element a containing block for fixed-position descendants.
  Both places that frost the background — `AppShell`'s drawer and `UpdatePrompt`
  — keep the overlay as a sibling. Any future sheet or modal must too.
- **Anything laid out as a grid or flex inside a page needs `min-width: 0`.** The
  general rule on `.page *` supplies it; a new component setting its own
  `min-width` re-opens the bug that cut the contents page off.
- **The subtitle rule is deliberately a guess.** Real titles are locked into
  `cleanTitle.test.ts` as must-not-cut; add to them rather than loosening guards.
- **Columns break awkwardly around tall figures, wide tables and long code.**
  Accepted; the named remedy is plain scrolling as a per-section fallback. Not
  built — wait until it is actually hit.
- **`Reader.test.tsx` and `Library.test.tsx` are timing-sensitive under load.**
  If one fails on an idle machine, it is real.
- **The live Anthropic key is still in `Claude API/API.txt`**, gitignored and
  never committed. WP-19 is when it must move out and be read from an env var.

## Decisions already made — don't re-derive these
- **A reading place is an anchor, never a page number** (WP-15).
- **Pages are counted in words, not screens** (WP-40). 300 words to a page.
- **The spine is not a whole-book read.** Manifest plus chapter *indexes* only.
- **Pagination is CSS columns**, not JavaScript measurement, and **the page turn
  is a seam** — navigation and animation stay separate.
- **A page turn is a rotation about the spine, not a slide** — and the two
  directions are not mirror images: forwards the outgoing page moves, backwards
  the arriving one does, which is why going back needs two copies.
- **An epub spine boundary is a page break, not a section break.**
- **Nothing on the reading screen animates from zero opacity** — the
  camera-shutter flash.
- **Focus Mode hides, never removes.**
- **A link is a range of a paragraph**, resolved *after* assembly, rendered as a
  `<span role="link">`, never a `<button>`.
- **Only a shelf holding something back gets "View All"** — Unread alone.

## Useful context (already known — don't re-derive)
- Gates: `npm test` (616), `npm run typecheck`, `npm run build`, from the repo
  root.
- **There is no bottom tab bar.** Navigation is a ☰ in `AppShell`'s top bar
  opening a left drawer (All Books / Stats / Settings). Home is not in it.
- **`@testing-library/user-event` is not installed** — component tests drive
  clicks and keys through `fireEvent`.
- Retrieval path, and the whole of it: `getManifest(bookId)` →
  `getChapterIndex(bookId, n)` → `getSection(bookId, path)`. There is
  deliberately no "load the book" call — don't add one.
- **`Reader.tsx` has one `goTo` and one `turnPage`** — keep it that way.
- Anchors reach the DOM as ids with the brackets stripped (`ch02-s03-p013`).
- Vitest defaults to `node`; add `// @vitest-environment jsdom` per file for
  React tests. Testing Library needs an explicit `afterEach(cleanup)`.
- jsdom has no layout: stub `window.scrollTo` **and**
  `Element.prototype.scrollIntoView` in any test that mounts Reader. It reports
  every width as zero, which `measure()` reads as "one page, nothing to turn" on
  purpose, and it has no Web Animations API — `playFlip` falls through to the
  instant change there. **A layout or animation bug cannot be caught here, only
  in a real browser.**
- **Headless Chrome is the tool that cracked the text-escaping bugs** and is
  worth reaching for before touching layout code. `chrome.exe --headless
  --disable-gpu --virtual-time-budget=5000 --dump-dom <file:///…>` runs a probe
  page's JavaScript and prints the DOM, so a measurement written into a `<pre>`
  comes straight back. Chrome is at
  `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Real books for manual checks: the Jung epub in `books/`, the Springer PDF in
  `research-paper/`. Both untracked. Neither is *Breath* or *Beyond Mindfulness*
  — ask for those files rather than diagnosing against the Jung again.
