# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

Judge the Pace Horizon and the new summary behaviour on the phone.

## Steps

1. Open the app. Look at the Current Reading shelf.
2. Check the wave shows your real reading week, and the dashed line ends on a
   pin.
3. Check the finish date and the pace read correctly.
4. Open the bell. Check only *Man and His Symbols* offers "Read the summary".
5. Approve a question for another book. Check the line says "Waiting for a
   model".

## What to watch for

- A flat or empty wave when you have read this week.
- The strip wider than the card, or a clipped status badge.
- A `ready` line that opens an empty summary.
- A yes that vanishes with no waiting line.

## Files in scope

- `web/src/pages/PaceHorizon.tsx` — the drawing.
- `web/src/pages/paceHorizon.module.css` — its colours and its container query.
- `web/src/pages/Home.tsx` — `CurrentDetail` and `lastSevenDays`.
- `web/src/summary/cleanup.ts` — the one-time sweep.
- `web/src/summary/engine.ts` — approve, retry, and the launch clock.
