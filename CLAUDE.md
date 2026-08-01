# Wayfinder Map — project memory

Mobile-first PWA reading companion. The web UI in `web/` is the product; the
Tauri shell in `shell/` is a throwaway dev harness; `api/` is a tiny endpoint
that holds the Claude key.

## Session ritual (token discipline)

- Start every session with **`/startup`**. End with **`/wrap-session`**.
- **Do not read the codebase broadly.** Read only the files listed in
  `docs/active-task.md`. If you think you need more, add the path to that file's
  "Files in scope" list with a one-line reason — don't grep or glob the tree.
- Prefer trusting the context files below over re-deriving state from code.

## Explain as you go (plain language, concise)

- After each task or step, tell me in plain, everyday language what you just did
  and what you're about to do next — reach for a quick example or analogy when it
  makes something click. Treat me as smart but new to this part: I want to
  *understand* what's happening, not just receive code.
- Be transparent about every action **before** you take it and **after** it lands.
- Stay concise. Cut filler, preamble, and restating the obvious. Short and clear
  beats long and thorough — teach the idea, don't pad it.

## Context map — read on demand, never all at once

| File | Read it when |
|---|---|
| `docs/active-task.md` | **Always at startup.** The one task in flight + the exact files to open. |
| `docs/progress.md` | **Always at startup.** What's done, in flight, blocked, next. |
| `docs/backlog.md` | Planning the next task, or on `/plan-task`. All 34 waypoints + status. |
| `docs/decisions.md` | A "why is it this way?" question, or before changing a settled choice. |
| `docs/architecture.md` | Touching folder layout, the parsed-book structure, or anchor grammar. |
| `…\reading-buddy` (external archive) | **Never by default — ask me first.** Deep decision reasoning. See below. |

Each file opens with a ~1-paragraph "What's in here / read when" note, so you can
decide whether to open it without reading the body.

## Deep-reasoning archive — ask before opening

The in-depth "why" behind each decision lives in the original planning tickets at:

```
C:\Users\chand\Python\wayfinder\reading-buddy
```

This is a **last resort, not a default source.** `docs/decisions.md` already holds
every settled choice in short form. Do **not** read this archive on your own
initiative. Only if a task genuinely needs deeper reasoning that is *not* covered
by `decisions.md` or `architecture.md`:

1. **Stop and ask my permission first.**
2. In plain language, tell me (a) exactly what you're trying to find, and (b) why
   the existing docs don't answer it.
3. Read it only after I say yes — and only the specific ticket(s) you named.

## Commands

`/startup` · `/wrap-session` · `/plan-task` — defined in `.claude/skills/`.

## Build / verify

Run from the repo root (`web/` is the only npm workspace):

- **dev:** `npm run dev` → Vite on <http://localhost:5173>
- **typecheck:** `npm run typecheck` → `tsc -b`, no emit
- **build:** `npm run build` → typecheck + production build to `web/dist/`
- **test:** none yet — no runner installed.
