> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Re-import a book and judge the parser on the phone

Nothing is mid-edit. Build green, **1404 tests across 81 files** (2026-08-16).

The parser now takes the book's structure from the book's own navigation. Every
epub ships a `toc.ncx` or a `nav.xhtml`. In it the author states the divisions:
their titles, their nesting, and the exact place each one starts. We read that
file before, but kept only a title per document. We dropped the positions and
the nesting. So the parser guessed a structure the file already stated.

Both formats are read now. Each entry finds its block and makes it a heading at
the depth the navigation gives it. A heading the navigation does not name goes
back to a paragraph set apart. This is what stops a dedication of three short
lines from becoming three chapters. The styling rules below are now the fallback
for a file with no usable navigation.

The navigation decides the structure. The markup keeps its own words. So a real
`<h1>NOTES</h1>` is not renamed to match a contents line that reads "Notes".

The book's printed contents page is kept. An earlier rule dropped it. That rule
was wrong twice. The page belongs to the book. And the rule could not tell where
the list ended, so it also ate the "PREFACE" title. That was the missing Preface.

The parser also reads the book's own stylesheet. Before this it judged structure
from tag names only. Almost no ebook is written as HTML. Converters make them,
and converters do not write `<h1>`. They write `<p class="chaphead">CONTENTS</p>`
and put the size and the weight in a CSS file. The parser never opened that file.
So a chapter title and a sentence arrived as the same thing.

`web/src/parse/styles.ts` is new. It reads the CSS and gives each element a size,
a weight, a slant and an alignment. The size is a multiple of the size **this
book** sets its body text in. This is the rule that makes the fix general. Books
do not agree on what 1em means. No book disagrees with itself.

A line becomes a heading on two signals, not one. Some books set all their text
in bold, or centre every line. One signal would turn such a book into one long
heading.

`PARSER_VERSION` is **23**. Books on the shelf keep their old text until you
accept the re-parse the shelf offers.

The browser paints the highlights now. `CSS.highlights` holds one live range per
highlight, and `::highlight(...)` gives each colour its rule. Nothing is
measured, so the colour cannot move away from the words. A tap on a highlight is
found by `highlightAt`, because painted ink receives no clicks. Tapping a
highlight opens the menu with the colours open, a ring on the colour it has, and
a **Remove** button.

The two selection handles are independent. A drag no longer moves "the start" or
"the end": it holds the other end still and puts the two boundaries back in
order. So either handle can cross the other one, and the selection follows the
finger. The drag is kept in a ref, because React commits state too late for the
first move of a fast gesture.

The menu also offers **Select sentence** and **Select paragraph**. The sentence
boundaries come from `Intl.Segmenter`. Note that ICU breaks after an
abbreviation, so "Mr. Bennet" is two sentences to it. A button is left out when
it would change nothing.

Two features landed. The Browser pane has no book on its shelf, so neither was
proved by eye.

### 1. Judge on the phone (no code needed)

- **The chapter opening.** Open a chapter and look at its title. Four settings
  exist. A religious or spiritual book gets the ornament. Fiction gets the
  ruled nameplate. A numbered chapter gets the large figure. Everything else
  gets the plain setting.
- **The selection menu.** Select some words. Check the card lands near them, and
  flips above the selection near the foot of the screen.
- **Highlights and notes.** Both write a row into the Notes tab under *Quotes*.
  A highlight keeps its colour as a bar beside it.

### 2. Then: the tutor, and the two lookups

Six actions in the menu say "not built yet" when tapped. They need work this app
has not done:

- **Ask Claude** (four actions) needs the tutor loop — WP-17 onward.
- **Define** needs a dictionary. **Translate** needs a translator.

### Files in scope

| Path | Why |
|---|---|
| `web/src/reader/chapterHeading.ts` | Which of the four settings a chapter takes. Pure. |
| `web/src/reader/ChapterOpening.tsx` | Draws the four settings. |
| `web/src/reader/ChapterOpening.module.css` | Their type and spacing. |
| `web/src/reader/selection.ts` | A DOM selection turned into text plus an anchor. |
| `web/src/reader/SelectionMenu.tsx` | The menu itself. |
| `web/src/reader/SelectionMenu.module.css` | Its look, and where the tutor block sits. |
| `web/src/reader/NoteComposer.tsx` | The box a note is written in. |
| `web/src/pages/Reader.tsx` | Mounts all of the above; holds the actions. |
| `web/src/reader/Highlights.tsx` | The highlights, painted by the browser. |
| `web/src/storage/notes.ts` | `addNote`, `setNoteColour`, `deleteNote`. |
| `web/src/storage/db.ts` | `StoredNote`. Both new fields are unindexed. |
| `web/src/reader/NotesPanel.tsx` | Shows a highlight's colour. |
| `web/src/parse/styles.ts` | Reads the book's CSS. Gives each block its look. |
| `web/src/parse/html.ts` | Turns markup into blocks. Holds both heading rules. |
| `web/src/parse/epub.ts` | Reads `toc.ncx`/`nav.xhtml`, and finds the stylesheets. |
| `web/src/parse/assemble.ts` | Blocks into divisions. Holds the `guessed` flag. |
| `web/src/parse/version.ts` | `PARSER_VERSION`. Bump it when a book parses differently. |

### Out of scope

- The tutor loop. It is its own waypoint.
- A cloud path for notes. Notes are still device-local.
- Any other screen, and any design token.
