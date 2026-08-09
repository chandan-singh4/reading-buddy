> **What's in here (read when setting the cloud backend up, or when a secret
> needs rotating).** Click-by-click account setup for the two services the cloud
> storage layer talks to — Supabase (Postgres, for the structured book records)
> and Cloudflare R2 (object storage, for the original files and pictures). Also
> the full list of environment variables, which ones are safe in the browser and
> which are absolutely not, and how to check the whole thing works. You only do
> this once. Skip it entirely if you're working on the app itself.

---

# Setting up Supabase and Cloudflare R2

## Why two services and not one

Supabase can store files too, and R2 can't run a database. So why both?

Think of it like a library. The **card catalogue** is thousands of small cards
you look things up in constantly — that's Postgres, and Supabase gives you one
with a browser-safe key and per-row permissions built in. The **books
themselves** are heavy, you fetch one at a time, and you mostly just want them
cheap to keep — that's R2, and Cloudflare charges nothing to read them back out,
where almost everyone else bills you per gigabyte downloaded.

Your library is roughly 90% bytes and 10% records. Putting the bytes on the free
egress service and the records on the queryable one is the whole idea.

## Before you start

Have ready:

- An email address you can receive mail at (this is how you'll sign in).
- **A payment card.** Cloudflare requires one on file to switch R2 on, even
  though the first 10 GB a month are free and you will almost certainly stay
  inside that. Supabase's free tier needs no card.
- About 20 minutes.

---

## Part 1 — Supabase (the records)

### 1.1 Make the project

1. Go to <https://supabase.com> and click **Start your project**. Sign in with
   GitHub — it's the fastest route and you already have an account.
2. Click **New project**.
3. Fill in:
   - **Name:** `reading-buddy`
   - **Database password:** click *Generate a password* and **save it in your
     password manager immediately.** You will hardly ever need it, and Supabase
     cannot show it to you again. (If you lose it you can reset it later, so
     this is an annoyance rather than a disaster.)
   - **Region:** whichever is physically closest to you. This is the single
     biggest lever on how fast the app feels, because every page turn is a round
     trip to this machine.
4. Click **Create new project** and wait. Provisioning takes about two minutes.

### 1.2 Create the tables

1. In the left sidebar click **SQL Editor**, then **New query**.
2. Open `supabase/migrations/0001_schema.sql` from this repo, copy the whole
   file, paste it in, and click **Run**. You should see *Success. No rows
   returned.*
3. New query again. Do the same with `supabase/migrations/0002_functions.sql`.

To check it worked, click **Table Editor** in the sidebar — you should see ten
tables: `books`, `manifests`, `chapters`, `sections`, `positions`, `sources`,
`assets`, `quotes`, `folders`, `bookmarks`.

> Every one of those tables has **Row Level Security** switched on, which means
> that by default *nobody can read or write anything*. The policies in
> `0001_schema.sql` then open exactly one door: a signed-in person can touch
> rows whose `user_id` matches their own. This is what makes it safe to put the
> Supabase key in the browser at all — the key gets you as far as the front
> desk, and the policies decide what you're allowed to take out.

### 1.3 Turn on email sign-in

1. Sidebar → **Authentication** → **Sign In / Providers**.
2. Make sure **Email** is enabled. That's the default, so usually there's
   nothing to do.
3. Sidebar → **Authentication** → **URL Configuration**:
   - **Site URL:** your deployed address, e.g. `https://reading-buddy.vercel.app`
   - **Redirect URLs:** add `http://localhost:5173/**` so sign-in works while
     you're developing too.

### 1.4 Lock it to just you — ⚠️ not yet, come back after Part 5

> **You cannot do this step now, and the app will not ask you to sign in yet.**
> This setting is written here because it belongs with the other auth settings,
> but it can only be done *last*: turning sign-ups off before you have signed in
> once locks you out of your own database. The app also won't offer the cloud at
> all until Part 3 has put the keys in front of it — until then the option in
> **Settings** is greyed out and there is no sign-in prompt anywhere. That is
> correct, not a fault. Carry on to Part 2, and Part 5 step 4 will send you back
> here at the right moment.

Once you have signed in once and your own account exists:

1. Sidebar → **Authentication** → **Sign Ups**.
2. Turn **Allow new users to sign up** *off*.

Now the only account that can ever exist is yours. Anyone who finds your app
gets a sign-in screen they can never get past. This is the cheapest security
control in the whole setup and it takes one click.

### 1.5 Copy the two values the app needs

Sidebar → **Project Settings** → **API Keys**.

| What | Looks like | Where it goes |
|---|---|---|
| **Project URL** | `https://abcdefgh.supabase.co` | `VITE_SUPABASE_URL` |
| **Publishable / anon key** | `sb_publishable_...` or a long `eyJ...` | `VITE_SUPABASE_ANON_KEY` |

> **Do not copy the `service_role` / `secret` key.** It's on the same page and
> it looks similar. That one ignores Row Level Security completely — it is the
> master key to your whole database, and putting it anywhere near the browser
> hands your library to anyone who opens dev tools. The app never needs it.

---

## Part 2 — Cloudflare R2 (the files)

### 2.1 Switch R2 on

1. Go to <https://dash.cloudflare.com> and create an account (or sign in).
2. Left sidebar → **R2 Object Storage**.
3. Click **Purchase R2** / **Enable R2** and add a payment card. Nothing is
   charged inside the free allowance — 10 GB stored, 1 million writes and 10
   million reads a month. A 300-book library is comfortably inside it.

### 2.2 Make the bucket

1. Click **Create bucket**.
2. **Name:** `reading-buddy`
3. **Location:** pick the hint nearest you, same reasoning as the Supabase
   region.
4. **Storage class:** Standard.
5. Click **Create bucket**.

Leave public access **off**. The app reaches its files through short-lived
signed links instead — see Part 3.

### 2.3 Let your app's web page talk to the bucket

Browsers refuse to send a request to another domain unless that domain has said
in advance that it's expecting you. That permission list is called CORS, and R2
starts with an empty one — so without this step every upload fails with a
confusing network error and nothing in the logs.

1. Open the bucket → **Settings** tab → scroll to **CORS Policy** → **Edit**.
2. Paste this, replacing the Vercel address with your real one:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://reading-buddy.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 2.4 Make an API token

1. On the R2 overview page, right sidebar → **Manage R2 API Tokens** → **Create
   API token**.
2. **Permissions:** *Object Read & Write*.
3. **Specify bucket:** choose `reading-buddy` only. A token that can only touch
   one bucket is one that can't be turned against anything else.
4. **TTL:** forever is fine for a personal project.
5. Click **Create API Token**.

You are now shown three things **once**. Copy all three now:

| What | Where it goes |
|---|---|
| **Access Key ID** | `R2_ACCESS_KEY_ID` |
| **Secret Access Key** | `R2_SECRET_ACCESS_KEY` |
| **Endpoint** (`https://<account-id>.r2.cloudflarestorage.com`) | the account id part goes in `R2_ACCOUNT_ID` |

If you navigate away before copying, you can't get the secret back — you delete
the token and make another. No harm done, just redo this step.

---

## Part 3 — The environment variables

Copy `.env.example` to `.env` at the repo root and fill it in. `.env` is
gitignored and never gets committed. **The repo root, not `web/`** — Vite is
pointed there by `envDir: '..'` in `web/vite.config.ts`, so that one file serves
both the browser half and the server half.

```
# --- Browser-visible. Safe: these are public by design. ---
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...

# --- Server-only. NEVER prefix these with VITE_. ---
R2_ACCOUNT_ID=...
R2_BUCKET=reading-buddy
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

> **The `VITE_` prefix is not a naming convention — it is a decision about who
> can see the value.** Vite finds every `VITE_`-prefixed variable and *bakes the
> text of it into the JavaScript it ships to the browser*. Anyone can read it by
> pressing F12. That's correct and intended for the Supabase URL and anon key,
> which are meant to be public and are useless without a signed-in session. It
> would be catastrophic for `R2_SECRET_ACCESS_KEY`, which is the password to
> your entire bucket. **If you ever find yourself typing `VITE_R2_`, stop.**

### On Vercel

Project → **Settings** → **Environment Variables**. Add all eight, for
Production and Preview. Set them in the dashboard, never in a committed file.

---

## Part 4 — Why there's a signing endpoint in `api/`

Supabase is designed to be called straight from a browser: the anon key is
public, and Row Level Security is what actually protects you. **R2 has no
equivalent.** Its credentials are all-powerful, so they can only live on a
server.

So `api/r2/sign.ts` sits in between. When the app wants to upload a book or
fetch a picture, it asks that endpoint, which:

1. checks the caller's Supabase session token is real,
2. confirms the key they're asking for starts with *their own* `users/<id>/`
   prefix,
3. hands back a URL that works for a few minutes and then stops.

The browser then uploads to or downloads from R2 directly using that URL. The
bytes never pass through the server — which is what keeps it fast and free.

Think of it as a hotel key card desk: the desk checks your ID and gives you a
card that opens your room and expires at checkout. The master key stays behind
the desk.

---

## Part 5 — Checking it works

Do this in **two passes**, because the two halves need different dev servers and
finding that out mid-import is confusing.

> **`npm run dev` does not serve `/api/r2/sign`.** It is Vite, and Vite serves
> `web/` only — the functions in `api/` are run by Vercel. Signing in needs no
> server at all (the browser talks to Supabase directly), so **pass 1** works
> under plain `npm run dev`. Importing a book needs an upload link from that
> endpoint, so **pass 2** needs `npx vercel dev` (run `npx vercel link` once
> first) or a real deploy. Under `npm run dev` an import fails at the upload
> with a 404 on `/api/r2/sign` — that is the missing server, not a broken key.

### Pass 1 — does sign-in work? (`npm run dev`)

1. `npm run dev` and open the app. It starts on **the library on this device**,
   exactly as before — the cloud is opt-in and nothing has moved.
2. **Settings → Where your library lives → The cloud.** The page reloads onto
   the cloud library, which is empty, and asks you to sign in. (If that card is
   greyed out, the `VITE_SUPABASE_*` variables aren't reaching the build —
   restart `npm run dev` after editing `.env`.)
3. Enter your email, open the link it sends you **on the same device**, and you
   land back in the app signed in.
4. Now go and turn sign-ups off — Part 1.4. Your account exists, so the door can
   be shut behind you.

### Pass 2 — does a book make the round trip? (`npx vercel dev`)

5. Stop Vite. `npx vercel dev` instead, so `/api/r2/sign` exists.
6. Import one book. Not thirty — one, and a small one.
7. Supabase → **Table Editor** → `books`. There should be a row, with `user_id`
   filled in and `ready` true.
8. Cloudflare → your bucket → **Objects**. There should be
   `users/<your-id>/books/<book-id>/source/...`.
9. Open the book, turn some pages, then switch back to **This device** in
   Settings and confirm your original library is still all there.

> **Switching backends never moves a book.** The cloud library starts empty even
> though your device library isn't, and that is correct rather than data loss —
> the two are separate libraries and the toggle only chooses which one you are
> looking at. Settings shows a count under the option you're *not* using so this
> is obvious rather than alarming. There is no "copy my library up" yet.

### When it doesn't

| Symptom | Almost always |
|---|---|
| `new row violates row-level security policy` | You're not signed in, or the row's `user_id` isn't yours. Check the session first. |
| Upload fails, console says CORS | Part 2.3, and check the origin matches **exactly** — `https://` vs `http://`, and no trailing slash. |
| `404` on `/api/r2/sign` | You're on `npm run dev`, which serves `web/` and nothing else. Use `npx vercel dev`, which runs the `api/` functions too. |
| `401` from `/api/r2/sign` | Session expired. Sign in again. |
| `SignatureDoesNotMatch` | `R2_SECRET_ACCESS_KEY` was copied with a stray space, or `R2_ACCOUNT_ID` has the rest of the endpoint URL in it — it's just the id, not the whole address. |
| Everything worked, now nothing does | A free Supabase project **pauses after a week of no activity**. Open the dashboard and click *Restore*. |
| The app never asks me to sign in | Working as intended. The app always opens on the device library; sign-in only appears once you switch to the cloud in **Settings**. If that switch is greyed out, see the row below. |
| The cloud option is greyed out | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` weren't there **when the app was built**. Locally: restart `npm run dev` after editing `.env`. On Vercel: add them in Project Settings and then **redeploy** — adding a variable does nothing to the build already live. |
| Stuck on the sign-in screen with no email arriving | Tap **Use the library on this device instead** at the bottom. Your books are still there; the cloud is a separate library, not a replacement for that one. |
| Signed in, but the library is empty | Expected. Switching backends copies nothing — see the note in Part 5. |

---

## What this costs

Realistically, for one reader with a few hundred books: **nothing.** Supabase's
free tier gives 500 MB of database (the text of a 600-page book is a couple of
MB) and R2's gives 10 GB of storage with free reads. The thing most likely to
push you off the free tier is kept source files — a library of large,
image-heavy EPUBs — and the app already has a *"forget the original files"*
control for exactly that reason.
