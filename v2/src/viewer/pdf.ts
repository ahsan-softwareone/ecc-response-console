import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// pdf.js 5.x keeps a static page mapper shared by every open document, so only
// one document may be alive at a time: switching files destroys the previous one.
let current: { url: string; promise: Promise<PDFDocumentProxy> } | null = null;
export function loadDoc(url: string): Promise<PDFDocumentProxy> {
  if (current && current.url === url) return current.promise;
  const prev = current;
  const promise = (prev ? prev.promise.then((d) => d.destroy()).catch(() => undefined) : Promise.resolve()).then(() => pdfjs.getDocument({ url }).promise);
  current = { url, promise };
  return promise;
}

export interface Rect { left: number; top: number; width: number; height: number }

interface TextItem { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Find all occurrences of `quote` in the page's real text layer and return the
 * highlight rectangles (viewport pixels) for each occurrence. Partial items are
 * narrowed proportionally so a match that starts mid-line is not over-highlighted.
 */
export async function findQuote(page: PDFPageProxy, viewport: PageViewport, quote: string): Promise<Rect[][]> {
  const content = await page.getTextContent();
  const items = (content.items as TextItem[]).filter((i) => typeof i.str === 'string' && i.str.length > 0);
  // Build concatenated text with item offsets.
  let text = '';
  const spans: { start: number; end: number; item: TextItem }[] = [];
  for (const it of items) {
    const s = it.str.replace(/\s+/g, ' ');
    const start = text.length;
    text += s;
    spans.push({ start, end: text.length, item: it });
    if (it.hasEOL && !text.endsWith(' ')) text += ' ';
  }
  const hay = text.toLowerCase();
  const needle = norm(quote);
  if (!needle) return [];
  const matches: Rect[][] = [];
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    const end = idx + needle.length;
    const rects: Rect[] = [];
    for (const sp of spans) {
      if (sp.end <= idx || sp.start >= end) continue;
      const len = sp.end - sp.start;
      const f0 = Math.max(0, idx - sp.start) / len;
      const f1 = Math.min(len, end - sp.start) / len;
      const r = itemRect(sp.item, viewport);
      rects.push({ left: r.left + r.width * f0, top: r.top, width: r.width * (f1 - f0), height: r.height });
    }
    if (rects.length) matches.push(rects);
    idx = hay.indexOf(needle, idx + 1);
  }
  return matches;
}

function itemRect(item: TextItem, viewport: PageViewport): Rect {
  const tx = pdfjs.Util.transform(viewport.transform, item.transform);
  const fontH = Math.hypot(tx[2], tx[3]);
  const width = item.width * viewport.scale;
  return { left: tx[4], top: tx[5] - fontH * 0.92, width, height: fontH * 1.18 };
}
