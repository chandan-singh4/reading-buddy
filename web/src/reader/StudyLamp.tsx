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
 *
 * ## A failure is not a turn
 *
 * When the tutor cannot be reached, the line saying so is held in component
 * state, never in `messages`. It therefore cannot stack — a second failed
 * attempt replaces the first rather than adding to it — it clears the moment
 * anything succeeds, it is never saved, and it is never replayed to the model
 * as one of its own previous turns. It is also drawn as a plain note rather
 * than as a slip, because it did not come from a model and must not wear a
 * model's clothes.
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
  chainFrom,
  chosenFrom,
  loadModels,
  rememberPick,
  storedPick,
  type TutorModel,
} from './models.ts'
import {
  askTutor,
  elide,
  INTENT_LABELS,
  modelLabel,
  type PassageAnchor,
  type TutorIntent,
  type TutorMessage,
} from './tutor.ts'
import type { PassageContext } from './context.ts'
import styles from './StudyLamp.module.css'

export interface StudyLampProps {
  passage: PassageAnchor
  /** Where the passage sits in the book. Sent with every question. */
  context?: PassageContext
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

export function StudyLamp({ passage, context, saved, onSave, onClose }: StudyLampProps) {
  const [messages, setMessages] = useState<TutorMessage[]>(saved ?? [])
  // A reopened thread starts pinned — the reader came back for the
  // conversation, and the passage is one tap away.
  const [collapsed, setCollapsed] = useState((saved?.length ?? 0) > 0)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState('')
  /*
   * The roster, and the reader's choice from it.
   *
   * Both start empty and may stay empty: the roster needs a network and a
   * signed-in reader, and neither is a condition the lamp refuses to open in.
   * With no roster the picker is not drawn and no model is sent, which is
   * exactly the stage-A behaviour — the relay chooses. So the picker is an
   * addition to the lamp, never a gate on it.
   */
  const [models, setModels] = useState<TutorModel[]>([])
  const [pick, setPick] = useState<string | undefined>(undefined)
  /** The last attempt's failure, if it failed. One at a time, never stored. */
  const [failure, setFailure] = useState<string | undefined>(undefined)
  /** Which message just went to the clipboard, so the button can say so. */
  const [copied, setCopied] = useState<number | undefined>(undefined)
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

  /* The roster, once the lamp is open. It is cached for the session, so
     reopening the lamp costs nothing. A failure is silent on purpose: the
     reader loses a dropdown, not the tutor. */
  useEffect(() => {
    let live = true
    void loadModels()
      .then((rows) => {
        if (!live) return
        setModels(rows)
        setPick(chosenFrom(rows, storedPick()))
      })
      .catch(() => {
        /* no roster, no picker */
      })
    return () => {
      live = false
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
    /**
     * `base` replaces the thread this question is asked against. A retry passes
     * everything up to the question being re-asked, which drops that question's
     * old answer and anything after it — the alternative is a thread that holds
     * two answers to the same question and no way to tell which one is live.
     */
    (text: string, chip?: TutorIntent, base?: TutorMessage[]) => {
      if (pending) return
      const asked = text.trim()
      if (!asked) return
      if (chip) intent.current = chip

      const yours: TutorMessage = { role: 'you', text: asked, ts: Date.now() }
      const history = base ?? messages
      setMessages([...history, yours])
      setDraft('')
      setFailure(undefined)
      setPending(true)

      void askTutor({
        anchor: passage,
        ...(context ? { context } : {}),
        mode: history.length === 0 ? 'fresh' : 'reopen',
        intent: intent.current,
        history,
        userMessage: asked,
        // The whole chain, not just the pick. If the reader's choice will not
        // answer, the next thing tried should be the strongest model on the
        // roster — not whatever fixed list the server happens to carry.
        ...(models.length > 0 ? { models: chainFrom(models, pick) } : {}),
      }).then((reply) => {
        if (reply.failed) {
          // The question stays — the reader can see what went unanswered and
          // retry it. The failure itself goes beside the thread, not into it.
          const kept = [...history, yours]
          setMessages(kept)
          setFailure(reply.text)
          setPending(false)
          if (history.length === 0) setCollapsed(true)
          onSave(kept)
          return
        }
        // `reply.model` is what answered, not what was asked for. On a failover
        // the two differ, and the label has to name the one that wrote the
        // words. A canned failure line carries no model and so draws no name.
        const answer: TutorMessage = {
          role: 'claude',
          text: reply.text,
          ...(reply.isProbe ? { isProbe: true } : {}),
          ...(reply.model ? { model: reply.model } : {}),
          ts: Date.now(),
        }
        // The check that the explanation landed is a *second* bubble, not a
        // paragraph tacked onto the first. It is a different kind of thing —
        // the tutor asking rather than telling — and the room already draws
        // those differently.
        const check: TutorMessage[] = reply.probe
          ? [
              {
                role: 'claude',
                text: reply.probe,
                isProbe: true,
                ...(reply.probeModel ? { model: reply.probeModel } : {}),
                ts: Date.now() + 1,
              },
            ]
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
    [messages, passage, context, pending, models, pick, onSave],
  )

  /* The nearest question at or above a message. Retrying an answer means
     asking its question again, and an answer may be followed by a probe. */
  const questionAt = useCallback(
    (index: number): number => {
      for (let at = index; at >= 0; at -= 1) if (messages[at]?.role === 'you') return at
      return -1
    },
    [messages],
  )

  const retry = useCallback(
    (index: number) => {
      const at = questionAt(index)
      if (at < 0) return
      send(messages[at]!.text, undefined, messages.slice(0, at))
    },
    [messages, questionAt, send],
  )

  /* Edit puts the words back in the composer and rewinds the thread to just
     before them. It does not send — the reader is editing, so they decide when
     it is ready. */
  const edit = useCallback(
    (index: number) => {
      setMessages(messages.slice(0, index))
      setFailure(undefined)
      setDraft(messages[index]?.text ?? '')
      input.current?.focus()
    },
    [messages],
  )

  const copy = useCallback((message: TutorMessage) => {
    void navigator.clipboard
      ?.writeText(message.text)
      .then(() => {
        setCopied(message.ts)
        setTimeout(() => setCopied(undefined), 1400)
      })
      .catch(() => {
        /* No clipboard permission. Nothing to say about it. */
      })
  }, [])

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

        {messages.map((message, index) =>
          message.role === 'you' ? (
            <div key={message.ts}>
              <p className={styles.you}>{message.text}</p>
              <div className={`${styles.actions} ${styles.actionsYou}`}>
                <button
                  type="button"
                  className={styles.action}
                  aria-label="Copy your question"
                  onClick={() => copy(message)}
                >
                  {copied === message.ts ? <span className={styles.copied}>Copied</span> : '⧉'}
                </button>
                <button
                  type="button"
                  className={styles.action}
                  aria-label="Edit your question"
                  disabled={pending}
                  onClick={() => edit(index)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className={styles.action}
                  aria-label="Ask this again"
                  disabled={pending}
                  onClick={() => retry(index)}
                >
                  ↻
                </button>
              </div>
            </div>
          ) : (
            <div key={message.ts}>
              {/* Only when the message itself recorded a model. Threads saved
                  before stage B have none, and a caption naming today's model
                  over yesterday's words would be a plain lie. */}
              {message.model && (
                <p className={styles.byline}>
                  {models.find((row) => row.id === message.model)?.name ??
                    modelLabel(message.model)}
                </p>
              )}
              <div className={`${styles.slip} ${message.isProbe ? styles.probe : ''}`}>
                {message.text}
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.action}
                  aria-label="Copy this answer"
                  onClick={() => copy(message)}
                >
                  {copied === message.ts ? <span className={styles.copied}>Copied</span> : '⧉'}
                </button>
                <button
                  type="button"
                  className={styles.action}
                  aria-label="Answer this again"
                  disabled={pending}
                  onClick={() => retry(index)}
                >
                  ↻
                </button>
              </div>
            </div>
          ),
        )}

        {/* Beside the thread, never in it. One at a time, and gone the moment
            an answer arrives. */}
        {failure && !pending && (
          <p className={styles.failure} role="status">
            {failure}{' '}
            <button
              type="button"
              className={styles.failureRetry}
              onClick={() => retry(messages.length - 1)}
            >
              Try again
            </button>
          </p>
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
        {models.length > 0 && (
          <select
            className={styles.picker}
            aria-label="Which model answers"
            value={pick ?? ''}
            onChange={(event) => {
              setPick(event.target.value)
              rememberPick(event.target.value)
            }}
          >
            {models.map((row) => (
              <option key={row.id} value={row.id}>
                {row.paid ? `${row.name} · paid` : row.name}
              </option>
            ))}
          </select>
        )}
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
