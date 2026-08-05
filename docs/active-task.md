> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## First: is the phone on the new build?

**Do this before picking up anything below.** Four rounds of fixes shipped on
2026-08-05 (`af5111d`) and **not one of them has been seen on the phone.** The
deploy itself was verified end to end — `main` and `origin/main` match, and the
live bundle was checked for strings only the newest commit introduces — so the
code is out there. What is stuck is the reader's *installed* app.

The cause is this session's `autoUpdate` → `prompt` switch: the installed client
is the old code, which expects a new worker to activate itself, and the new
worker deliberately waits to be asked. A one-time crossing. The way through, in
order: fully close the app from the app switcher → hard-refresh the site in a
browser tab → uninstall and reinstall (books live in IndexedDB; nothing is
lost).

**If all three failed**, the agreed fallback is to make the new worker claim old
clients on its own at the cost of one silent reload. Don't build it before that
is known — it trades away the thing the reader just asked for.

Once they are on the new build, **the whole of last session is unverified**:
titles, page divisions, footnote links, the reading typography, the motion and
the update panel. Expect a round of reactions, and treat those as the real next
task.

### Two judgement calls waiting on the reader's eye
- **The blank line between paragraphs is gone**, replaced by a first-line
  indent. That is authentic book setting and denser than before; the reader was
  told to say if it reads as cramped. Restoring it is one line in
  `blocks.module.css`.
- **Subtitle cutting is a guess** and will occasionally take a real title too
  far. Worth a scan down the shelf. The manual rename on the detail page is the
  way back.

---

## Task — WP-51: the page-flip animation

The reader named this as still outstanding in the same session they asked for
the app to have more character, so it is the natural next piece once the build
lands.

The seam has been built since WP-14 and is untouched: **`Reader.tsx` has one
`goTo` and one `turnPage`, and every move goes through them.** This session
changed only the *timing* of the slide — 380 ms on a curve eased at both ends,
because the old one whipped the words off the screen. What is still missing is
the turn looking like a page rather than a viewport sliding.

Page curl stays a labelled slot, not a promise: it is expensive, easy to make
gaudy, and the reader's stated want is *smooth*, which a well-made slide already
delivers.

### Definition of done
A page turn reads as a page moving rather than a viewport scrolling; it honours
`prefers-reduced-motion` by staying instant; a fast tapper can still outrun it
rather than queueing behind it; and turning *between* sections looks the same as
turning within one — that seam is the whole reason `motion.ts` exists.

### Files in scope
- `web/src/reader/motion.ts` — the single `MOVE_MS` and curve. Every kind of
  move is driven from here; if one ever feels out of step, the answer is here
  and only here.
- `web/src/reader/pageTurn.ts` — the between-sections turn, where the outgoing
  page is laid over the strip.
- `web/src/pages/Reader.tsx` — `goTo` and `turnPage`, the seam itself.
- `web/src/pages/Reader.module.css` — the frame the turn is measured against,
  and the note on why there is deliberately no `transform` on `.reader`.
- `web/src/reader/columns.ts` — the page arithmetic the turn must not break.

### Out of scope
The tutor loop (WP-17→20), WP-43 folder re-scan, WP-39's second half, in-book
search and real bookmarks (the rest of WP-14).

---

## Carried forward — things that will bite

- **The `autoUpdate` → `prompt` crossing strands already-installed clients
  once.** Written up in `progress.md` under Blockers. It will not recur.
- **Books imported before a parser change keep the old parse, silently.**
  `PARSER_VERSION` is 8 and the shelf offers the update — but it needs the kept
  source file, and a book imported without one can never be brought forward.
- **A title fix reaches everyone; a parser fix does not.** `TITLE_CLEAN_VERSION`
  recomputes from what is already stored, at boot, for free. Keep new work on
  the title side of that line wherever there is a choice.
- **The subtitle rule is deliberately a guess.** Real titles are locked into
  `cleanTitle.test.ts` as must-not-cut; add to them rather than loosening the
  guards when something breaks.
- **There is no gap between the reading columns** — the page turn's arithmetic
  is built on a page being exactly one box wide. So anything wider than its
  column lands on the *next page* and is sliced by `overflow: hidden`. The
  general guard is on `.page > *`; if a future block escapes anyway, that is
  where to look first, not at the block.
- **Columns break awkwardly around tall figures, wide tables and long code.**
  Accepted; the named remedy is plain scrolling as a per-section fallback. Not
  built — wait until it is actually hit.
- **`Reader.test.tsx` is timing-sensitive under load.** Not diagnosed. If it
  recurs on an idle machine, it is real.
- **The live Anthropic key is still in `Claude API/API.txt`**, gitignored and
  never committed. WP-19 is when it must move out and be read from an env var.

## Decisions already made — don't re-derive these
- **A reading place is an anchor, never a page number** (WP-15).
- **Pages are counted in words, not screens** (WP-40). 300 words to a page;
  changing that constant renumbers every book.
- **The spine is not a whole-book read.** Manifest plus chapter *indexes* only.
- **Pagination is CSS columns**, not JavaScript measurement, and **the page turn
  is a seam** — navigation and animation stay separate.
- **An epub spine boundary is a page break, not a section break** — sections are
  the navigation and the anchor grammar.
- **Nothing on the reading screen animates from zero opacity** — that is the
  camera-shutter flash.
- **Focus Mode hides, never removes.**
- **A link is a range of a paragraph**, resolved *after* assembly, with epub ids
  qualified by their source file.

## Useful context (already known — don't re-derive)
- Gates: `npm test` (611), `npm run typecheck`, `npm run build`, from the repo
  root. Precache 468.27 KiB.
- Retrieval path, and the whole of it: `getManifest(bookId)` →
  `getChapterIndex(bookId, n)` → `getSection(bookId, path)`. There is
  deliberately no "load the book" call — don't add one.
- **`Reader.tsx` has one `goTo` and one `turnPage`** — keep it that way.
- Anchors reach the DOM as ids with the brackets stripped (`ch02-s03-p013`).
- Vitest defaults to `node`; add `// @vitest-environment jsdom` per file for
  React tests. Testing Library needs an explicit `afterEach(cleanup)`.
- A state change arriving from outside React — a service-worker event — needs
  wrapping in `act()` in tests; nothing else will flush it.
- jsdom has no layout: stub `window.scrollTo` **and**
  `Element.prototype.scrollIntoView` in any test that mounts Reader.
- Real books for manual checks: the Jung epub in `books/`, the Springer PDF in
  `research-paper/`. Both untracked. **Neither reproduces the reported dead-link
  bug** — that book (Sapolsky's *Determined*) is not in the repo. Ask for the
  file rather than diagnosing against the Jung again.
