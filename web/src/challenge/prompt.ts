/**
 * What Veda is told when she writes a question.
 *
 * ## Why this prompt lives here and not in `prompts/`
 *
 * The Librarian and the Scribe are golden: they came from outside this repo,
 * nobody may change a word, and a test enforces it. This one is ours. It was
 * written for this feature and it will be tuned as the distractors get better
 * or worse, so it sits in the app where it can be edited like code.
 *
 * ## Why question-writing is not folded into the Librarian
 *
 * Summarising is compression — say the chapter shorter and truer. Writing a
 * distractor is adversarial invention — build the wrong answer a careful reader
 * would actually reach for. Asked in one breath, a model does both worse: the
 * summary picks up a quizzy edge and the distractors turn into paraphrases of
 * the summary. They are also routed separately on purpose, so a reader can
 * spend a stronger model on questions than on recaps.
 */

/** One paragraph of the chapter, with the address the question must cite. */
export interface Passage {
  anchor: string
  text: string
}

export interface QuestionRequest {
  bookTitle: string
  author?: string
  chapter: number
  chapterTitle: string
  /** The concept names the Librarian already recorded for this chapter. */
  concepts: readonly string[]
  passages: readonly Passage[]
  /** How many items to ask for in this call. */
  count: number
  /**
   * The stems already written for this chapter, so a refill does not repeat
   * one. Sent as text rather than as ids: a model cannot avoid a question it
   * has never seen, and the id alone tells it nothing.
   */
  avoidStems?: readonly string[]
  /** The seams already covered, so a refill goes looking for new ones. */
  avoidConcepts?: readonly string[]
}

export const SYSTEM_PROMPT = `You write GRADUATE-SEMINAR multiple-choice questions on a book. You test
whether a reader can USE an idea — never whether they memorised a word.

Pitch every question at a graduate seminar. Assume the reader has read the
chapter closely and wants to be pushed. An undergraduate recall question is a
failure, however well written.

You are given the verbatim text of a chapter the reader has actually finished,
the concepts the chapter turns on, and the book's details.

Hard rules:
- Test a SEAM: the specific distinction a careful reader still confuses, not a
  broad subject. "anima-vs-shadow", not "archetypes".
- Exactly ONE correct option. Three distractors.
- Every distractor must be a NAMED, plausible misconception a well-read person
  could hold after finishing the chapter — never filler, never obviously silly.
  If a distractor can be eliminated without understanding the idea, rewrite it.
  Each carries a short misconceptionTag and a one-line revealNote saying why it
  is tempting but wrong. The correct option carries a revealNote saying why it
  reads true.
- Difficulty comes from REASONING, AMBIGUITY and DISCRIMINATION between close
  ideas — never from obscure vocabulary, and never from "according to page X"
  trivia.
- Reach for these forms: apply the idea to a case the book never mentions; ask
  which of two neighbouring ideas a situation actually turns on; ask what the
  argument would predict; ask which objection the chapter has already answered
  and which it has not; ask where the author's claim stops holding.
- Ground every question in the supplied passages. Do not make a claim the text
  does not support. Cite the anchor of the passage you used in sourceAnchor,
  copied exactly from the passage list.
- Prefer a short situational scenario when it sharpens the test; omit it when a
  direct stem is cleaner.
- Output STRICT JSON only. No prose, no markdown, no code fences.`

/** A blank line between passages, kept as a constant to survive editing. */
const SPLIT = '\n\n'

/** The shape asked for, sent with the material — never written into a prompt. */
const SCHEMA = `{
  "questions": [
    {
      "id": "string, unique within this batch",
      "concept": "kebab-case seam, e.g. anima-vs-shadow",
      "scenario": "string or null",
      "stem": "string",
      "options": [
        { "id": "a", "text": "string", "correct": true, "revealNote": "why this reads true" },
        { "id": "b", "text": "string", "correct": false, "misconceptionTag": "short name", "revealNote": "why it is tempting but wrong" },
        { "id": "c", "text": "string", "correct": false, "misconceptionTag": "short name", "revealNote": "..." },
        { "id": "d", "text": "string", "correct": false, "misconceptionTag": "short name", "revealNote": "..." }
      ],
      "difficulty": "1-3, your own ordering hint only. 1 is the gentlest way into this chapter, not an easy question.",
      "sourceAnchor": "an anchor copied exactly from the passages you were given"
    }
  ]
}`

/**
 * The chapter's prose, with the address each paragraph must be cited by.
 *
 * This is the material — the real text of the book, never a summary of it. A
 * question has to be grounded in what the author actually wrote, so this is
 * what Veda is given, and it is what `validate.ts` checks her citations
 * against.
 *
 * The anchors ride inline so the model can cite one without being asked to
 * invent an id. That is what makes the grounding check something a well-behaved
 * model passes rather than a trap.
 */
export function material(passages: readonly Passage[]): string {
  return passages
    .map((passage) => `[${passage.anchor}] ${passage.text}`)
    .join(SPLIT)
}

/**
 * Build the user message: the framing, the concepts, and the shape.
 *
 * The passages are NOT repeated here. They go once, as the material above.
 * Sending them in both places is how this started, and it paid for the
 * chapter twice on every call.
 */
export function userMessage(request: QuestionRequest): string {

  const concepts =
    request.concepts.length > 0
      ? request.concepts.join(', ')
      : '(none recorded — choose the seams yourself from the passages)'

  return [
    `BOOK: ${request.bookTitle}${request.author ? ` — ${request.author}` : ''}`,
    `CHAPTER ${request.chapter}: ${request.chapterTitle}`,
    ``,
    `CONCEPTS THIS CHAPTER TURNS ON: ${concepts}`,
    ``,
    // The passages are one slice of the chapter, not the whole of it. Saying so
    // stops the model writing a question about "the rest of the chapter" that
    // it has not been shown.
    `The passages you were given are an extract of this chapter, not all of it.`,
    `Write only what they support.`,
    ``,
    `WRITE ${request.count} QUESTION${request.count === 1 ? '' : 'S'}, each on a different seam.`,
    ``,
    `RETURN EXACTLY THIS SHAPE:`,
    SCHEMA,
    ``,
    `Cite one anchor per question, copied exactly from the passages you were given.`,
  ].join('\n')
}
