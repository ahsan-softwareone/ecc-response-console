// Unified document listing: fixture documents (from derive) plus uploaded
// documents and uploaded revisions of existing documents.
import { useEffect, useMemo, useState } from 'react';
import type { KnowledgeDoc } from '../data/types';
import { useStore } from '../store';
import { useDerived } from './derive';
import type { UploadedDoc } from './ingest';

export interface DocRevisionEntry {
  revision: string;
  status: 'effective' | 'superseded' | 'draft' | 'not-established' | 'declared-effective' | 'declared-draft' | 'declared-superseded';
  statusLabel: string;
  effectiveFrom: string;
  file: string | null;      // URL for fixtures; null for uploads (resolved async)
  pages: number;
  upload?: UploadedDoc;
}
export interface DocEntry {
  id: string;
  title: string;
  number: string;
  type: KnowledgeDoc['type'];
  site: string;
  equipment: string[];
  summary: string;
  revisions: DocRevisionEntry[];
  /** Revision used for new lookups (newest uploaded revision supersedes for future lookup). */
  current: DocRevisionEntry;
  isUpload: boolean;
}

export const STATUS_LABEL: Record<DocRevisionEntry['status'], string> = {
  effective: 'Effective', superseded: 'Superseded', draft: 'Draft',
  'not-established': 'Approval not established', 'declared-effective': 'Declared effective by uploader', 'declared-draft': 'Declared draft by uploader', 'declared-superseded': 'Declared superseded by uploader',
};

export function useAllDocs(): DocEntry[] {
  const d = useDerived();
  const uploads = useStore((s) => s.uploads);
  return useMemo(() => {
    const entries: DocEntry[] = d.docs.map((doc) => {
      const revs: DocRevisionEntry[] = doc.revisions.map((r) => ({ revision: r.revision, status: r.status, statusLabel: STATUS_LABEL[r.status], effectiveFrom: r.effectiveFrom, file: r.file, pages: r.pages }));
      return { id: doc.id, title: doc.title, number: doc.number, type: doc.type, site: doc.site, equipment: doc.equipment, summary: doc.summary, revisions: revs, current: revs.find((r) => r.revision === doc.current.revision) ?? revs[0], isUpload: false };
    });
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const u of uploads) {
      const rev: DocRevisionEntry = { revision: u.revision, status: u.declaredStatus, statusLabel: STATUS_LABEL[u.declaredStatus], effectiveFrom: new Date(u.storedAt).toISOString().slice(0, 10), file: null, pages: u.extraction.pages, upload: u };
      const parent = u.revisionOf ? byId.get(u.revisionOf) : undefined;
      if (parent) { parent.revisions.push(rev); parent.current = rev; }
      else { const e: DocEntry = { id: u.id, title: u.title, number: u.number, type: u.type, site: u.site, equipment: u.equipment, summary: `Uploaded ${u.fileName}`, revisions: [rev], current: rev, isUpload: true }; entries.push(e); byId.set(u.id, e); }
    }
    return entries;
  }, [d.docs, uploads]);
}

export interface ResolvedRevision { entry: DocEntry; rev: DocRevisionEntry; url: string | null; loading: boolean; previewable: boolean }

/** Resolve a document revision (fixture or upload) to a viewable URL. */
export function useDocRevision(docId: string, revision: string): ResolvedRevision | null {
  const docs = useAllDocs();
  const uploadUrl = useStore((s) => s.uploadUrl);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const entry = docs.find((e) => e.id === docId) ?? docs.find((e) => e.revisions.some((r) => r.upload?.id === docId));
  const rev = entry?.revisions.find((r) => r.revision === revision || r.upload?.id === docId) ?? entry?.current ?? null;
  const uploadId = rev?.upload?.id;
  useEffect(() => {
    let cancelled = false;
    if (!uploadId) { setUrl(null); return; }
    setLoading(true);
    uploadUrl(uploadId).then((u) => { if (!cancelled) { setUrl(u); setLoading(false); } });
    return () => { cancelled = true; };
  }, [uploadId, uploadUrl]);
  if (!entry || !rev) return null;
  return { entry, rev, url: rev.file ?? url, loading: !!uploadId && loading, previewable: rev.upload ? rev.upload.previewable : true };
}
