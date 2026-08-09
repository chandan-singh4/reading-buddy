/**
 * The door to the cloud library.
 *
 * Shown instead of the app when the cloud backend is switched on and nobody is
 * signed in. A link rather than a password: there is exactly one account, it is
 * used from a phone, and a password would be one more thing to lose.
 *
 * ## The escape hatch is not optional
 *
 * The button at the bottom switches back to the library on this device. Without
 * it, a reader who turns the cloud on before their Supabase project exists —
 * or whose email simply doesn't arrive — is locked out of their own books by a
 * screen with no way past it. The device library is still sitting there
 * untouched; the only thing standing between the reader and it would be this
 * form. So this screen always offers the way back.
 */

import { useState, type FormEvent } from 'react'

import { chooseBackend } from '../storage/index.ts'
import { sendSignInLink } from '../storage/cloud/index.ts'
import styles from './SignIn.module.css'

type Stage = 'asking' | 'sending' | 'sent'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [stage, setStage] = useState<Stage>('asking')
  const [error, setError] = useState<string>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!address || stage === 'sending') return

    setStage('sending')
    setError(undefined)
    try {
      await sendSignInLink(address)
      setStage('sent')
    } catch (cause) {
      setStage('asking')
      setError(cause instanceof Error ? cause.message : 'That didn’t work. Try again.')
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <h1 className={styles.title}>Reading Buddy</h1>

        {stage === 'sent' ? (
          <>
            <p className={styles.lede}>
              Check <strong>{email.trim()}</strong>. Open the link on this device and
              you’ll land back here, signed in.
            </p>
            <p className={styles.hint}>
              Nothing arrived? Look in spam, then try again — links expire after an
              hour.
            </p>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setStage('asking')
                setError(undefined)
              }}
            >
              Use a different address
            </button>
          </>
        ) : (
          <>
            <p className={styles.lede}>
              Your cloud library is private to one account. Enter your email and
              we’ll send a link to sign in — no password to remember.
            </p>

            <form className={styles.form} onSubmit={submit}>
              <label className={styles.label} htmlFor="signin-email">
                Email
              </label>
              <input
                id="signin-email"
                className={styles.input}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <button type="submit" className={styles.primary} disabled={stage === 'sending'}>
                {stage === 'sending' ? 'Sending…' : 'Send me a link'}
              </button>
            </form>

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}

        <button
          type="button"
          className={styles.escape}
          onClick={() => chooseBackend('local')}
        >
          Use the library on this device instead
        </button>
      </div>
    </main>
  )
}
