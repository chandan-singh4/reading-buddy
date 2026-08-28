# Active task

> **What's in here:** the one task in flight, its definition of done, and the
> exact files the build session may open. Read this first, every session.

## Task

**Nothing is mid-edit.** Everything is merged, pushed and deployed. The next
step needs a phone, not an editor.

## Option A — judge the summaries on the phone

Six things shipped this session and none of them has been seen on a device.
Take the update first, then open a book with named sections inside a chapter
(Man and His Symbols has them).

Check, in this order:

1. **The two-row rail.** Open a chapter that has parts. Swipe the top strip to
   move between chapters. Swipe the lower strip to move between parts. Neither
   row may drag the other. No text may run off the right edge.
2. **One button, one job.** Under "The parts you have finished", press one
   Summarise button. Only that one may start.
3. **The model name.** A finished summary prints the model that wrote it.
4. **The bell.** It asks once for a book. "Pick chapters" opens the list.
5. **Settings → the summary model.** Choose a model. Make a summary. Check the
   name printed on it is the one you chose.
6. **The paper.** This page does not follow your theme. In Dark, at night, you
   get a bright page. Say if that is right or wrong.

### Definition of done

- Every point above is either good or reported with a screenshot.
- The answer to point 6 goes in `docs/decisions.md` either way.

### Files in scope

None, unless a fault appears. Then, and only the ones the fault names:

- `web/src/summary/summary.module.css` — every rule for the page and the rail.
- `web/src/pages/ChapterView.tsx` — the page itself.
- `web/src/summary/Paper.tsx` — the rail.
- `web/src/summary/queue.ts`, `web/src/summary/engine.ts` — what gets made.
- `web/src/summary/Bell.tsx`, `web/src/summary/bellGroups.ts`.
- `web/src/pages/Settings.tsx`, `web/src/reader/models.ts` — the model picker.

## Option B — the Obsidian export

**Do this after you have used Obsidian a little, not before.** The export should
be shaped by how you actually work in a vault, not by a guess. Everything it
needs is already stored: every claim, every concept name, every anchor.

1. Learn Obsidian by hand first. Make a few notes. See how links feel.
2. Then decide the shape: one note per chapter, one per concept, or both.
3. A concept name becomes a `[[wikilink]]`. That is the whole value.
4. Frontmatter is written by this app, never by a model — both prompts say so.

Also unbuilt, and smaller:

- **Promoting a candidate concept.** The Scribe raises candidates. Nothing
  approves one into the vocabulary yet.
- **A cap on spending.** Only the most recently opened book runs unasked, and
  finished work is skipped. There is no ceiling beyond that.

## Option C — make the update prompt hard to miss

Carried, and still true. Reading Buddy asks before it updates itself. One
session shipped four fixes that could not reach the phone.

1. Look at the update panel on a phone and decide if it is loud enough.
2. Change it only if you say it is too quiet.
3. Write the decision in `docs/decisions.md` either way.

Files: `web/src/app/updates.ts`, `web/src/app/UpdatePrompt.tsx`,
`web/vite.config.ts`.

## Out of scope for all three

- `api/tutor.ts` and every prompt. Edit a `.md` in `prompts/`, then run
  `node scripts/build-prompts.mjs`. Never edit the generated block by hand.
- Any parsing file, and `PARSER_VERSION`.
- Syncing notes to the cloud. Notes stay device-local.

---

## Done, 2026-08-27

**Summaries by part, by book, and by a model you choose.** The bell groups by
book. A titled section is summarised on its own. The rail holds two rows. Each
summary records its model, and the model is now chosen in Settings. 2,221 tests
pass, build green. Written up in `docs/decisions.md` under the five headings
from "the prompts are written into `api/tutor.ts`" to "the model that writes
summaries".

**One root cause behind every empty page.** Four screens imported the device
store instead of the store that follows the reader's choice.
`summary/repository.test.ts` now guards it by reading imports.

## Done, earlier on 2026-08-27

**The Librarian and the Scribe run.** Both prompts copied byte for byte, both
models wired to the relay, the queue and the bell built.

**The chapter summary page.** Built to the reference design, then cut back by
the reader to two sections.

## Done, 2026-08-26

**VEDA-QUOTES.** Shipped over five rounds, the last four of them fixes the
reader had to report.
