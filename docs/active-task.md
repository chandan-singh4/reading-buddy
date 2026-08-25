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

WP-39's epub half shipped on 2026-08-25. `/plan-task` fills this in next.

**Files in scope:** none yet.

## Not proved on a device — ask about a picture

1. **The whole path, on a real plate.** Every piece has tests; the path from a
   thumb to an answer has none. Open a book with figures, tap **Ask** under one,
   and read what comes back. The answer must describe something that is in the
   picture and not in the caption. That is the only proof that matters.
2. **The relay's half is untested, and cannot be here.** There is no test
   harness for `api/` — there never has been. `pictureUrl` and the content-parts
   message are read code, not proved code.
3. **A day when no model can see.** The roster churns weekly. The lamp then
   refuses and says why. Worth seeing once: it is the guard against a confident
   answer about a plate nobody looked at.

## Left open — WP-39's other half

**PDF regions.** A PDF has no stored picture, so pdf.js must render the region
first. The row stays `[~]` for that reason.

## A lesson worth keeping

One passing example is not a rule. Test the class, not the case. Written after
"persons" was read as proof that plurals worked, and "physicians" was not.

## Note on the docs, 2026-08-25

Where a backlog status box and the code disagree, trust the code and fix the box.
