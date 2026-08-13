/**
 * A book's full title, subtitle and all.
 *
 * The two are stored apart on purpose — see `BookMeta.subtitle` — so the one
 * place they get joined is here, and every screen that wants the long form gets
 * the same punctuation instead of inventing its own.
 *
 * Not used everywhere. Tiles and cards show the bare `title`, because a subtitle
 * on a thumbnail is three lines of ellipsis; the detail page and the opening
 * plate have room to say the whole thing.
 */
export function fullTitle(title: string, subtitle?: string): string {
  const sub = subtitle?.trim()
  if (!sub) return title

  const main = title.trim()
  // Already joined. Files and catalogues both hand back titles with the
  // subtitle baked in, and "Breath: The New Science: The New Science" is worse
  // than either half alone.
  if (main.toLowerCase().endsWith(sub.toLowerCase())) return main

  // A title that already ends in punctuation has said its piece. "Who Are You?:
  // A Guide" reads like a typo, so the separator is dropped rather than stacked.
  return /[:;,.!?—–-]$/.test(main) ? `${main} ${sub}` : `${main}: ${sub}`
}
