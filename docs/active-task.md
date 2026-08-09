> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — see WP-55 on the phone, and say what it should do next

Shipped 2026-08-08 across eleven commits (`d9a7c06` → `4f96fb3`) and on Vercel.
Nothing is half-built. The next task is whatever the reader says when they open
it.

**These notes were reconstructed on 2026-08-09**, not written at the time: the
previous session's connection dropped before `/wrap-session` could run. The code
was fine — clean tree, branch level with `origin/main`, 805 tests / typecheck /
build all green on a fresh checkout. Only the notes were missing.

### The one lesson worth keeping from this round — 2026-08-08

Two rounds of work on per-screen scroll positions changed nothing the reader
could see. The WP-54 notes explained why in detail — a hidden screen has no
height, the document shrinks, the browser clamps `scrollY` — and it was wrong.
Not subtly wrong. **None of that code had ever run.**

`index.css` carried `overflow-x: hidden` on `html, body` together. The root
element's overflow is *propagated* to the viewport; once it has been, the body's
own overflow applies to the body. So that one extra selector made the **body** a
scroll container, one viewport tall, with all four screens scrolling inside it —
while `scrollMemory`, `AppShell` and `scrollRestoration` all talked to the
`window`. Measured: `window.scrollY` always 0, `window.scrollTo` moved nothing,
and a window scroll listener never fired once, because element scroll events do
not bubble.

**A fix that changes nothing the reader can see has two possible explanations,
and the cheaper one is "it never ran".** Ask that before believing a theory that
merely fits the symptom. The clamping story was plausible, self-consistent, and
cost a round because nothing ever checked whether the handler fired.

### Ask these first

1. **Does the launch screen feel like the app arriving, or like a toll gate?**
   It leaves the moment the first screen paints, so on a warm start it should be
   barely there. If it reads as a *flash*, `MIN_VISIBLE` (260 ms, in
   `app/splash.ts`) is the number to raise, not the animation to rebuild.
2. **Does the page still read well when the toolbar is up?** It scales to 85%
   and slides down. **That number is a guess made without a real screen** — jsdom
   has no layout, so the tests hold the switch and not the geometry. Whether the
   bars clear the text, and whether 85% is too much shrink, is a phone question.
3. **Does each screen come back where you left it?** Scroll Library down, go to
   Home, come back. This is the *first* time that code has actually executed, so
   treat it as new rather than as previously-tested behaviour.
4. **Is the tempo right?** Three durations where there were ten. Tap a filter,
   open the sheet, pick an option — that sequence used to be four speeds in a
   second.
5. **Bookmarks and search** — the corner of the page marks it; the magnifier
   searches the whole book. Both are new and neither has been used on a phone.

### Decisions made this round the reader may want to revisit

- **The bookmark left the toolbar and became the page's top-right corner.** Bare
  paper until marked. If it is hard to hit, or hit by accident while turning
  pages, that is the trade to revisit — the corner is close to the edge-tap zone.
- **A wide table now wraps instead of scrolling sideways.** A genuinely wide
  table reads cramped. Deliberate: cramped text can be read, text below the fold
  could not be reached at all.
- **The bottom bar keeps only the slider.** Contents, Bookmarks and Notes are in
  the ⋯ menu. If reaching them feels buried, the menu is the thing to change, not
  the bottom bar — controls under a resting thumb were being hit by accident.
- **Search is case-insensitive but not accent-insensitive.** "resume" will not
  find "résumé". The narrow rule can be widened later without surprising anyone;
  the reverse is not true.

### Files in scope

*For a reaction to the launch screen or the logo:*
- `web/index.html` — the splash markup, its inline CSS, the pre-paint theme
  script, and the watchdog. **Start here**; the notes in it explain why each
  piece cannot live in the bundle.
- `web/src/app/splash.ts` — when it goes. `MIN_VISIBLE` and `FADE_MS`.
- `web/scripts/make-icons.mjs` — the mark itself, drawn from theme tokens.
  `npm run icons` regenerates all four PNGs. The same mark is hand-inlined as
  SVG in `index.html` and in `web/public/favicon.svg` — **change one, change all
  three.**

*For a reaction to motion or timing:*
- `web/src/styles/theme.css` — `--motion-micro`, `--motion-ui`, `--motion-screen`
  and the two curves.
- `web/src/styles/motionTokens.test.ts` — the two timings that must live outside
  the stylesheet, checked rather than asserted in a comment.
- `web/src/reader/motion.ts` — **inside a book only, and deliberately untouched.**
  A page turn is 400 ms because it was reported as too fast twice.

*For a reaction to scrolling or navigation:*
- `web/src/index.css` — the `overflow-x` rule. **Start here for anything about
  landing in the wrong place**, and read the note before changing it.
- `web/src/app/scrollMemory.ts` — the per-path offsets.
- `web/src/app/AppShell.tsx` + `.module.css` — where it is saved and restored.

*For a reaction to the reading screen:*
- `web/src/pages/Reader.tsx` + `.module.css` — the scale-for-toolbar, and the
  constant it hands to CSS.
- `web/src/reader/Chrome.module.css` — the one toolbar.
- `web/src/reader/pageTurn.ts` — the copy, and why it is built at full size and
  drawn at the scale.
- `web/src/reader/bookmarks.ts`, `search.ts` — both pure and tested.
- `web/src/storage/db.ts` — schema **v10** and its migration.

### Out of scope
The tutor loop (WP-17→20), WP-43 folder re-scan, WP-39's second half, WP-25
notes/highlights.

---

## Still unseen from earlier rounds

- **The library's *looks*.** Grid card proportions, the progress bar in list
  view, whether the floating "+" clears the last book. Every round since
  2026-08-06 has been the reader reporting something broken; not one has been
  them saying how it reads.
- **Did the covers come back?** The fix is in the *parser*, so it reaches a book
  already on the shelf only when **Library → Update** is run. If *Beyond
  Mindfulness in Plain English* still shows a placeholder afterwards, **ask for
  the epub before diagnosing** — all four cover rules are unit-tested.
- **Long contents entries cut off at the right edge** (2026-08-05, `bbeb6b8`).
  Measured fixed in headless Chrome; the reader's exact line was never
  reproduced. The book is Nestor, *Breath*, not in the repo. **Ask for the file
  rather than guessing again.**
- **Finished is deliberately not a shelf on Home.** The reader asked for three;
  their reference had four. Putting it back is a `<Shelf>` block in `Home.tsx`
  plus `shelves.finished` in the cover list. They were told — wait for their call.
- **The blank line between paragraphs is gone**, replaced by a first-line indent.
  One line in `blocks.module.css` to restore.
- **Subtitle cutting is a guess** and will occasionally take a real title too
  far. The manual rename on the detail page is the way back.

---

## Carried forward — things that will bite

- **Ship at the end of every thread.** Build, commit, merge to `main`, push —
  Vercel deploys from `main`. This is in `CLAUDE.md` at the reader's request and
  it **overrides `/wrap-session`'s older "do not commit or push unless I ask".**
- **The scroller is the root element, not the document and not the body.**
  `overflow-x: hidden` on `html, body` *together* is not the same rule twice: it
  makes the body a second scroll container and silently detaches every
  `window.scrollY` / `window.scrollTo` / window scroll listener in the app.
  **This replaces WP-54's "the document is the only scroller, and a hidden screen
  has no height", which was wrong** — see `decisions.md`, 2026-08-08.
- **When a fix changes nothing the reader can see, check that it ran before
  refining the theory.** Cost a round.
- **`position: fixed` does not work anywhere inside the app frame. Use
  `app/Portal.tsx`.** `.frame` carries a `filter` at all times (at no-op values,
  because `none → blur()` snaps instead of animating), and an element with a
  filter is a containing block for every fixed descendant. This has now cost two
  rounds. **The same trap applies to the reading screen's scale transform**: the
  page number had to become part of the page for exactly this reason.
- **To make the page look smaller, scale it — never resize it.** A real resize
  re-flows the columns and the browser re-decides every page break, so the page
  under the reader's thumb changes as they tap. Scaled rectangles come back
  scaled while `scrollLeft` and the column gap do not — divide on the way in, and
  never derive the factor from `offsetWidth` (whole-pixel rounded; a fraction of
  a per cent of a 40,000 px strip is a page and a half).
- **Anything with `overflow` other than `visible` cannot be broken across a
  column.** A scroll container has no seam to cut, so giving an element its own
  scroller is what makes a tall one run off the bottom of the page.
- **Headless Chrome renders this app correctly.** The old note saying `#root`
  comes back empty was the dev server's self-signed certificate, not the app.
  Real layout *is* testable — the scroll fix was verified against a 9000 px
  screen. **Gestures are still a phone question**: jsdom never cancels a pointer.
- **Books imported before a parser change keep the old parse, silently.**
  `PARSER_VERSION` is 9 and the shelf offers the update — but it needs the kept
  source file, and a book imported without one can never be brought forward.
- **A title fix reaches everyone; a parser fix does not.** `TITLE_CLEAN_VERSION`
  recomputes from what is already stored, at boot, for free. Keep new work on the
  title side of that line wherever there is a choice.
- **Anything that adds, removes or re-parses a book must clear all three
  caches** — `forgetCovers()`, `forgetShelfMemory()`, `forgetLibraryMemory()`.
  `Library.reload(changed)` is the one door they live behind; keep it that way.
- **A copy of the strip is a scrolling box.** Anything laid over one at
  `inset: 0` lands at its scroll origin, not on screen — hang it on the
  non-scrolling wrapper `copyOf` returns.
- **A page is a column plus its gap.** Anything that scrolls or measures the
  strip must use `measure().pageWidth`, never the element's width.
- **No 3D transform on a shelf tile.** A rotated element takes its own width with
  it and breaks the row alignment. Spine and page edges are shadows and
  pseudo-elements for exactly this reason.
