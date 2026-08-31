# Active task

> **What's in here:** the one task in flight, what "done" means, and the exact
> files to open. Read this first. Do not read the codebase around it.

## Task: judge the Obsidian export in a real vault

The export is built, tested and shipped (2026-08-30). It has never met Obsidian.
This task needs a device and, at first, no code.

### The checks, in order

1. Open **Settings - Take your notes to Obsidian**. Press **Export everything**.
2. Unzip the file. It must hold exactly one folder: `Reading Buddy`.
3. Drag that folder to the **top level** of the vault. Nothing else.
4. Open `Reading Buddy/Reading Buddy.md`. Each book link must resolve.
5. Open a book note, then a chapter note from it. Check the recap, the section
   recaps, your highlights and the conversation with Veda.
6. Tap a `[[concept]]` link. The concept note must list each chapter that raised
   the idea. Open the graph view and look at the shape.
7. Read more of a book. Let a new chapter summary write itself.
8. Export **what's new**. The number on the button must be small.
9. Drop the folder in again. The vault must gain the new chapter. It must **not**
   gain a second copy of an old one.

### Done when

The reader says the notes are worth keeping, and step 9 leaves no duplicates.

### What to watch for

- **A link that does not resolve.** Links are written from the vault root. They
  break if the folder is not at the top of the vault. That is the known cost of
  telling two chapters called "Introduction" apart.
- **A chapter note that reads as a wall.** A long conversation with Veda is
  printed in full. If it drowns the recap, the answer is a fold, not a cut.
- **Notes the reader edits by hand.** A later export replaces the note at the
  same path, so their own words in a Reading Buddy note would be lost. Nothing
  guards this yet. If they want to write in these notes, the answer is a section
  the export never touches, or a separate file beside it.

### Files in scope

- `web/src/export/vault.ts` - the whole builder. Pure, and the only file that
  decides what a note says.
- `web/src/export/seen.ts` - the fingerprints that make "what's new" work.
- `web/src/export/zip.ts` / `gather.ts` / `ExportVault.tsx` / `export.module.css`
- `web/src/export/vault.test.ts` / `zip.test.ts`
- `docs/decisions.md` - the two export sections at the foot.

## Also waiting on a device (no code)

- **The check-in and a corrected sitting.** Stay on one page for ten minutes.
  The bar asks. Answer "I stepped away" and check the day log drops the time.
- **Veda's measured minutes.** Open the lamp, talk, close it, and check the day
  log prints the real number with no `~` in front of it.
- **The four heat shades**, and a sitting named for the screen it was spent on
  (`Book details`, `Notes`, `With Veda`).
- **The reading desk**, in both states: an unfinished book and a finished one.

## One deletion, still pending

Delete `web/src/stats/repair.ts` and its call in `stats/load.ts`, **once the
reader has opened Statistics on the phone.** It repairs old session rows one
time and must not become permanent.
