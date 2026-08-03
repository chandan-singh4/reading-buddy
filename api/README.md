# api/ — Claude proxy endpoint (placeholder)

A single small server-side endpoint whose only job is to hold the Claude API key
and forward requests from `web/`, so the key never reaches the browser.

Empty until the Ask waypoints land.

## The key

Read from `ANTHROPIC_API_KEY` (see `.env.example` at the repo root) once this
endpoint has code in it — never hard-coded, never committed. Locally that means
a `.env` file (gitignored). On Vercel it means a Project → Settings →
Environment Variables entry, set directly in the dashboard rather than shipped
in a file at all.
