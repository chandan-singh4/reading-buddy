# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Task — WP-17 · Selection menu, round 2 — DONE (2026-08-17)

Built and shipped. Build green, 1481 tests pass. New files: `highlightStyle.ts`,
`units.ts` (+ tests), `HandDrawn.tsx` (+ css). The style setting lives per book in
`localStorage`, under the Themes tab of the Aa sheet.

Two notes for the next session:

1. The hand-drawn layer sits **over** the text with `mix-blend-mode: multiply`,
   not behind it. `pointer-events: none` gives the brief what it asked for.
2. `flatIndexOf` in `selection.ts` returns index 0 for a boundary past the end of
   a text node. `units.ts` works around it in `indexIn`. Fix at the source later.


Three changes, from the reader's brief and `design-inspiration/reading_experience_v2.html`
(Section 1 = the panel, Section 2 option A = the chevrons, Section 3 = the two
highlight styles).

**1. The colours row.** Drop the "Highlight" label and the eraser swatch. Show
four swatches only. Tap a colour to highlight. Tap the same colour again to take
the highlight off. Tap a different colour to change it. The active colour wears a
ring.

**2. Sentence and Paragraph, with chevron handles.** Tap Sentence or Paragraph and
the selection snaps to the whole unit. Two chevrons then hold the ends: `‹` at the
start, `›` at the end. Each tap adds one more unit in that direction. Tapping the
other unit button re-snaps to that unit.

**3. Two highlight styles over one data model.** A highlight is stored as data
only. A renderer paints it in the current style: *Clean* (flat, rounded,
`mix-blend-mode: multiply`) or *Hand-drawn* (the marker look). A setting picks
the style. Switching is instant and destroys nothing.

### Definition of done

1. The four swatches toggle, recolour and remove, and the ring follows the
   highlight the menu is sitting on.
2. Sentence and Paragraph snap the selection, and the two chevrons grow it one
   unit at a time in each direction. A chevron disappears at the first or last
   unit of the document.
3. Both highlight styles paint the same stored rows, and the setting switches
   between them without a re-render of the book or any write to a note.
4. `npm run build` is green and `npm test --workspace web` passes.
5. Keyboard and ARIA on the menu, the chevrons and the swatches. Light and dark.
   Down to 360px. `prefers-reduced-motion` respected.

### Files in scope

Read and edit:

- `web/src/reader/SelectionMenu.tsx` — the panel. The quick row, the colours row,
  the two handles.
- `web/src/reader/SelectionMenu.module.css` — its styles, and the chevron handles.
- `web/src/reader/selection.ts` — `HIGHLIGHT_COLOURS`, `selectAround`,
  `selectionBetween`, `describe`. The unit walk goes here.
- `web/src/reader/selection.test.ts`
- `web/src/reader/Highlights.tsx` — today's painter, the CSS Custom Highlight API.
  Becomes the *Clean* renderer, or its caller.
- `web/src/reader/highlights.test.tsx`
- `web/src/pages/Reader.tsx` — `onSelectionAction`, `touched`, `canSelect`,
  `stretchSelection`, and the `<Highlights>` / `<SelectionMenu>` mount near
  line 3247.
- `web/src/reader/readerSettings.ts` — where a global reading setting lives.
- `web/src/reader/TextSettings.tsx` + `.module.css` — the Aa sheet, if the
  setting goes there.
- `web/src/storage/notes.ts` and `web/src/storage/db.ts` — `StoredNote.colour`.
- `web/src/styles/theme.css` — colour tokens only.

New files expected:

- `web/src/reader/highlightStyle.ts` — the colour keys, the renderer interface,
  the seed.
- `web/src/reader/HandDrawn.tsx` (+ css) — the hand-drawn renderer.
- `web/src/reader/units.ts` — sentence and paragraph boundaries, pure and tested.

Read for reference, do not edit:

- `design-inspiration/reading_experience_v2.html`

### Out of scope

The parser, the page turn, storage sync, the tutor, every other screen.

### Three things the code already decides, and one it does not

1. **A highlight is a note that keeps its colour** (`decisions.md`, 2026-08-16).
   There is no highlights table. `StoredNote` carries `quote` and `colour`.
2. **The colour is stored as a CSS value, not as a key.** `HIGHLIGHT_COLOURS`
   holds `{id, label, value}` and only `value` reaches the row. The brief asks
   for a `colorKey`. Rows already written hold hex, so the read path must map a
   known hex back to its key and keep an unknown one as a literal colour.
3. **Highlights are painted by the browser, not by us** (`Highlights.tsx`). The
   CSS Custom Highlight API puts the colour under the words as ink, so it moves
   with the text for free. The first version drew boxes in screen coordinates and
   they chased the words visibly.
4. **The open question: hand-drawn cannot use that API.** `::highlight()` takes a
   background colour and almost nothing else — no filter, no mask, no blend mode.
   The marker look needs real boxes over real line rectangles, which is exactly
   the model that was removed. See the note in the plan.

### Carried forward — how to work on the reading page

Three lessons an earlier thread paid for.

1. **Measure in a real browser, not by reading the file.**
2. **Layout is `offsetWidth`, paint is `getBoundingClientRect`.** The turning
   sheet is under a transform, so its rectangles are distorted.
3. **The Browser pane does not composite.** `requestAnimationFrame` never fires
   there. Step things synchronously and observe with `setTimeout`.

### Parked

- **Judge `PARSER_VERSION` 28 on the phone.** No code. The reader accepts the
  rebuild and reads the Contents tab of *The Mountains of My Life* and *The Gay
  Science*.
- **Drop caps.** Waiting on the reader's screenshot. Note
  `.opening + p::first-letter` in `Reader.module.css` already floats one.
