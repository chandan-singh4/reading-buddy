import { BrowserRouter, Route, Routes } from 'react-router'

import AppShell from './app/AppShell.tsx'
import BookInfo from './pages/BookInfo.tsx'
import Home from './pages/Home.tsx'
import Library from './pages/Library.tsx'
import Reader from './pages/Reader.tsx'
import Settings from './pages/Settings.tsx'
import Stats from './pages/Stats.tsx'

/**
 * Route table. Home, Library, Stats and Settings all nest inside `AppShell`
 * so they share the tab bar; Reader and BookInfo (WP-47) sit outside it to
 * render full-bleed.
 */
export function AppRoutes() {
  return (
    <Routes>
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
      <AppRoutes />
    </BrowserRouter>
  )
}
