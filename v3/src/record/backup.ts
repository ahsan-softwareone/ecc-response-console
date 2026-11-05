// Structured export and import. A complete export carries the record itself plus the original
// files of any uploaded documents it references. Built-in fixture documents ship with the
// application and are exported by reference only, which the export states.
import { idb } from '../lib/idb';
import type { UploadedDoc } from '../lib/ingest';
import { incidentJson } from './exports';
import type { IncidentRecord, RecordKind } from './types';

export const BACKUP_SCHEMA = 'ecc-backup/1';
const KINDS: RecordKind[] = ['notification', 'equipment', 'measurement', 'observation', 'alert', 'finding', 'recommendation', 'decision', 'report', 'outcome', 'gap', 'agent', 'reference', 'knowledge', 'report-version', 'stabilization', 'closure', 'correction', 'lesson', 'acknowledgement', 'agent-control', 'config', 'lifecycle', 'resolution'];
const STATUSES = ['active', 'resolved', 'stabilizing', 'closed', 'left-open'];
export interface Attachment { doc: UploadedDoc; base64: string; pages: string[] }
export interface ExportContents { attachments: string; included: string[]; byReference: string[]; missing: string[] }

async function toBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer()); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string, type: string): Blob {
  const s = atob(b64); const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Blob([bytes], { type });
}
const docIdsOf = (r: IncidentRecord) => [...new Set([...r.references.map((x) => x.docId), ...r.events.flatMap((e) => (e.evidence ?? []).map((x) => x.docId))])];
async function attachmentsFor(ids: string[]): Promise<{ attachments: Attachment[]; contents: ExportContents }> {
  const attachments: Attachment[] = []; const included: string[] = []; const byReference: string[] = []; const missing: string[] = [];
  for (const id of ids) {
    if (!id.startsWith('up-')) { byReference.push(id); continue; }
    const doc = await idb.get<UploadedDoc>('documents', id); const file = await idb.get<Blob>('files', id);
    if (!doc || !file) { missing.push(id); continue; }
    attachments.push({ doc, base64: await toBase64(file), pages: (await idb.get<string[]>('pages', id)) ?? [] }); included.push(doc.fileName);
  }
  const attachmentsNote = `${included.length} uploaded original${included.length === 1 ? '' : 's'} included. ${byReference.length} built-in fixture document${byReference.length === 1 ? '' : 's'} referenced by id only (they ship with this application, not with this file).${missing.length ? ` ${missing.length} original${missing.length === 1 ? '' : 's'} could not be found and ${missing.length === 1 ? 'is' : 'are'} NOT included.` : ''}`;
  return { attachments, contents: { attachments: attachmentsNote, included, byReference, missing } };
}
/** One incident: the readable sections, the complete record and any uploaded originals. */
export async function exportIncident(r: IncidentRecord, at: number): Promise<{ blob: Blob; contents: ExportContents }> {
  const { attachments, contents } = await attachmentsFor(docIdsOf(r));
  const base = JSON.parse(await incidentJson(r, at).text());
  return { blob: new Blob([JSON.stringify({ ...base, backupSchema: BACKUP_SCHEMA, contents, records: [r], attachments }, null, 2)], { type: 'application/json' }), contents };
}
/** Everything in this browser except seeded fixtures: every record and every uploaded original. */
export async function exportAll(records: IncidentRecord[], uploads: UploadedDoc[], at: number): Promise<{ blob: Blob; contents: ExportContents; count: number }> {
  const own = records.filter((r) => r.provenance !== 'seed');
  const ids = [...new Set([...own.flatMap(docIdsOf), ...uploads.map((u) => u.id)])];
  const { attachments, contents } = await attachmentsFor(ids);
  return { blob: new Blob([JSON.stringify({ backupSchema: BACKUP_SCHEMA, exportedAt: at, persistence: 'browser-local (IndexedDB) prototype records', contents, records: own, attachments })], { type: 'application/json' }), contents, count: own.length };
}

export interface ParsedImport { records: IncidentRecord[]; docs: { doc: UploadedDoc; file: Blob; pages: string[] }[]; contents: ExportContents | null; errors: string[] }
function validate(r: unknown, i: number): string[] {
  const e: string[] = []; const x = r as Partial<IncidentRecord>; const tag = `Record ${x?.id ?? i + 1}`;
  if (!x || typeof x !== 'object') return [`${tag}: not an object`];
  if (x.schema !== 'ecc-incident/1') e.push(`${tag}: unknown record schema "${String(x.schema)}"`);
  if (typeof x.id !== 'string' || !x.id) e.push(`${tag}: missing id`);
  if (typeof x.title !== 'string') e.push(`${tag}: missing title`);
  if (typeof x.site !== 'string') e.push(`${tag}: missing site`);
  if (x.mode !== 'real' && x.mode !== 'training') e.push(`${tag}: mode must be real or training`);
  if (typeof x.startedAt !== 'number') e.push(`${tag}: missing start time`);
  if (!STATUSES.includes(x.status as string)) e.push(`${tag}: unknown status "${String(x.status)}"`);
  if (!Array.isArray(x.events)) e.push(`${tag}: events must be a list`);
  else x.events.forEach((ev, n) => { if (!ev || typeof ev.id !== 'string' || typeof ev.t !== 'number' || !KINDS.includes(ev.kind)) e.push(`${tag}: event ${n + 1} is malformed`); });
  for (const k of ['reportVersions', 'lessons', 'references', 'equipment'] as const) if (!Array.isArray(x[k])) e.push(`${tag}: ${k} must be a list`);
  return e.slice(0, 6);
}
export function parseImport(text: string): ParsedImport {
  const bad = (m: string): ParsedImport => ({ records: [], docs: [], contents: null, errors: [m] });
  let data: { backupSchema?: string; records?: unknown[]; attachments?: Attachment[]; contents?: ExportContents };
  try { data = JSON.parse(text); } catch { return bad('This file is not valid JSON.'); }
  if (data?.backupSchema !== BACKUP_SCHEMA || !Array.isArray(data.records)) return bad('This is not an ECC export that contains complete records. Exports made before this version hold readable sections only and cannot be restored.');
  const errors = data.records.flatMap(validate);
  if (errors.length) return { records: [], docs: [], contents: null, errors };
  const docs: ParsedImport['docs'] = [];
  for (const a of data.attachments ?? []) {
    try { docs.push({ doc: a.doc, file: fromBase64(a.base64, a.doc.mime), pages: a.pages ?? [] }); }
    catch { errors.push(`Attachment ${a.doc?.fileName ?? '?'} could not be decoded`); }
  }
  return { records: data.records as IncidentRecord[], docs, contents: data.contents ?? null, errors };
}
/** A copy under a new identity, never a silent overwrite of an existing record. */
export function asCopy(r: IncidentRecord, existing: Set<string>): IncidentRecord {
  let n = 1; let id = `${r.id}-COPY`;
  while (existing.has(id)) id = `${r.id}-COPY${++n}`;
  return { ...r, id, importedFrom: r.id, provenance: 'imported' };
}
