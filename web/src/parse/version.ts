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
 */
export const PARSER_VERSION = 11
