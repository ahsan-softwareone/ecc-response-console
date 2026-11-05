import { useMemo, useState } from 'react';

/**
 * Holds newly arrived list items behind a "N new" control so a list never moves under the reader.
 * The caller passes items newest first; whatever exists on first render is shown at once.
 */
export function useHeld<T extends { seq: number }>(items: T[]) {
  const [shownSeq, setShownSeq] = useState(() => Math.max(0, ...items.map((i) => i.seq)));
  const shown = useMemo(() => items.filter((i) => i.seq <= shownSeq), [items, shownSeq]);
  const heldCount = items.length - shown.length;
  const showAll = () => setShownSeq(Math.max(0, ...items.map((i) => i.seq)));
  return { shown, heldCount, showAll };
}
