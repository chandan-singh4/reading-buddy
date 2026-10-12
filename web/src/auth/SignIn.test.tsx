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

afterEach(() => {
  cleanup()
  cloud.sent.length = 0
  cloud.fail = undefined
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
   * The old "use the library on this device instead" button is gone on
   * purpose: a library in the browser is one the browser may delete. See
   * `storage/backend.ts`.
   */
  it('offers no way to a library kept only in this browser', () => {
    render(<SignIn />)
    expect(screen.queryByRole('button', { name: /library on this device/i })).toBeNull()
  })
})
