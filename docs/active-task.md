# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

Read offline while travelling, and sync on return.

WP-43 is closed. The reader pressed **Check folder for new books** on the phone
on 2026-09-10. It works.

The reader travels on 2026-09-11 and reads with no network. The app must open,
show the shelf, open the books, and keep every page turn. The cloud must get
that work when the signal comes back.

## What was wrong, and is now fixed

A sign-in token lives about one hour. The app renews it over the network. With
no network the app could not renew it. After one hour the app said "nobody is
signed in". It then showed the sign-in screen, which the reader cannot use with
no signal. It also refused to queue any write.

The app now writes down the reader who last signed in. It gives that reader
back **only** when the renewal fails for want of a network. A true sign-out
still closes the app. See `web/src/storage/cloud/remembered.ts`.

## Before the reader leaves

1. Open the app with a signal. Let it sign in.
2. Open every book to read on the trip. The copy holds only opened books, and
   only 20 of them. The oldest read book is dropped first.
3. Press **Read aloud** one time, with a signal, for each voice to use. The
   speech model is 86 MB and arrives one time only.
4. Take any waiting update before the trip. The bell shows it.

## What works with no network

- The shelf, the books, the page, the bookmarks, the saved passages, the notes.
- Read aloud, after step 3 above.
- Every page turn, bookmark and saved passage is queued and sent on return.

## What does not work with no network

- Veda, the chapter summaries and the examination. All three need the models.
- Delete a book. The app refuses this on purpose.
- A book that was never opened with a signal. The shelf greys it out.

## Files in scope

- `web/src/storage/cloud/remembered.ts` — the reader we last saw.
- `web/src/storage/cloud/client.ts` — `currentUser`, `signOut`, `onAuthChange`.
- `web/src/storage/cloud/cached.ts` — the offline copy and the read rules.
- `web/src/storage/cloud/outbox.ts` — the queue and the drain.
- `web/src/auth/useSession.ts`, `web/src/auth/AuthGate.tsx` — the gate.
