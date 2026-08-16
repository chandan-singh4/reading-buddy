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
 */
export const PARSER_VERSION = 22
