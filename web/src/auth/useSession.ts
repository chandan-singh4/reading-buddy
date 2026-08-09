/**
 * Is anyone signed in?
 *
 * Only meaningful when the cloud backend is switched on — on the device library
 * there is no such thing as a session, and this reports `signed-out` forever
 * without ever touching Supabase.
 *
 * Three states rather than a boolean, because the difference between "nobody is
 * signed in" and "we haven't asked yet" is a whole screen. Supabase reads its
 * stored session asynchronously, so a boolean would start `false` and flash the
 * sign-in form at a reader who is perfectly well signed in — every single time
 * they open the app.
 */

import { useEffect, useState } from 'react'

import { currentUser, isCloudConfigured, onAuthChange } from '../storage/cloud/index.ts'
import type { CloudUser } from '../storage/cloud/index.ts'

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out'

export interface Session {
  status: SessionStatus
  /** The Supabase user id, when signed in. Also the R2 key prefix. */
  userId?: string
  /** Which address is signed in — see `CloudUser`. */
  email?: string
}

export function useSession(enabled = true): Session {
  const [session, setSession] = useState<Session>(() =>
    enabled && isCloudConfigured() ? { status: 'loading' } : { status: 'signed-out' },
  )

  useEffect(() => {
    if (!enabled || !isCloudConfigured()) {
      setSession({ status: 'signed-out' })
      return
    }

    let live = true
    const settle = (user: CloudUser | undefined) => {
      if (!live) return
      setSession(
        user ? { status: 'signed-in', userId: user.id, email: user.email } : { status: 'signed-out' },
      )
    }

    // The first answer, and then every change. `onAuthChange` also fires when
    // the magic link lands back on the page, which is what opens the gate
    // without the reader having to reload anything.
    void currentUser().then(settle, () => settle(undefined))
    const stop = onAuthChange(settle)

    return () => {
      live = false
      stop()
    }
  }, [enabled])

  return session
}
