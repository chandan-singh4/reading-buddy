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
      "sourceAnchor": "an anchor copied exactly from the passages below"
    }
  ]
}`

/**
 * Build the user message: the material, the concepts, and the shape.
 *
 * The passages carry their anchors inline so the model can cite one without
 * being asked to invent an id. That is what makes the grounding check in
 * `validate.ts` something a well-behaved model passes rather than a trap.
 */
export function userMessage(request: QuestionRequest): string {
  const passages = request.passages
    .map((passage) => `[${passage.anchor}] ${passage.text}`)
    .join('\n\n')

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
    `WRITE ${request.count} QUESTION${request.count === 1 ? '' : 'S'}, each on a different seam.`,
    ``,
    `RETURN EXACTLY THIS SHAPE:`,
    SCHEMA,
    ``,
    `PASSAGES (cite one anchor per question, copied exactly):`,
    passages,
  ].join('\n')
}
