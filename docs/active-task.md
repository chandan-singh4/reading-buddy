# Active task

> **What's in here:** the one task in flight, what "done" means, and the exact
> files to open. Read this first. Do not read the codebase around it.

## Task: judge the 2026-08-28 work on the phone

Nothing from that session has been seen on a device. Everything is built,
tested, merged and deployed. This task needs no code unless a check fails.

### Checks, in order

1. **A book you are still reading.** Open Book Details. The cover is the first
   thing your eye lands on, not the title. The two actions are **Continue
   reading** and the violet **Coming back to it**. Veda's study block is there.
2. **A book you finished** (100 percent). The two actions become **Start again**
   and the violet **Read chapter summaries**. The study block is gone.
3. **Narrow screens.** Nothing overflows sideways at about 360 px. A long title
   drops to the smaller size and still fits.
4. **The description clamp.** Four lines, then "More". It must clamp on lines,
   not cut a line in half.
5. **A chapter summary, redone.** Press Redo on one half only. That half shows
   the three dots. The other half stays on screen and stays readable.
6. **A failure message.** If a call fails, the page must name the reason: the
   model is busy, the request is too large, or the relay was too slow. It must
   not say "the model did not answer" for all three.
7. **The chapter rail.** The chapter you are on sits in the middle of the row,
   and both rows behave the same. It only moves when you move it.
8. **The one-time re-run.** Every chapter that already had a summary will look
   stale once and write itself again. This is expected. It must settle after
   one pass.

### Done when

Each check above is a yes, or it is written down as a fault with what you saw.

### Files in scope

Open these only if a check fails.

- `web/src/pages/BookInfo.tsx` and `BookInfo.module.css` — checks 1 to 4.
- `web/src/pages/ChapterView.tsx` — checks 5 and 6.
- `web/src/summary/parse.ts` — check 6 (a recap the model did not close).
- `web/src/summary/engine.ts` — checks 6 and 8 (streaming, and the staleness
  count).
- `web/src/summary/Paper.tsx` — check 7 (the rail).
- `api/tutor.ts` — only if the relay itself is at fault.
