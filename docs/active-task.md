# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Task — re-import the books and judge PARSER_VERSION 28

**Goal.** Check on the phone that the library now reads the way the printed book
reads. The parser stamp is 28, so the shelf offers to rebuild every book.

### What changed in 28

Three faults, each found by reading a book beside the same book in Google Books.
Each one is a place the parser wrote something the publisher did not.

**1. A heading lost the line break the book wrote into it.**

A heading was read with `textContent`. A paragraph was read with the full
extractor. `textContent` has no idea what a line is.

A numeral over a name is the commonest title in print. *The Gay Science* writes
it as one heading with a break inside:

```html
<h2 class="section"><strong>3</strong><br/><em>Emerson</em></h2>
```

So the two halves arrived pasted together as "3Emerson". Headings now read
through the same extractor as prose. The break survives as a newline, and the
reader prints it on two lines. The extractor also skips a bare page marker inside
a heading, so its number no longer joins the title.

**2. A drop cap set the whole first paragraph five times too large.**

`::first-letter` styles one letter that CSS invents. The parser read it as a rule
about the element. *Determined* carries:

```css
p.x03-CO-Body-Text::first-letter { font-size: 5em }
```

It sits after the plain `1em` rule, so it won on source order. Every chapter
opened with a page of enormous type. It also gave the baseline a 5em paragraph to
weigh, which moves what the rest of the book is measured against.

A rule is now dropped when its rightmost compound carries a pseudo-element.
Pseudo-*classes* (`:first-child`, `:hover`) are kept on purpose. They select the
element itself and only narrow which ones.

**3. "Page 360" became a chapter title.**

*The Mountains of My Life* gathers each chapter's footnotes into a file of their
own. It lists them in the contents under the chapter they belong to, one entry
per note, labelled with the page the note was printed on:

```xml
<navLabel><text>Page 360</text></navLabel>
<content src="xhtml/chapter025-fn.xhtml#ch25fn002"/>
```

The target is the footnote paragraph. That file holds no heading at all. So a
title was invented for each one. The reader met a page headed "Page 360" above a
footnote, and the contents listed 14 of them among the chapters.

The label is now read as what it says: this block opens printed page 360. The
number is kept on the block. The entry goes no further — it never becomes a
heading and never takes a level. The rule is tight on purpose. The whole label
must be the reference and nothing else, so a chapter called "Page One" is safe.

### What the numbers say

Measured across all 32 books, before and after. Exactly one row moves:

| The Mountains of My Life | Before | After |
|---|---|---|
| Sections | 136 | 108 |
| Printed page numbers | 0 | 28 |

28 invented titles gone. 28 printed pages recovered. No other book changes.

The report cannot see faults 1 and 2, so each was checked on the book itself:

- *The Gay Science* — the title is now `"3\nEmerson"`, not `"3Emerson"`.
- *Determined* — paragraphs set over twice body size: 0. It was every chapter
  opening in the book.

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
5. ***Kundalini*** loses chapters Three, Eleven and Fourteen.
6. **The original file is not kept aside.** A book must be imported again to be
   parsed again.

Closed in 28: *The Mountains of My Life* listed 14 footnote entries as chapters.
Its `toc.ncx` is still malformed, but those entries are now read as printed
pages, so they no longer reach the code the fault hurt.

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
