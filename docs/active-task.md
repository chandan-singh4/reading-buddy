# Active task

> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

**Rewrite this file. Do not add to it.** One task lives here at a time.

**Where the overflow goes.** If a task needs more background than fits here,
put it in `docs/progress.md` and link to it — do not grow this file. When a task
is finished, delete it from *both* files. `progress.md` keeps only the five most
recent done items and drops the rest. Nothing is archived to a third file: git
holds every earlier version, and `git log -p` brings any of it back.

This file grew to 36 KB by 2026-08-25 because sessions appended instead of
rewriting, and a finished WP-25 sat at the top and was proposed three times.

## State — 2026-08-25

Nothing is mid-edit. Build green: 1909 tests across 105 files. `main` is pushed.

The AI tutor works end to end: a reader selects a passage, taps a chip, and a
live model streams a warm answer into the Study Lamp. The reader picks the
model. Notes, highlights and saved words are written and listed. Define opens a
Merriam-Webster loupe beside the word.

## Task — none chosen yet

`/plan-task` fills this in. See "Proposed next" below.

**Files in scope:** none yet.

## Proposed next — WP-09, the import manifest and crossrefs

Four rows wait on this one and cannot start without it: WP-10 (import
classification), WP-18 (the retrieval assembler), WP-21 (tutor persona), WP-28
(the books-stay-separate guard). It is the last foundation the tutor is missing.

**Not yet agreed with the reader.** Confirm before planning.

Other rows that are open and unblocked, if the reader prefers a smaller step:

- **WP-16 Read-aloud** — phone TTS through the Web Speech API.
- **WP-43 Re-scan a folder** — "Check folder for new books", name what arrived.
- **WP-27 Cost / usage visibility** — now unblocked, because WP-19 is done.
- **The cloud path for notes** — `notes`, `tutor` and `digests` are all
  device-local, and all three carry the same note explaining why.

## Note on the docs, 2026-08-25

`docs/backlog.md` statuses were corrected against the code. Where a status box
and the code disagree, trust the code and fix the box.
