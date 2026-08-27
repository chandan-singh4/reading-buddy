# Active task

> **What's in here:** the one task in flight, its definition of done, and the
> exact files the build session may open. Read this first, every session.

## Task

**Nothing is mid-edit.** The chapter summary page is built, tested and shipped.
Pick the next task with `/plan-task`, or take one of the three below.

## Option A — watch the two models run for real

The task this session earned. No code unless something is wrong.

Neither model has ever answered. Everything around them is tested; they are
not. Finish a chapter, then open Home and wait for the bell.

Watch for two things especially:

- A reply in the wrong shape. `summary/parse.ts` is written to survive one, but
  it has never met a real answer.
- A summary that reads badly. That is a prompt question, and the prompts are
  yours — I may not edit them.

### Definition of done

1. See a real summary appear in the bell, and read it on the chapter page.
2. Look at the page on the phone. Say whether the paper reads as paper.
2. Answer the one open question: this page **does not** follow your theme. In
   Dark, at night, you get a bright page. Is that right or wrong?
3. Check the rail. On a phone it lies down and scrolls sideways. Check that it
   works with a thumb.
4. Write the answer to point 2 in `docs/decisions.md` either way.

### Files in scope

None, unless a fault appears. Then:

- `web/src/summary/summary.module.css` — every rule for the page.
- `web/src/pages/ChapterView.tsx`.
- `web/src/summary/Bell.tsx`, `web/src/summary/bell.module.css`.

## Option B — the Obsidian export

**Do this after you have used Obsidian a little, not before.** The export should
be shaped by how you actually work in a vault, not by a guess. Everything it
needs is already stored from today: every claim, every concept name, every
anchor.

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

- `api/tutor.ts` and every prompt.
- Any parsing file, and `PARSER_VERSION`.
- Syncing notes to the cloud. Notes stay device-local.

---

## Done, 2026-08-27

**The Librarian and the Scribe run.** Both prompts copied byte for byte, both
models wired to the relay, the queue and the bell built. 2,185 tests pass, build
green. Written up in `docs/decisions.md` under "the Librarian and the Scribe
run". The Obsidian export is deliberately not built.

## Done, earlier on 2026-08-27

**The chapter summary page.** Built to the reference design, then cut back by
the reader to two sections: the Librarian's summary of the chapter with its
tags, and the Scribe's summary of the conversation. The Commonplace Book was
built and then deleted — it is in git. 2,156 tests pass, build green. Both
models are stubbed and not started. Written up in `docs/decisions.md` under
"the chapter summary page".

## Done, 2026-08-26

**VEDA-QUOTES.** Shipped over five rounds, the last four of them fixes the
reader had to report. 2,130 tests pass, build green. Written up in
`docs/decisions.md` under the five headings from "keeping a line Veda said"
to "a mended line must close the marks it opens".
