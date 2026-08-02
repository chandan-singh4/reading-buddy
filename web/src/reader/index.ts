/**
 * The single public entry point for the reader. Pages import from here; nothing
 * reaches past it into `blocks.tsx` or `navigation.ts`.
 */

export { Block, elementIdOf } from './blocks.tsx'
export type { FollowLink } from './blocks.tsx'

export { runsOf, lineRunsOf } from './linkRuns.ts'
export type { Run } from './linkRuns.ts'
export { Chrome } from './Chrome.tsx'
export type { ChromeProps, SheetTab } from './Chrome.tsx'

export { advanceBar, barLabel, showsPercent } from './bar.ts'
export type { BarState } from './bar.ts'

export { readFocusMode, writeFocusMode } from './focusMode.ts'

export { useBackDismiss } from './useBackDismiss.ts'

export { stepThrough, swipeOf } from './swipe.ts'
export type { Swipe, Touch } from './swipe.ts'

export { offsetOfPage, pageAt, pageCountOf, turn } from './columns.ts'
export type { Strip } from './columns.ts'

export { isFresh, placeOf } from './position.ts'
export type { Place } from './position.ts'

export {
  anchorAtPage,
  buildSpine,
  chapterAt,
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
export type { Pages, Progress, Spine, SpineEntry } from './progress.ts'

export {
  chapterTitle,
  firstSection,
  nextSection,
  pathOf,
  previousSection,
} from './navigation.ts'
export type { SectionCountLookup, SectionRef } from './navigation.ts'
