# Active task

> What is in here: the one task in flight, and the exact files to open for it.
> Read it at startup, before anything else.

## Task — none in flight

The last three threads closed on the phone. The reader signed off all of them:

- **The selection menu survives a page turn** (2026-08-17). Six rounds. See
  `progress.md`.
- **The page turn is faster, and the ink no longer arrives late** (2026-08-17).
  Measured on the phone with a temporary in-app stopwatch, now deleted.
- **A backward turn is now as fast as a forward turn** (2026-08-18). The reader
  signed off on the phone: "the slowness is gone". See below.

Newest, and waiting for the reader to judge it on the phone:

- **The text no longer moves when a page turn starts** (2026-08-18). The copy of
  the page was drawn sideways by the inset of a quote. Proved by geometry, not by
  eye. See lesson 9 and `progress.md`.

Nothing is mid-edit. Build green, 1486 tests across 84 files.

## Next up — pick one, then run `/plan-task`

1. **Judge `PARSER_VERSION` 28 on the phone.** No code. The reader accepts the
   rebuild and reads the Contents tab of *The Mountains of My Life* and *The Gay
   Science*. This is the cheapest open item and it has waited two threads.
2. **Finish WP-25: something that writes a note.** The Notes tab reads a table
   that nothing fills. One question to settle first: device-local or cloud.
   Device-local is the smaller step.
3. **WP-17's tail: Define and Ask.** The menu, the colours, the chevrons and the
   two highlight styles are all built. Ask waits on WP-19.
4. **Drop caps.** Parked, waiting on the reader's screenshot. Note
   `.opening + p::first-letter` in `Reader.module.css` already floats one.

## Carried forward — how to work on the reading page

Ten lessons earlier threads paid for. Lessons 9 and 10 are new.

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
