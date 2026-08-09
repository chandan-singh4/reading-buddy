// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import SignIn from './SignIn.tsx'

const cloud = vi.hoisted(() => ({
  sent: [] as string[],
  fail: undefined as string | undefined,
}))

vi.mock('../storage/cloud/index.ts', () => ({
  sendSignInLink: async (email: string) => {
    if (cloud.fail) throw new Error(cloud.fail)
    cloud.sent.push(email)
  },
}))

const backend = vi.hoisted(() => ({ chosen: [] as string[] }))

vi.mock('../storage/index.ts', () => ({
  chooseBackend: (kind: string) => backend.chosen.push(kind),
}))

afterEach(() => {
  cleanup()
  cloud.sent.length = 0
  cloud.fail = undefined
  backend.chosen.length = 0
})

function submit(email: string): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Send me a link' }))
}

describe('SignIn', () => {
  it('sends a link and then says where to look', async () => {
    render(<SignIn />)
    submit('reader@example.com')

    await waitFor(() => expect(cloud.sent).toEqual(['reader@example.com']))
    expect(screen.getByText(/reader@example\.com/)).toBeTruthy()
  })

  it('trims the address, because a phone keyboard adds a space after it', async () => {
    render(<SignIn />)
    submit('  reader@example.com ')

    await waitFor(() => expect(cloud.sent).toEqual(['reader@example.com']))
  })

  it('shows the refusal and stays on the form when the link cannot be sent', async () => {
    cloud.fail = 'That sign-in link couldn’t be sent.'
    render(<SignIn />)
    submit('reader@example.com')

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('couldn’t be sent'))
    expect(screen.getByRole('button', { name: 'Send me a link' })).toBeTruthy()
  })

  /**
   * The one that matters. Without this button a reader who turns the cloud on
   * before the accounts exist is locked away from books that are still sitting
   * in the browser underneath this screen.
   */
  it('always offers the way back to the device library', () => {
    render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: /library on this device/i }))

    expect(backend.chosen).toEqual(['local'])
  })

  it('offers the way back from the sent screen too', async () => {
    render(<SignIn />)
    submit('reader@example.com')
    await waitFor(() => expect(cloud.sent.length).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: /library on this device/i }))
    expect(backend.chosen).toEqual(['local'])
  })
})
