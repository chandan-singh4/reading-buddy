/**
 * The single public entry point for the reader. Pages import from here; nothing
 * reaches past it into `blocks.tsx` or `navigation.ts`.
 */

export { Block, elementIdOf } from './blocks.tsx'
export { Chrome } from './Chrome.tsx'
export type { ChromeProps } from './Chrome.tsx'

export { readFocusMode, writeFocusMode } from './focusMode.ts'

export { chapterAt, progressLabel, progressOf } from './progress.ts'
export type { Progress } from './progress.ts'

export {
  chapterTitle,
  firstSection,
  nextSection,
  pathOf,
  previousSection,
} from './navigation.ts'
export type { SectionCountLookup, SectionRef } from './navigation.ts'
