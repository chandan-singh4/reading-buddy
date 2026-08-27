import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

import AppShell from './app/AppShell.tsx'
import { startCatchUp } from './app/bookCatchUp.ts'
import { tookConsent } from './app/bookUpdate.ts'
import { AuthGate } from './auth/AuthGate.tsx'
import { RouteTransition, useViewLocation } from './app/routeTransition.tsx'
import { UpdatePrompt } from './app/UpdatePrompt.tsx'
import { startSummaries } from './summary/engine.ts'
import BookInfo from './pages/BookInfo.tsx'
import ChapterView from './pages/ChapterView.tsx'
import Home from './pages/Home.tsx'
import LastTime from './pages/LastTime.tsx'
import Library from './pages/Library.tsx'
import Reader from './pages/Reader.tsx'
import Settings from './pages/Settings.tsx'
import Stats from './pages/Stats.tsx'

/**
 * Route table. Home, Library, Stats and Settings all nest inside `AppShell`
 * so they share the top bar and navigation drawer; Reader and BookInfo
 * (WP-47) sit outside it to render full-bleed.
 */
export function AppRoutes() {
  // The location the routes match against is the *rendered* one, which during a
  // crossing between the shelf and a book is held one step behind the browser's
  // while the outgoing screen is photographed. Identical to `useLocation()` at
  // every other moment — see `routeTransition.tsx`.
  const location = useViewLocation()

  return (
    <Routes location={location}>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="library" element={<Library />} />
        <Route path="stats" element={<Stats />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="book/:bookId" element={<Reader />} />
      <Route path="book/:bookId/info" element={<BookInfo />} />
      <Route path="book/:bookId/last-time" element={<LastTime />} />
      {/*
       * The chapter summaries, outside `AppShell` and full-bleed.
       *
       * This is the one part of the app that does not follow the reader's
       * theme — it is a paper object in one fixed palette (see
       * `summary/summary.module.css`). The shell's top bar and drawer in the
       * app's own colours, wrapped around a page pretending to be paper, would
       * undo exactly the thing the design is doing. The page carries its own
       * way back instead.
       */}
      <Route path="book/:bookId/chapters" element={<ChapterView />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}

export default function App() {
  /*
   * The books bring themselves up to date in the background, one at a time,
   * for as long as the app is open (`app/bookCatchUp.ts`). Started here rather
   * than inside a screen so it survives every navigation, and read here rather
   * than in `UpdatePrompt` because `tookConsent` can only be read once — it
   * clears itself, and it means "the reader just accepted an update", which is
   * the one launch worth starting on without the usual opening pause.
   */
  useEffect(() => startCatchUp(tookConsent()), [])

  /*
   * The Librarian and the Scribe, for as long as the app is open.
   *
   * Started here rather than inside a screen, for the reason above it: this has
   * to survive every navigation. The book the reader opened last summarises its
   * finished chapters on its own; every other book raises a question in the
   * bell and waits to be asked. See `summary/queue.ts`.
   */
  useEffect(() => startSummaries(), [])

  return (
    <BrowserRouter>
      {/*
       * Inside the router, not around it: the sign-in screen has no links, but
       * it hands the reader back to the device library, and that switch reloads
       * the page — which needs a router already mounted underneath it.
       *
       * Wraps the routes only — not `UpdatePrompt`, which is a panel over
       * whatever is on screen rather than a place, and has no business being
       * held a step behind while a book opens.
       */}
      <AuthGate>
        <RouteTransition>
          <AppRoutes />
        </RouteTransition>
      </AuthGate>
      {/*
       * Outside the routes, not inside `AppShell`: the reading screen is the
       * one place a reader is most likely to be when a build lands, and it
       * deliberately renders outside the shell. Mounted here, the panel covers
       * every screen there is.
       */}
      <UpdatePrompt />
    </BrowserRouter>
  )
}
