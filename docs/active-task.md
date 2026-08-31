# Active task

> **What's in here:** the one task in flight, what "done" means, and the exact
> files to open. Read this first. Do not read the codebase around it.

## Task: judge this session's four changes on the phone

All four are built, tested and shipped. None has been seen on a device. This
task needs no code at first.

### The checks, in order

1. **Statistics - the heatmap.** A day you did not read must be an empty square,
   not a pale one. The key must show four shades, not five. Check this in Dark
   and in High contrast as well as your usual theme.
2. **Statistics - the colours.** The screen now follows your theme. It was warm
   paper in all eight themes before. Open it in Dark at night and say whether it
   is right.
3. **Library - rename.** Press and hold a book. Press **Rename**. The field
   opens on the current title. Change it and press Rename. Tick two books: the
   button must go grey.
4. **Home - the book in hand.** The cover carries a lit fore edge down its right
   side, as far as you have read. Title and author sit at the top. Under it are
   **Continue reading** and **Chapter summaries**, then the finish date and your
   daily pace.
5. **The three screens together.** Move Home - Library - Statistics. The
   headings must be the same face and the accent the same colour on all three.

### Done when

You say the four changes are right on a phone, and the three screens read as one
app.

### What to watch for

- **The lit edge on a dark cover.** It sits on the page block beside the
  artwork, never on top of it, so it should hold on any cover. Judge it against
  *Man and His Symbols*, which is the darkest cover on the shelf.
- **The finish date on a fresh book.** With too little read, the strip says
  "Still learning how fast you read this one." That is correct, not a failure.
  It needs about 15 minutes of reading and 5% of the book.
- **Statistics in a dark theme.** The card, rule and ink now come from the
  theme. Watch for anything that has gone low-contrast, especially the genre
  bars and the Veda violet, which are still literal colours by design.
- **The selection bar wraps to two rows now.** Four actions do not fit across a
  375px phone, so Delete drops to its own line. That is the correct behaviour
  and every action is still reachable. Say if it looks wrong to you.
- **The accent changed on Statistics.** Its pills and buttons were forest green
  and are now your theme's accent, which is warm brown by default. That is the
  standardisation working. Say if you preferred the green - the fix would be to
  move green into `theme.css` for every screen, not to give one screen its own.

### Files in scope

- `web/src/stats/stats.module.css` - the local names now resolve to theme tokens.
- `web/src/stats/Heatmap.tsx` - the four-swatch key.
- `web/src/library/SelectionBar.tsx` / `web/src/pages/Library.tsx` - rename.
- `web/src/pages/Home.tsx` / `Home.module.css` - the hero card and the lit edge.
- `web/src/styles/theme.css` - `--font-display` and `--font-figure`.

## Also waiting on a device (no code)

- **The check-in and a corrected sitting.** Stay on one page for ten minutes.
  The bar asks. Answer "I stepped away" and check the day log drops the time.
- **Veda's measured minutes.** Open the lamp, talk, close it, and check the day
  log prints the real number with no `~` in front of it.
- **The four heat shades**, and a sitting named for the screen it was spent on
  (`Book details`, `Notes`, `With Veda`).
- **The reading desk**, in both states: an unfinished book and a finished one.

## One deletion, still pending

Delete `web/src/stats/repair.ts` and its call in `stats/load.ts`, **once the
reader has opened Statistics on the phone.** It repairs old session rows one
time and must not become permanent.
