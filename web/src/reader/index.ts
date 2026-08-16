/**
 * The single public entry point for the reader. Pages import from here; nothing
 * reaches past it into `blocks.tsx` or `navigation.ts`.
 */

export { Block, elementIdOf } from './blocks.tsx'
export type { FollowLink } from './blocks.tsx'

export { imagePathsOf, isDirectSrc, srcOf, useFigureImages } from './figures.ts'
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
export { SelectionMenu } from './SelectionMenu.tsx'
export type { SelectionAction, SelectionMenuProps } from './SelectionMenu.tsx'
export { Highlights, canPaintHighlights } from './Highlights.tsx'
export type { HighlightLike, HighlightsProps } from './Highlights.tsx'
export {
  HIGHLIGHT_COLOURS,
  describeRange,
  extendSelection,
  highlightAt,
  rangeOfQuote,
  selectionInReader,
} from './selection.ts'
export type { HighlightColour, ReaderSelection, SelectionEdge } from './selection.ts'

export { NotesPanel } from './NotesPanel.tsx'
export type { NoteRow, NotesPanelProps } from './NotesPanel.tsx'

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
