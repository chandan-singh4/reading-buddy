# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

Judge the new summary behaviour on the phone.

## Steps

1. Open the app. The one-time sweep runs at launch.
2. Open the bell. Check that only *Man and His Symbols* still offers "Read the
   summary".
3. Find a question for another book. Approve it.
4. Check the line changes to "Waiting for a model".
5. Leave the app open. Check the line becomes a summary, or stays and waits.

## What to watch for

- A `ready` line that opens an empty summary. The sweep missed an alert.
- Missing *Man and His Symbols* summaries. The title match failed.
- A yes that vanishes with no waiting line.

## Files in scope

- `web/src/summary/cleanup.ts` — the one-time sweep.
- `web/src/summary/engine.ts` — approve, retry, and the launch clock.
- `web/src/summary/Bell.tsx` — the waiting line.
- `web/src/summary/bellGroups.ts` — which lines group together.
