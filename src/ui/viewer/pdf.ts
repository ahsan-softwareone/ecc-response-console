// PDF.js loading, kept behind a dynamic import so the application stays light until a
// document is opened. Documents are fetched as bytes and checked before parsing, because the
// dev server answers a missing path with index.html rather than a 404.
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PageTextItem } from '../../domain/sourceLocate';

type PdfLib = typeof import('pdfjs-dist');

let lib: Promise<PdfLib> | undefined;

async function pdfjs(): Promise<PdfLib> {
  if (!lib) {
    lib = (async () => {
      const [mod, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
      mod.GlobalWorkerOptions.workerSrc = worker.default;
      return mod;
    })();
  }
  return lib;
}

export class PdfOpenError extends Error {
  constructor(
    message: string,
    public readonly reason: 'missing' | 'not-pdf' | 'unreadable',
  ) {
    super(message);
  }
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

/** Opens a document once per URL. A missing or non-PDF file fails with a plain reason. */
export function openPdf(url: string): Promise<PDFDocumentProxy> {
  let p = docs.get(url);
  if (!p) {
    p = (async () => {
      let res: Response;
      try {
        res = await fetch(url);
      } catch {
        throw new PdfOpenError('The file could not be fetched.', 'missing');
      }
      if (!res.ok) throw new PdfOpenError(`The server answered ${res.status}.`, 'missing');
      const bytes = new Uint8Array(await res.arrayBuffer());
      const head = new TextDecoder('latin1').decode(bytes.subarray(0, 5));
      if (head !== '%PDF-') throw new PdfOpenError('The file at this location is not a PDF.', 'not-pdf');
      const mod = await pdfjs();
      try {
        return await mod.getDocument({ data: bytes }).promise;
      } catch {
        throw new PdfOpenError('The PDF could not be parsed.', 'unreadable');
      }
    })();
    docs.set(url, p);
    p.catch(() => docs.delete(url));
  }
  return p;
}

const texts = new Map<string, Promise<PageTextItem[]>>();

/** Real text items of a page, normalised to 0..1 from the top-left, as sourceLocate expects. */
export function pageText(url: string, page: PDFPageProxy): Promise<PageTextItem[]> {
  const key = `${url}#${page.pageNumber}`;
  let p = texts.get(key);
  if (!p) {
    p = (async () => {
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PageTextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it)) continue;
        const [, , , h, x, y] = it.transform as number[];
        items.push({ str: it.str, x: x / vp.width, y: (vp.height - y - h) / vp.height, w: it.width / vp.width, h: h / vp.height });
      }
      return items;
    })();
    texts.set(key, p);
  }
  return p;
}
