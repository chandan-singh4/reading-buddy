# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Task — none in flight

The Study Lamp shipped this thread (2026-08-21). "Ask Claude" in the selection
menu is one entry now. It opens a dark, full-screen tutor room. The room shows
the passage, four question chips, and a composer. The conversation is saved on
the device. A closed conversation leaves an ink line under the passage and a
small paper slip at its corner. A tap on either one reopens the same thread.

The reader's first-use feedback landed the same day (2026-08-21). Four fixes
shipped on top:

1. Each slip now sits at the end of its own passage's last inked line. Two
   threads in one paragraph wear two separate slips. Before, both slips sat on
   the same corner and only the top one took the tap.
2. Every note row has a small × to delete it. On a tutor row the × removes the
   whole thread and its page marks.
3. Tutor conversations now show in Notes → Claude. A row shows the elided
   passage and Claude's last reply. A tap reopens the thread under the lamp.
4. The Study Lamp and Notes fonts are larger. The handwriting size did not
   change — it must match the 32 px rule pitch.

The whole flow was proved in the running app with a real book. Build, typecheck
and all 1512 tests are green.

**What the phone must still judge:**

1. The dim-in of the room, the glow, and the collapse of the pinned bar. The
   Browser pane draws no animation, so all motion is unproved.
2. The look of the ink line and the slip on real paper themes.
3. The long press → ASK CLAUDE → chip → reply loop under a real thumb.
4. The new per-sentence slip positions on real text. Ask two questions in one
   paragraph and check both slips sit on their own sentence.
5. The delete × in Notes, and the larger fonts.

**The tutor speaks in a placeholder.** `askTutor` posts to `/api/tutor`, and no
relay exists yet. The reply says plainly that the tutor is offline. It never
invents an answer. The relay endpoint is the next tutor task: it holds the
system prompt and the key, server-side only.

## Next up — pick one, then run `/plan-task`

1. **Build the `/api/tutor` relay.** One endpoint in `api/` that holds the
   system prompt and calls Claude. The client is done and waiting.
2. **Judge `PARSER_VERSION` 28 on the phone.** No code. The reader accepts the
   rebuild and reads the Contents tab of *The Mountains of My Life*.
3. **Finish WP-25: something that writes a note.** The Notes tab reads a table
   that nothing fills.
4. **Drop caps**, still parked and waiting on the reader's screenshot.

## Files in scope — the Study Lamp

- `web/src/reader/tutor.ts` — the passage types, `elide`, `askTutor`, the
  canned fallback.
- `web/src/reader/StudyLamp.tsx` + `.module.css` — the room itself.
- `web/src/reader/TutorMarks.tsx` + `.module.css` — the ink line and the slip.
- `web/src/storage/tutor.ts` + `db.ts` (`version(12)`) — the saved threads.
- `web/src/pages/Reader.tsx` — `lamp` state, `openThread`, `keepThread`, the
  `ask` case, three `TutorMarks` mounts.

## Carried forward — how to work on the reading page

Fourteen lessons earlier threads paid for. Lessons 12 to 14 are new.

1. **Measure in a real browser, not by reading the file.**
2. **Layout is `offsetWidth`, paint is `getBoundingClientRect`.** The turning
   sheet is under a transform, so its rectangles are distorted.
3. **The Browser pane does not composite.** `requestAnimationFrame` never fires
   there, and timers are throttled to about 1 Hz — a 600 ms test window sees two
   ticks and looks broken. Step things synchronously, observe with `setTimeout`,
   and wait seconds, not milliseconds.
4. **Check the trigger before writing the fix.** Six rounds went into the
   selection menu because nobody asked what actually tells the app a page turned.
   The answer was *nothing*. Two of those rounds were spent explaining a dead
   probe away as a harness limitation, when it was the bug.
5. **Paint cost cannot be read on the desktop at all.** The pane does not paint.
   For anything that feels slow on the phone, build a small readout into the app
   and ask the reader for a screenshot. Remote USB profiling does not work here —
   `chrome://inspect` stayed "Offline" through every fix.
6. **A page turn has two directions and they are not mirror images.** Forwards
   the moving sheet is the page being left. Backwards it is the page being
   arrived at. Any optimisation that strips something from a sheet has to know
   which. See `data-page-leaving` in `pageTurn.ts`.
7. **Measure the worst frame, not the start of the gesture.** Build and paint
   time only the first frame. A turn that stutters "the whole way through" costs
   its money in the frames after that, and no start-of-gesture number shows it.
   Ask the reader *when* it feels slow before you choose what to measure.
8. **Do not strip two things at once.** A switch that removes the whole pen
   proves the ink is the cost, but not which half. Split the switch, then keep
   only the half you must lose. Here the grain paid the whole bill.
9. **A word fingerprint settles a "the text moved" report; the eye cannot.**
   Print every visible word as `word@x,y` for the real page and for the copy, and
   compare the two lists as strings. This found a 40 px sideways error in one
   call that four rounds of looking at screenshots had missed. Build the bench on
   a bare page with the real CSS modules. Turn off `scroll-behavior` and any
   entrance animation first — a running animation beats an inline transform, and
   a smooth scroll is read mid-flight.
10. **Never add a rectangle to `scrollLeft`.** `getBoundingClientRect` answers in
    painted pixels. `scrollLeft`, `clientWidth` and computed styles answer in
    layout pixels. The reading stage carries `scale(0.85)` while the toolbar is
    up, so the two units differ by 15%, and any sum of them is only right when
    the toolbar is down. This was the reader's bug. Divide the rectangle by the
    drawn scale first. See `edge` in `pageTurn.ts`.
11. **Test in the real app, not in a bench you built.** A bare page that renders
    the same blocks with the same CSS still missed the reader's bug three times.
    The real page has a chapter header, real furniture and real wrappers, and the
    fault lived in a wrapper. Put the book into the running app instead: fetch
    the file, make a `File`, hand it to the import input, then `import()` the
    module you want to test straight from the dev server.

12. **`strip.current` is empty when an effect with `[]` runs.** A callback ref
    fills it when the book mounts, which is later. A listener bound that way
    binds nothing, and the failure is silent — the reader loses the feature
    completely. Bind to `document` and read the ref at the event instead.
13. **Clear the screen before you probe a coordinate.** Two probes read `null`
    from a working function because a leftover selection card and the splash
    screen sat over the text. `elementFromPoint` tells you what you really hit —
    check it before you believe the result.
14. **Anything drawn over the page must be a layer.** A back swipe leaves the
    book unless `layerDepth` counts it. See `useBackDismiss`.

## Turn cost, as measured (2026-08-17, phone, one page, 103 strokes)

Keep these. They are the baseline any future change is judged against.

| | build | paint |
|---|---|---|
| clean ink | ~70 ms | 21 ms |
| hand-drawn | ~75 ms | 48 ms |
| hand-drawn, texture forced on | ~104 ms | 94 ms |

Build is the copy work in `pageTurn.ts` and is a straight multiple of `STRIPS`
(now 12). Paint is the browser drawing the ink. After the fixes, both fell; the
reader called the result "much faster" and did not ask for a re-measure.

## Worst frame during a turn (2026-08-18, phone, one page, 47 strokes)

A second baseline, and the more useful of the two. It times the longest single
frame of the whole gesture, not the start.

| bands carry | forward, worst | backward, worst |
|---|---|---|
| the whole pen | 50–67 ms | 50–**150** ms |
| no pen at all | 49–50 ms | 50–67 ms |
| shape only, no grain (shipped) | 50 ms | 50–67 ms |

About 50 ms is the floor. That is the one frame where the gesture builds the
sheet, and it is the same in both directions.

The 150 ms frame was the fault. A backward turn drags the page the reader lands
on, so its 12 bands must keep the shape of their ink. With the grain inside that
shape as well, the browser redrew about 12 × 47 textured marks every frame. A
forward turn redrew none, because a page being left may drop the whole pen.

Dropping the grain alone put the two directions level and left nothing missing
at the hand-over. See `data-page-arriving` in `pageTurn.ts` and the rule of the
same name in `HandDrawn.module.css`.
