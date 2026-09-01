/**
 * One question, from the first tap to the verdict.
 *
 * The order of the controls is the design. The reader picks an option, and only
 * *then* is asked how sure they are — asking first would let the confidence
 * colour the choice, and asking after the answer is graded would let the result
 * colour the confidence. Between the two is the only honest moment.
 *
 * Nothing is submitted until both are set. The submit button stays disabled
 * rather than hidden, so the reader can see there is one more thing to do.
 */

import { useState } from 'react'

import { askTutor, type TutorMessage } from '../reader/tutor.ts'
import { missStore } from '../storage/challenge.ts'
import type { Anchor, BookId } from '../structure/index.ts'
import { heldFirmly, CONFIDENCE, type Confidence, type Question } from '../challenge/types.ts'
import styles from './challenge.module.css'

const FACE: Record<Confidence, string> = {
  guessing: '😕',
  somewhat: '🤔',
  confident: '🙂',
  very: '😎',
}

const WORD: Record<Confidence, string> = {
  guessing: 'Guessing',
  somewhat: 'Somewhat',
  confident: 'Confident',
  very: 'Very',
}

const KEYS = ['A', 'B', 'C', 'D']

export interface SittingProps {
  question: Question
  bookId: BookId
  bookTitle: string
  chapter: number
  chapterTitle: string
  onNext: () => void
}

export function Sitting({
  question,
  bookId,
  bookTitle,
  chapter,
  chapterTitle,
  onNext,
}: SittingProps) {
  const [picked, setPicked] = useState<number | undefined>()
  const [confidence, setConfidence] = useState<Confidence | undefined>()
  const [locked, setLocked] = useState(false)
  const [discussing, setDiscussing] = useState(false)

  const correctIndex = question.options.findIndex((option) => option.correct)
  const right = locked && picked === correctIndex
  const firm = confidence !== undefined && heldFirmly(confidence)

  const submit = () => {
    if (picked === undefined || confidence === undefined) return
    setLocked(true)
    /*
     * The ledger is written once, here, keyed by concept rather than by
     * question. A correct answer clears the flag; a confident-wrong sets it.
     * Nothing about this ever feeds back into generation — correctness and
     * confidence stay on the device and drive resurfacing only.
     */
    void missStore.record(question.concept, bookId, picked === correctIndex, confidence)
  }

  return (
    <div className={styles.card}>
      {question.scenario && <div className={styles.scenario}>{question.scenario}</div>}
      <h1 className={styles.stem}>{question.stem}</h1>

      <div role="radiogroup" aria-label="Answers">
        {question.options.map((option, index) => {
          const isCorrect = locked && index === correctIndex
          const isChosenWrong = locked && index === picked && index !== correctIndex
          const showSlip = locked && (index === picked || index === correctIndex)

          return (
            <div key={option.id}>
              <button
                type="button"
                role="radio"
                aria-checked={picked === index}
                disabled={locked}
                className={[
                  styles.opt,
                  picked === index && !locked ? styles.optPicked : '',
                  isCorrect ? styles.optCorrect : '',
                  isChosenWrong ? styles.optWrong : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => !locked && setPicked(index)}
              >
                <span className={styles.optKey} aria-hidden="true">
                  {KEYS[index]}
                </span>
                <span className={styles.optText}>{option.text}</span>
                {isCorrect && (
                  <span className={styles.mark} aria-label="Correct">
                    ✓
                  </span>
                )}
                {isChosenWrong && (
                  <span className={styles.markWrong} aria-label="Your answer, wrong">
                    ✗
                  </span>
                )}
              </button>

              {/* Both slips, always: the one the reader chose and the one that
                  was right. Showing only the correct note leaves a reader who
                  picked B with no account of why B pulled them. */}
              {showSlip && (
                <div className={styles.slip}>
                  <div className={styles.slipTag}>
                    {option.misconceptionTag ?? 'Why this reads true'}
                  </div>
                  <p className={styles.slipNote}>{option.revealNote}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {picked !== undefined && !locked && (
        <div className={styles.conf}>
          <div className={styles.confLabel}>How sure are you?</div>
          <div className={styles.confRow}>
            {CONFIDENCE.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={confidence === level}
                className={`${styles.confTap} ${confidence === level ? styles.confOn : ''}`}
                onClick={() => setConfidence(level)}
              >
                <span className={styles.confFace} aria-hidden="true">
                  {FACE[level]}
                </span>
                <span className={styles.confWord}>{WORD[level]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!locked && (
        <button
          type="button"
          className={styles.submit}
          disabled={picked === undefined || confidence === undefined}
          onClick={submit}
        >
          Submit answer
        </button>
      )}

      {locked && (
        <>
          <Verdict right={right} firm={firm} />

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.discuss}
              disabled={discussing}
              onClick={() => setDiscussing(true)}
            >
              <span className={styles.discussOrb} aria-hidden="true" />
              Discuss with Veda
            </button>
            {/* Always "Next question". There is no last card — the bank
                grows on demand, and a button that said "Finish" would be
                promising an end the examination does not have. */}
            <button type="button" className={styles.next} onClick={onNext}>
              Next question
            </button>
          </div>

          {discussing && picked !== undefined && (
            <Thread
              question={question}
              picked={picked}
              bookTitle={bookTitle}
              chapter={chapter}
              chapterTitle={chapterTitle}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * The three verdicts, and they are three because a miss is not one thing.
 *
 * A confident-wrong is the most useful signal the examination ever gets, and it
 * is told to the reader that way — as a finding, not a failure. An unsure-wrong
 * is explicitly normalised. Neither is scored.
 */
function Verdict({ right, firm }: { right: boolean; firm: boolean }) {
  if (right) {
    return (
      <div className={`${styles.verdict} ${styles.verdictGood}`} role="status">
        <div className={styles.verdictHead}>That holds.</div>
        <p className={styles.verdictNote}>
          {firm
            ? 'Solid, well-anchored understanding.'
            : 'Correct — but you were not sure. Worth a lighter re-touch later.'}
        </p>
      </div>
    )
  }
  if (firm) {
    return (
      <div className={`${styles.verdict} ${styles.verdictFlag}`} role="status">
        <div className={styles.verdictHead}>Flagged: possible misconception</div>
        <p className={styles.verdictNote}>
          You were <b>confident and wrong</b> — the most useful signal there is. This idea comes
          back in a later sitting, as a new question.
        </p>
      </div>
    )
  }
  return (
    <div className={`${styles.verdict} ${styles.verdictMiss}`} role="status">
      <div className={styles.verdictHead}>Not quite — and that is fine.</div>
      <p className={styles.verdictNote}>
        A normal learning gap. The wrong pulls are named on purpose.
      </p>
    </div>
  )
}

interface Turn {
  who: 'veda' | 'me'
  text: string
  model?: string
}

/**
 * The conversation after the verdict.
 *
 * An ordinary stateless tutor call, seeded with what just happened: the
 * passage's anchor, the question, what the reader picked, what was right, and
 * both reveal notes. The engine holds no memory, so every turn re-sends the
 * whole thread — that is the app's existing pattern and this does not depart
 * from it.
 *
 * Each of Veda's bubbles carries the model that actually wrote it, read off the
 * reply rather than assumed from the request. During a failover those differ,
 * which is exactly when the label matters.
 */
function Thread({
  question,
  picked,
  bookTitle,
  chapter,
  chapterTitle,
}: {
  question: Question
  picked: number
  bookTitle: string
  chapter: number
  chapterTitle: string
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)

  const correct = question.options.find((option) => option.correct)
  const chose = question.options[picked]

  const seed = [
    `The reader has just answered a comprehension question about ${bookTitle}, chapter ${chapter}${chapterTitle ? ` (${chapterTitle})` : ''}.`,
    ``,
    `CONCEPT UNDER TEST: ${question.concept}`,
    question.scenario ? `SCENARIO: ${question.scenario}` : '',
    `QUESTION: ${question.stem}`,
    ``,
    `OPTIONS:`,
    ...question.options.map(
      (option, index) =>
        `${KEYS[index]}. ${option.text}${option.correct ? '  [correct]' : ''}${
          option.misconceptionTag ? `  [misconception: ${option.misconceptionTag}]` : ''
        }\n   note: ${option.revealNote}`,
    ),
    ``,
    `THEY PICKED: ${KEYS[picked]} — ${chose?.text ?? ''}`,
    `THE ANSWER WAS: ${correct?.text ?? ''}`,
  ]
    .filter(Boolean)
    .join('\n')

  const send = async (text: string) => {
    setThinking(true)
    const history: TutorMessage[] = turns.map((turn) => ({
      role: turn.who === 'me' ? 'you' : 'claude',
      text: turn.text,
      ts: Date.now(),
    }))
    try {
      const reply = await askTutor({
        /*
         * The seed rides as the excerpt, which is what the relay puts in front
         * of the model as the material. That is the whole context module the
         * spec asks for: the passage's address, the question, both reveal
         * notes, what the reader picked and what was right.
         */
        anchor: {
          anchor: question.sourceAnchor as Anchor,
          excerpt: seed,
          kind: 'paragraph',
        },
        mode: turns.length === 0 ? 'fresh' : 'reopen',
        history,
        userMessage: text,
      })
      setTurns((previous) => [
        ...previous,
        { who: 'veda', text: reply.text, model: reply.model },
      ])
    } finally {
      setThinking(false)
    }
  }

  const opening = 'Talk me through why I picked what I picked.'

  return (
    <div className={styles.thread}>
      <div className={styles.threadHead}>
        <span className={styles.discussOrb} aria-hidden="true" />
        <b>Veda</b>
      </div>

      <div className={styles.msgs}>
        {turns.length === 0 && !thinking && (
          <button type="button" className={styles.opener} onClick={() => void send(opening)}>
            {opening}
          </button>
        )}
        {turns.map((turn, index) => (
          <div
            key={index}
            className={turn.who === 'veda' ? styles.bubbleVeda : styles.bubbleMe}
          >
            {turn.who === 'veda' && turn.model && (
              <span className={styles.model}>{turn.model}</span>
            )}
            {turn.text}
          </div>
        ))}
        {thinking && <div className={styles.bubbleVeda}>…</div>}
      </div>

      <form
        className={styles.compose}
        onSubmit={(event) => {
          event.preventDefault()
          const text = draft.trim()
          if (!text || thinking) return
          setDraft('')
          setTurns((previous) => [...previous, { who: 'me', text }])
          void send(text)
        }}
      >
        <input
          className={styles.composeInput}
          value={draft}
          placeholder="Ask Veda…"
          aria-label="Ask Veda"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className={styles.composeSend} disabled={thinking}>
          Send
        </button>
      </form>
    </div>
  )
}
