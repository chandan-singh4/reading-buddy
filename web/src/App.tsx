import { BrowserRouter, Route, Routes } from 'react-router'

import AppShell from './app/AppShell.tsx'
import Library from './pages/Library.tsx'
import Reader from './pages/Reader.tsx'
import Settings from './pages/Settings.tsx'

/**
 * Route table. Library and Settings nest inside `AppShell` so they share the
 * tab bar; Reader sits outside it to render full-bleed.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Library />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="book/:bookId" element={<Reader />} />
      <Route path="*" element={<Library />} />
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
