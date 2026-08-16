# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Task — re-import the books and judge PARSER_VERSION 27

**Goal.** Check on the phone that the library now reads the way the printed book
reads. The parser stamp is 27, so the shelf offers to rebuild every book.

### What changed in 27

The parser read an epub's chapters as HTML. They are XHTML.

XHTML lets any element close itself. Publishers write a page anchor as
`<a id="page205"/>` and put one at the top of every chapter. The HTML parser
allows self-closing only for `<br>` and `<img>`. So it read that anchor as an
opening tag with no closing tag, and put the rest of the file inside it. The
whole chapter then arrived as one block of running text.

This is the cause of "the new lines are gone".

Measured across the eight books on disk:

| | Before | After |
|---|---|---|
| Paragraphs | 9,808 | 11,381 |
| Chapters | 252 | 291 |
| Sections | 326 | 378 |
| Printed page numbers | 204 | 205 |
| Subheadings kept | 146 | 185 |

Two books gained most: *The Mountains of My Life* (56 → 94 chapters) and
*The Quantum and the Lotus* (832 → 1,424 paragraphs).

The XML parser refuses a whole file over one fault. So the parser tries XHTML
first and falls back to HTML. One of the library's 202 chapter documents falls
back.

Second change, found by the first. A chapter's own heading is no longer
overwritten by the name the navigation gave it. If the two are the same line
said twice, the navigation still wins. If they differ, the page carries a real
second heading under the chapter's name, and it is kept as a subheading.

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
5. ***The Mountains of My Life*** lists 14 footnote entries as chapters. Its
   `toc.ncx` is malformed — two `</navPoint>` tags are missing.
6. ***Kundalini*** loses chapters Three, Eleven and Fourteen.
7. **The original file is not kept aside.** A book must be imported again to be
   parsed again.

### How to compare the whole library

`web/src/parse/library.report.ts` prints nine numbers for every epub in a
folder. Run it before and after a parser change. Judge the change on all the
books, never on one.

### Files in scope

- `web/src/parse/html.ts` — `parseMarkup`, `tagOf`, the block walk.
- `web/src/parse/epub.ts` — `applyNavigation`, the spine walk.
- `web/src/parse/assemble.ts` — `sameLine`, level resolution.
- `web/src/parse/styles.ts` — the mini CSS engine.
- `web/src/parse/version.ts` — the stamp and its log.
- `web/src/parse/library.report.ts` — the whole-library report.
- Tests beside each of the above.

### Out of scope

The reading screen, storage, and the tutor. This task changes what a book
*becomes*, not how it draws.
