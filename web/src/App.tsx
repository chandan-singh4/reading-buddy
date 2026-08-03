import { BrowserRouter, Route, Routes } from 'react-router'

import AppShell from './app/AppShell.tsx'
import Home from './pages/Home.tsx'
import Journal from './pages/Journal.tsx'
import Library from './pages/Library.tsx'
import Reader from './pages/Reader.tsx'
import Settings from './pages/Settings.tsx'
import Stats from './pages/Stats.tsx'

/**
 * Route table. Home, Stats, Journal, Library and Settings all nest inside
 * `AppShell` so they share the tab bar; Reader sits outside it to render
 * full-bleed. Library keeps its own route — the full catalogue — even though
 * it lost the tab bar's front-door slot to Home; nothing about the screen
 * itself changed, only how it's reached.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="library" element={<Library />} />
        <Route path="stats" element={<Stats />} />
        <Route path="journal" element={<Journal />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="book/:bookId" element={<Reader />} />
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
