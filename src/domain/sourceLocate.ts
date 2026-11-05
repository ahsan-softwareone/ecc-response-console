// Finds a cited passage in a page's real text. The outcome is reported honestly:
// exact only when the quote is found once (or a stored occurrence picks it); otherwise it says what happened.

export interface PageTextItem {
  str: string;
  /** Normalised to the page: 0..1 from the top-left, so highlights stay aligned at any zoom or size. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LocateStatus = 'exact' | 'approximate' | 'not-found' | 'no-text';

export interface LocateResult {
  status: LocateStatus;
  rects: NormRect[];
  matches: number;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function locateQuote(items: PageTextItem[], quote: string, occurrence?: number): LocateResult {
  const usable = items.filter((i) => i.str.trim());
  if (!usable.length) return { status: 'no-text', rects: [], matches: 0 };

  // One long string, with a map from each character back to its text item.
  let text = '';
  const owner: { item: number; offset: number }[] = [];
  usable.forEach((it, idx) => {
    const s = it.str.replace(/\s+/g, ' ');
    if (text && !text.endsWith(' ') && !s.startsWith(' ')) {
      text += ' ';
      owner.push({ item: -1, offset: 0 });
    }
    for (let i = 0; i < s.length; i++) {
      text += s[i];
      owner.push({ item: idx, offset: i });
    }
  });

  const find = (hay: string, needle: string) => {
    const out: number[] = [];
    let at = hay.indexOf(needle);
    while (at !== -1) {
      out.push(at);
      at = hay.indexOf(needle, at + 1);
    }
    return out;
  };

  const q = norm(quote);
  let hits = find(text, q);
  let exactCase = true;
  if (!hits.length) {
    hits = find(text.toLowerCase(), q.toLowerCase());
    exactCase = false;
  }
  if (!hits.length) return { status: 'not-found', rects: [], matches: 0 };

  const chosen = occurrence !== undefined ? hits[occurrence] : hits[0];
  if (chosen === undefined) return { status: 'not-found', rects: [], matches: hits.length };

  const spans = new Map<number, { from: number; to: number }>();
  for (let i = chosen; i < chosen + q.length; i++) {
    const o = owner[i];
    if (!o || o.item < 0) continue;
    const span = spans.get(o.item);
    if (span) span.to = o.offset + 1;
    else spans.set(o.item, { from: o.offset, to: o.offset + 1 });
  }
  const rects = [...spans.entries()].map(([idx, sp]) => {
    const it = usable[idx];
    const len = it.str.length || 1;
    return { x: it.x + (it.w * sp.from) / len, y: it.y, w: (it.w * (sp.to - sp.from)) / len, h: it.h };
  });
  const unambiguous = hits.length === 1 || occurrence !== undefined;
  return { status: unambiguous && exactCase ? 'exact' : 'approximate', rects, matches: hits.length };
}
