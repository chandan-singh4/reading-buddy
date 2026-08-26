# Active task

> **What's in here:** the one task in flight, its definition of done, and the
> exact files the build session may open. Read this first, every session.

## Task

**VEDA-INK — Veda's notes in a handwriting face (Kalam, violet ink).**

This is not a backlog waypoint. It is a styling change the reader asked for.
The source is `design-inspiration/veda-handwriting-build-prompt.md`. The visual
truth is `design-inspiration/veda-handwriting-fonts.html`.

Veda's notes render in the app's typeset face. They must read as a tutor's hand
in the reader's notebook. The reader's own Quotes stay in blue Caveat. Veda must
look like a different hand: a different face **and** a different ink.

## Definition of done

1. A Veda note in the Notes tab shows Kalam in violet ink. A heading, `**bold**`,
   `*italic*`, a bullet list, and a block quote all use the hand. Bold uses true
   Kalam 700, not a faux weight.
2. Inline code and fenced code stay in the monospace face, in a soft tinted box.
3. A Quote note and a Veda note in the same list read as two different hands.
   The Quotes rules do not change.
4. `npm run build` is green and the Notes tests still pass.

## How to do it (the shape, not the code)

The markdown renderer already reads every colour from a `--md-*` token, with a
fallback. `NotesPanel.module.css` already names five of those tokens for the
Notes tab. So the change is a token override plus a `font-family` on the note
slip. **Do not edit `markdown.tsx`.**

- Put the new tokens and the face on `.txt` (or `.slip`) in
  `NotesPanel.module.css`. That class *is* the `veda-note` gate the build prompt
  asks for. The Ask-Veda chat overlay in `StudyLamp` uses the same renderer with
  its own tokens, so it stays typeset. This answers the prompt's open question.
- Kalam is self-hosted with `@fontsource`, not Google Fonts. The app must work
  offline, so **do not add a `fonts.googleapis.com` link.** `fonts.css` declares
  Kalam 400 and 700. If the prompt's weight 300 is wanted, add a third
  `@font-face` that points at the `@fontsource/kalam` 300 file. Check that file
  exists first. If it does not, use 400 and say so.
- The reference file gives the sizes: body about 21px on a 38px line, `h3` about
  26px at weight 700. The Notes slip is narrow. Scale the sizes down if 21px
  breaks the slip, and report what you chose.

## Files in scope

- `web/src/reader/NotesPanel.module.css` — the tokens, the face, the ink.
- `web/src/styles/fonts.css` — a Kalam 300 `@font-face`, only if needed.
- `web/src/reader/markdown.module.css` — only if a rule cannot be reached by a
  token. Prefer a new token over a rule change here.
- `web/src/reader/NotesPanel.test.tsx` — a test that a Veda note carries the
  Veda class and a Quote does not.
- `design-inspiration/veda-handwriting-fonts.html` — read only. The visual truth.

## Out of scope

- `web/src/reader/markdown.tsx`. No parsing change. No sanitizing change.
- The Quotes note rules: `.hand`, `.tag`, `.tagRow`, and the Caveat face.
- `web/src/reader/StudyLamp.module.css` and the Ask-Veda chat overlay.
- Any PDF or EPUB parsing file.
- `PARSER_VERSION`. This change does not touch a parsed book.
