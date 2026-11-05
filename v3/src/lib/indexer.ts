// Builds the local retrieval index: fixture documents (text extracted by pdf.js and
// cached in IndexedDB), uploaded documents (text extracted at ingestion) and
// incident records (one unit per event).
import { DOCS } from '../data/scenario';
import type { IncidentRecord } from '../record/types';
import { CATEGORY } from '../record/timeline';
import { idb } from './idb';
import type { UploadedDoc } from './ingest';
import { retrieval, type ContentType, type IndexUnit } from './retrieval';
import { extractText } from '../viewer/pdf';

export function contentTypeOf(type: string): ContentType {
  if (type === 'Procedure') return 'procedure';
  if (type === 'Operating limits') return 'limits';
  if (type === 'Equipment manual') return 'manual';
  if (type === 'Policy') return 'policy';
  if (type === 'Past-incident report') return 'incident';
  return 'drawing';
}

let built = false;
let building: Promise<void> | null = null;

async function fixturePages(docId: string, revision: string, file: string): Promise<string[]> {
  const key = `${docId}:${revision}`;
  const cached = await idb.get<string[]>('pages', key).catch(() => undefined);
  if (cached) return cached;
  const pages = await extractText(file);
  await idb.put('pages', key, pages).catch(() => undefined);
  return pages;
}

export async function buildIndex(records: IncidentRecord[], uploads: UploadedDoc[], uploadPages: (id: string) => Promise<string[]>, superseded: Set<string>, force = false): Promise<void> {
  if (building) return building;
  building = (async () => {
    const units: IndexUnit[] = [];
    for (const d of DOCS) for (const r of d.revisions) {
      const pages = await fixturePages(d.id, r.revision, r.file);
      const approval = r.status === 'effective' ? (superseded.has(`${d.id}:${r.revision}`) ? 'superseded' : 'approved') : r.status === 'draft' ? 'draft' : 'superseded';
      pages.forEach((text, i) => { if (text.length > 20) units.push({ id: `${d.id}:${r.revision}:${i + 1}`, text, source: { kind: 'document', id: d.id, title: d.title, site: d.site, contentType: contentTypeOf(d.type), revision: r.revision, page: i + 1, approval, locate: 'exact' } }); });
    }
    for (const u of uploads) {
      if (!u.indexReady) continue;
      const pages = await uploadPages(u.id);
      pages.forEach((text, i) => { if (text.length > 20) units.push({ id: `${u.id}:${u.revision}:${i + 1}`, text, source: { kind: 'document', id: u.id, title: u.title, site: u.site, contentType: contentTypeOf(u.type), revision: u.revision, page: i + 1, approval: u.declaredStatus === 'not-established' ? 'not-established' : 'declared', locate: 'exact' } }); });
    }
    for (const r of records) for (const e of r.events) {
      if (e.kind === 'measurement' || e.kind === 'agent' || e.kind === 'report-version') continue;
      const text = `${CATEGORY[e.kind]}: ${e.title}${e.detail ? `. ${e.detail}` : ''}${e.by ? ` (${e.by})` : ''}`;
      units.push({ id: `${r.id}:${e.id}`, text, source: { kind: 'incident', id: r.id, title: `${r.id} · ${r.title}`, site: r.site, contentType: 'incident', approval: 'not-established', incidentMode: r.mode, incidentStatus: r.status, eventId: e.id, eventTitle: e.title, category: CATEGORY[e.kind], t: e.t, incidentStartedAt: r.startedAt, locate: 'page-only' } });
    }
    retrieval.setUnits(units);
    built = true;
  })().finally(() => { building = null; });
  void force;
  return building;
}
export const indexBuilt = () => built;
