// @vitest-environment jsdom
//
// The selection menu's two doors out of the book.
//
// This file covers one thing: that "Tell the Scribe" is there, beside "Ask
// Veda", and that it reports the action the reader page switches on. The menu
// is mostly geometry — placement, handles, stretching — and none of that is
// testable in jsdom, which is why the rest of it is proved on a phone.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { SelectionMenu, type SelectionAction } from './SelectionMenu.tsx'
import type { ReaderSelection } from './selection.ts'

afterEach(cleanup)

const HELD: ReaderSelection = {
  text: 'The map is not the territory.',
  anchor: 'c1/p4' as never,
  rect: { top: 100, bottom: 120, left: 20, right: 300 },
  rects: [],
  range: document.createRange(),
}

function openMenu(onAction: (action: SelectionAction) => void) {
  return render(
    <SelectionMenu
      selection={HELD}
      onAction={onAction}
      onDismiss={() => {}}
      onExtend={() => {}}
    />,
  )
}

it('offers the Scribe beside Veda', () => {
  openMenu(() => {})

  // One asks a question of the book. The other says something about it. Both
  // are the same size and the same colour on purpose — see `decisions.md`,
  // "The book's journal action is not called 'speak'".
  expect(screen.getByRole('menuitem', { name: 'Ask Veda' })).toBeTruthy()
  expect(screen.getByRole('menuitem', { name: 'Tell the Scribe' })).toBeTruthy()
})

it('does not call the action "speak", which is Read aloud', () => {
  const acted = vi.fn()
  openMenu(acted)

  fireEvent.click(screen.getByRole('menuitem', { name: 'Tell the Scribe' }))

  expect(acted).toHaveBeenCalledWith({ kind: 'scribe' })
  // The menu still has its own Read aloud, and it is a different thing.
  expect(screen.getByRole('menuitem', { name: 'Read aloud' })).toBeTruthy()
})
