// Real ingestion: the original file is stored as-is; PDFs are parsed by pdf.js page
// by page. States are reported honestly (scanned, unsupported, failed).
import { extractText } from '../viewer/pdf';
import type { KnowledgeDoc } from '../data/types';

export type DeclaredStatus = 'not-established' | 'declared-effective' | 'declared-draft' | 'declared-superseded';

export interface Extraction { state: 'extracted' | 'scanned' | 'unsupported' | 'failed'; reason?: string; pages: number; chars: number }

export interface UploadedDoc {
  id: string;
  title: string;
  site: string;
  equipment: string[];
  type: KnowledgeDoc['type'];
  number: string;
  revision: string;
  declaredStatus: DeclaredStatus;
  /** Existing document (fixture or upload) this is a new revision of. */
  revisionOf?: string;
  fileName: string;
  mime: string;
  size: number;
  storedAt: number;
  by: string;
  extraction: Extraction;
  indexReady: boolean;
  previewable: boolean;
}

const urls = new Map<string, string>();
/** Object URL for a stored original (created once per session). */
export function objectUrlFor(id: string, blob: Blob): string {
  let u = urls.get(id);
  if (!u) { u = URL.createObjectURL(blob); urls.set(id, u); }
  return u;
}

export async function analyse(file: File): Promise<{ extraction: Extraction; pages: string[]; previewable: boolean; url?: string }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return { extraction: { state: 'unsupported', reason: `${file.type || 'unknown type'} is not supported for preview or extraction`, pages: 0, chars: 0 }, pages: [], previewable: false };
  const url = URL.createObjectURL(file);
  try {
    const pages = await extractText(url);
    const chars = pages.reduce((n, p) => n + p.length, 0);
    if (chars < 20) return { extraction: { state: 'scanned', reason: 'No text layer found; OCR is not available in this prototype', pages: pages.length, chars }, pages, previewable: true, url };
    return { extraction: { state: 'extracted', pages: pages.length, chars }, pages, previewable: true, url };
  } catch (e) {
    URL.revokeObjectURL(url);
    const msg = e instanceof Error ? e.message : String(e);
    return { extraction: { state: 'failed', reason: msg.replace(/^.*?:\s*/, '') || 'could not be parsed as a PDF', pages: 0, chars: 0 }, pages: [], previewable: false };
  }
}
