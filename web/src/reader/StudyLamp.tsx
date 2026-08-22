/**
 * The study lamp — a conversation with the tutor about one passage.
 *
 * A full-screen overlay, and always dark, whatever theme the book is wearing.
 * That is the design's one non-negotiable: closing the book's light and
 * pulling a passage under a lamp is what tells the reader they have left the
 * page and entered a conversation. The palette is therefore hard-coded in the
 * module CSS rather than drawn from theme tokens.
 *
 * ## The anchor has three states
 *
 * The passage sits at the top. A sentence is shown whole, centred, relit in
 * Cormorant Garamond. A paragraph is shown fading into shadow — a mask, not a
 * cut, so it visibly *continues* rather than ends. Both carry `▴ TAP TO PIN`,
 * which collapses them to a one-line bar (first three words … last four) so
 * the thread gets the room. The lamp collapses it itself after the first
 * exchange: once the conversation exists, the conversation is the point.
 *
 * ## Two ways in
 *
 * Fresh — no saved thread — shows four entry chips and the composer. Reopened
 * — from the ink mark or the slip on the page — shows the collapsed bar and
 * the saved thread, scrolled to its end.
 *
 * The lamp owns the conversation while it is open and reports every completed
 * exchange upward through `onSave`; the Reader persists and repaints. It never
 * touches storage itself, so a scratch test can mount it dry.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

import {
  askTutor,
  elide,
  INTENT_LABELS,
  type PassageAnchor,
  type TutorIntent,
  type TutorMessage,
} from './tutor.ts'
import styles from './StudyLamp.module.css'

export interface StudyLampProps {
  passage: PassageAnchor
  /** The saved conversation, when the lamp is reopening one. */
  saved?: TutorMessage[]
  /** Every completed exchange, whole. The Reader persists it. */
  onSave: (messages: TutorMessage[]) => void
  onClose: () => void
}

/**
 * The chips, in the order they are offered.
 *
 * Explaining comes first because it is why the reader stopped reading. The two
 * explainers sit together, then the two that do something else with the
 * passage. Four genre-conditional chips join this row in stage C.
 */
const INTENTS: TutorIntent[] = ['simply', 'friend', 'discuss', 'define']

export function StudyLamp({ passage, saved, onSave, onClose }: StudyLampProps) {
  const [messages, setMessages] = useState<TutorMessage[]>(saved ?? [])
  // A reopened thread starts pinned — the reader came back for the
  // conversation, and the passage is one tap away.
  const [collapsed, setCollapsed] = useState((saved?.length ?? 0) > 0)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState('')
  /** Which chip started it — sent along with every later message. */
  const intent = useRef<TutorIntent | undefined>(undefined)

  const overlay = useRef<HTMLDivElement | null>(null)
  const flow = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)

  const fresh = messages.length === 0

  /*
   * Focus management, the modal contract: focus moves in, Tab cycles inside,
   * Escape closes, and focus goes back where it came from. The element that
   * had it is read once on mount — by close time the selection menu that
   * launched the lamp is long gone, so `document.body` is the usual honest
   * answer and focusing it is harmless.
   */
  useEffect(() => {
    const before = document.activeElement
    input.current?.focus({ preventScroll: true })
    return () => {
      if (before instanceof HTMLElement) before.focus({ preventScroll: true })
    }
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = overlay.current?.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  /* The newest words, always in view. Layout effect so the reader never sees
     the scroll happen. */
  useLayoutEffect(() => {
    const node = flow.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, pending])

  const send = useCallback(
    (text: string, chip?: TutorIntent) => {
      if (pending) return
      const asked = text.trim()
      if (!asked) return
      if (chip) intent.current = chip

      const yours: TutorMessage = { role: 'you', text: asked, ts: Date.now() }
      const history = messages
      setMessages([...history, yours])
      setDraft('')
      setPending(true)

      void askTutor({
        anchor: passage,
        mode: history.length === 0 ? 'fresh' : 'reopen',
        intent: intent.current,
        history,
        userMessage: asked,
      }).then((reply) => {
        const answer: TutorMessage = {
          role: 'claude',
          text: reply.text,
          ...(reply.isProbe ? { isProbe: true } : {}),
          ts: Date.now(),
        }
        // The check that the explanation landed is a *second* bubble, not a
        // paragraph tacked onto the first. It is a different kind of thing —
        // the tutor asking rather than telling — and the room already draws
        // those differently.
        const check: TutorMessage[] = reply.probe
          ? [{ role: 'claude', text: reply.probe, isProbe: true, ts: Date.now() + 1 }]
          : []
        const whole = [...history, yours, answer, ...check]
        setMessages(whole)
        setPending(false)
        // The first exchange pins the passage on its own: the thread has
        // begun, and the thread needs the room.
        if (history.length === 0) setCollapsed(true)
        onSave(whole)
      })
    },
    [messages, passage, pending, onSave],
  )

  const bar = passage.kind === 'sentence' && passage.excerpt.length <= 40
    ? passage.excerpt
    : elide(passage.excerpt)

  return createPortal(
    <div
      ref={overlay}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Ask Claude about this passage"
      onKeyDown={onKeyDown}
    >
      <div className={`${styles.glow} ${collapsed ? styles.glowDim : ''}`} aria-hidden="true" />

      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
        ×
      </button>

      <div className={styles.anchor}>
        {collapsed ? (
          <button
            type="button"
            className={styles.anchorBar}
            aria-expanded={false}
            aria-label="Show the passage"
            onClick={() => setCollapsed(false)}
          >
            <span className={styles.anchorMark} aria-hidden="true">
              ✦
            </span>
            <span className={styles.anchorBarText}>{bar}</span>
            <span className={styles.anchorChevron} aria-hidden="true">
              ▾
            </span>
          </button>
        ) : (
          <>
            {passage.kind === 'sentence' ? (
              <blockquote className={styles.passageSentence}>“{passage.excerpt}”</blockquote>
            ) : (
              <blockquote className={styles.passageParagraph}>{passage.excerpt}</blockquote>
            )}
            <button
              type="button"
              className={styles.pin}
              aria-expanded={true}
              aria-label="Pin the passage out of the way"
              onClick={() => setCollapsed(true)}
            >
              ▴ TAP TO PIN
            </button>
          </>
        )}
      </div>

      <div className={styles.divider} aria-hidden="true" />

      <div ref={flow} className={styles.flow} aria-live="polite">
        {fresh && (
          <div className={styles.options}>
            {INTENTS.map((chip) => (
              <button
                key={chip}
                type="button"
                className={styles.option}
                disabled={pending}
                onClick={() => send(INTENT_LABELS[chip], chip)}
              >
                {INTENT_LABELS[chip]}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) =>
          message.role === 'you' ? (
            <p key={message.ts} className={styles.you}>
              {message.text}
            </p>
          ) : (
            <div
              key={message.ts}
              className={`${styles.slip} ${message.isProbe ? styles.probe : ''}`}
            >
              {message.text}
            </div>
          ),
        )}

        {pending && (
          <div className={styles.slip} aria-label="Claude is thinking">
            <span className={styles.thinking} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        <input
          ref={input}
          className={styles.input}
          value={draft}
          placeholder="Ask into the quiet…"
          aria-label="Ask about this passage"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          className={styles.send}
          aria-label="Send"
          disabled={pending || draft.trim().length === 0}
        >
          ↑
        </button>
      </form>
    </div>,
    document.body,
  )
}
