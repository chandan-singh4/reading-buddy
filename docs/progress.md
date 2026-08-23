> **What's in here (read at every startup).** A living snapshot of where the
> build stands — recently finished work, what's in flight, current blockers, and
> the immediate next moves. It's the "you are here" pin: read it first every
> session so you know the state without inspecting git history or the codebase.
> Kept deliberately short — only the last handful of done items survive, older
> history is dropped. Updated at the end of every session by `/wrap-session`. If
> this file and the code ever disagree, trust the code and fix this file.

---

**Current leg:** Leg 2 — Reading Room
**Near-term arc:** the *walking skeleton* — import a `.md` → render → select →
Ask → streamed answer (WP 01 → 03 → 04 → 05 → 08 → 11 → 12 → 17 → 18 → 19 → 20).
Get that loop working before building any breadth.

### In flight
- **Nothing mid-edit.** Everything below is merged and pushed; build green.
- **Stages C and D of the tutor engine are built** (2026-08-22). Search, the
  globe switch, the genre chips, and the whole digest and recap pipeline. A
  live call proved search: five sources and a claim dated April 2026. A live
  call also proved `reasoning: { effort: 'max' }`, which an earlier note in
  `docs/active-task.md` wrongly said does not exist. **Recaps are off until the
  reader switches them on**, on the "Last time on…" screen, because each one is
  a paid call that starts while the reader reads. See `docs/active-task.md` for
  the two other deviations from the plan.
- **One step needs the reader's hands** (2026-08-22). Run
  `supabase/migrations/0008_tutor_genre.sql` in the Supabase SQL editor.
- **The tutor is built and the key is live, but no answer has been seen**
  (2026-08-22). `api/tutor.ts` holds the OpenRouter key and the whole prompt
  library. `api/models.ts` fetches the free tool-capable roster.
  `web/src/reader/models.ts` decides which of those a reader may pick, and hides
  models built for one narrow job. The Study Lamp draws a picker above the input
  and a small caption above each tutor bubble naming the model that wrote it.
  **The picker and the caption have never drawn from a real answer.** Vite does
  not run `api/`, so every reply in the pane is still the honest offline line.
  To prove it: sign in on the phone, open a passage, tap "Explain simply". Two
  bubbles must arrive, each with a name above it.
- **The Study Lamp has message actions** (2026-08-22). Copy, edit and ask again
  sit under each of the reader's questions. Copy and answer again sit under each
  tutor answer. Edit and retry both drop everything after the question they act
  on, so a thread never holds two answers to one question.
- **A failure is no longer a message** (2026-08-22). The "could not be reached"
  line lives in component state. Before this it was stored as a tutor turn. It
  stacked up one bubble per attempt, it survived a reopen, and it was replayed
  to the model as words the tutor had said. It is now drawn as a plain centred
  note with no ✦ badge and no bubble, so it cannot be mistaken for an answer.
- **The tutor answered nothing at all until 2026-08-22, and the cause was
  ours.** The relay sent a four-model fallback chain. OpenRouter rejects any
  `models` array longer than three with a `400`, so every question failed, for
  every model the reader picked. The relay flattened all failures to `502`, and
  the client printed one generic line for all of them, so the bug looked like an
  outage. Fixed three ways: the chain is capped at three, the upstream status is
  carried through, and a rate-limited model now says so.
- **Free models are unreliable, and that is normal.** A probe on 2026-08-22
  found `z-ai/glm-5.2:free` and `google/gemma-4-31b-it:free` returning `429`,
  `thinkingmachines/inkling:free` returning `403`, and only
  `nvidia/nemotron-3-super-120b-a12b:free` answering. The preferred model is now
  that one. GLM was also a bad default for a second reason: it is a reasoning
  model and can return `content: null` with the working-out in `reasoning`.
- **Two things wait on OpenRouter credits** (2026-08-22). A live probe of the
  key returned `402 Insufficient credits` for the web plugin and for every paid
  slug. So Stage C's "Still true?" and "Historical context" cannot search, and
  the Claude row must stay out of the picker. Keep `TUTOR_MODEL_CLAUDE` unset
  until credits exist. Free models answer normally.
- **`openrouter/free` is not safe as a fallback** (2026-08-22). It auto-routes
  across every free model. The probe landed on a coding agent and on a safety
  classifier that answered "say the word: ok" with "User Safety: safe". Neither
  errors. The relay now falls back through four named general models.
- **The Study Lamp chips changed** (2026-08-22). They now name real prompt
  modules: Explain simply, Explain to a friend, Discuss, Define a term. The old
  `explain` and `quiz` chips matched no prompt and are gone — "quiz" is now the
  explain-back probe, which arrives on its own after an explanation. Proved in
  the Browser pane with the real book.
- **The Study Lamp motion is still unproved** (2026-08-21). The pane draws no
  animation, so the dim-in, the glow and the collapse still need the phone.
- **The touch selection is new and only half proved** (2026-08-19). On a touch
  screen the phone can no longer select anything. A long press picks the word,
  and a back swipe puts the menu away. All three were proved in the Browser
  pane with the real book. **iOS's own menu cannot be shown there**, so only the
  phone can tell you the flash is gone. Check these on the phone:
  1. Long press a word. The app's own menu must open, with no grey flash first.
  2. Drag a handle. The words must grow, with no flash.
  3. Swipe back with the menu open. The menu must close and the book must stay.
- **The page turn is measured now, and the numbers are on file.** See *The page
  turn got faster* in Recently done. If a turn ever feels slow again, do not
  guess: put the stopwatch back (it is one small module, deleted again on
  2026-08-18, recoverable from git) and read the `worst` frame first, not `build`
  and `paint` — those two time the first frame only. Remote profiling from the PC
  does **not** work — `chrome://inspect` never left "Offline".
- **A backward turn is now as fast as a forward one** (2026-08-18). The bands of
  an arriving page drop the grain of the pen and keep its shape. Worst frame fell
  from 150 ms to 50 ms. The reader signed it off on the phone. Baseline table in
  `active-task.md`.
- **`PARSER_VERSION` is 28, so the shelf offers to rebuild every book.** The
  reader should accept the rebuild and check the Contents tab. Expected:
  chapters nested under their parts, the Preface listed, the book's own printed
  contents page still in the text, and a numbered chapter opening with the large
  numeral. *The Mountains of My Life* is the book to look at first — it lost 28
  invented "Page 360" chapters.
- **The page-flip seam is closed** — see *The page turn crosses a section* in
  Recently done. Signed off by the reader on the phone, 2026-08-17.
- **Drop caps are parked, waiting on a screenshot.** The reader deferred them to
  a later thread. The recommendation on file: recognise the shape (one letter,
  offset 0, at least twice body size) and float it as print does, with the size
  clamped to the lines it spans.
- **The new Bookmarks and Notes panels have never been seen.** The Browser pane
  has no book on its shelf, so both were proved by tests, not by eye. **Worth a
  minute on the phone.** Watch the ribbon grow down when a bookmark unfurls.
- **The Notes tab reads a table that nothing writes.** It shows its empty state
  until something makes a note. That is the next task — see `active-task.md`.
- **The frozen-page report is answered but not explained.** The floor under it is
  in and proven; the *cause* is not confirmed. If a page ever freezes again, the
  question to ask first is whether one touch clears it — if it does, a teardown
  is still being missed somewhere and the backstop is catching it.
- **The finger-tracked page curl has never been under a finger.** The maths is
  covered by 24 tests and the wiring typechecks, but jsdom has no compositor and
  the preview tree has no book on its shelf, so no drag has ever been dragged.
  **This one is provable on the phone or not at all** — a synthetic pointer is
  not a thumb.
- **The 16 DOM clones a drag builds at `pointerdown` are measured and fixed.**
  They cost 24,583 ms on a 2,542-page book — the "Aw, Snap!" crash. A drag now
  costs 56–76 ms. See *A dragged page turn no longer clones the chapter*, below.
  `STRIPS` in `pageCurl.ts` is still the lever if a phone hitches, but the cost
  no longer scales with the chapter, so it should not need pulling.
- **The reading page's new furniture has never been *seen*.** The Browser pane
  would not composite frames all session, so the paper themes, the running head,
  the gutter shadow and the decks were verified numerically (computed tokens
  across all ten themes, deck widths 3px → 11px, gutter 24px) and by tests —
  not by looking. **Worth a minute on the phone.** The three numbers most likely
  to want tuning are `--page-deck` (11px), `--page-gutter` (24px) and
  `--running-head` (1.5rem), all in `styles/theme.css`.
- **`PARSER_VERSION` is 19.** Books on the shelf are behind until the idle
  trickle catches them up, which it does one book at a time on its own.
- **One chore only the reader can do: redeploy on Vercel** so the newly added
  *Production* `GOOGLE_BOOKS_KEY` takes effect, then press Refresh on one book
  before letting the 32-book backfill run. The probe reads: 401 = key present,
  503 = key missing, 404 = endpoint not deployed.
- **Steps 2 and 3 of the Google Books arc are shipped.** Only **step 4, Stats**,
  is left. Migration `0007` has been run.
- **Two older Supabase migrations still need pasting into the SQL editor** —
  `0003_finished_at.sql` and `0006_position_within.sql`. **Both have since been
  run** — confirmed by the reader on 2026-08-15. This note stood stale long
  enough to send a whole round of diagnosis at the wrong bug; the real cause of
  "reopens a few pages back" was the landing, not the save. See below.
- **Nothing is waiting on the reader. The queue is empty as of 2026-08-10** —
  the first time it has been, and worth not quietly refilling.
  - **The greyed-out offline shelf was seen and approved on the phone**, along
    with the four shelves that now hold their place when empty.
  - **The design-hook findings are triaged.** The side-stripe was softened to a
    wash on the reader's call (`--color-accent-wash`); the `LibraryCopy` "width
    animation" was closed as a false positive — that rule animates a transform.
  - **WP-55 is signed off.** The launch tempo (557 ms), the 85% page scale and
    the gestures were all carried unseen for two days and have now been used and
    called good. The 85% has budget to 90% if it is ever raised again, and the
    "I don't see the logo" report closes with it — a stale cached build, as
    suspected, which is also why the update panel got its safety net.

### Recently done

- **Study Lamp round two — the reader's first-use feedback** (2026-08-21).
  Four fixes off one report:
  - **A slip per sentence.** `TutorMarks.tsx` places each thread's slip at the
    end of its own last inked line, clamped inside the paragraph. Two threads
    in one paragraph no longer stack their slips on the same corner.
  - **Notes can be deleted.** Every row in the Notes tab carries a small ×.
    A tutor row's × deletes the whole thread and its page marks
    (`dropNoteRow` in `Reader.tsx`).
  - **Tutor threads show under Notes → Claude.** `Reader.tsx` merges threads
    into `noteRows` through `inNoteOrder`. A row shows the elided passage and
    Claude's last reply; a tap reopens the thread under the lamp, not the page.
  - **Larger fonts** in the Study Lamp and the Notes slips. The Caveat
    handwriting stayed at 22 px — its line height must equal the 32 px rule.
  - 4 new NotesPanel tests; 1512 total, all green. The slip positions and the
    delete feel still need the phone.

- **The Study Lamp — Ask Claude is a room now** (2026-08-21). This is the first
  visible piece of the tutor loop (WP-17 → 20).
  - The selection menu's four Ask rows became one bronze `✦ ASK CLAUDE` entry.
  - It opens a full-screen, always-dark room over the page: the passage in
    Cormorant Garamond, four question chips, and a composer. A long passage
    fades into shadow with `▴ TAP TO PIN`; after the first exchange the passage
    collapses to a one-line pinned bar.
  - Your words are handwriting; Claude's are a printed slip with a ✦ badge.
  - Threads live in a new `tutor` table (Dexie `version(12)`), device-local
    like notes. One thread per passage — asking again reopens it.
  - Closing the room leaves a hand-drawn ink line under the passage and a tiny
    tucked slip at its corner. `TutorMarks.tsx` paints them with the same
    column-fold measuring machinery as `HandDrawn.tsx`, now shared via exports.
  - `askTutor` posts to `/api/tutor`. No relay exists yet, so a canned reply
    says the tutor is offline. It never fakes an answer. The system prompt and
    the key belong to the relay, server-side only, never a `VITE_` variable.
  - The lamp counts as a layer: back swipe and Escape close it first.
  - Proved in the running app: the full loop, persistence across a reload, and
    the marks returning from the database. 8 new tests cover `elide`,
    `passageKindOf` and the store. Deleting a book now clears its notes and
    tutor threads too — the notes cascade was a pre-existing gap.

- **A back swipe now closes the selection menu, not the book** (2026-08-19).
  With a sentence chosen, a back swipe took the reader out to the shelf. The
  selection menu was never counted as a layer. It is now the topmost one in
  `layerDepth`, and `dismissTopLayer` lets the words go before it touches a
  panel or the toolbar. `dismissTopLayer` and `layerDepth` moved below the
  selection state, because they must read it. They reach `selected` and
  `dropSelection` through refs, so the handler keeps one identity — the hook
  counts history entries against it. Proved in the running app: a long press
  adds one history entry, and a back closes the card and stays on the book
  URL.

- **The phone's own selection panel no longer flashes** (2026-08-19). Before,
  the app let the phone make a selection and then dropped it. That took the
  phone's menu away, but the reader saw it for a moment first. Now the phone
  cannot select at all: `.page` sets `user-select: none` and
  `-webkit-touch-callout: none` under `@media (pointer: coarse)`. A new
  long press in `Reader.tsx` finds the word under the finger with `wordAt` in
  `reader/selection.ts`, and shows the app's own menu. The press must hold for
  420 ms and move less than 10 px. It also clears `touchStart`, so the page
  does not turn as well. A mouse keeps the browser's selection, because a
  desktop has no such menu.
- **Lesson: `strip.current` is empty on mount.** A callback ref fills it when
  the book mounts, long after the first render. The first try bound the long
  press in a `useEffect` with an empty dependency list. It read `null`, bound
  nothing, and left the reader with no way to select at all. The listener now
  sits on `document` and reads `strip.current` at the press. Proved in the
  running app: a long press returns the word and opens the app's own menu; a
  press that moves 60 px opens nothing. **iOS's own menu is still unproved** —
  the Browser pane cannot show it.

- **The text no longer moves when a page turn starts** (2026-08-19). The copy of
  the page zeroed the top margin of its first paragraph, because a browser
  truncates that margin at a column break. But a margin collapses *through* an
  element with nothing at its top edge. A figure inside a plain wrapper `div`
  puts its 24 px on the wrapper, so the wrapper's own margin reads 0 and setting
  it to 0 changes nothing. The copy started 24 px low. Every column below broke a
  line early, and the last line of the page before appeared along the top of the
  page. The fix zeroes the margin down the first-child chain, and stops at the
  first element with a top border or padding, because that is what blocks the
  collapse. Proof: a word fingerprint of the real app, with the reader's own
  book, over 59 pages of two chapters, with the toolbar up and down. Before the
  fix 5 pages of the Introduction re-flowed. After it, none.

- **The text no longer moves when a page turn starts, at any zoom** (2026-08-19).
  `pageCopy` measured where a paragraph sat with `getBoundingClientRect` and
  added `scrollLeft` to it. Rectangles are painted pixels. `scrollLeft` is a
  layout pixel. The stage is scaled to 0.85 while the toolbar is up, so the sum
  was 15% short: the copy was cut at the wrong paragraph and then slid sideways
  by the same error. The page showed the tail of the page before along its top.
  This is the fault the reader reported. Two smaller faults were fixed on the way
  — an inset block gave the wrong column edge, and the copy was laid out at the
  scale React believed rather than the scale the screen was drawing, which is not
  the same for the 0.24 s the stage takes to shrink. Proof: a word fingerprint of
  every page of *How to Speak Whale*, sections 4 to 6, in all four combinations
  of drawn scale and told scale. Every page matches.
- **The text no longer moves when a page turn starts** — 2026-08-18. The reader
  reported it on a backward turn: two lines of the page before appeared at the
  top. An earlier fix had cured the same fault forwards, so this looked like a
  backward-only bug. It was not.
  - **The fault is in code both directions share.** `pageCopy` returns `shift`,
    the number of pixels `place` moves the copy sideways by. It set `shift` to
    the left edge of the first child it kept, and called that the column's left
    edge. That is only true for a child that fills the column's width. A quote,
    an epigraph, a dedication, a centred heading and a figure all sit inside the
    column. For those, the copy is drawn out by the inset, which pulls the tail
    of the page before into view.
  - **Why it looked backward-only.** Forwards, the moving sheet is the page you
    leave, and your eye follows the page you go to. Backwards, the still copy of
    the page you leave is the one you are looking at. The same error, on show.
  - **The fix.** `shift` is now the smallest left edge among the kept children
    that start in the same column. A flush paragraph gives the column's true
    edge. Snapping to a computed grid was rejected: the true column width is
    fractional (392.72 px on the phone) and the error adds up over thirty
    columns.
  - **Proved by geometry.** A temporary bench at `/probe.html` built a real
    strip, and printed every visible word as `word@x,y` for the page and for the
    copy. Before: 5 of 14 pages differed, all by exactly 40 px, and all of them
    pages whose copy began at the blockquote. After: `ALL PAGES MATCH`. The bench
    was run again with `REACH` forced to 0, so every copy took the spacer path
    instead of a column boundary. That also matched, which clears the vertical
    half of the same question. The bench is deleted; lesson 9 in
    `active-task.md` says how to rebuild it.
- **The selection menu survives a page turn** — 2026-08-17, six commits
  (`ee7a4ad`, `c09363b`, `6ab61d9`, `59a2938`, `685569d`, `2f6dbc1`). **Signed
  off by the reader: "It looks finally fixed."** Six rounds, because the trigger
  was never checked before the fix was written.
  - **Nothing announces a page turn.** `pages.page` does not reliably change,
    and the strip fires no `scroll` event — its overflow is hidden. Both were
    measured dead, not assumed. The selection now watches the geometry of its own
    anchor paragraph on an 80 ms timer. A timer, not `requestAnimationFrame`: a
    frame callback stops in a page that is not being drawn.
  - **A DOM Range whose end node is removed does not throw.** It re-points to the
    end of its container, so the whole page reads as selected. The windowed strip
    removes paragraphs on every turn. The selection is rebuilt from its anchor
    and its words instead — `rangeOfSelection` in `selection.ts`, which searches
    the whole root because a grown selection belongs to no single paragraph.
  - **The card is placed by the lines that are on screen.** `selection.rect`
    unions line boxes from other columns, which are off to the left at the same
    heights, so after three flips the card landed on the chevron.
  - **The two chevrons do not hang by the same amount.** `.handleEnd` carries
    `translateY(50%)`, so it sits a whole disc below the last line. Two
    clearances, not one.
  - The card takes the side with room and scrolls inside it, capped at
    `scrollHeight` — never at its own measured height, which would let the cap
    shrink itself.
- **The page turn got faster, and the ink stopped arriving late** — 2026-08-17,
  four commits (`3806415`, `60eafa0`, `32661fe`, `2fd0d0a`). **Signed off by the
  reader on the phone.** A fully highlighted page turned slowly in the hand-drawn
  style. Remote profiling failed, so a temporary in-app stopwatch was built,
  read from phone screenshots, and then deleted.
  - **Measured, one page, 103 strokes, per turn:** clean 70 ms build / 21 ms
    paint; hand-drawn 75 / 48; hand-drawn with the texture forced on 104 / 94.
    So the wobble filter is 46 ms and the app was already right to drop it.
  - **Build, a third of it, was words nobody sees.** The page copy kept a whole
    page *after* the visible one. Columns flow forwards, so what follows the page
    decides none of its breaks. The leading page is load-bearing and stays.
  - **`STRIPS` is 12, not 16.** Every strip is a copy, so the cost is a straight
    multiple. Its own comment named it the lever for a struggling phone. Ten is
    where the bend looks like a folding screen, so twelve keeps a margin.
  - **The mask and the grain now come off a turning sheet too** — the 27 ms that
    was left after the filter. Only paint is dropped, never geometry, so no ink
    moves.
  - **Two scoping faults followed, both reported by the reader, both the same
    mistake.** The rule was written as `[data-page-frame]:has([data-page-sheet])`,
    which reached the *real* page under the sheet. Then, scoped to sheets, it
    still reached the backward arrival. **The two directions are not mirror
    images:** forwards the moving sheet is the page being left and is gone;
    backwards it is the page being arrived at, and the reader goes on looking at
    it. Every copy of a page being *left* now carries `data-page-leaving`, and
    only those give up the mask. The one unmarked copy is the backward arrival.
- **The page turn crosses a section** — 2026-08-17, five commits (`06daff5`,
  `e1336c4`, `54c215f`, `6d946ba`, `8e44036`), build green, **1459 tests across
  81 files**. **Signed off by the reader on the phone.** A section is laid out
  in columns in one strip, so `turn()` returned `null` at the end of it and the
  drag fell back to a jump. In a book of 100 sections that is about 200 dead
  pages. Both neighbour sections are now mounted offscreen, laid out but not
  painted, and the right one is revealed under the sheet. Four faults followed,
  each found by the reader and each measured before it was fixed:
  - **The neighbours drew no pictures**, so their columns broke in the wrong
    places. `shownParagraphs` now gives the picture hook all three sections.
  - **A picture blinked out on the way back.** The picture hook treated the
    whole path list as one request, so any change revoked every URL at once
    while the replacements arrived an `await` later. It holds one URL per path
    now. This was a regression from the fix above, which made the list change on
    every turn.
  - **The landing flashed.** A seam turn took `fadeIn`, which belongs to a jump,
    on top of a page that had already landed. Text at 0.6 opacity is lighter
    than the same text at 1.0, which is what looked like the type resizing.
  - **The page under the sheet was 22px wider than the page.** `.understudy`
    insets the strip, but `.page` sets `width: 100%` and is written second, so
    it won on source order. The strip hung 11px off the screen and broke its
    lines to a different measure. The rule is `.page.understudy` now.
- **The parser reads the book instead of guessing at it** — 2026-08-16, four
  commits (`f407641`, `9cb387c`, `2a3f5cb`, `7a69627`), build green, **1407
  tests across 81 files**. The reader's brief: "We have parsed at least 20
  times, I want it to be done with once and for all." Four faults, each one
  under the last.
  - **The parser never opened the book's stylesheet.** It judged structure from
    tag names only. Almost no ebook is written as HTML — converters make them,
    and a converter writes `<p class="chaphead">CONTENTS</p>` and puts the size
    and the weight in a CSS file. So a chapter title and a sentence arrived as
    the same thing. `parse/styles.ts` is new. It reads the CSS and gives each
    element a size, a weight, a slant and an alignment.
  - **The size is a multiple of the size *this book* sets its body text in.**
    This is the rule that makes the fix general. Books do not agree on what 1em
    means. No book disagrees with itself. A line needs two signals, not one,
    because some books set all their text bold or centre every line.
  - **Version 21 found the titles and did not use them.** They were labelled,
    not promoted, so the assembler built no divisions and Contents listed three
    entries for a book with thirty. `promoteStyledHeadings` makes them real, with
    levels from ranking the distinct sizes largest first.
  - **The book's own navigation is the source of truth now.** Every epub ships a
    `toc.ncx` or a `nav.xhtml` in which the author *states* the divisions, their
    nesting and the exact position of each. We read that file already and threw
    nearly all of it away — `resolvePath` split the `#fragment` off, the nesting
    was never recorded, and one flat title per document survived. That is why
    inference could never be right in principle: three short centred lines of a
    dedication are, as evidence, identical to three chapter titles.
  - **Silence is not denial.** Version 23 let the navigation speak for the whole
    book, so a file listing its front matter and then chapter 26 discarded every
    heading the styling pass had correctly found. A document the navigation never
    points into now keeps its own guesses. The fallback takes over exactly where
    the file goes quiet.
  - **A rule threw out every numbered chapter title in print.** It rejected any
    line ending in a space and a number, to keep a contents entry from reading
    as the heading it is set to look like. "Chapter 1" and "Part 1" have that
    shape. The page number must now follow a title of more than one word.
  - **The printed contents page is kept, and the Preface is back.** Version 22
    dropped the page, which was wrong twice: the reader wants it, and the rule
    could not tell where the list ended so it ate the "PREFACE" title too.
  - **A numbered section opens like a chapter in the reader.** Where a book is
    cut into parts, the part becomes the division and "Chapter 1" lands as a
    section — the words print gives a full opening to.
  - **One rule was tried and withdrawn**, and it is written down in the code so
    it is not re-invented: keep a guess that *looks like* one the navigation
    named nearby. A navigation names a dedication by pointing at its first line,
    so the lines under it look endorsed and become chapters again.
- **Bookmarks and Notes are real panels now** — 2026-08-15, build green, **1335
  tests across 77 files**. Both come from the prototype `bookmarks_notes_v2.html`.
  - `reader/BookmarksPanel.tsx` — each mark rests as a page-edge tab with a
    coloured number flag. One tap unfurls it: the flag fades, a ribbon grows
    down, and the row shows the passage, `Go to page N`, Rename and Remove.
    Only one row opens at a time. `prefers-reduced-motion` snaps instead.
  - `reader/NotesPanel.tsx` — a ruled sheet. Your notes are handwriting in
    Caveat. Claude's notes are a typeset slip taped on the page. The two can
    never be confused. Chips filter: All, Yours, Claude, By chapter. **By
    chapter groups, it does not hide.**
  - Both mount in `reader/Chrome.tsx`, in the browse page, behind the existing
    tab row. No other screen changed and no design token changed.
  - `reader/notes.ts` holds the pure decisions: book order, chip filters and
    chapter grouping. Tested on its own.
  - **Notes needed a store; there was none.** `repository.setNotes` is one free
    text field on the book. A `notes` table went in at Dexie `version(11)`,
    behind `storage/notes.ts`. It is **device-local only** — the cloud backend
    has no notes table, so `Repository` stays untouched.
  - Caveat and Kalam are self-hosted woff2 from `@fontsource`. No CDN. The OFL
    text is in `web/public/licenses/fonts.md`.
- **Contents, Bookmarks and Notes are a page now, with page numbers** —
  2026-08-15, proven by tests. The ⋮ opened a dropdown, and the dropdown opened
  a sheet two thirds of a screen tall. It opens the page directly at Contents.
  - The page fills the screen. It carries a back arrow, the book's title, and a
    tab row: Contents, Bookmarks, Notes. One tap moves between them.
  - Aa stays a sheet over the book. You judge text size against the text.
  - The dropdown is gone: `menuOpen`, `toggleMenu`, `.menu`, `.menuScrim` and
    `.menuItem` are all deleted. The reading page tracks two layers, not three.
  - **Every chapter shows the page it opens on**, under its title. The chapter
    you are in says `currently on page N` instead — your page, not its first.
  - `chapterPages(spine)` in `progress.ts` works the figure out from the first
    section of each chapter. No layout, no measuring, nothing loaded.
  - **Swipe left and right to change tab.** `stepThrough` in `swipe.ts` already
    did this job and had no caller. It stops at the ends; the row does not loop.
  - **The contents are set like a printed contents page** — the reader sent a
    mock-up and asked for it. CONTENTS letterspaced under a small ornament, a
    hairline rule, titles ranged left, page numbers ranged right, and a dot
    leader across the gap. Set in `--font-reading`, because the page belongs to
    the book. The chapter you are in is bold in the accent, with
    `✦ reading now · page N ✦` centred under it.
  - **Parts are the one thing from the mock-up that is missing.** Nothing in the
    manifest says which part a chapter belongs to, so "PART ONE" would have to
    be invented. It needs a parser change first.
  - **The page number hides while the page is open.** The status line is
    `z-index: 11`, above the overlay on purpose, so a full-screen list could not
    cover it. `<html>` now carries `data-browsing`, and `theme.css` fades the
    page furniture out while it is on.
- **The ⋮ moved to the slider, and Focus Mode took its place** — 2026-08-15,
  browser-checked at phone size. The ⋮ now sits at the left-hand end of the
  bottom row, before the slider. It still opens Contents, Bookmarks and Notes.
  The menu grows upwards out of it.
  - Focus Mode has the top-right corner the ⋮ held. It was a line inside the
    menu, which is two taps to ask for less chrome.
  - **The button is a reading lamp now** — `FocusLamp.tsx`. Off, it is line art
    in `currentColor`. On, the shade and the bulb fill amber, a cone of light
    falls on the page, and a 40 px radial halo sits behind the glyph. One
    drawing in both states, so the lamp does not move when it lights.
  - **Focus Mode does something at last.** It was a stored boolean that changed
    nothing but its own button. Now `<html>` carries `data-focus`, and
    `theme.css` gives it two effects: a 7% amber wash over the canvas, and the
    running head and status line faded out. Both take 0.4 s.
  - The wash is one layer, not ten warm themes. Ten variants would drift, and
    the four dark themes have no parchment to go to.
  - `data-focus` is removed when the reading page unmounts. A library that had
    turned sepia, with its only switch two screens away inside a book, is a
    trap. The setting itself still persists.
  - `.footRow` is a new flex row inside the bottom bar. The bar itself stays a
    column, because it once stacked a slider over a row of buttons.
- **Drag the right deck to turn the paper down** — 2026-08-15, browser-checked,
  **not yet under a thumb**. A finger dragged up on the right-hand block of
  paper brightens the page; dragged down, it darkens it — the same way round as
  the phone's own brightness control. There is no slider and
  nothing appears while you do it. The setting is saved with the theme and the
  font, and applies at boot.
  - The band that listens is 44 px along the right edge, not the 11 px the deck
    is drawn at. You cannot hit 11 px with a thumb.
  - **The direction gate is one question asked once in each direction.** Where
    the stroke started decides whether it can dim, and it is asked only at
    `pointerdown`. Whether it went vertical first decides whether it can turn a
    page, and once it has gone vertical the page turn has no way in — the
    gesture clears the touch-down point that the turn needs.
  - A veil over the page, not `filter: brightness()`. A filter makes a
    containing block, and this screen is full of `position: fixed`.
  - Black, so a theme keeps its own colour. Stops at 0.72, so the darkest page
    is still a page.
  - Checked in a browser: up brightens, down darkens, neither moves the page; a
    horizontal drag mid-page still turns; a vertical drag mid-page changes
    nothing. The value survives a reload.
- **The spacer is gone, and the copy keeps its paragraph indent** — 2026-08-15.
  The reader saw the re-wrap on the original font as well as on a new one. The
  font only moves where the paragraphs land, so the font was never the cause.
  Two causes, both now removed.
  - **The spacer is kept, and it is now measured.** Deleting it was wrong. With
    no limit on the search back, a book of long paragraphs has no column
    boundary for a very long way, so the copy started at the chapter and the
    stall came straight back — which is what the reader saw next. The search
    stops after 64 children again. Forcing the spacer path for every turn gives
    the same fingerprint as the aligned path, to the pixel. The spacer was never
    the fault.
  - **The copy's first child lost its indent.** The indent rule is
    `.prose + .prose`, and the copy's first child has no previous sibling. So
    the first line started 1.5em further left, had 1.5em more room, and could
    wrap a word early — which moves every line after it. The clone now carries
    the real computed `text-indent`.

  Checked at five scroll positions in both directions: same words, same left,
  same top. One line on a scaled forward sheet is 1 px out, which cannot change
  a wrap. The copy stays at 11 children out of 6,001.
- **The copy starts at a column boundary, and a fast flick turns the page** —
  2026-08-15. Two faults, reported together from the phone.
  - **The sheet pulled a line in from the page before.** A spacer of the right
    height is not the same start as the real text above it. `orphans` and
    `widows` count the lines on both sides of a column break, and they count a
    spacer differently. So the copy broke its columns one line out. The copy now
    prefers to begin at a child that already begins a column in the strip: no
    height to make up, and every break after it is decided from the same state.
    Where no such child is within 64 children, it still uses the spacer. It
    never copies the whole chapter for this reason, because that is the 24 s
    stall.
  - **A fast swipe did not turn the page.** Two causes. The speed average
    blended the first reading against the zero the gesture starts at, which
    reported about a third of the real speed on a flick of two or three moves;
    the first reading is now taken whole. And the browser joins the moves of a
    flick into one event, so the release could arrive with no move after the one
    that started the drag; `pointerup` now counts its own position as a move.

  Checked in a browser by geometry at seven scroll positions in both
  directions — every line of the real page and of the sheet at the same
  `left,top`. The cut stays live: 9–11 children out of 6,001, 66–150 ms. The
  flick itself is only provable under a thumb.
- **The turning sheet shows the page it left, not a page further on** —
  2026-08-15. The reader swiped and the page changed to text they had not
  reached, in both directions. The cut copy was at fault, in two ways, and both
  are the same mistake: the copy did not reproduce the original layout exactly.
  - `getBoundingClientRect` on a paragraph that breaks across a column gives the
    box around **both** pieces. Its `top` is the top of the continued piece, so
    the copy began the text a column too high. `getClientRects()[0]` is the
    piece that answers "where does this begin".
  - The spacer holds the first kept paragraph at its measured top, and that
    measurement is to the border box. The paragraph's own `margin-top` then
    applied a second time and every column break landed a few pixels early. It
    is now set to 0 in the copy.

  Proved by geometry, not by eye: every visible fragment printed as
  `text@left,top` for the real page and for the sheet, compared as strings, at
  six scroll positions in both directions. All identical. The two that produce
  no sheet are the first page turning back and the last page turning on, which
  is correct. Timing is unchanged at 54–84 ms.
- **A dragged page turn no longer clones the chapter** — 2026-08-15, measured in
  a real browser, **not yet under a thumb**. A drag built sixteen sheets, and each
  sheet was a copy of the whole laid-out section: 24,583 ms of blocked thread and
  102,300 nodes on a 2,542-page book, which on the phone is the renderer running
  out of memory. Three fixes, only one of them the one predicted:
  - **The copy is cut to the pages around the one on screen** — 7 children out of
    6,001, found by binary search over their left edges, with a spacer holding the
    first at its true height and a `shift` so the scroll still lands right.
  - **Every rectangle is read once**, before the first sheet is inserted.
  - **The copy is moved by transform, not by `scrollLeft`** — and this was 165 ms
    of the last 200. A scroll is a layout the browser cannot batch; a transform is
    not a layout at all.

  A split experiment killed the bitmap plan before it was written: `cloneNode` of
  the whole section is **7 ms**, inserting and laying it out is **1,529 ms**.
  Copying was never the cost. Now **56–76 ms**, no leaked nodes over five drags,
  `DRAG_TURNS` deleted, and the curl is simply on.
- **The page number moves through a long paragraph** — 2026-08-15. `withinHere`
  was written to the database and used to restore the place, but never reached
  the number on screen, so reading forty pages through one unbroken closing
  paragraph moved nothing. `wordsAt` now takes it as `pagesInto` and converts at
  `WORDS_PER_PAGE`. Exactly, not approximately: that constant is the definition
  of a page here, and it is the same one `pagesAt` divides by coming back out.
  The offset goes into the word *total* on purpose — every figure on that bar is
  derived from the one total, which is what stops them disagreeing.
- **A book reopens on the page it closed on** — 2026-08-15, **confirmed fixed on
  the phone.** Closed on `ch04-s01-p027`, reopened showing `ch04-s01-p023`. The
  save was never at fault — `p027` was written down correctly, `within` and all.
  The landing was. `settleOn` asks `columnOf()` which column the saved paragraph
  is in, and on open it asks too early: a book of full-page pictures lays out
  with every image at zero height, so every paragraph reports a lower column
  number than it will finally have. We scroll there, the images decode, forty
  pages of columns slide rightwards, and the reader lands paragraphs early.
  - The code already guarded against this — it re-checked on the next **two
    frames**, about 32 ms. Long enough for a font swap, nowhere near long enough
    for an image to decode.
  - The correction now **follows the layout** instead of counting frames:
    `scrollWidth` changes on every reflow, so correct each frame until it has
    held still for three. `SETTLE_MS` caps it at 3 s, and the existing `moveSeq`
    check still abandons the chase the instant the reader scrolls themselves.
  - This also explains why the anchor stopped updating in the database on open:
    nothing had scrolled, so nothing told it to.
  - **Three wrong theories preceded this one** — a stranded page-turn copy, then
    a missing migration, then the page number ignoring `within`. What ended it
    was the reader noting the anchor before closing and after opening. Ask for
    that datum first next time; it separates save from restore in one step.
- **The finger-tracked turn is switched off, and why** — 2026-08-15. The book
  did not freeze and it did not leak; the main thread was simply never free to
  answer. `beginDrag` builds the sheet out of `STRIPS` (16) copies, and a copy is
  `cloneNode(true)` of the **whole laid-out section** — not the visible page, the
  entire chapter as a multi-column strip thousands of columns wide. Every copy
  must be laid out before it can be drawn, so starting a drag costs one full
  section layout × 16, synchronously, on the first millimetre of a swipe.
  - **Measured in a real browser**, on a deliberately representative
    single-section book (6,003 nodes, 2,542 pages wide): one clone **1,923 ms**;
    one drag start **24,583 ms** of blocked main thread, 17 articles on the page,
    **102,300 DOM nodes**. JS heap grew only 0.6 MB — the cost is layout and
    render, not objects. Sixteen × 1,923 ≈ 30,763, so it is exactly linear in the
    clone count.
  - That is the crash: on a phone, on a 1,583-page book with full-page images,
    the renderer runs out of memory before it finishes and Chrome shows
    "Aw, Snap!". It is also why tapping did nothing — the taps were queued behind
    a thread that never came back.
  - **Lowering `STRIPS` divides this, it does not fix it.** `DRAG_TURNS` in
    `Reader.tsx` is `false` and the reading screen is back on the threshold
    swipe, which takes one copy and only when the turn actually happens. The
    curl geometry in `pageCurl.ts` is sound and stays, tests and all.
  - **The rebuild, when it comes:** snapshot the page **once** to a bitmap and
    give the sixteen bands that one image at sixteen `background-position`
    offsets. One decode, no layout, no DOM clones. Then flip `DRAG_TURNS`.
- **A frozen book, and the floor under it** — 2026-08-15. The reader opened a
  book onto a full-page map and the page would not turn at all — no swipe, no
  tap; then it crashed the tab. **Root cause now measured — see the entry above
  this one.** The work below is still right, but it was a floor under the
  symptom, not the cause. The preview pane delivers no frames (rAF and the Web
  Animations API both never fire in it), so every copy strands there and it
  could not tell a real leak from its own artefact.
  What is certain is the *shape* of the failure: a page-turn copy is an opaque
  photograph of the old page, so one left standing looks exactly like a book
  that has stopped responding — gestures keep working underneath and nothing the
  reader does changes what they see.
  - **Both teardowns waited on frames, and frames are not a promise.** `playFlip`
    waits on `animation.finished`; `settleDrag` waits on rAF. A tab backgrounded
    mid-turn stops being offered either. Both now carry a `setTimeout` backstop
    at duration + 600 ms, and both clears are idempotent so whichever arrives
    first wins.
  - **`clearSheets` is the floor.** Every scrap this module hangs on the page is
    branded `data-page-sheet`, and `pointerdown` sweeps them whenever nothing is
    legitimately in flight. Whatever drops the ball in future, the freeze cannot
    outlast one touch.
  - **A tap could be swallowed.** `swiped.current` was being set on eight pixels
    of horizontal movement even when no drag started, so a slightly-moving tap
    turned into nothing at all. Only a real turn sets it now.
  - Verified live: the same drag that left **17 stranded clones** in the pane now
    leaves **zero**, on the timer alone, with no frames at any point.
  - Module-level `concealed` leaks across tests — `pageTurn.test.ts` sweeps in
    `afterEach` now, or one test leaves the next unable to hide anything.
- **The page turns with the thumb now, and the paper is a notch darker** —
  2026-08-15. Two things off one brief.
  - **Paper down ~4.5%.** Every channel × 0.955, so the hue is untouched and
    only the luminance moves: `#f1e9db` → `#e6ded1`, with `--color-surface` and
    `--color-surface-raised` alongside it so the sheet does not float on
    furniture lighter than itself. Only Paper moved. The next nudge in either
    direction is this same three-line edit, which is why it was not made into a
    slider.
  - **A finger-tracked curl replaces the threshold swipe.** Pointer Events with
    `setPointerCapture`, so the release always arrives; horizontal travel maps
    **linearly** onto 0→1 with no smoothing, because a thumb held still must
    leave the page held still and any filter at all would let it creep.
  - **The browser has no mesh warp for live DOM text**, so the sheet is a
    snapshot cut into 16 vertical strips, each a flat quad with its own
    `rotateY`. Strip *i*'s left edge is placed where strip *i−1*'s right edge
    **computed out** (`xᵢ₊₁ = xᵢ + w·cos θᵢ`, `zᵢ₊₁ = zᵢ + w·sin θᵢ`) — any
    closed-form shortcut shows daylight through the paper the moment the curve
    is not uniform. A test asserts the joins at seven progress values.
  - **Rigid-plus-curl, not a scaled arc:** `θ = π·p · (0.55 + 0.45·mᵏ)` with
    `k = 1 + 1.4(1−p)`, so the sheet lifts at the corner early and evens out
    late — the shape at 20% is a different curve from the shape at 80%.
  - **The shadow is zero at flat by arithmetic, not by a guard** — it is derived
    from `(1 − cos θ)/2`, so there is nothing a later refactor can delete.
  - **Release is critically damped** (`1 − (1 + ωt)e^{−ωt}`, ω = 8, normalised
    so it lands exactly on 1). Paper settles; it does not wobble past flat.
    Velocity beats position **in both directions**: a page dragged past halfway
    and thrown back goes back.
  - **The strip scrolls to the destination at gesture *start*,** which is what
    reveals the next page from the first millimetre. That inverts the old logic:
    completing is now the case where nothing more happens, and it is the
    *abandoned* turn that has work to do.
  - **`touch-action` had to go from `pan-x` to `none`** — under `pan-x` the
    browser can claim a horizontal gesture and fire `pointercancel` a few pixels
    in. Harmless for a swipe decided at `touchend`; fatal for a dragged sheet.
    The cost is pinch-zoom, which this screen answers with the Aa tab.
  - **Section-crossing turns stay on the old path** on purpose: at a chapter
    edge the destination is not laid out, so there is nothing honest to scrub
    against. Reduced motion falls back too.
- **Older rounds — the physical page themes, the shelf that catches up, the
  offline shelf, the four phone-tested pieces, — WP-53, WP-54, WP-55, the first cloud write-up, the sign-in
  toggle and the first live setup — dropped
  from here to keep this file short.** Each has a full entry in `docs/backlog.md`
  and its reasoning in `docs/decisions.md`; the traps they cost are in
  `active-task.md` under "Carried forward".

**Gates:** `npm test` (1486, 84 files), `npm run typecheck`, `npm run build` — all
passing as of 2026-08-17. Precache 34 entries / 1461.86 KiB. **Two tests flaked
once under parallel load** (`Reader › goes to the next section`, `Library ›
unfiles a book…`) and passed on re-run and in isolation — timing, not a
regression, but they exist. **Run the suite as `npm test --workspace web`** — from the repo root it misses `web/`'s Vite config
and reports phantom import failures. Every
parser stays behind a dynamic `import()`, so pdf.js (434 kB) and mammoth
(500 kB) remain in their own chunks and are fetched only when a file of that
type is imported.

### Blockers
- **None.** Supabase's email allowance (a few sign-in messages an hour on the
  free mailer) bit once on 2026-08-09 and cleared itself; connect real SMTP
  under Authentication → Emails if it ever gets in the way again.
- The `autoUpdate` → `prompt` crossing that stranded installed clients
  is closed: the reader confirmed on 2026-08-05 that the phone is on the current
  build and that the stale client was a desktop-app session, not a deploy or
  worker problem. Don't raise it again.

### Next up
**Judge the parser on the phone.** Accept the rebuild to `PARSER_VERSION` 28 and
check the Contents tab. This needs no code. It is the only way to know if the
four parser rounds have landed.

**Then drop caps**, parked this thread and waiting on the reader's screenshot.

**Finish WP-25: something that writes a note.** The Notes tab reads a table that
nothing fills. Written out in `active-task.md`, with one question to settle
first: device-local or cloud. Device-local is the smaller step.

Then, still open:

**Google Books metadata, then the Stats tab** — the arc the reader chose on
2026-08-10, written out step by step in `active-task.md`. Import reads only
**title and author** today; everything Stats wants (page count, categories,
average rating) comes from a catalogue.
1. `finishedAt` — **done** (`4f9175c`).
2. ISBN, publisher and subtitle out of the EPUB's own OPF — **done**.
3. The Google Books lookup through `api/`, with the match guard, the shelf
   backfill and a per-book Refresh — **done** (`fbea9ad` → `a1cce60`). The key
   is server-side only; never a `VITE_` variable.
4. **Stats — the only step left.** Pages read = finished books × the print edition's page count — the
   reader's own simplification, and the reason there is no reading-events log.
   A part-read book shows an approximation: percent × page count.

**Then back to the reader's order, set 2026-08-02:** a proper reading app first,
then AI.
- **The reader's eye is no longer the blocker — signed off 2026-08-10.** The
  launch tempo, the 85% page scale, the gestures, the library's list and grid
  were all carried open for days and are now called good. Left as facts rather
  than questions: 557 ms is the measured splash, 85% clears both bars with
  budget to 90%, and **gestures are still verifiable on a phone or not at all** —
  a synthetic click is not a finger, so that stays true of any future change to
  them. One chore survives, unrelated to taste: run **Library → Update** to pull
  covers forward to `PARSER_VERSION` 9.
- **Offered, not yet answered (2026-08-14): "More by this author."** Google
  Books has **no author entity** — `volumeInfo.authors` is a plain `string[]`,
  with no bio, nationality or bibliography anywhere in the API. But a shelf of
  the author's other books is one query away on the endpoint that already
  exists (`q=inauthor:"…"`). A *biography* would need Wikidata/Wikipedia or
  Open Library — a second source, worth doing second if at all.
- **Cheap follow-ons the redesign made cheap**, if the reader wants them:
  favourites (a boolean, one filter clause, one chip) and renaming/deleting a
  folder from the filter sheet — `repository.renameFolder` and `deleteFolder`
  both exist and have no UI yet.
- **Reading comfort is done.** WP-14 closed with WP-55's bookmarks and in-book
  search; font size, line spacing, margins, sepia and the page turn were already
  in. Notes/highlights are WP-25 and need the tutor loop's selection work first.
- **WP-43 · Re-scan a folder + name what's new.**
- **WP-17 → 18 → 19 → 20 · the tutor loop** — select text → assemble a prompt →
  call Claude → stream an answer. This is the rest of the walking skeleton and
  the first time the app does anything an ordinary reader can't.
- WP-09/10 (summaries, classification) need a model call and can follow.
  WP-02 (Tauri) stays skipped.

### Known parser limits (accepted, not bugs)
- **PDF is lossy by nature** — it stores positioned glyphs, not paragraphs.
  Publisher furniture that appears on only one or two pages (e.g. Springer's
  `Vol.:(0123456789)` sidebar) survives the repeat-based filter, which needs 3+
  pages to act. Not worth over-fitting to one publisher.
- **Scanned PDFs yield nothing.** No text layer, and OCR is out of scope — this
  surfaces as an empty book, so WP-11 should catch and explain it.
- **`.azw3` / `.kfx` declined** — DRM; see the note in `backlog.md`.

### Open items
- **Migration `0008`, agreed and deferred:** drop `subject`, `type`,
  `type_overridden`, `title_overridden`; remove `repository.renameBook` (no UI)
  and the `healTitles` override skip. Note `subject` (the app's own tag, being
  dropped) is **not** `subjects` (Google's BISAC headings, now displayed).
- **The live Anthropic key still sits in `Claude API/API.txt`**, on the
  reader's own machine, gitignored and never committed. `.env.example` is
  ready at the repo root; the key itself still needs a manual copy into a
  local `.env` for dev, and into Vercel's Environment Variables for
  production. **More urgent now than "someday"** — the app has a real public
  URL as of 2026-08-03, not just a home LAN.
- **A garbled-diacritics report is open, waiting on the reader.** A book's
  title-page text was missing accented letters and a word-space; traced to
  the source epub's own SVG `<title>` markup (nothing in `web/src/parse/`
  strips non-ASCII), but unconfirmed without seeing the actual file or its
  title-page markup.
- **Pictures need a re-import to appear.** Fixed 2026-08-02 for new imports;
  books already on the shelf have no bytes stored, so the shelf's "Update"
  (kept source file, `PARSER_VERSION` 3) is what fills them in. Storage grows by
  roughly the images again — the Jung epub's 141 plates are most of its 15 MB.
