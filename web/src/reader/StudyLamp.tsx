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
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

import {
  arrange,
  arrangementOf,
  chosenFrom,
  loadModels,
  rememberArrangement,
  rememberPick,
  stepsFrom,
  storedArrangement,
  storedPick,
  type Column,
} from './models.ts'
import {
  askTutor,
  elide,
  INTENT_LABELS,
  modelLabel,
  type PassageAnchor,
  type TutorIntent,
  type TutorMessage,
  type TutorProgress,
  type TutorUsage,
} from './tutor.ts'
import type { PassageContext } from './context.ts'
import { ModelSheet } from './ModelSheet.tsx'
import { EffortSheet } from './EffortSheet.tsx'
import { Markdown, whileWriting } from './markdown.tsx'
import {
  DEFAULT_EFFORT,
  effortLabel,
  rememberEffort,
  storedEffort,
  type Effort,
} from './effort.ts'
import { useDictation } from './dictation.ts'
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
 * Every book gets all of them. An earlier design showed four and worked the
 * last three out from the kind of book — "What's happening here?" only on a
 * novel, "Still true?" only on a textbook. It was the wrong trade: guessing the
 * kind needed a column in the database and a row of controls on the book's own
 * page, and it was still a guess. A chip that does not suit the passage costs
 * the reader nothing; they simply do not tap it.
 *
 * Explaining comes first, because it is why the reader stopped reading. The
 * two explainers sit together, then the two that do something else with the
 * passage, then the three that suit a particular kind of book.
 *
 * The list is a scrolling column, not a row, so length is cheap here.
 */
const INTENTS: TutorIntent[] = [
  'simply',
  'friend',
  'discuss',
  'define',
  'happening',
  'stilltrue',
  'interpret',
]

/**
 * A microphone, drawn rather than typed. The 🎤 emoji is a different size, a
 * different colour and a different century in every font that has it.
 */
function MicGlyph() {
  return (
    <svg
      className={styles.micGlyph}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  )
}

/**
 * A globe. Drawn for the same reason the microphone is: 🌐 is a different size
 * and a different century in every font that has it.
 */
function GlobeGlyph() {
  return (
    <svg
      className={styles.micGlyph}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
    </svg>
  )
}

/**
 * Token counts, in the order they happen: what went in, what came back, the sum.
 *
 * Written in full words rather than as `1.2k`. This is a small honest number
 * under a message bar, not a dashboard, and rounding it would hide exactly the
 * thing a reader watching a budget wants to see.
 */
function spentLine(usage: TutorUsage): string {
  const count = (n: number) => n.toLocaleString()
  return `${count(usage.input)} in · ${count(usage.output)} out · ${count(usage.total)} total`
}

/**
 * Everything this conversation has cost so far.
 *
 * A sum rather than the last exchange. Each answer now carries its own count
 * beside its buttons, so the number under the bar is the one those add up to —
 * and a reader watching a budget is watching the total, not the last line.
 *
 * `undefined` when nothing reported a cost, which is not the same as zero: a
 * model that sends no usage must not be drawn as a free one.
 */
function totalUsage(messages: readonly TutorMessage[]): TutorUsage | undefined {
  const sum = { input: 0, output: 0, total: 0 }
  let any = false

  for (const message of messages) {
    if (!message.usage) continue
    any = true
    sum.input += message.usage.input
    sum.output += message.usage.output
    sum.total += message.usage.total
  }
  return any ? sum : undefined
}

export function StudyLamp({
  passage,
  context,
  saved,
  onSave,
  onClose,
}: StudyLampProps) {
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
  /*
   * The roster is held as columns rather than as a flat list, because the
   * columns are the reader's arrangement and the arrangement is the chain. A
   * flat list would have to be re-grouped on every render and every drag.
   */
  const [columns, setColumns] = useState<Column[]>([])
  const [pick, setPick] = useState<string | undefined>(undefined)

  /** Every model, for the times a flat list is what is wanted — a name lookup. */
  const models = useMemo(() => columns.flatMap((column) => column.models), [columns])
  /**
   * Which sheet is up, if either. A layer above the lamp, not in it.
   *
   * One value rather than two flags, because the two sheets are the same slot:
   * opening one has to close the other, and two booleans can both be true.
   */
  const [sheet, setSheet] = useState<'model' | 'effort' | null>(null)
  /**
   * How hard the model is asked to think.
   *
   * Starts at the highest setting for everyone. Every model on the roster is
   * free, so the thing usually traded away — money — is not being spent, and
   * the reader gets the best answer the model has by default. The control is
   * there to turn it *down*, and to matter later when a paid model is picked.
   */
  const [effort, setEffort] = useState<Effort>(() => storedEffort() ?? DEFAULT_EFFORT)
  /** Which answers have their working-out unfolded. Folded is the default. */
  const [shown, setShown] = useState<number[]>([])
  /**
   * Whether the next question goes to the web.
   *
   * Off by default, and off again the moment a question is sent. A search costs
   * real money on every engine OpenRouter offers, so it is a decision the
   * reader makes once per question — never a switch that quietly stays on
   * behind a conversation.
   */
  const [searching, setSearching] = useState(false)
  /** The last attempt's failure, if it failed. One at a time, never stored. */
  const [failure, setFailure] = useState<string | undefined>(undefined)
  /*
   * The answer being written, before it becomes a message.
   *
   * Kept out of `messages` on purpose. A half-written answer must not be
   * saved, must not be re-asked, and must not offer a copy button for words
   * that are still arriving — and every one of those follows for free from it
   * not being in the thread yet.
   */
  const [live, setLive] = useState<TutorProgress | undefined>(undefined)
  /** Which message just went to the clipboard, so the button can say so. */
  const [copied, setCopied] = useState<number | undefined>(undefined)
  /** Which chip started it — sent along with every later message. */
  const intent = useRef<TutorIntent | undefined>(undefined)

  const overlay = useRef<HTMLDivElement | null>(null)
  const flow = useRef<HTMLDivElement | null>(null)
  /* The answer to reveal from its first line once it is finished. See the
     layout effect below for why this is a ref and not state. */
  const reveal = useRef<number | undefined>(undefined)
  const input = useRef<HTMLInputElement | null>(null)
  /* What is in the box right now, for the recogniser — which starts once and
     must not be rebuilt every keystroke to see it. */
  const draftRef = useRef('')
  draftRef.current = draft

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
    // The overlay, not the input. Focusing the input raises the phone keyboard
    // the instant the lamp opens, which covers half the passage the reader came
    // to read — and they may only want to read the saved thread. The keyboard
    // now waits to be asked, by a tap on the box.
    overlay.current?.focus({ preventScroll: true })
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
        const laid = arrange(rows, storedArrangement())
        setColumns(laid)
        setPick(chosenFrom(laid, storedPick()))
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

  /*
   * Where the thread sits after something changes.
   *
   * Two rules, and the second is the interesting one.
   *
   * While an answer is arriving, the newest words stay in view. That is the
   * ordinary chat behaviour and it is what makes a stream feel live.
   *
   * When the answer finishes, the view jumps to **its first line** instead.
   * Following the words leaves the reader at the end of something they have
   * not read, and a long answer then has to be scrolled back by hand every
   * single time. The scroll is clamped by the browser, so a short answer that
   * cannot reach the top simply stays where it was — the jump only happens
   * when there is something to jump over.
   *
   * A layout effect, so the reader never sees the scroll happen — only the
   * result. A ref rather than state because this must fire once, on the render
   * that added the answer, and clear itself; as state it would re-scroll on
   * every later render and pin the reader in place.
   */
  useLayoutEffect(() => {
    const node = flow.current
    if (!node) return

    const ts = reveal.current
    if (ts !== undefined) {
      reveal.current = undefined
      const answer = node.querySelector(`[data-answer="${ts}"]`)
      if (answer) {
        // Measured rather than read off `offsetTop`, which is relative to
        // whichever ancestor happens to be positioned.
        node.scrollTop += answer.getBoundingClientRect().top - node.getBoundingClientRect().top
        return
      }
    }

    node.scrollTop = node.scrollHeight
  }, [messages, pending, live])

  /*
   * Speaking instead of typing.
   *
   * The words land in the same box the reader would have typed into, so a
   * dictated question can be corrected by hand before it is sent — which is
   * most of them, because a recogniser hears "Nietzsche" as "Nietzsche" about
   * half the time.
   */
  const dictation = useDictation({
    baseText: () => draftRef.current,
    onText: setDraft,
  })
  /* `send` must be able to end a run without listing the whole dictation in
     its dependencies — it is rebuilt on every keystroke otherwise. */
  const stopSaying = useRef(dictation.stop)
  stopSaying.current = dictation.stop

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
      // A question that has gone must not keep collecting words behind it.
      stopSaying.current()
      if (chip) intent.current = chip

      const yours: TutorMessage = { role: 'you', text: asked, ts: Date.now() }
      const history = base ?? messages
      setMessages([...history, yours])
      setDraft('')
      setFailure(undefined)
      setLive(undefined)
      setPending(true)
      // The globe is spent on this question. See the state above.
      setSearching(false)

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
        ...(columns.length > 0 ? { models: stepsFrom(columns, pick) } : {}),
        effort,
        ...(searching ? { search: true } : {}),
      },
        // Every delta, as it lands. `setLive` alone draws the answer growing;
        // nothing is saved and nothing joins the thread until it is finished.
        setLive,
      ).then((reply) => {
        setLive(undefined)
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
          ...(reply.reasoning ? { reasoning: reply.reasoning } : {}),
          ...(reply.usage ? { usage: reply.usage } : {}),
          ...(reply.sources ? { sources: reply.sources } : {}),
          ts: Date.now(),
        }
        const whole = [...history, yours, answer]
        // Read this one from its first line, not from wherever the writing
        // ended up. The layout effect above does it and clears itself.
        reveal.current = answer.ts
        setMessages(whole)
        setPending(false)
        // The first exchange pins the passage on its own: the thread has
        // begun, and the thread needs the room.
        if (history.length === 0) setCollapsed(true)
        onSave(whole)
      })
    },
    [messages, passage, context, pending, columns, pick, effort, searching, onSave],
  )

  /* The nearest question at or above a message. Retrying an answer means
     asking its question again. Threads saved before the explain-back check
     moved into the answer still hold a probe bubble after one. */
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
      tabIndex={-1}
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
            <div key={message.ts} data-answer={message.ts}>
              {/* Only when the message itself recorded a model. Threads saved
                  before stage B have none, and a caption naming today's model
                  over yesterday's words would be a plain lie. */}
              {message.model && (
                <p className={styles.byline}>
                  {models.find((row) => row.id === message.model)?.name ??
                    modelLabel(message.model)}
                </p>
              )}
              {/* The working-out, folded. Above the answer because that is the
                  order it happened in, and folded because it is the model
                  talking to itself — offered, never imposed. */}
              {message.reasoning && (
                <div className={styles.thought}>
                  <button
                    type="button"
                    className={styles.thoughtTop}
                    aria-expanded={shown.includes(message.ts)}
                    onClick={() =>
                      setShown((current) =>
                        current.includes(message.ts)
                          ? current.filter((ts) => ts !== message.ts)
                          : [...current, message.ts],
                      )
                    }
                  >
                    <span className={styles.thoughtChevron} aria-hidden="true">
                      {shown.includes(message.ts) ? '⌃' : '⌄'}
                    </span>
                    How it thought this through
                  </button>
                  {shown.includes(message.ts) && (
                    <Markdown className={styles.thoughtText} text={message.reasoning} />
                  )}
                </div>
              )}
              {/* Markdown, not raw text. The model writes `**like this**`
                  whether or not anyone asked, and the asterisks land exactly
                  where the emphasis was meant to be. Rendered at draw time, so
                  every answer already stored is redrawn too. */}
              <Markdown
                className={`${styles.slip} ${message.isProbe ? styles.probe : ''}`}
                text={message.text}
              />
              {/* Where the check came from. Printed rather than folded away:
                  "Still true?" tells the reader in so many words that it looked
                  something up, and a claim with a hidden source is worse than
                  one with none. */}
              {message.sources && message.sources.length > 0 && (
                <ul className={styles.sources}>
                  {message.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        className={styles.source}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {source.title ?? source.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
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
                {/* What this one exchange cost, beside the buttons that act on
                    it. The line under the bar adds these up; this says which
                    question the money went on, which the sum cannot. */}
                {message.usage && (
                  <span className={styles.exchange}>
                    <span className={styles.srOnly}>Tokens used for this answer: </span>
                    {spentLine(message.usage)}
                  </span>
                )}
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

        {/* The answer as it is written. The same furniture as a finished
            one — byline, folded thinking, markdown — and none of the actions,
            because there is nothing yet to copy or ask again. */}
        {live && (live.text || live.reasoning) && (
          <div>
            {live.model && (
              <p className={styles.byline}>
                {models.find((row) => row.id === live.model)?.name ?? modelLabel(live.model)}
              </p>
            )}
            {/* Only until the words start. A model may think for ten seconds
                before it writes anything, and watching the thinking arrive is
                the difference between a slow answer and a frozen app. */}
            {!live.text && live.reasoning && (
              <p className={styles.thinkingAloud}>{live.reasoning.slice(-160)}</p>
            )}
            {live.text && (
              <Markdown className={styles.slip} text={whileWriting(live.text)} />
            )}
          </div>
        )}

        {pending && !live?.text && !live?.reasoning && (
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
        {/* The three controls that decide how the answer is made — which model,
            how hard it thinks, and whether it may look things up — sit
            together. The microphone belongs to the message bar instead: it is
            about how the question is typed, not about how it is answered. */}
        <div className={styles.pickers}>
          {columns.length > 0 && (
            <>
          <button
            type="button"
            className={styles.picker}
            /* The name of the control *and* its current value. A button
               labelled only "Which model answers" reads out as a question with
               no answer, which is worse than a `<select>` was. */
            aria-label={`Which model answers: ${models.find((row) => row.id === pick)?.name ?? 'not chosen'}`}
            aria-haspopup="dialog"
            aria-expanded={sheet === 'model'}
            onClick={() => setSheet('model')}
          >
            {models.find((row) => row.id === pick)?.name ?? 'Choose a model'}
            <span className={styles.chevron} aria-hidden="true">
              ⌄
            </span>
          </button>
          <button
            type="button"
            className={`${styles.picker} ${styles.effort}`}
            aria-label={`How hard it thinks: ${effortLabel(effort)}`}
            aria-haspopup="dialog"
            aria-expanded={sheet === 'effort'}
            onClick={() => setSheet('effort')}
          >
            {effortLabel(effort)}
            <span className={styles.chevron} aria-hidden="true">
              ⌄
            </span>
          </button>
            </>
          )}
          {/* The globe. Lit blue while it is on, and on for one question only.
              `aria-pressed` is what makes it a switch rather than a button to a
              screen reader, which is exactly what it is. */}
          <button
            type="button"
            className={`${styles.picker} ${styles.globe} ${searching ? styles.searching : ''}`}
            aria-label={
              searching ? 'Web search is on for this question' : 'Search the web for this question'
            }
            aria-pressed={searching}
            onClick={() => setSearching((on) => !on)}
          >
            <GlobeGlyph />
          </button>
        </div>
        {dictation.supported && (
          <button
            type="button"
            className={`${styles.mic} ${dictation.listening ? styles.hearing : ''}`}
            aria-label={dictation.listening ? 'Stop dictating' : 'Ask out loud'}
            aria-pressed={dictation.listening}
            onClick={dictation.toggle}
          >
            <MicGlyph />
          </button>
        )}
        <input
          ref={input}
          className={styles.input}
          value={draft}
          placeholder={dictation.listening ? 'Listening…' : 'Ask into the quiet…'}
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

      {/* Under the bar, in the quietest type in the room. The whole
          conversation's cost, which is what the per-answer counts above add
          up to. */}
      {totalUsage(messages) && (
        <p className={styles.spent}>
          <span className={styles.srOnly}>Tokens used in this conversation: </span>
          {spentLine(totalUsage(messages)!)}
        </p>
      )}

      {sheet === 'model' && (
        <ModelSheet
          columns={columns}
          pick={pick}
          onPick={(id) => {
            setPick(id)
            rememberPick(id)
            setSheet(null)
          }}
          onArrange={(next) => {
            // Saved as it is dragged, not on closing. The sheet can be
            // dismissed by the scrim, by Escape and by the back gesture, and
            // an arrangement lost to one of those would look like the drag
            // never took.
            setColumns(next)
            rememberArrangement(arrangementOf(next))
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === 'effort' && (
        <EffortSheet
          pick={effort}
          paid={models.find((row) => row.id === pick)?.paid === true}
          onPick={(level) => {
            setEffort(level)
            rememberEffort(level)
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>,
    document.body,
  )
}
