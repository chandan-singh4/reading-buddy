/**
 * Which build of the parser a book was made by.
 *
 * A parsed book is a *snapshot*. Nothing re-reads the original file while
 * reading — the text, the anchors, the links and the block kinds were all
 * decided once, at import, and are then permanent. So improving the parser does
 * nothing whatever for the books already on the shelf, and says nothing about
 * itself: the reader sees the old behaviour, concludes the fix didn't land, and
 * the only remedy is deleting the book and finding the file again.
 *
 * Bumping this number is how a parser change announces itself. The shelf
 * compares each book's stamp against it and offers to rebuild the ones behind —
 * from the original file, which is now kept for exactly this purpose (see
 * `storage`'s `sources` table).
 *
 * ## Bump this when — and only when — a change alters what a book *becomes*
 *
 * Parsing differently: a new block kind, different chapter splitting, links
 * that used to be dropped, furniture that used to survive. Not for a change to
 * rendering, storage or the reading screen — those take effect on their own,
 * and a needless bump asks every reader to reprocess their whole library for
 * nothing.
 *
 * Leave a line here for each bump. The shelf can't explain *why* a book is
 * behind, but this file can.
 *
 * - **1** — the first stamped build. Everything imported before this is
 *   unstamped and treated as behind, which is right: it predates the link work
 *   entirely.
 * - **2** — links inside table cells survive (a contents page is very often a
 *   two-column table, and every entry in one was dead text), and a paragraph of
 *   prose that merely contains an image is no longer turned wholesale into a
 *   figure caption.
 * - **3** — pictures. An epub's images are pulled out of the archive at import
 *   and stored beside the text, so a figure shows the plate and not just its
 *   caption. Books parsed under 1 or 2 have no pictures stored at all, which is
 *   precisely the case this stamp exists to announce.
 * - **4** — an epub's own title metadata now wins over its filename, which
 *   used to win by mistake — the guess a downloaded file's name makes is
 *   sometimes a stray id or hash, never something a reader chose, and the
 *   book's own `<dc:title>` is almost always cleaner. Its cover image, when
 *   the package names one, is now extracted too, for the shelf's cover art.
 *   Books parsed under 1–3 kept whatever title their filename produced and
 *   have no cover asset at all.
 * - **5** — a stray hash some download or conversion tool left sitting inside
 *   a title — in the filename, or baked right into the epub's own metadata —
 *   is now stripped out. Books parsed under 1–4 may still show one.
 * - **6** — a `<dc:title>` polluted with a whole citation dump (author,
 *   publisher, ISBN, content hash, a trailing "Anna's Archive" credit — all
 *   run together with no punctuation between fields) is now cut back to just
 *   the title, by recognising each of those fields and truncating at the
 *   first one found. Not a guarantee: a subtitle mashed into the same string
 *   with none of those markers of its own can survive — use the manual rename
 *   on the book's detail page for those. Books parsed under 1–5 may still
 *   show the full dump.
 * - **7** — an epub's spine boundaries survive as page breaks. The cover, the
 *   copyright page, the dedication and the preface are four separate documents
 *   in the file and four separate pages in every other reader; they were being
 *   concatenated into one continuous run of text, so the cover plate ran
 *   straight into the title beneath it. Books parsed under 1–6 carry no
 *   boundary marks at all and will keep flowing together until re-imported.
 * - **8** — three things a book loses without a re-parse. A `<br>` is a line
 *   break again instead of nothing at all, so the words either side of one stop
 *   being pasted together ("Published byDell Publishinga division of"). Link
 *   targets that used to vanish now survive: the ids on a heading that becomes
 *   a chapter or section title are handed to the first block underneath it
 *   rather than dropped with the heading, and the legacy `<a name="fn1">` form
 *   is recognised. A dedication or an epigraph is labelled as such, so the
 *   reading screen can set it apart the way print does.
 * - **9** — covers are found in two more ways. A book that names no cover in
 *   its metadata — which conversion tools drop routinely — now gets one from a
 *   manifest image called "cover", or from the single picture on the book's own
 *   first page. Books parsed under 1–8 that missed on the metadata rules have
 *   no cover asset stored at all and show a coloured placeholder until this
 *   update runs.
 * - **10** — the rest of the book's own Dublin Core record is read: its ISBN,
 *   publisher, publication date, language, blurb and subject headings. The
 *   parser had been taking the title and the author from that record and
 *   walking past everything else. Unlike most stamps this one changes no word
 *   of the text — but it is the one case where a re-parse is the *only* way to
 *   get the data, because it exists solely in the original file and can be
 *   derived from nothing already stored. The ISBN in particular is what makes
 *   a catalogue lookup an exact fetch rather than a title search, which
 *   confidently returns the wrong edition. Books parsed under 1–9 carry none
 *   of these six fields.
 * - **11** — 10 again, because 10 didn't land. The re-parse read all six
 *   fields and then discarded them along with the rest of the parser's meta —
 *   the rule that stops a re-parse overruling a title the reader corrected,
 *   applied to fields the reader never touches and the file alone can supply.
 *   Every book updated under 10 gained nothing, and needs asking again. The
 *   author is now read properly in the same pass: every `dc:creator` the file
 *   credits rather than only the first, skipping the ones labelled as
 *   illustrator or translator.
 * - **12** — 10 and 11 again, for the same six fields, because there was a
 *   second wall behind the first. The client was sending the fields correctly
 *   under 11; `rb_upsert_book` — which lists its columns by hand — had never
 *   been taught their names, so Postgres read the jsonb it was given and
 *   silently dropped those six keys on every import and all 32 updates. No
 *   error, nothing in a log, just nulls. Migration `0005` fixes the function;
 *   this bump is what asks the books one more time, since 11 already stamped
 *   them as current on the way past.
 * - **13** — the running heads a print edition left in the text are recognised
 *   as furniture and dropped. "Introduction | 7" and "6 | You Are the One
 *   You've Been Waiting For" are what sits in the margin of a paper page; a
 *   conversion from print, or from a PDF of print, brings them down into the
 *   prose, where they land between two halves of a sentence every few hundred
 *   words. Nothing in the markup says what they are — see `runningHead.ts` for
 *   the shape they are recognised by, and for why the rule refuses to touch a
 *   dash. Books parsed under 1–12 keep them, and this is a case where a
 *   re-parse is the only remedy: the lines are ordinary paragraphs in the
 *   stored text, indistinguishable after the fact from the ones the author
 *   wrote.
 * - **14** — 13 again, for the half of them it missed. 13 examined paragraphs
 *   only, on the reasoning that a heading is the author speaking. But a
 *   converter reaching for `<h1>` is describing how a line *looked* on the
 *   page, and the running head at the top of a printed page looks exactly like
 *   a heading — so "Introduction | 7" was dropped and "6 | You Are the One
 *   You've Been Waiting For", the same furniture from the facing page, stayed.
 *   Books updated under 13 kept every running head their file marked up as a
 *   heading, and need asking again.
 * - **15** — the half of them that were never a block at all, found by finally
 *   opening the file instead of theorising at it. 13 and 14 both assumed a
 *   running head arrives as its own paragraph. On a recto page it does. On a
 *   verso page it sits above a sentence *continuing* from the page before, so
 *   the converter emits one paragraph — "8 | You Are the One You've Been
 *   Waiting For or distract from the pain and emptiness..." — and there is no
 *   block to drop, only a prefix to strip. Where the prefix ends is settled by
 *   what repeats: the text after the page number is identical on every other
 *   page of the book, so the common opening of those paragraphs is the head.
 *   Needing the whole book to see that is why it lives in `assemble.ts` and not
 *   in a format's own parser. Books updated under 13 or 14 kept every one of
 *   these.
 * - **16** — the headings a book only ever set in bold. Below the chapter
 *   level, a print conversion rarely uses `<h1>`–`<h6>`: a subheading is a
 *   paragraph in heavier type, `<p><b>The Three Projects</b></p>`, because that
 *   is all it was on the page. The parser flattens inline formatting to plain
 *   text, so the line arrived indistinguishable from prose and the reader lost
 *   every signal that a new section had begun. A wholly bold paragraph that is
 *   short, does not end like a sentence, and does not end in a page number (a
 *   contents entry, set in the same bold) is now labelled `subheading`, and the
 *   reading screen sets it as a heading. Labelled rather than promoted to a
 *   real heading block on purpose: a heading is consumed as a division title
 *   and vanishes from the text, which would shift every anchor after it — and
 *   an anchor is what a highlight is pinned to.
 * - **17** — the `####` on the page. A book with headings deeper than its
 *   section level had those headings demoted to prose, and the demotion wrote
 *   the level down as literal markdown hashes: `#### TANTRISM AND KUNDALINI
 *   YOGA`. Nothing downstream ever parsed them back out — the reader draws a
 *   block's text as it stands — so the hashes were simply printed. Demoted
 *   headings now carry `label: 'subheading'` and their own bare text, which is
 *   the same treatment 16 gave to bold-only headings and which the reading
 *   screen already sets as a small heading.
 * - **18** — the chapter title said twice. A converter often emits a chapter's
 *   name both as structure and as the line that was printed on the page:
 *   `<h1>Introduction</h1><p>Introduction</p>`. The heading becomes the
 *   chapter's title and moves into the reading screen's header, so what was
 *   left was the app's own title followed immediately by the same word again.
 *   A division's first block is dropped when it repeats that division's name
 *   exactly, letters and digits compared and case ignored. Only the first
 *   block, and only an exact match: a paragraph that merely opens with the
 *   chapter's name is a sentence, and dropping it would delete a line of the
 *   book. Anything the dropped line carried — ids a contents page links to, a
 *   page break the source asked for — moves to the line that takes its place.
 * - **19** — the scene break the file threw away. An author's pause between two
 *   scenes of one chapter reaches a file either as `<hr>`, which this parser
 *   had no rule for and so dropped silently, or as a short paragraph of
 *   asterisks, which was printed as the literal characters `* * *`. Both are
 *   now `prose` labelled `break`, and the reading screen draws the ornament
 *   itself rather than printing the block's text — so the mark is the theme's
 *   to choose. Labelled rather than given a `BlockKind`, for the same reason as
 *   16 and 17: the block was already there, and its anchor must not move.
 * - **20** — the book with no chapters. An epub's chapter titles are often set
 *   as artwork, so the file holds a picture and not an `<h1>`. The parser
 *   already had the answer: take the title from the epub's own contents. But it
 *   asked *once for the whole book* whether any heading existed anywhere, and a
 *   book with headings in its endnotes and glossary — most books — switched the
 *   fallback off for every chapter. Every chapter then arrived headless, the
 *   body fused into one untitled division, and the contents page listed the
 *   front and back matter and not one chapter of the book. The question is now
 *   asked per document. A document that has a heading is untouched, so the
 *   original worry — a synthesised title competing with a real one and splitting
 *   a chapter — cannot happen.
 * - **21** — the parser opens the book's stylesheet. Until now it judged
 *   structure from tags alone, and almost no ebook in circulation is written as
 *   HTML: it is converted, and converters do not emit `<h1>`. They emit
 *   `<p class="chaphead">CONTENTS</p>` and put the size, the weight and the
 *   centring in a CSS file the parser never opened. Every visible difference
 *   between a chapter title and a sentence was in that file, so a contents page
 *   arrived as a wall of identical paragraphs — which is exactly what was
 *   reported. An epub's stylesheets are now read and resolved per element, and a
 *   line is called a heading when it is set louder than *this book's own body
 *   text*, never against a fixed size: books disagree about what 1em means, but
 *   no book disagrees with itself. Two signals are required, so a book set
 *   entirely in bold or entirely centred does not become one long heading. A
 *   contents page with no `<nav>` to mark it is recognised from its own
 *   "Contents" line and dropped, because the app builds that screen itself and
 *   the printed page numbers are meaningless here. Nothing in the rule knows a
 *   single class name — that is the point, and the reason it should not need
 *   adjusting for the next book. Books parsed under 1–20 keep the flattened
 *   version.
 * - **22** — 21 found the titles and then did not use them. A styled heading
 *   was *labelled*, not promoted, so it looked right on the page and counted
 *   for nothing: the assembler builds divisions from `heading` blocks, and the
 *   contents screen is built from divisions. A converted book therefore came
 *   out as one undivided run of text with bold lines in it, and Contents listed
 *   three entries for a book with thirty. That was reported, with the titles
 *   plainly visible in the reading screen and absent from Contents in the same
 *   session. They are promoted now, and their levels come from ranking the
 *   distinct sizes the document uses — largest is level 1 — so a part title
 *   nests the chapters beneath it without the parser knowing anything about how
 *   this converter scales its type. Two guards: a document with real
 *   `<h1>`–`<h6>` of its own is left alone, because the author has already said
 *   what the structure is; and a long document that comes back mostly headings
 *   is disbelieved and kept as prose, since a chapter cut into fifty divisions
 *   is worse than flat emphasis. The share is not weighed on a short document —
 *   an epub gives a part its own file holding one line, and that file is all
 *   heading and entirely correct.
 *
 *   21 held back from promoting on the grounds that a heading is consumed as a
 *   division title and shifts every anchor after it. True, and the wrong trade:
 *   a re-parse rebuilds anchors in any case, notes carry their quote text, and
 *   the caution bought nothing while costing the reader the whole contents
 *   screen. Books parsed under 21 have the titles but none of the structure.
 * - **23** — the book's own navigation decides the structure. Every epub ships
 *   a `toc.ncx` or a `nav.xhtml` in which the author *states* the divisions:
 *   their titles, their nesting, and the exact position of each one, as a
 *   `#fragment` into a spine document. We read that file already, at
 *   `readTocTitles`, and threw nearly all of it away — `resolvePath` splits the
 *   fragment off, the nesting was never recorded, and what survived was a flat
 *   path-to-label map used only to title a whole document. So the parser was
 *   inferring, from type size and boldness, a structure the file had spelled
 *   out. That is why 21 and 22 could never be right in principle: three short
 *   centred lines of a dedication are, as evidence, identical to three chapter
 *   titles.
 *
 *   Both formats are read now, EPUB 3 first, keeping the fragment and the
 *   nesting depth. Each entry finds its block by anchor and makes it a heading
 *   at the depth the navigation gives it. A heading the navigation does *not*
 *   name, and which 22 only guessed at from styling, goes back to being a
 *   paragraph set apart — which is what stops a dedication becoming three
 *   chapters. The styling pass is now the fallback for a file with no usable
 *   navigation, not the method. Structure comes from the navigation; the words
 *   stay the markup's own, so a real `<h1>NOTES</h1>` is not rewritten to match
 *   a contents line reading "Notes".
 *
 *   22 also dropped the book's printed contents page. That was wrong twice
 *   over. The reader wants the page — it belongs to the book like a dedication
 *   does, and the app's Contents tab is a separate thing that does not replace
 *   it. And the rule could not tell where the list ended, so it read on into
 *   "PREFACE" — short, no full stop — and ate it. That is the reported missing
 *   Preface. The rule is gone.
 * - **24** — two faults that emptied a book's contents between them, both found
 *   on one reported file whose contents listed its front matter and then jumped
 *   to chapter twenty-six.
 *
 *   The first is older than the navigation work and is the deeper one. A rule
 *   rejected any line ending in a space and a number, to keep a contents entry —
 *   "An Example of Growing Toward Self-Leadership 130" — from reading as the
 *   heading it is set to look like. "Chapter 1" and "Part 1" have that shape
 *   too. So every numbered chapter title in print was refused before any other
 *   rule saw it. The number must now follow a title of more than one word: a
 *   contents line names something and then gives a page, a numbered title is a
 *   label and a figure. Books parsed under 21–23 are missing these headings
 *   entirely.
 *
 *   The second is that 23 let the navigation speak for the whole book. A
 *   navigation that lists nothing between chapters 1 and 26 has not said those
 *   chapters are prose; it has said nothing about them. Read as denial, it threw
 *   away every heading the styling pass had correctly found. A document the
 *   navigation never points into now keeps its own guesses, so the fallback
 *   takes over exactly where the file went quiet — and the navigation still
 *   rules the documents it does describe.
 * - **25** — the parser stopped throwing away what the book's own stylesheet
 *   says, and stopped flattening books that nest their chapters under parts.
 *
 *   The stylesheet engine has always computed a full appearance for every
 *   element — size, weight, slant, alignment, indent — and then reduced it to
 *   one yes-or-no question: does this look like a heading? Everything else was
 *   discarded. So italics were lost, and so was the size hierarchy of a part
 *   page. Emphasis is now kept per run of characters (`marks`) and per block
 *   (`appearance`), and the reader draws both. Two books needed two different
 *   carriers to be read the same way: one marks its italics with `<em>`, the
 *   other with a class and a CSS rule, and only reading the CSS finds both.
 *
 *   The second fault renumbered chapters. Navigation depth was written straight
 *   into the heading level, and only the two shallowest levels survive — so a
 *   book that nests chapters under parts put every chapter at depth 3 and lost
 *   the lot. *The Mountains of My Life* came back with 9 chapters of 28; *Be As
 *   You Are* with 11 of 21. A navigation level is now judged by how much of the
 *   book it holds. A level of parts holds under 1%; a level of chapters holds
 *   nearly all of it. A part no longer consumes a level — it stands beside the
 *   chapters it names — so the anchor grammar stays two deep.
 *
 *   Chapter numbers move in any book that nests. Saved places, bookmarks and
 *   highlights in those books point at the wrong paragraph and must be reset.
 * - **26** — one reader for the text instead of two, ancestors in the style
 *   rules, and the printed page numbers a book states about itself.
 *
 *   Content that sat loose between block tags — inside a bare `<div>` rather
 *   than a `<p>` — was read with `textContent`, while a `<p>` got the full
 *   extractor. The flat reader kept the words and threw away everything that
 *   told them apart: the `<br>` that puts each line on its own line, every link,
 *   every italic. A contents page written as `<div><a>…</a><br/><a>…</a></div>`
 *   therefore arrived as one running paragraph of dead text. Both paths now use
 *   the one extractor.
 *
 *   CSS selectors were matched on their rightmost compound alone, so `.pref p`
 *   was a rule about every paragraph in the book. That was harmless while the
 *   answer fed one yes-or-no question about headings, and stopped being harmless
 *   in 25, when a book's own appearance started being drawn: one preface could
 *   set a whole book in italic. Ancestors are now checked. `>` is read as an
 *   ancestor, which can only ever match a little too widely; `+` and `~` are not
 *   ancestry at all, and a selector using them keeps the old behaviour.
 *
 *   Page numbers: an epub may mark where the paper edition turned over
 *   (`<span epub:type="pagebreak" id="page7"/>`, or the ARIA `doc-pagebreak`).
 *   Where a book says so, the number is kept on the paragraph that opens that
 *   page, as a string so roman front matter survives. Measured first: not one of
 *   the five books on the shelf carries a single marker, so this changes nothing
 *   for them. It is stored and not yet shown. A marker is *replaced* by its
 *   number only when it holds nothing but the number; the same attribute sitting
 *   on a container that wraps a real page of prose is walked into like any other
 *   element, so no text is lost to it.
 * - **27** — an epub's chapters are XHTML, and were being read as HTML.
 *
 *   XHTML lets any element close itself. A page anchor written `<a
 *   id="page205"/>` is the commonest case, and publishers put one at the top of
 *   every chapter. The HTML parser allows self-closing only for `<br>` and
 *   `<img>`, so it read that anchor as an *opening* tag with no closing tag and
 *   nested the rest of the file inside it. The whole chapter — every heading,
 *   every paragraph — then arrived as inline content of one `<a>` and was
 *   emitted as a single block of running text.
 *
 *   That is the fault behind "the new lines are gone". Measured on the shelf:
 *   five books of eight carry self-closing tags, 2,250 of them. Re-parsing the
 *   library restores 1,573 paragraphs that were fused into their neighbours,
 *   38 chapters and 50 sections that had been swallowed, and 205 printed page
 *   numbers on the one book that states them (its markers are self-closing
 *   `<span>`s, so every one of them was being eaten).
 *
 *   XHTML is now parsed as XHTML, with a fall back to the forgiving HTML parser
 *   for any file the XML parser refuses — one of the library's 202 chapter
 *   documents, as it turns out.
 *
 *   Second change, which the first uncovered: a chapter's own heading is no
 *   longer overwritten by the name the navigation gave it. Where the two are
 *   the same line said twice the navigation still wins, as before. Where they
 *   differ, the page carries a real second heading under the chapter's name
 *   ("Chapter 12" over "NATURAL LAWS, MATHEMATICS, AND THE WORLD OF IDEALS"),
 *   and it is kept as a subheading instead of being erased.
 * - **28** — three faults found by reading a book beside the same book in Google
 *   Books. Each one is a place the parser wrote something the publisher did not.
 *
 *   A heading was read with `textContent`, while a paragraph got the full
 *   extractor — the last corner of the split 26 closed everywhere else. A
 *   heading is a place a book breaks its own line, and the number over the name
 *   is the commonest title in print: *The Gay Science* writes it
 *   `<h2><strong>3</strong><br/><em>Emerson</em></h2>`. `textContent` has no
 *   concept of a line, so it arrived as "3Emerson". Headings now read through the
 *   one extractor, which keeps the break and also skips a bare page marker sitting
 *   inside a heading instead of reading its number as part of the title.
 *
 *   CSS pseudo-elements were read as if they styled the element. `::first-letter`
 *   is the drop cap every publisher opens a chapter with, and *Determined* sets
 *   it at 5em, after the plain body rule — so the rule won on source order and
 *   the whole first paragraph of every chapter was set five times body size. It
 *   also gave `baselineOf` a 5em paragraph to weigh, which moves what the rest of
 *   the book is measured against. A rule whose rightmost compound carries a
 *   pseudo-element is now dropped. Pseudo-*classes* are deliberately kept: they
 *   select the element itself and only narrow which ones.
 *
 *   A contents entry labelled "Page 360" was read as a division. *The Mountains
 *   of My Life* gathers each chapter's footnotes into a file of their own and
 *   lists them under the chapter, one entry per note, labelled with the page the
 *   note was printed on — pointing at the footnote paragraph, in a file with no
 *   heading anywhere. So a title was invented for each: the reader met a page
 *   headed "Page 360" above a footnote, and the contents listed them among the
 *   chapters. The label is now read as what it says — this block opens printed
 *   page 360 — and goes no further. Measured across all 32 books, exactly one row
 *   moves: that book loses 28 invented section titles and gains the 28 printed
 *   page numbers, and no other book changes at all.
 *
 * ## 29 — a PDF's figures are photographed
 *
 * A PDF carried no pictures at all: the parser read the text of a page and
 * nothing else, so a book of plates imported as a book of captions. It now
 * finds any tall band of a page with no text in it, draws that strip, and keeps
 * it as an ordinary figure — which is what makes a PDF's plates askable, the
 * same as an epub's.
 *
 * Nothing is *recognised*. A band is a fact about the page, not a judgment
 * about what is in it, and a band that renders blank is discarded after the
 * fact rather than guessed at beforehand. A PDF of plain prose gains nothing
 * and is drawn not at all.
 *
 * Every PDF already on a shelf re-parses on this bump, which is the only way
 * the pictures reach a book imported before today.
 */

/**
 * 30 — a PDF's column measure is the column's, not the paragraph's.
 *
 * A contents page came out as four run-on paragraphs instead of fifteen
 * entries: "The Books The Phenomenology of Spirit The Logic of Hegel" on one
 * line. The rule that ends a paragraph when a line stops well short of the
 * column edge was comparing each line against a measure seeded from the first
 * line of the paragraph being built — so a paragraph that *began* with a short
 * line compared that line with itself, the test could never fire, and every
 * following line was welded on.
 *
 * The measure is now taken across the whole column, once, before paragraphs are
 * formed. Per column and not per page, so the left column of a two-column
 * spread keeps its own edge and academic PDFs are unaffected.
 *
 * Every PDF on a shelf re-parses on this bump. Epub, docx, md and txt do not
 * pass through this code at all.
 */
/**
 * 31 — a PDF's contents come from the PDF, not from a guess.
 *
 * Every division in a PDF used to be inferred from font size, because that was
 * all this parser looked at. But most published PDFs carry an outline — the
 * bookmark tree a PDF viewer shows down its side — and that is the publisher
 * stating, in the file, which page begins which division. It is the only
 * structural truth a PDF ever holds.
 *
 * Where a file has one, it is now read and it wins outright: the font-size
 * guess is switched off rather than blended with it. Blending would let a
 * large-set pull quote outrank a real chapter, and a collected works has plenty
 * of both. A file with no outline is parsed exactly as before.
 *
 * The tree's depth becomes heading level, so a volume's children are its
 * sections and the contents list nests them under it.
 *
 * Measured on the Delphi Classics Collected Works of Hegel: 340 entries, 19
 * volumes and 321 children, against a font-size guess that found neither.
 *
 * Every PDF on a shelf re-parses on this bump. No other format reads this code.
 */
/**
 * 32 — the headings a PDF's outline does not name.
 *
 * With the outline in charge, anything it did not list came out as ordinary
 * prose. But an outline stops at the divisions a publisher thought worth
 * listing, and a book still has headings below them. The Phenomenology sets its
 * part titles in the body face, centred — so the size test could not see them
 * either, and a title stood in the text looking exactly like the paragraph
 * above it.
 *
 * Two rules now catch them. A line set larger than the body, as before. And a
 * line that stands clear of the column's left edge with near-equal margins:
 * centred, which is what a book does when it will not change the size.
 *
 * Both mark the line as a *subheading* — prose with a label. It is drawn as a
 * heading and divides nothing, so a line that merely looks important can never
 * become a chapter or a section and can never move an anchor. The outline stays
 * the only thing that divides a book.
 *
 * Also fixed: a title the page sets over two lines matched no outline entry, so
 * the entry inserted a heading of its own and the reader met the title three
 * times — once inserted, then both halves as prose beneath it. The two halves
 * are now joined and promoted, and it appears once.
 *
 * Every PDF on a shelf re-parses on this bump. No other format reads this code.
 */
/**
 * 33 — a PDF's links work.
 *
 * The contents page of a collection is a list of links, and every one of them
 * was dead: the parser read a page's text and threw its annotations away. So a
 * reader tapped the name of a volume and nothing happened, while the same tap
 * in any PDF viewer went straight there.
 *
 * A PDF link is a rectangle and a destination, and it carries no text at all.
 * The words under it have to be found from the geometry: the line is matched by
 * its baseline, and the words are the fragments whose own strip of page overlaps
 * the box. So the tappable stretch is the words the file marked, not the whole
 * paragraph.
 *
 * An external link keeps its address. An internal one names a page, and the
 * paragraph that opens that page is given an id to be pointed at — after which
 * `parse/links.ts` resolves it to a permanent anchor exactly as it does for an
 * epub. A rectangle covering no words is dropped rather than guessed at.
 *
 * Every PDF on a shelf re-parses on this bump. No other format reads this code.
 */
/**
 * 34 — a third heading level divides the book.
 *
 * *Man and His Symbols* sets Part 1 as `<h1>`, its parts as `<h2>`, and "The
 * soul of man" as `<h3>`. Only the two shallowest levels divided, so that third
 * title became a bold line of prose. It was not in the contents, the reader
 * could not jump to it, and Veda could not be asked to summarise it: as far as
 * the book's structure knew, it was not there.
 *
 * Every level below the chapter now opens a section. The model has two tiers,
 * so a third level lands in the second one — a flatter outline than the book's,
 * and a true one.
 *
 * A *guessed* heading is the exception. Those levels are inferred from type
 * size, ranked per document, so they are our arithmetic and not the author's.
 * A guess still divides only at the exact section level.
 *
 * Measured on the shelf: *Man and His Symbols* 35 sections to 57, *Be As You
 * Are* 44 to 78, *Nondual Love* 21 to 42. Five books did not move at all, and
 * no book lost a chapter or a paragraph.
 *
 * Every book on a shelf re-parses on this bump.
 */
export const PARSER_VERSION = 34
