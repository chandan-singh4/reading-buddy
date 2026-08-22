# api/ — the small server-side endpoints

Each file here is one endpoint. Each exists for the same reason: to hold a key
the browser must never see, and to do as little else as possible.

| File | What it holds |
|---|---|
| `tutor.ts` | The OpenRouter key **and the whole prompt library**. |
| `books/google.ts` | The Google Books key. |
| `r2/sign.ts` | The R2 credentials. |

`api/` is built separately from `web/` and cannot share code with it. Nothing
in these files can have a test. Keep judgment out of them and in `web/src/`,
where it can be measured.

## The tutor relay

`tutor.ts` is the only place in the project that talks to a model. Read the
comment at the top of the file for the reasoning. Three points matter most:

1. **The prompts live server-side, not in the bundle.** The client sends an
   *intent* — a short enum such as `simply` — and the relay decides what that
   means. A caller cannot rewrite the system prompt and spend the project's
   tokens on something else. That is the difference between a relay and an open
   proxy to a paid API.
2. **Failover is OpenRouter's job.** We send a `models` array and OpenRouter
   walks it. There is deliberately no retry loop in our code.
3. **The response reports which model really answered.** We hand that back, not
   the slug we asked for. During a failover the two differ, and the reader's
   bubble label must name the model that wrote the words.

Sign-in is required. It is a spend control, not privacy: the Claude slug on
this same path costs real money, and without the check this URL is an open,
unmetered proxy to it.

## The keys

See `.env.example` at the repo root for every variable and what it does. Never
hard-code a key, and never commit one. Locally that means a gitignored `.env`.
On Vercel it means Project → Settings → Environment Variables, set in the
dashboard rather than shipped in a file at all.

Never prefix any of these with `VITE_`. That prefix compiles the value into the
JavaScript every visitor downloads.
