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

Nothing is mid-edit. Build green: 2034 tests across 112 files. `main` is pushed.

The AI tutor works end to end: a reader selects a passage, taps a chip, and a
live model streams a warm answer into the Study Lamp. The reader picks the
model. Notes, highlights and saved words are written and listed. Define opens a
Merriam-Webster loupe beside the word.

## Task — none in flight

WP-16 closed on 2026-08-25. Nothing is chosen for next. Run `/plan-task`.

**Files in scope:** none yet.

## Not proved on a device — the reading voice

1. **Ask for read-aloud and leave it running.** It must cross paragraphs and
   then a section boundary without being touched.
2. **Watch the mark and the page.** The blue wash must sit on the sentence being
   said, and the page must turn itself when the voice leaves it.
3. **The transport.** Pause, resume, back, next, and each speed. A resumed
   sentence starts again from its beginning — that is on purpose.
4. **The voice list.** The Aa tab's Mode pane lists the phone's voices. Choose
   one mid-sentence: the current sentence restarts in the new voice.
5. **Leave the book while it is reading.** The voice must stop.

## Not proved on a device — a PDF's figures

1. **Import a PDF with plates in it.** Every piece has tests; no test can say
   whether the bands land on the figures. Check that a picture appears where one
   belongs, that the Ask button under it answers about the picture, and that no
   Ask button appears under a strip of blank paper.
2. **A long PDF, for time.** One page is drawn for every page that holds a band.
   A book of plates draws a lot of pages, on a phone, during import.

## A lesson worth keeping

One passing example is not a rule. Test the class, not the case. Written after
"persons" was read as proof that plurals worked, and "physicians" was not.

## Note on the docs, 2026-08-25

Where a backlog status box and the code disagree, trust the code and fix the box.
