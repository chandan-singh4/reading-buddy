import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { dismissSplash } from './app/splash.ts'
import { backfill, catalogueDeps } from './catalogue/index.ts'
import { watchForUpdates } from './app/updates.ts'
import { applyStoredTheme } from './reader/readerSettings.ts'
import { repository } from './storage/index.ts'
import './index.css'

watchForUpdates()

// Before React renders anything, not after — see `applyStoredTheme`'s doc
// comment for why this used to only happen once a book was opened.
applyStoredTheme()

// The app restores its own position (`useRowMemory`). The browser's attempt
// runs while a screen is still loading and therefore still short, so what it
// restores is clamped to a page that doesn't exist yet — which is how coming
// back from a book landed at the bottom of the shelf.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

/**
 * Bring stored titles up to date before the first screen asks for them.
 *
 * It has to be before, not alongside: the shelf reads `listBooks()` once when
 * it mounts and doesn't subscribe to changes, so a heal that finished a moment
 * later would leave the reader looking at the old titles until they navigated
 * away and back — which is precisely the "you said you fixed it" experience
 * this is meant to end.
 *
 * The cost is one indexed pass over the books table — metadata only, no
 * sections, no files — and it stamps every row it visits, so after the first
 * boot on a new version there is nothing left to do. If storage is unavailable
 * the app still starts: a wrong title is a blemish, a blank screen is a
 * failure.
 */
async function boot(container: HTMLElement): Promise<void> {
  try {
    await repository.healTitles()
  } catch {
    // Private-mode storage, a blocked upgrade, a full disk. Nothing here is
    // worth refusing to open the app over.
  }

  // Deliberately *not* awaited, unlike `healTitles` above. Nothing on the first
  // screen reads a finish date — it is for Stats, which is not built yet — so
  // making the launch wait on it would buy nothing and cost a network round
  // trip on the cloud backend. It also catches the book finished with no
  // signal, whose position reached the queue but whose date never did.
  void repository.backfillFinishedAt().catch(() => {})

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // Fill in publisher, length, genre and covers from Google Books for any book
  // that has never been asked about.
  //
  // After the render and never awaited, because this is the one boot chore that
  // talks to somebody else's server: a shelf of 32 books is a minute of
  // background requests, and nothing on the first screen is waiting for it. It
  // stamps every book it asks about — including the ones the catalogue has no
  // record of — so the second launch finds nothing to do, and it stops dead on
  // the first network failure rather than spending a rate limit that is already
  // the problem. See `catalogue/refresh.ts`.
  //
  // What it will *not* do is update the shelf that is already on screen: the
  // library reads its books once when it mounts. New covers and details appear
  // on the next navigation, which is the same bargain `backfillFinishedAt`
  // makes above and is why this isn't allowed to hold up the launch.
  void backfill(catalogueDeps()).catch(() => {})

  // After the render, and inside the same function as the `healTitles()` await
  // above — which is the whole reason the launch screen exists. That await is
  // an indexed pass over the books table before the first screen may be built,
  // so on a large library `#root` was empty for as long as it took. The splash
  // covers exactly that window and leaves as soon as it closes; it does not
  // wait for anything of its own. See `app/splash.ts`.
  dismissSplash()
}

// Passed in rather than read from the outer scope: the check above doesn't
// narrow inside a function that could be called at any later moment.
void boot(root)
