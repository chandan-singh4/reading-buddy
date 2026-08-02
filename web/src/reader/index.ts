/**
 * The single public entry point for the reader. Pages import from here; nothing
 * reaches past it into `blocks.tsx` or `navigation.ts`.
 */

export { Block, elementIdOf } from './blocks.tsx'

export {
  chapterTitle,
  firstSection,
  nextSection,
  pathOf,
  previousSection,
} from './navigation.ts'
export type { SectionCountLookup, SectionRef } from './navigation.ts'
