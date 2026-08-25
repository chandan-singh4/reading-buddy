---
name: wrap-session
description: Close a work session by writing state back to the context files so the next session starts cheap. Updates progress, backlog status, decisions, and the next active task. Invoke with /wrap-session before ending.
disable-model-invocation: true
---

# /wrap-session

Capture just enough state that the next session needs zero code-reading to
resume. Keep every edit terse.

1. **`docs/progress.md`** — update "In flight", move finished items to "Recently
   done", refresh "Next up" and any "Blockers". **Keep the last ~5 and delete
   the rest.** Do not archive them anywhere. Git holds every earlier version of
   this file, so the record is already kept — `git log -p docs/progress.md`
   brings back any entry ever written. A second copy in the repo is a file that
   goes stale and costs tokens.
2. **`docs/backlog.md`** — flip the status box of any waypoints touched
   (`[ ]` → `[~]` → `[x]`).
3. **`docs/decisions.md`** — if we settled anything non-obvious this session,
   append one line: the decision + one-clause why + today's date. Skip if nothing
   changed.
4. **`docs/architecture.md`** — update only if the folder layout, book structure,
   or anchor grammar actually changed.
5. **`docs/active-task.md`** — **rewrite it, do not append to it.** Replace the
   whole file for next session: the next task, its
   definition-of-done, and the exact "Files in scope" list. If the current task
   is unfinished, keep it and note what's left.
6. **`wayfinder_build_board.html`** (repo root, only if it exists) — if any
   waypoint's status box flipped in step 2, mirror the same to/doing/done change
   into that file's baked-in `state` object (the `let state={...}` line near the
   bottom of the `<script>` block). This is static — the board has no real
   persistence — so it only reflects reality if this stays in sync. Don't re-read
   or touch anything else in the file.

7. **Ship it** — the same ritual as the end of any other thread, and for the
   same reason: Vercel deploys from `main`, so notes left on a branch are notes
   the next session won't find. See "Ship at the end of every thread" in
   `CLAUDE.md`, which is the single definition — don't restate the steps here
   and let the two drift apart. In short: build, commit, merge to `main`, push.
   A docs-only wrap still runs the build if any code changed this session; if
   the code was already shipped earlier in the thread, the notes go up on their
   own.

Then show me a 3-line summary of what changed, say what was pushed, and stop.
If I want spend, remind me to run `/cost`.
