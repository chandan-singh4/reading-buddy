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

## Task — none in flight

Two search fixes shipped and proved on the phone on 2026-08-25. `/plan-task`
fills this in next.

**Files in scope:** none yet.

## Proposed next — undecided

WP-09, WP-10, WP-18, WP-21 and WP-28 all closed on 2026-08-25, so the old
proposal is gone. Read `docs/backlog.md` for what is open.

## Closed — a tapped plural is defined again

The reader reported "physicians": no matches, while "physician" worked. The
fault was ours, not MW's. `entriesFor` kept only entries whose headword equalled
the tapped word, so MW's correct answer for the plural was discarded. It now
falls back to MW's `meta.stems`. Exact headwords still win first, so nothing
that worked before changed.

**A lesson worth keeping.** This was called "nothing to build" a day earlier on
the strength of one word — `persons` — which happened to match exactly. One
passing example is not a rule. Test the class, not the case.

## Note on the docs, 2026-08-25

`docs/backlog.md` statuses were corrected against the code. Where a status box
and the code disagree, trust the code and fix the box.
