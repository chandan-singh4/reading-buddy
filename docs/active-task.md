# Active task

> **What's in here:** the one task in flight, its definition of done, and the
> exact files the build session may open. Read this first, every session.

## Task

**VEDA-QUOTES — keep a line Veda said.**

Not a backlog waypoint. The reader asked for it.

Veda sometimes says one line that is worth more than the answer around it.
Today the reader can copy the whole answer, or nothing. They want to select
words inside Veda's answer and do one of two things with them:

- **Save** — keep the words under Notes, as Veda's quote.
- **Ask** — put the words in the question box, to ask Veda about her own line.

## What the code already gives us

Read this before planning any new machinery. Four parts exist:

1. `StudyLamp` holds `setBox(text)`. Every path that writes to the question box
   goes through it. **That is the whole of Ask.**
2. `StoredNote` already has `author: 'claude'`. Nothing stores one yet. The
   `'claude'` rows in the notes list are made on the fly from tutor threads.
3. `StoredNote.colour` proves an unindexed field needs no schema version.
4. `SelectionMenu` is the book's popup. **Do not reuse it.** It carries drag
   handles, snapping and highlight colours, and it is anchored to a book
   paragraph. Veda's answer is markdown in a bubble. It needs a small popup of
   its own with two buttons.

## The one new field

`StoredNote.fromThread?: string` — the tutor thread the words were said in.

With `author: 'claude'`, its presence means "an excerpt of Veda's answer", and
not a whole conversation. It also lets a tap on the quote reopen the
conversation the line came from, which is where the reader will want to go.

Unindexed, so no Dexie version bump.

## Definition of done

1. The reader selects words inside one of Veda's answers in the lamp. A small
   card appears with **Save** and **Ask**.
2. **Save** writes a note with `author: 'claude'`, the selected words, and
   `fromThread`. It shows under Notes on a new **Veda quotes** chip, in Veda's
   violet hand, drawn as a quotation and not as a slip. Tapping it reopens the
   thread.

   **"By chapter" leaves the chip row** and becomes a switch beside it, so
   grouping applies to whichever chip is on. **Veda quotes** takes its place.
   The switch is hidden on Words: a word has no anchor.
3. **Ask** puts the words in the question box as a block quote, puts the cursor
   after them, and raises the keyboard. It does not send.
4. Selecting the reader's own question, or plain text outside a message, shows
   no card.
5. `npm run build` is green. New tests cover the popup and the saved quote.

## Files in scope

- `web/src/storage/db.ts` — the `fromThread` field and its note.
- `web/src/storage/notes.ts` — carry the field through.
- `web/src/reader/StudyLamp.tsx` — the selection watcher, the card, the two
  actions. `setBox` is already there.
- `web/src/reader/StudyLamp.module.css` — the card.
- `web/src/pages/Reader.tsx` — save the note; keep quotes out of the thread
  rows so a quote is not counted twice.
- `web/src/reader/notes.ts` — the chips, and the switch's own rule.
- `web/src/reader/NotesPanel.tsx` — the new chip, the switch, the quotation.
- `web/src/reader/NotesPanel.module.css` — its rules.
- `web/src/reader/StudyLamp.test.tsx`, `web/src/reader/NotesPanel.test.tsx`.

## Out of scope

- `api/tutor.ts` and every prompt. The model needs no instruction for this.
- `web/src/reader/SelectionMenu.tsx` and `selection.ts` — the book's gesture
  does not change.
- `web/src/reader/markdown.tsx`. No parsing change.
- Any parsing file, and `PARSER_VERSION`.
- Syncing notes to the cloud. Notes stay device-local.

---

## Done, 2026-08-26

Built and shipped. 2,088 tests pass, build green. The decisions are written up
in `docs/decisions.md` under "keeping a line Veda said".
