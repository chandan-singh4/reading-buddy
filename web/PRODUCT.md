# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal, single-user app — the developer's own daily reading, across formats
(epub/pdf/md/txt/docx) and across light fiction and dense/technical material
alike. No accounts, no multi-user design surface.

## Product Purpose

A mobile-first PWA that is a genuine e-reader first — word-counted pagination
that survives font and theme changes, permanent paragraph anchors, in-book
links, bookmarks — and an AI tutor for dense/technical books second: explain,
ask, quiz, and a per-book learner model, so difficult material gets easier to
work through, not just easier to display.

## Positioning

The AI tutor loop is the claim a neighboring ereader (Kindle, Google Books)
can't copy: book-type-gated teaching modes, a per-book `learner.md` model that
remembers what's understood vs. struggled, chapter recaps, and "ask about a
picture." Reading comfort is table stakes everyone has; the tutor is the actual
differentiator.

## Operating Context

Read on a phone as an installed PWA, offline-first (IndexedDB + generated
service worker). Books come in through an in-app file picker only, never OS
file-type association. The tutor makes occasional calls to Claude (tiered
Haiku 4.5 → Sonnet 5, streamed, gated by book type at import). Deployed to
Vercel, auto-deploying from `main`.

## Capabilities and Constraints

- Formats at launch: `.epub`, `.pdf`, `.md`, `.txt`, `.docx`. `.azw3`/`.kfx`
  declined — DRM.
- Local-first: books, positions, highlights all live in IndexedDB; no
  server-side book storage.
- Books stay fully separate — no cross-book memory or lookups, ever.
- Address-based retrieval: manifest + chapter index + one section, never a
  whole-book load; anchors are permanent once assigned.
- The Claude API key lives behind a tiny backend endpoint (`api/`) in
  production, never reaches the browser.

## Brand Commitments

Product name is **Reading Buddy**. *Wayfinder* was only the planning method
used to map the build and must never appear as the product's name in code or
UI.

## Evidence on Hand

Two real books used for manual testing — a 15 MB Jung epub and a Springer PDF
(`books/`, `research-paper/`), both untracked. Live deploy at
`reading-buddy-web-nu.vercel.app`.

## Product Principles

1. **Reading first, AI second.** The app has to be worth opening as a plain
   reader before it's worth opening for tutoring.
2. **Local-first and address-based.** A query loads an address, never the
   whole book; nothing routes through a server except the tutor call itself.
3. **Comfort settings are structural, not cosmetic.** Page numbers, positions,
   and highlights are computed from word counts and anchors, not screen
   geometry, so they survive a font or theme change.
4. **Distraction-free by default.** Focus Mode hides chrome without removing
   it; streaks, badges, and leaderboards are explicitly declined for
   optimizing app engagement over reading.
5. **AI interaction is bounded and visible.** Tiered models, cost visibility,
   no proactive or interrupting AI.

## Accessibility & Inclusion

No confirmed standard beyond the reduced-motion handling already decided for
the page-turn animation (`prefers-reduced-motion` falls back to instant).
