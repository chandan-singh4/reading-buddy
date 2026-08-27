# Active task

> **What's in here:** the one task in flight, its definition of done, and the
> exact files the build session may open. Read this first, every session.

## Task

**Nothing is mid-edit.** The chapter summary page is built, tested and shipped.
Pick the next task with `/plan-task`, or take one of the three below.

## Option A — judge the chapter summary page on the phone

The task this session earned. No code unless something is wrong.

Open a book → **Book details** → **Chapter summaries**. Everything you see is
sample content. The two models that make real summaries are not built.

### Definition of done

1. Look at the page on the phone. Say whether the paper reads as paper.
2. Answer the one open question: this page **does not** follow your theme. In
   Dark, at night, you get a bright page. Is that right or wrong?
3. Check the rail. On a phone it lies down and scrolls sideways. Check that it
   works with a thumb.
4. Write the answer to point 2 in `docs/decisions.md` either way.

### Files in scope

None, unless a fault appears. Then:

- `web/src/summary/summary.module.css` — every rule for the page.
- `web/src/pages/ChapterView.tsx`.

## Option B — the Librarian and the Scribe

The work the page was built to wait for. **Do not start it yet.** The reader
will supply both prompts. The seam is ready: `web/src/summary/dataSource.ts`
holds the interface and the labelled stubs.

1. The **Librarian** — one chapter in; a plain-language summary and its tags
   out.
2. The **Scribe** — that chapter's questions and answers in; one summary out.
3. **When they run** — at the end of a chapter, and after a conversation.
4. **Where the output is kept** — the storage writes, and the export.

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
