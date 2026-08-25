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

## Task — WP-39, ask about a picture (the epub half)

Tap a figure on the page, and ask the tutor about it. The picture goes with the
question, not only its caption.

Half of this row shipped on 2026-08-02: epub and docx images are pulled out at
import into the `assets` table, and `blocks.tsx` already draws them. What is
missing is the tutor half.

**PDF regions are out of this task.** A PDF has no stored image to send — pdf.js
must render the region first. That is a different piece of work, and it must not
delay the half that is wiring.

## Definition of done

1. Tapping a figure in the reading page opens the Study Lamp with that figure as
   its subject, exactly as tapping a paragraph does. The chips offer the figure
   modules.
2. The relay sends the picture *and* the text around it. Proved by a test on the
   request the client builds, and by one real answer that describes something
   only visible in the plate — not in its caption.
3. A model that cannot read a picture never receives one. The reader is told
   which models can, before they ask, and the fallback chain skips the rest.

## The three problems, in the order they bite

**1. A tap on a picture is not a text selection.** Every route into the lamp
today starts with selected words — `Reader.tsx` builds a `ReaderSelection` from
a DOM range. A figure has no words to select. So the figure needs its own tap
target and its own path into the same lamp.

**2. A message is a string.** `Turn.content` in `api/tutor.ts` is `string`, all
the way through. A picture needs OpenRouter's content-parts form: an array of
`{type:'text'}` and `{type:'image_url'}`. That type has to widen, and the digest
jobs must be unaffected.

**3. The roster does not know which models can see.** `api/models.ts` filters
models by *shape* — "text in, text out" — and its `NOT_A_TUTOR` regex throws out
image *generation* models. Nothing anywhere records whether a model accepts an
image as input. So the reader's chosen model, and every rung under it, may be
blind, and a picture sent to a blind model is dropped in silence: the answer
comes back describing the caption and sounding confident. **This is the part to
settle before building.**

Also true and smaller: a full-resolution plate is megabytes as base64. The
picture must be scaled down and re-encoded before it is sent.

## Files in scope

Read only these. Add a path here with a one-line reason if the work needs more.

- `web/src/reader/blocks.tsx` — draws the figure. The tap target goes here.
- `web/src/reader/figures.ts` — already turns a stored blob into a `blob:` URL
  for the page; the bytes for one figure come from here.
- `web/src/reader/figurePicture.ts` **(new)** + its test — scale a blob down and
  encode it for sending. Its own module because the size rule needs tests.
- `web/src/reader/tutor.ts` — `AskTutorRequest` gains the picture.
- `web/src/reader/context.ts` — the text around a figure, for the frame.
- `web/src/reader/StudyLamp.tsx` — show the picture at the head of the thread.
- `web/src/pages/Reader.tsx` — wire the tap to the lamp.
- `api/tutor.ts` — widen `Turn.content`; pass the picture through.
- `api/models.ts` — record which models accept an image.
- The test file beside each of the above.

## Out of scope

- **pdf.js region rendering.** The PDF half of the row stays open.
- **The parser and the import path.** The bytes are already stored. Nothing in
  `web/src/parse/` or `web/src/import/` is touched.
- **Tables and formulas.** WP-38 keeps each as one block, and a table is text
  the tutor can already read. Pictures only.
- **Storing the picture in the thread.** A saved thread keeps its text, as now.
  The figure is found again from its anchor.

## One decision before building

Problem 3 has two answers, and they cost differently.

- **Ask the roster.** OpenRouter publishes each model's input modalities. Read
  it, mark the models that see, and let the picker show it. Correct, and it
  touches the roster's shape and the picker.
- **Name a short list.** Hard-code a few known models for pictures. Cheap, and
  wrong the week the free roster churns — which it does weekly, by the note in
  `api/tutor.ts`.

I recommend the first. The second builds a thing we know is going stale.
