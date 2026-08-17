---
name: startup
description: Begin a work session with minimal context. Reads only the session-state files and the files named in the active task, never the whole codebase. Invoke with /startup at the start of every session.
disable-model-invocation: true
---

# /startup

Prime the session as cheaply as possible. Do exactly this, in order:

1. Read `docs/progress.md` and `docs/active-task.md`. Nothing else yet.
2. If `active-task.md` names a live task:
   - Open **only** the files it lists under "Files in scope". Do not open, grep,
     or glob anything else.
   - Restate the task's goal and definition-of-done in one or two sentences, then
     wait for my go-ahead.
3. If `active-task.md` is empty or marked DONE:
   - Read `docs/backlog.md`, propose the next waypoint (respecting its
     dependencies), and run the `/plan-task` steps to fill in `active-task.md`.
     Then stop for my confirmation.
4. Only read `docs/decisions.md` or `docs/architecture.md` if the task obviously
   turns on a past decision or the folder structure — and say so before you do.

Do not summarise files I didn't ask about. Do not edit code until I confirm.
