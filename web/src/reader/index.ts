/**
 * The single public entry point for the reader. Pages import from here; nothing
 * reaches past it into `blocks.tsx` or `navigation.ts`.
 */

export { Block, elementIdOf } from './blocks.tsx'
export type { FollowLink } from './blocks.tsx'

export { imagePathsOf, isDirectSrc, srcOf, useFigureImages } from './figures.ts'
export { fitWithin, pictureOf, MAX_EDGE, type Picture } from './figurePicture.ts'
export type { LoadAssets } from './figures.ts'

export { runsOf, lineRunsOf } from './linkRuns.ts'
export type { Run } from './linkRuns.ts'
export { Chrome } from './Chrome.tsx'
export type { BookmarkRow, ChromeProps, SheetTab } from './Chrome.tsx'

export { StatusLine } from './StatusLine.tsx'
export type { StatusLineProps } from './StatusLine.tsx'
export { PageDecks } from './PageDecks.tsx'
export type { PageDecksProps } from './PageDecks.tsx'
export { PageSpine } from './PageSpine.tsx'
export { RunningHead } from './RunningHead.tsx'
export type { RunningHeadProps } from './RunningHead.tsx'

export { bookmarkOn, inBookOrder, labelFor } from './bookmarks.ts'
export type { BookmarkLike } from './bookmarks.ts'

export { BookmarksPanel } from './BookmarksPanel.tsx'
export type { BookmarkColor, BookmarksPanelProps } from './BookmarksPanel.tsx'

export { ChapterOpening } from './ChapterOpening.tsx'
export type { ChapterOpeningProps } from './ChapterOpening.tsx'
export { chapterHeadingStyle, chapterNumber, subjectTags } from './chapterHeading.ts'
export type { ChapterHeadingStyle, ChapterNumber } from './chapterHeading.ts'

export { NoteComposer } from './NoteComposer.tsx'
export type { NoteComposerProps } from './NoteComposer.tsx'
export { DefinePanel } from './DefinePanel.tsx'
export type { DefinePanelProps } from './DefinePanel.tsx'

export { lookUpWord, wordFrom } from './defineWord.ts'
export { keepScreenAwake } from './wakeLock.ts'
export type { Lookup } from './defineWord.ts'

export type { DefineEntry, Etymology, EtymologyNode } from './dictionary.ts'

export { SelectionMenu } from './SelectionMenu.tsx'
export type { SelectionAction, SelectionMenuProps } from './SelectionMenu.tsx'
export { Highlights, canPaintHighlights } from './Highlights.tsx'
export type { HighlightLike, HighlightsProps } from './Highlights.tsx'
export { StudyLamp } from './StudyLamp.tsx'
export type { StudyLampProps } from './StudyLamp.tsx'
export { ModelSheet } from './ModelSheet.tsx'
export type { ModelSheetProps } from './ModelSheet.tsx'
export { Sheet } from './Sheet.tsx'
export type { SheetProps, SheetRow } from './Sheet.tsx'
export { EffortSheet } from './EffortSheet.tsx'
export type { EffortSheetProps } from './EffortSheet.tsx'
export {
  DEFAULT_EFFORT,
  EFFORTS,
  effortLabel,
  isEffort,
  rememberEffort,
  storedEffort,
} from './effort.ts'
export type { Effort } from './effort.ts'
export { ThreadMenu } from './ThreadMenu.tsx'
export type { ThreadMenuProps } from './ThreadMenu.tsx'
export { TutorMarks } from './TutorMarks.tsx'
export type { TutorMarksProps } from './TutorMarks.tsx'
export { askTutor, elide, INTENT_LABELS, passageKindOf } from './tutor.ts'
export { neighboursOf, passageContext, sentences } from './context.ts'
export type { PassageContext } from './context.ts'
export type {
  AskTutorReply,
  AskTutorRequest,
  PassageAnchor,
  PassageKind,
  TutorIntent,
  TutorMessage,
  TutorSource,
  TutorUsage,
} from './tutor.ts'
export {
  describeRange,
  selectAround,
  highlightAt,
  pivotFor,
  rangeOfQuote,
  rangeOfSelection,
  selectionBetween,
  selectionInReader,
  wordAt,
} from './selection.ts'
export type {
  ReaderSelection,
  SelectionEdge,
  SelectionGrain,
  SelectionPivot,
} from './selection.ts'

export { canGrow, unitAround, unitBeyond } from './units.ts'
export type { SelectionUnit, UnitSide } from './units.ts'

export {
  HIGHLIGHTER_CHOICES,
  HIGHLIGHT_COLOURS,
  colourOfKey,
  keyOfColour,
  readHighlighter,
  resolveHighlighter,
  seedOf,
  styleForTheme,
  writeHighlighter,
} from './highlightStyle.ts'
export type {
  ColourKey,
  HighlightColour,
  HighlighterChoice,
  HighlighterStyle,
  PaintedHighlight,
} from './highlightStyle.ts'

export { NotesPanel } from './NotesPanel.tsx'
export type { NoteRow, NotesPanelProps, WordRow } from './NotesPanel.tsx'

export { groupByChapter, inNoteOrder, NOTE_FILTERS, notesUnder } from './notes.ts'
export type { NoteFilter, NoteGroup, NoteLike } from './notes.ts'

export { MAX_HITS, MIN_QUERY, searchBook } from './search.ts'
export type { SearchHit, SearchOutcome } from './search.ts'

export { advanceBar, barLabel, showsPercent } from './bar.ts'
export type { BarState } from './bar.ts'

export { readFocusMode, writeFocusMode } from './focusMode.ts'
export { FocusLamp } from './FocusLamp.tsx'
export type { FocusLampProps } from './FocusLamp.tsx'
export { DIM_FROM, MAX_DIM, clampDim, dimAfterDrag, inDimZone } from './paperDim.ts'

export {
  DEFAULT_SETTINGS,
  MAX_TEXT_STEP,
  MIN_TEXT_STEP,
  TEXT_STEPS,
  applyStoredTheme,
  leadingOf,
  gutterOf,
  measureOf,
  readReaderSettings,
  textSizeOf,
  writeReaderSettings,
} from './readerSettings.ts'
export type { Margins, ReaderSettings, ReadingFont, Spacing, Theme } from './readerSettings.ts'

export { useBackDismiss } from './useBackDismiss.ts'

export { inEdgeBand, stepThrough, swipeOf } from './swipe.ts'
export type { Swipe, Touch } from './swipe.ts'

export { offsetOfPage, pageAt, pageCountOf, turn } from './columns.ts'
export type { Strip } from './columns.ts'

export { isFresh, placeOf } from './position.ts'
export type { Place } from './position.ts'

export {
  anchorAtPage,
  buildSpine,
  chapterAt,
  chapterPages,
  contentsOutline,
  hasWordCounts,
  pagesAt,
  pagesOf,
  paragraphStarts,
  progressLabel,
  progressOf,
  refAtPage,
  wordsAt,
  wordsAtPage,
} from './progress.ts'
export type { OutlineEntry, Pages, Progress, Spine, SpineEntry } from './progress.ts'

export {
  chapterTitle,
  firstSection,
  nextSection,
  pathOf,
  previousSection,
} from './navigation.ts'
export type { SectionCountLookup, SectionRef } from './navigation.ts'

export {
  beginDrag,
  cancelTurn,
  clearSheets,
  dropDrag,
  dropStill,
  holdOutgoing,
  holdStill,
  paintDrag,
  playFlip,
  settleDrag,
} from './pageTurn.ts'
export type { Drag, HeldPage } from './pageTurn.ts'

export { COMMIT_AT, curlProgress, FLICK } from './pageCurl.ts'

export {
  MOVE_EASING,
  MOVE_MS,
  MOVE_TIMING,
  easeMove,
  fadeIn,
  prefersReducedMotion,
  scrollStrip,
} from './motion.ts'
export type { Cancel } from './motion.ts'
