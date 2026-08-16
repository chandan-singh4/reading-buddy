> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Re-import the books and judge PARSER_VERSION 25 on the phone

Nothing is mid-edit. Build green, **1423 tests across 81 files** (2026-08-16).

**This is the task: re-parse the books and look at them. No code.**

1. Open the shelf. Accept the re-parse it offers for every book.
2. Open the Contents tab of *The Mountains of My Life*. Chapters 1 to 27 must
   all be there, with PART 1, PART 2 and PART 3 standing beside them.
3. Open the Contents tab of *Be As You Are*. Chapters 1 to 21 must all be
   there, with Parts Two to Six beside them.
4. Read a few pages of each. Italic phrases must be in italics. A centred line
   must be centred. A display line must be larger than the body text.

### What changed in 25

Two faults, both of them the same mistake in different places: the parser
measured something true about the book and then threw the measurement away.

**Emphasis is kept.** The stylesheet engine always computed a full appearance
for every element — size, weight, slant, alignment, indent — then reduced it to
one yes-or-no question and discarded the rest. Now a paragraph carries `marks`
(runs of characters the book set apart) and `appearance` (how the book set the
whole line), and the reader draws both. Two books needed two different carriers
to be read alike: one marks italics with `<em>`, the other with a class and a
CSS rule. Only reading the CSS finds both.

**Parts no longer eat chapters.** Navigation depth was written straight into the
heading level, and only the two shallowest levels survive. A book that nests
chapters under parts put every chapter at depth 3 and lost all of them.
*Mountains* came back with 9 chapters of 28. A navigation level is now judged by
how much of the book it holds: a level of parts holds under 1%, a level of
chapters holds nearly all of it. A part stands beside the chapters it names
rather than above them, so the anchor grammar stays two deep.

### Still open — measured, not fixed

- **Kundalini is missing chapters Three, Eleven and Fourteen.** Measured cause:
  the file states nothing about them. `<p class="calibre1">Chapter Three</p>`,
  where `.calibre1` is the class every body paragraph uses, and the contents
  omits those three entries. A text rule was written and withdrawn: it did not
  fire in that book (the promotion pass stops early when a document has no
  styled headings at all) and it added three false chapters to another book.
- **A part page does not get its own page.** The CSS `page-break` properties are
  still unread. Measured: *Mountains* defines `.pgbrk` and never uses it, so a
  page-break rule alone would not have fixed that book either.
- **Mountains lists 14 footnote entries as chapters.** Its `toc.ncx` forgets two
  closing `</navPoint>` tags, so the footnote list nests a level too deep. These
  are real entries in the book's own contents; they are noise, not loss.
- **The source is not stored aside yet.** Re-parsing still needs the original
  file.

### Files in scope

- `web/src/parse/epub.ts` — navigation, part levels
- `web/src/parse/html.ts` — marks, block appearance
- `web/src/parse/styles.ts` — the CSS engine
- `web/src/parse/assemble.ts` — the block stream and its types
- `web/src/reader/blocks.tsx` — drawing marks and appearance
- `web/src/reader/linkRuns.ts` — cutting text at link and mark edges

### Out of scope

Chapter numbers move in any book that nests. Saved places, bookmarks and
highlights in those books point at the wrong paragraph. This was accepted
before the work started; do not spend the session on migrating them.
