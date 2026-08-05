> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## First: how did the new navigation and Home land?

Shipped 2026-08-05 (WP-52) and merged to `main`, so Vercel has it — but the
reader had not yet opened it on the phone when the session closed. **Ask before
building anything else.** It is the first screen they will see and the whole of
it is new: the ☰ and its drawer, the frosted blur behind it, the three shelves,
the wooden plank, the greeting.

- **The one deliberate subtraction: Finished is no longer a shelf on Home.** The
  reader asked for three shelves; the reference screenshot they shared has four.
  Nothing was deleted — those books are still under All Books — and putting it
  back is a `<Shelf>` block in `Home.tsx` plus re-adding `shelves.finished` to
  the cover list. **They were told this; wait for their call rather than
  pre-empting it.**
- **Two things could only be checked in jsdom, which has no layout.** The blur
  and the drawer slide have never been seen on a real phone: `backdrop-filter`
  and a transitioned `filter` are both known to be uneven on Android, and a
  blurred wrapper is a repaint on every frame of a 320 ms transition. If it
  stutters, the cheap answer is to drop `saturate()` and lower the blur radius,
  not to rebuild the animation.
- **Files if a reaction comes back:** `web/src/app/AppShell.tsx` +
  `AppShell.module.css` for anything about the bar, the drawer or the blur;
  `web/src/pages/Home.tsx` + `Home.module.css` for the shelves, the plank and
  "View All". Nothing else was touched except one deleted token in
  `styles/theme.css` and a comment in `App.tsx`.

---

## Then: did the text stop escaping the page?

Two fixes shipped on 2026-08-05 (`1f450f9`, `bbeb6b8`) against two screenshots
of the same book. The phone is on the current build — **the old-build blocker is
closed, don't raise it again.**

- **Round one — ink from the previous page at the left margin.** Fixed by giving
  the columns a `column-gap`. The reader confirmed this one gone.
- **Round two — long contents entries cut off at the right edge.** Fixed in two
  places: the no-wider-than-the-column guard now applies at *every* depth (grid
  children were refusing to shrink), and an internal link is no longer a
  `<button>`, because a button is a box that cannot break across a line.
  **Unconfirmed by eye.**

**If round two's clipping survives, ask for the epub before diagnosing.** The
book is Nestor, *Breath* — not in the repo. The mechanism was reproduced and
measured in headless Chrome (215.7px of overhang → 0.0px), but the reader's
*exact* line could not be: desktop Chrome shrinks that button where Android
apparently does not, so a reconstruction can only get so close. A second round
of guessing without the file is not worth the tokens.

**Headless Chrome is the tool that cracked both of these**, and it is worth
reaching for again before touching layout code. `chrome.exe --headless
--disable-gpu --virtual-time-budget=5000 --dump-dom <file:///…>` runs a probe
page's JavaScript and prints the DOM, so a measurement written into a `<pre>`
comes straight back. Both fixes have a measured before/after because of it.
Chrome is at `C:\Program Files\Google\Chrome\Application\chrome.exe`.

### Also waiting on the reader's eye
- **The blank line between paragraphs is gone**, replaced by a first-line
  indent. Authentic book setting and denser than before. Restoring it is one line
  in `blocks.module.css`.
- **Subtitle cutting is a guess** and will occasionally take a real title too
  far. Worth a scan down the shelf; the manual rename on the detail page is the
  way back.

---

## Task — WP-51: the page-flip animation

Still not started. The reader named it as outstanding three sessions ago, and it
stays next once the reactions above are in.

The seam has been built since WP-14 and is untouched: **`Reader.tsx` has one
`goTo` and one `turnPage`, and every move goes through them.** A previous session
changed only the *timing* of the slide — 380 ms on a curve eased at both ends,
because the old one whipped the words off the screen. What is still missing is
the turn looking like a page rather than a viewport sliding.

Page curl stays a labelled slot, not a promise: it is expensive, easy to make
gaudy, and the reader's stated want is *smooth*, which a well-made slide already
delivers.

**Note the ground has shifted slightly.** A page is now a column *plus its gap*,
so the distance a turn travels is `measure(strip).pageWidth`, not the element's
width. `playTurn` already takes that distance as a pixel argument — anything new
must use the same number or the between-sections turn will drift out of step
with the within-section one, which is the one thing that seam exists to prevent.

### Definition of done
A page turn reads as a page moving rather than a viewport scrolling; it honours
`prefers-reduced-motion` by staying instant; a fast tapper can still outrun it
rather than queueing behind it; and turning *between* sections looks the same as
turning within one.

### Files in scope
- `web/src/reader/motion.ts` — the single `MOVE_MS` and curve. Every kind of
  move is driven from here; if one ever feels out of step, the answer is here
  and only here.
- `web/src/reader/pageTurn.ts` — the between-sections turn, where the outgoing
  page is laid over the strip. Now takes the travel distance in pixels.
- `web/src/pages/Reader.tsx` — `goTo` and `turnPage`, the seam itself, plus
  `measure()` and the column-gap arithmetic.
- `web/src/pages/Reader.module.css` — the frame the turn is measured against,
  the `column-gap` and why it exists, the guard on everything inside a page, and
  the note on why there is deliberately no `transform` on `.reader`.
- `web/src/reader/columns.ts` — the page arithmetic the turn must not break.
- `web/src/reader/blocks.tsx` — **added 2026-08-05**: renders links and every
  block; where the `<span role="link">` lives.
- `web/src/reader/blocks.module.css` — **added 2026-08-05**: block typography,
  including `.list` (a grid) and `.link`.

### Out of scope
The tutor loop (WP-17→20), WP-43 folder re-scan, WP-39's second half, in-book
search and real bookmarks (the rest of WP-14).

---

## Carried forward — things that will bite

- **Books imported before a parser change keep the old parse, silently.**
  `PARSER_VERSION` is 8 and the shelf offers the update — but it needs the kept
  source file, and a book imported without one can never be brought forward.
- **A title fix reaches everyone; a parser fix does not.** `TITLE_CLEAN_VERSION`
  recomputes from what is already stored, at boot, for free. Keep new work on
  the title side of that line wherever there is a choice.
- **The subtitle rule is deliberately a guess.** Real titles are locked into
  `cleanTitle.test.ts` as must-not-cut; add to them rather than loosening the
  guards when something breaks.
- **A page is a column plus its gap.** Anything that scrolls or measures the
  strip must use `measure().pageWidth`, never the element's width, and the gap
  itself is set once in `Reader.module.css` and read back from the computed
  style. Two sources for it would put every turn out of true.
- **A blurred wrapper cannot contain the thing it is blurring *behind*.** A CSS
  `filter` makes an element a containing block for fixed-position descendants,
  so an overlay nested inside gets blurred with the page. Both places that frost
  the background — `AppShell`'s drawer and `UpdatePrompt` — keep the overlay as a
  sibling. Any future sheet or modal must do the same.
- **Anything laid out as a grid or flex inside a page needs `min-width: 0`.**
  The general rule on `.page *` supplies it, but a new component that sets its
  own `min-width` will re-open exactly the bug that cut the contents page off.
- **Columns break awkwardly around tall figures, wide tables and long code.**
  Accepted; the named remedy is plain scrolling as a per-section fallback. Not
  built — wait until it is actually hit.
- **`Reader.test.tsx` and `Library.test.tsx` are timing-sensitive under load.**
  One `Library` test failed mid-session and passed on a re-run with nothing
  changed. If it recurs on an idle machine, it is real.
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
  qualified by their source file — and it renders as a `<span role="link">`,
  never a `<button>`.

## Useful context (already known — don't re-derive)
- Gates: `npm test` (613), `npm run typecheck`, `npm run build`, from the repo
  root. Precache 475.54 KiB.
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
- A state change arriving from outside React — a service-worker event — needs
  wrapping in `act()` in tests; nothing else will flush it.
- jsdom has no layout: stub `window.scrollTo` **and**
  `Element.prototype.scrollIntoView` in any test that mounts Reader. It also
  reports every width as zero, which `measure()` reads as "one page, nothing to
  turn" on purpose — **a layout bug cannot be caught here, only in a real
  browser.** That is why both of this session's fixes were measured in headless
  Chrome and neither was caught by 611 passing tests.
- Real books for manual checks: the Jung epub in `books/`, the Springer PDF in
  `research-paper/`. Both untracked. **Neither reproduces the reported dead-link
  bug nor the contents-page clipping** — that book (Nestor's *Breath*) is not in
  the repo. Ask for the file rather than diagnosing against the Jung again.
