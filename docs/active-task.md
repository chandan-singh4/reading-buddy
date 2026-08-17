# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Task — re-import the books and judge PARSER_VERSION 28

**Goal.** Check on the phone that the library now reads the way the printed book
reads. The parser stamp is 28, so the shelf offers to rebuild every book.

### The page turn at a section seam

**The fault.** The last page of a section did not follow the finger. Nor did the
first page, going back. The page jumped instead. In a book of 100 sections, that
is about 200 dead pages.

**The cause.** A section is laid out in columns in one strip. `turn()` returns
`null` when the next page is outside that strip. `startDrag` then gave up, and
the reader fell back to a threshold swipe. The sheet had nothing to reveal,
because the arriving page was in a different section that was not on screen.

**The fix.** Both neighbour sections are now on the page all the time. They sit
in two more `<article>` strips, in the same box as the live one, with the same
markup. They are laid out but not painted (`visibility: hidden`). See
`.understudy` in `Reader.module.css`.

When a drag runs off the end of a section, `startSeamDrag` does this:

1. It scrolls the neighbour strip to the page the finger is asking for.
2. It makes that strip visible and hides the live one.
3. It starts the flip, with the neighbour as the page under the sheet.

If the finger goes back, the strips swap back and nothing has moved. If the
finger commits, the reader loads the neighbour as normal, and the strip is
hidden again the moment the real page arrives.

The two directions build the sheet in opposite orders. `beginDrag` already
records why, at `pageTurn.ts`.

**Why the markup is shared.** `sectionBody` draws the live strip and both
neighbours. The page breaks must fall in the same places, or the page under the
sheet is not the page that arrives. One function is what guarantees that.

**Checked in the browser.** With the live strip on the last page of a section:
the next strip appears at its first page, the live one hides, and the flip runs.
On release, the reader lands on the next section's first page and both
neighbours go dark again. Backwards is the mirror of that, landing on the
previous section's last page. No console errors.

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

For the page turn at a section seam:

- `web/src/pages/Reader.tsx` — `startSeamDrag`, `endDrag`, `sectionBody`.
- `web/src/pages/Reader.module.css` — `.understudy`.
- `web/src/reader/pageTurn.ts` — `beginDrag`, `holdStill`, `settleDrag`.
- `web/src/reader/columns.ts` — `turn`, `offsetOfPage`, `pageCountOf`.
- `web/src/pages/Reader.test.tsx`.

### Out of scope

Storage and the tutor.

The parser part of this task changes what a book *becomes*, not how it draws.
The page-turn part is the reading screen only. It changes no parsed data.

### The words that moved at the seam

The first build of the seam turn had a fault. The reader dragged onto the new
page, and then the words dropped into place. Going back, a picture appeared
before the turn had landed.

**The cause.** A figure's picture is stored in the book, not on the web. The
reader turns it into a `blob:` URL, and it did that for the section on screen
only. So a neighbour strip drew every figure at no height. The strip then broke
its columns in the wrong places. The reader saw a page built with the pictures
missing, and the real section replaced it a moment later with the pictures in.

**The fix.** `shownParagraphs` in `Reader.tsx` now gives the picture hook all
three sections at once. The three strips get the same pictures, so they break
their columns in the same places, and the page that arrives is the page that was
under the sheet.

Second fault, found beside it. The two neighbours were emptied at the start of
every page load and filled again when the reads came back. That threw away the
live page's pictures as well, and left a gap where a seam turn could not start.
They are now replaced in one step, and carry the path of the page they belong
beside, so a stale pair is never revealed.
