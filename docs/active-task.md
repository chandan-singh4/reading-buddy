# Active task

> **What's in here:** the one task in flight, its definition of done, and the
> exact files the build session may open. Read this first, every session.

## Task

**Nothing is mid-edit.** Veda's Quotes is built, shipped and confirmed on the
phone. Pick the next task with `/plan-task`, or take one of the two below.

## Option A — make the update prompt hard to miss

The smaller task, and the one this session earned.

Reading Buddy is a PWA with `registerType: 'prompt'` in `web/vite.config.ts`. A
new build waits for the reader to accept it. This session shipped four fixes
that could not reach the phone, and the reader reported the same fault four
times. The choice to ask first is right; how loudly it asks may not be.

### Definition of done

1. Look at the update panel on a phone screen and decide, with the reader,
   whether it is loud enough.
2. Change it only if the reader says it is too quiet. A change with no
   complaint behind it is not worth the risk.
3. Write the decision in `docs/decisions.md` either way.

### Files in scope

- `web/src/app/updates.ts` — the registration and the check timer.
- `web/vite.config.ts` — the `registerType` note, if the mode itself changes.
- Whatever draws the panel — find it from `onNeedRefresh` in `updates.ts`.

## Option B — prove the reading voice on the phone

Carried from the last session, and still true. WP-16 is built and tested, but
three of its faults were only visible on a device. The voice choice is the one
that still needs proof: the fix assumes the engine ignores a voice when no
language is set.

No files. This is a device check, not an edit.

## Out of scope for both

- `api/tutor.ts` and every prompt.
- Any parsing file, and `PARSER_VERSION`.
- Syncing notes to the cloud. Notes stay device-local.

---

## Done, 2026-08-26

**VEDA-QUOTES.** Shipped over five rounds, the last four of them fixes the
reader had to report. 2,130 tests pass, build green. Written up in
`docs/decisions.md` under the five headings from "keeping a line Veda said"
to "a mended line must close the marks it opens".
