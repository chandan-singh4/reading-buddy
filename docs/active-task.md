# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

Judge the new reading voice on the phone.

## Steps

1. Open a book. Select a sentence. Tap **Speak**.
2. The first time only: wait. The model is 86 MB. Settings shows the percent.
3. Listen to three or four sentences. Watch the sentence that is marked.
4. Open **Aa → Text**. Find **Reading voice**.
5. Read the line under the picker, if there is one. Tell me what it says.
6. Choose a British voice. Listen to the preview.
7. Go back to the book. Check the new voice reads the next sentence.
8. Turn off the network. Press Speak again. It must still work.

## What to watch for

- **The most important one: does the voice stop between sentences?** Say how
  often, and say which line step 5 showed.
- A gap or a click where two sentences meet.
- A page that turns late, or in the middle of a word.
- The marked sentence and the spoken sentence out of step.
- A voice you choose that does not take effect.
- The reading going on after you leave the book.

## The open question

Without graphics acceleration the voice is about five times slower than speech.
That is measured, not guessed. A phone with WebGPU will be much faster.

If your phone stops between sentences, tell me. Two answers are open:

1. Turn on cross-origin isolation. This uses more than one processor core. It
   needs a test, because it changes every cross-origin request in the app.
2. Go back to the browser's own voice on a device with no GPU.

## Files in scope

- `web/src/narrator/kokoro.worker.ts` — the model, on its own thread.
- `web/src/narrator/NarratorEngine.ts` — the audio clock and the lookahead.
- `web/src/narrator/speech.ts` — the adapter under the reading rules.
- `web/src/narrator/voices.ts` — the roster, the groups, the two defaults.
- `web/src/reader/useReadAloud.ts` — the voice, wired to the screen.
- `web/src/reader/readAloud.ts` — the reading rules. Unchanged but for the voice type.
- `web/src/reader/TextSettings.tsx` — the picker and the download line.
- `web/vite.config.ts` — the caching that makes it work offline.
