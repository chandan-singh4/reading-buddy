/**
 * The reading streak, told to the top bar.
 *
 * The bar lives in `AppShell`, which is an *ancestor* of every screen, so Home
 * cannot render into it and the bar cannot reach into Home. The streak is a
 * number Home already has — it reads the sessions for the two-hour ring — so
 * the door publishes it here and the bar subscribes. One reader of the session
 * table, one number, no second copy to disagree with the first.
 *
 * A module-level store rather than a context, for the same reason
 * `shelfMemory.ts` and `libraryMemory.ts` are: the value has to outlive a
 * component and cross a tree boundary. Tests clear it with `forgetStreak()`.
 */

import { useSyncExternalStore } from "react";

let streak: number | null = null;
const listeners = new Set<() => void>();

/** What the front door found. `null` means "say nothing". */
export function publishStreak(next: number | null): void {
  if (next === streak) return;
  streak = next;
  for (const listen of listeners) listen();
}

export function forgetStreak(): void {
  publishStreak(null);
}

function subscribe(listen: () => void): () => void {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
}

function read(): number | null {
  return streak;
}

/** The run of days, or `null` while there is nothing to report. */
export function useStreak(): number | null {
  return useSyncExternalStore(subscribe, read, read);
}
