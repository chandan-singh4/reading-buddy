> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — see WP-54 on the phone, and say what it should do next

Shipped 2026-08-08 across five commits (`378b43f` → `d304ef1`) and on Vercel.
Nothing is half-built. The next task is whatever the reader says when they open
it.

### The one lesson worth keeping from this round — 2026-08-08

Five rounds of "the covers flash, it looks like Home is refreshing" ended last
session with screens being kept mounted. This session found the *rest* of that
same report, and it was never about painting at all:

**There is one scroller in this app and it is the document.** A hidden screen is
`display: none`, so it has no height, so the document is only ever as tall as the
screen on show — which means **every tab change changes the height of the
document**, and the browser has no choice but to clamp `scrollY` into the new
screen's range. A long Library → a short Home clamps to Home's last pixel; the
clamp lands hard against the document edge, which is the jolt that reads as
pull-to-refresh; and Library then comes back to that clamped number, because
there was only ever one number for two screens.

The tell was in the reader's own report and it took reading twice to hear:
*"Library is also restored to the top."* Two screens overwriting one value. **A
symptom that describes a shared resource is worth more than a symptom that
describes a wrong value.**

### Ask these first

1. **Does each screen come back where you left it?** Scroll Library down, go to
   Home, come back. Home should be where *it* was, Library where *it* was, and
   neither should jolt. This is the only part of the round jsdom genuinely
   cannot see — it has no layout, so nothing there is ever tall enough to clamp.
   The bookkeeping rule is tested; the layout is verified on the phone or not at
   all.
2. **Does the filter row fit one-handed?** It scrolls sideways and now carries
   eight controls. The reader steered its behaviour four times by eye but has
   said nothing about its *size* — chip height, how far the row runs off the
   right edge, whether the open panel pushes the shelf too far down.
3. **Do the reading-progress bands answer the real question?** 0–25% / 25–50% /
   50–75% / 75–100%, several at once. **A book with no recorded percentage is in
   none of them** — deliberate, since an unknown percentage means never opened,
   and Unread already holds those. If the reader expects unread books in
   "0–25%", that is a one-line change in `inBand` and a decision, not a bug.
4. **Do Unread and Finished behave?** Finish a book; it should be in Finished on
   the next paint with nothing filed. Clear its position; it should be back in
   Unread. There is no sync step to go wrong — if it misbehaves, the fault is in
   `progressMap`, not in folders.

### Decisions made this round the reader may want to revisit

- **A book may now be in several folders**, reversing WP-53's "at most one".
  What keeps it a folder and not a tag is that the shelf shows each book once.
  The consequence they haven't seen: a book in three folders wears three badges
  on its row.
- **Sorting by folder was dropped** (folders have their own control) and
  **sorting by reading progress became a filter**. Both were removed, not
  hidden; a stored preference naming either falls back to "Recently added".
- **The accent no longer marks "this filter is hiding books"** — it marks the
  chip last tapped. The information moved to the chip's own label and the
  "Showing 3 of 12" line. If the reader misses spotting an active filter at a
  glance, the fix is a *second, quieter* cue, not taking the yellow back.
- **"Unread" appears twice in the full sheet** — once as a reading status, once
  as a folder. Inherent in having asked for both. Droppable by removing the
  Reading status group from the sheet, since the folders cover it.

### Files in scope

*For a reaction to scrolling or navigation:*
- `web/src/app/scrollMemory.ts` — the per-path offsets, and the whole diagnosis.
  **Start here for anything about landing in the wrong place.**
- `web/src/app/AppShell.tsx` + `.module.css` — where it is saved and restored,
  and `leavingShift`, which offsets the outgoing screen during the slide.
- `web/src/app/screenActive.tsx`, `tabHistory.ts`, `routeTransition.tsx`,
  `useSwipeNav.ts` — unchanged this round; read only if the fault is Back, the
  slide, or a stale screen rather than a position.

*For a reaction to the filter controls:*
- `web/src/library/FilterBar.tsx` + `.module.css` — the row. Its opening note
  holds the three rules the reader arrived at by correction: two options is a
  switch, the accent follows the tap, a panel closes when you move on.
- `web/src/library/prefs.ts` — **add a new filter here first**: a field on
  `LibraryPrefs`, a default, a validator, then one clause in `filter.ts`. The
  reading-progress bands are the worked example.
- `web/src/library/filter.ts` — search → filter → sort, all of it pure.
- `web/src/library/FilterSheet.tsx` — the complete set behind the ⚙ icon, and
  the only place content type lives.

*For a reaction to folders:*
- `web/src/library/systemFolders.ts` — why Unread and Finished are computed.
- `web/src/library/folders.ts` — `foldersOf`, `folderChoices`.
- `web/src/storage/db.ts` (schema v9 + the migration) and `repository.ts`
  (`addBooksToFolder`, `removeBooksFromFolder`, `clearFoldersFor`).
- `web/src/library/SelectionBar.tsx` — "Change folders", with its three-state
  rows (none / some / all of the ticked books).

### Out of scope
The tutor loop (WP-17→20), WP-43 folder re-scan, WP-39's second half, in-book
search and real bookmarks (the rest of WP-14).

---

## Still unseen from earlier rounds

- **The library's *looks*.** Every round since 2026-08-06 has been the reader
  reporting something broken; not one has been them saying how it reads. Grid
  card proportions, the progress bar in list view, whether the floating "+"
  clears the last book.
- **Does the page flip stutter on a long chapter?** A turn inside a section takes
  a `cloneNode(true)` of the laid-out section on every tap. **If it does, the fix
  is named already: cache the clone per section in a ref and reset its
  `scrollLeft` before each flip.** Invalidate on section change, resize, and any
  reader-settings change.
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
- **The document is the only scroller, and a hidden screen has no height.**
  Anything that changes what a screen contains changes the document's height,
  and the browser will clamp the scroll to match. Kept here because it is not
  visible from any one file and cost a round to find.
- **`position: fixed` does not work anywhere inside the app frame. Use
  `app/Portal.tsx`.** `.frame` carries a `filter` at all times (at no-op values,
  because `none → blur()` snaps instead of animating), and an element with a
  filter is a containing block for every fixed descendant. This has now cost two
  rounds. It is also why `FilterBar`'s panels sit in the normal flow rather than
  hanging under their chips.
- **Layout and gestures are verified on the reader's phone or not at all.** jsdom
  has no layout and never cancels a pointer; headless Chrome renders this app's
  `#root` empty. Three faults once shipped under 656 green tests.
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
