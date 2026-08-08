import { BrowserRouter, Route, Routes } from 'react-router'

import AppShell from './app/AppShell.tsx'
import { RouteTransition, useViewLocation } from './app/routeTransition.tsx'
import { UpdatePrompt } from './app/UpdatePrompt.tsx'
import BookInfo from './pages/BookInfo.tsx'
import Home from './pages/Home.tsx'
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
      <Route path="*" element={<Home />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/*
       * Wraps the routes only — not `UpdatePrompt`, which is a panel over
       * whatever is on screen rather than a place, and has no business being
       * held a step behind while a book opens.
       */}
      <RouteTransition>
        <AppRoutes />
      </RouteTransition>
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
