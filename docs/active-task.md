# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Task — judge PARSER_VERSION 28 on the phone

**Goal.** Read the library on the phone beside the same books in Google Books.
Find where the app and the printed book disagree.

**This needs no code.** The parser stamp is 28, so the shelf offers to rebuild
every book. Accept the rebuild first.

**Definition of done.** The reader has looked at the Contents tab of at least
*The Mountains of My Life* and *The Gay Science*, and has said what still
disagrees. Nothing is fixed until there is a fault to fix.

**What to expect after the rebuild:**

- Chapters nest under their parts.
- The Preface is listed.
- The book's own printed contents page is still in the text.
- A numbered chapter opens with the large numeral.
- *The Mountains of My Life* no longer lists 14 footnote entries as chapters.
  It went from 136 sections to 108, and gained 28 printed page numbers.
- *The Gay Science* shows "3" over "Emerson", on two lines.
- *Determined* opens its chapters at body size, not five times it.

### Next after that — drop caps

The reader parked this and will send a screenshot. Nothing is decided yet.

The recommendation on file: find the shape rather than the book. One letter,
offset 0 in its paragraph, set at twice body size or more. Float it as print
does, and clamp the size to the number of lines it spans. Do not add a rule for
one book.

Note the reading page already floats a drop cap of its own, in
`.opening + p::first-letter` in `Reader.module.css`. Read that first: the
question may be which of the two is right, not how to build one.

### Files in scope

For the parser judgement (only if a fault is found):

- `web/src/parse/html.ts` — `parseMarkup`, `tagOf`, the block walk.
- `web/src/parse/epub.ts` — `applyNavigation`, the spine walk.
- `web/src/parse/assemble.ts` — `sameLine`, level resolution.
- `web/src/parse/styles.ts` — the mini CSS engine.
- `web/src/parse/version.ts` — the stamp and its log.
- `web/src/parse/library.report.ts` — the whole-library report.
- Tests beside each of the above.

For anything that touches the page turn:

- `web/src/pages/Reader.tsx` — `startSeamDrag`, `endDrag`, `sectionBody`.
- `web/src/pages/Reader.module.css` — `.page`, `.page.understudy`.
- `web/src/reader/pageTurn.ts` — `beginDrag`, `holdStill`, `settleDrag`.
- `web/src/reader/columns.ts` — `turn`, `offsetOfPage`, `pageCountOf`.
- `web/src/reader/motion.ts` — `fadeIn`, `MOVE_MS`.
- `web/src/reader/figures.ts` — `useFigureImages`.
- `web/src/pages/Reader.test.tsx`, `web/src/reader/figures.test.tsx`.

### Out of scope

Storage and the tutor.

### How to compare the whole library

`web/src/parse/library.report.ts` prints nine numbers for every epub in a
folder. Run it before and after a parser change. Judge the change on all the
books, never on one.

### Carried forward — how to work on the reading page

Three lessons this thread paid for. They cost half a day each.

1. **Measure in a real browser, not by reading the file.** Every one of the four
   seam faults was found by asking the running page a number: a layout-shift
   observer, `getAnimations()`, `offsetWidth`. None of them was visible in the
   source.
2. **Layout is `offsetWidth`, paint is `getBoundingClientRect`.** The turning
   sheet is under a transform, so its rectangles are distorted. Two false alarms
   came from comparing the two.
3. **The Browser pane does not composite.** `document.hidden` is true, so
   `requestAnimationFrame` never fires and every animation reads as `running` at
   time 0. Step a drag synchronously and observe settles with `setTimeout`.

### Still open — measured, not fixed

1. **Printed page numbers are read but not shown.** The reader still estimates
   the page from the word count. Only *Nondual Love* states its pages with
   EPUB 3 markers.
2. **The `<a id="pageNNN"/>` form is not read as a page number.** *The Quantum
   and the Lotus* and *The Mountains of My Life* mark their pages this way. The
   ids survive; nothing reads them.
3. **The EPUB 2 `<pageList>` in `toc.ncx` is unread.**
4. **CSS `page-break-before` / `page-break-after` is unread.** Only the epub
   spine seam makes a page break.
5. ***Kundalini*** loses chapters Three, Eleven and Fourteen.
6. **The original file is not kept aside.** A book must be imported again to be
   parsed again.

### Closed this thread

The seam turn and the four faults under it are done and signed off. The full
write-up is in `docs/progress.md` under *The page turn crosses a section*, and
the three decisions are in `docs/decisions.md`, all dated 2026-08-17.
