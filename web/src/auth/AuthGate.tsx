/**
 * Stands in front of the app when the cloud library is switched on.
 *
 * On the device library it is a pass-through and costs nothing: `useSession`
 * short-circuits without touching Supabase, so a reader who never turns the
 * cloud on never meets any of this.
 *
 * The `loading` case paints the page background rather than returning `null`.
 * The launch screen is removed as soon as React has rendered once, so an empty
 * render here is a white flash on a dark phone — brief, but it is the first
 * thing the app does, and it reads as a fault.
 */

import type { ReactNode } from 'react'

import { activeBackend } from '../storage/index.ts'
import SignIn from './SignIn.tsx'
import { useSession } from './useSession.ts'
import styles from './SignIn.module.css'

export function AuthGate({ children }: { children: ReactNode }) {
  const cloud = activeBackend() === 'cloud'
  const session = useSession(cloud)

  if (!cloud) return <>{children}</>
  if (session.status === 'loading') return <main className={styles.screen} />
  if (session.status === 'signed-out') return <SignIn />
  return <>{children}</>
}
