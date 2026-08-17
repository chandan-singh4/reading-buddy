---
name: plan-task
description: Turn the next backlog waypoint into a scoped active task with an explicit, minimal file list, so the build session reads only what it needs. Invoke with /plan-task.
disable-model-invocation: true
---

# /plan-task

1. Read `docs/backlog.md`; pick the next waypoint. Respect the "after N"
   dependencies — don't pick one whose dependencies aren't done.
2. Read `docs/decisions.md` only for the sections relevant to that waypoint.
3. Write `docs/active-task.md`:
   - **Task**: the waypoint id + title.
   - **Definition of done**: 2–3 concrete, checkable outcomes.
   - **Files in scope**: the *smallest* set of files to create or edit, listed as
     explicit paths. This is the ONLY reading the next build session is allowed by
     default — keep it tight.
   - **Out of scope**: what NOT to touch, so the session doesn't sprawl.
4. Show me the plan and wait. Don't build yet.
