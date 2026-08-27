# Active task

> **What's in here:** the one task in flight, its definition of done, and the
> exact files the build session may open. Read this first, every session.

## Task

**Nothing is mid-edit.** The two summary views are built, tested and shipped.
Pick the next task with `/plan-task`, or take one of the three below.

## Option A — judge the two summary views on the phone

The task this session earned. No code unless something is wrong.

Open a book → **Book details** → **What we worked through** → both links.
Everything you see is sample content. The engine that makes real notes is not
built.

### Definition of done

1. Look at both pages on the phone. Say whether the paper reads as paper.
   Note that the Commonplace Book opened from a book shows **that book only**.
2. Answer the one open question: these pages **do not** follow your theme. In
   Dark, at night, you get a bright page. Is that right or wrong?
3. Check the rail. On a phone it lies down and scrolls sideways. Check that it
   works with a thumb.
4. Write the answer to point 2 in `docs/decisions.md` either way.

### Files in scope

None, unless a fault appears. Then:

- `web/src/summary/summary.module.css` — every rule for both pages.
- `web/src/pages/Commonplace.tsx`, `web/src/pages/ChapterView.tsx`.

## Option B — the Scribe/Librarian engine

The work the views were built to wait for. It is a large task and needs
`/plan-task` of its own. The seam is ready:
`web/src/summary/dataSource.ts` holds the interface and the labelled stubs.

Build it in this order, because each part needs the one before it:

1. The **chapter pass** — one chapter in; a plain-language recap and a list of
   concepts out.
2. The **concept-list store** — the running controlled vocabulary. It grows
   across chapters and goes into every later call.
3. The **Q&A pass** — that chapter's Q&A into items, each tagged against the
   current list. An off-list name becomes a `candidate`.
4. **Model routing**, the chapter-end trigger, the storage writes, the export.
5. The **approval flow** — promote a candidate, or merge it.

One decision to settle before any of it: which model, and through OpenRouter or
through the `api/` endpoint that already holds the Claude key.

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

**The two summary views.** The Commonplace Book and the Chapter View, built to
the two reference designs. The Commonplace Book was then given two scopes, set
by the door the reader comes through. 2,174 tests pass, build green. The engine is stubbed
and not started. Written up in `docs/decisions.md` under "the two summary
views", in ten headings from the fonts to the stubs.

## Done, 2026-08-26

**VEDA-QUOTES.** Shipped over five rounds, the last four of them fixes the
reader had to report. 2,130 tests pass, build green. Written up in
`docs/decisions.md` under the five headings from "keeping a line Veda said"
to "a mended line must close the marks it opens".
