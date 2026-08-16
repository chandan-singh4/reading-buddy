> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Re-import the books and judge PARSER_VERSION 26 on the phone

Nothing is mid-edit. Build green, **1440 tests across 81 files** (2026-08-16).

**This is the task: re-parse the books and look at them. No code.**

1. Open the shelf. Accept the re-parse it offers for every book.
2. Open a contents page. Each entry must sit on its own line.
3. Read the preface of a book that sets one in italic. Only the preface may be
   italic. The chapters after it must not be.
4. Read a few pages. Italic phrases must be in italics. A centred line must be
   centred. A display line must be larger than the body text.

### What changed in 26

**One reader for the text, not two.** Content that sat loose between block tags
— inside a bare `<div>` rather than a `<p>` — was read with `textContent`, while
a `<p>` got the full extractor. The flat reader kept the words and threw away
everything that told them apart: the `<br>` that puts each line on its own line,
every link, every italic. A contents page written as
`<div><a>…</a><br/><a>…</a></div>` therefore arrived as one running paragraph of
dead text. Measured in *Man and His Symbols*: "PART 1 APPROACHING THE
UNCONSCIOUSCarl G. Jung", two lines pasted into one. Both paths now use the one
extractor.

**Style rules read their ancestors.** Selectors were matched on the rightmost
compound alone, so `.pref p` was a rule about every paragraph in the book. That
was harmless while the answer fed one yes-or-no question about headings. It
stopped being harmless in 25, when a book's own appearance started being drawn:
one preface could set a whole book in italic. `>` is read as an ancestor, which
can only match a little too widely. `+` and `~` are not ancestry, and a selector
using them keeps the old behaviour.

**Printed page numbers are read where a book states them.** EPUB 3 marks the
spot the paper edition turned over — `<span epub:type="pagebreak" id="page7"/>`,
or the ARIA `doc-pagebreak`. The number now rides on the paragraph that opens
that page, as a string so roman front matter (`xxvii`) survives.

### Still open — measured, not fixed

- **No book on the shelf carries page numbers.** All five were counted: zero
  `pagebreak` markers, zero NCX `<pageTarget>` entries. So 26 reads them and
  nothing shows them yet. Two pieces are still missing: the EPUB 2 `<pageList>`
  in `toc.ncx`, and the reader's own page counter, which still estimates from
  word count. Build the display half when a book that has real markers arrives.
- **The books that show the faults are not on disk.** *Braiding Sweetgrass* and
  the Nondual Love book were never added to `books/`. The two fixes above were
  measured on the books that are there, and the shapes match, but neither was
  confirmed on the exact file that showed the problem.
- **Kundalini is missing chapters Three, Eleven and Fourteen.** Measured cause:
  the file states nothing about them. A text rule was written and withdrawn — it
  did not fire in that book and added three false chapters to another.
- **A part page does not get its own page.** CSS `page-break` is still unread.
- **Mountains lists 14 footnote entries as chapters.** Its `toc.ncx` forgets two
  closing `</navPoint>` tags.
- **The source is not stored aside yet.** Re-parsing still needs the original
  file.

### Files in scope

- `web/src/parse/html.ts` — the one text extractor, page-break markers
- `web/src/parse/styles.ts` — the CSS engine and its ancestor matching
- `web/src/parse/epub.ts` — navigation, part levels
- `web/src/parse/assemble.ts` — the block stream and its types
- `web/src/structure/types.ts` — `Paragraph`, including `printedPage`
- `web/src/reader/blocks.tsx` — drawing marks and appearance

### Out of scope

Chapter numbers move in any book that nests. Saved places, bookmarks and
highlights in those books point at the wrong paragraph. This was accepted before
the work started; do not spend the session on migrating them.
