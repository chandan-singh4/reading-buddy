# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

Judge Veda's Examination on the phone.

## Steps

1. Open a book you have read some of. Tap the screen to raise the top bar.
2. Tap the question-mark page icon in the top right corner. It is violet.
3. Wait while Veda writes the questions. She does this once for each chapter.
4. Answer one question. Pick an option, then say how sure you are.
5. Read the reveal slips and the verdict.
6. Tap "Discuss with Veda". Check the model name shows on her bubble.
7. Go back to the book. Check the lamp icon at the foot still turns Focus Mode
   on and off.

## What to watch for

- Questions that ask you to remember a word, not to use an idea.
- A wrong option that no real reader could believe.
- A question about a chapter you have not read.
- The same question twice.
- A model name that is missing or wrong on a Veda bubble.
- Difficulty shown anywhere. It must never appear.

## Files in scope

- `web/src/challenge/generate.ts` — writes a bank of questions.
- `web/src/challenge/validate.ts` — the grounding gate.
- `web/src/challenge/serve.ts` — picks the questions for one sitting.
- `web/src/challenge/prompt.ts` — the schema sent with the material.
- `web/src/pages/Challenge.tsx` — the page.
- `web/src/pages/ChallengeSitting.tsx` — one question, start to verdict.
- `web/src/pages/challenge.module.css` — its colours.
- `web/src/storage/challenge.ts` — the bank and the miss ledger.
- `web/src/reader/Chrome.tsx` — the top bar and the foot row.
- `api/tutor.ts` — the `examiner` module.
