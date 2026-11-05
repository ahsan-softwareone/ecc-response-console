import { useMemo, useState, type FormEvent } from 'react';
import { EQUIPMENT, SITES } from '../data/scenario';
import type { KnowledgeDoc } from '../data/types';
import { useAllDocs, type DocEntry } from '../lib/docs';
import type { DeclaredStatus } from '../lib/ingest';
import { emphasize, retrieval, tokenize, type ContentType, type Passage, type RetrievalResult } from '../lib/retrieval';
import { useDerived } from '../lib/derive';
import { clock, dateTime, now, tPlus } from '../lib/time';
import { downloadBlob } from '../record/exports';
import { recordSummary } from '../record/timeline';
import { exportIncident } from '../record/backup';
import { configLabel, incidentTypeOf, INCIDENT_TYPES, isOpen, LIFECYCLE_LABEL } from '../lib/agent';
import { ImportControl } from '../shell/Settings';
import { TimelineView } from '../record/TimelineView';
import type { IncidentRecord } from '../record/types';
import { useStore } from '../store';
import { DocViewer } from '../viewer/DocViewer';
import { Icon } from '../ui/Icon';
import { PaneMaximize, SplitPane } from '../ui/Split';

const TYPES: ContentType[] = ['procedure', 'drawing', 'manual', 'policy', 'limits', 'incident'];
const TYPE_LABEL: Record<ContentType, string> = { procedure: 'Procedures', drawing: 'Drawings', manual: 'Manuals', policy: 'Policies', limits: 'Limits', incident: 'Incident records' };
const DOC_TYPES: KnowledgeDoc['type'][] = ['Procedure', 'P&ID', 'Area layout', 'Dependency view', 'Operating limits', 'Equipment manual', 'Policy', 'Past-incident report'];

export function Knowledge() {
  const view = useStore((s) => s.knowledgeView);
  const setKnowledgeView = useStore((s) => s.setKnowledgeView);
  const storageError = useStore((s) => s.storageError);
  return (
    <div className="page" data-testid="page-knowledge" style={{ flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="seg" data-testid="knowledge-tabs">
          <button aria-pressed={view === 'search'} onClick={() => setKnowledgeView('search')} data-testid="kv-search">Search</button>
          <button aria-pressed={view === 'documents'} onClick={() => setKnowledgeView('documents')} data-testid="kv-documents">Documents</button>
          <button aria-pressed={view === 'incidents'} onClick={() => setKnowledgeView('incidents')} data-testid="kv-incidents">Incidents</button>
        </span>
        <span className="sidenote" data-testid="local-note">Records and uploads are stored in this browser only (IndexedDB){storageError ? ` · currently unavailable: ${storageError}` : ''}.</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {view === 'search' && <SearchView />}
        {view === 'documents' && <DocumentsView />}
        {view === 'incidents' && <IncidentsView />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Search
export function Snippet({ text, terms }: { text: string; terms: string[] }) {
  return <span>{emphasize(text, terms).map((seg, i) => (seg.hit ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}</span>;
}

export function PassageCard({ p, origin, terms = [], more = 0, current = false }: { p: Passage; origin: string; terms?: string[]; more?: number; current?: boolean }) {
  const openViewer = useStore((s) => s.openViewer);
  const setKnowledgeView = useStore((s) => s.setKnowledgeView);
  const setNav = useStore((s) => s.setNav);
  const s = p.source;
  const approval = s.approval === 'approved' ? { l: 'Effective', c: 'soft' } : s.approval === 'superseded' ? { l: 'Superseded', c: 'outline' } : s.approval === 'draft' ? { l: 'Draft', c: 'outline' } : s.approval === 'declared' ? { l: 'Declared by uploader', c: 'outline' } : { l: 'Approval not established', c: 'outline' };
  const isInc = s.kind === 'incident';
  return (
    <div className={`passage ${isInc ? 'incident' : ''}`} data-testid="passage" data-kind={s.kind} data-doc={s.id} data-page={s.page ?? ''}>
      <div className="ph">
        <Icon name={isInc ? 'link' : 'doc'} size={13} />
        <span className="pt">{isInc ? `${s.category ?? 'Entry'} · ${s.eventTitle ?? s.title}` : s.title}</span>
        {!isInc ? <span className="sidenote num">Rev {s.revision} · p.{s.page}</span> : <span className="sidenote num">{s.t ? clock(s.t) : ''}{s.t && s.incidentStartedAt ? ` · ${tPlus(s.t, s.incidentStartedAt)}` : ''}</span>}
      </div>
      {isInc && <div className="sidenote">{s.title}</div>}
      <div className="ps" data-testid="passage-snippet"><Snippet text={isInc ? p.snippet.replace(/^[A-Za-z ]+: /, '') : p.snippet} terms={terms} /></div>
      {more > 0 && <div className="sidenote" data-testid="passage-more">{more} more from this source</div>}
      <div className="pm">
        <span className="sidenote">{s.site}</span>
        {s.kind === 'incident' ? <><span className={`chip ${s.incidentMode === 'training' ? 'mode-training' : 'mode-real'}`}>{s.incidentMode === 'training' ? 'Training' : 'Real incident'}</span><span className="sidenote" title={current ? 'An entry already in this incident\'s record' : 'Past actions are evidence of what happened, not guidance for now'}>{current ? 'this incident · recorded entry' : 'historical evidence, not protocol'}</span></> : <span className={`chip ${approval.c}`}>{approval.l}</span>}
        <span className="spacer" style={{ flex: 1 }} />
        {s.kind === 'document' ? <><button className="link" onClick={() => openViewer({ docId: s.id, revision: s.revision ?? '', page: s.page ?? 1, label: `Search match p.${s.page}`, quote: s.quote, locate: s.quote ? 'exact' : 'page-only', origin, dock: false })} data-testid="passage-open">View p.{s.page}</button><button className="link" style={{ marginLeft: 8 }} onClick={() => openViewer({ docId: s.id, revision: s.revision ?? '', page: s.page ?? 1, label: '', locate: 'page-only', origin, dock: false })} data-testid="passage-original">Original</button></> : <button className="link" onClick={() => { setKnowledgeView('incidents', s.id); setNav('knowledge'); }} data-testid="passage-open-incident">Open record</button>}
      </div>
    </div>
  );
}

export interface PassageGroup { key: string; label: string; items: { p: Passage; more: number }[] }
/** Group by source kind; collapse each source to its best two passages plus a count. Only other incidents are historical. */
export function groupPassages(ps: Passage[], currentIncidentId: string): PassageGroup[] {
  const collapse = (xs: Passage[]) => {
    const bySource = new Map<string, Passage[]>();
    for (const p of xs) { const k = `${p.source.kind}:${p.source.id}:${p.source.revision ?? ''}`; bySource.set(k, [...(bySource.get(k) ?? []), p]); }
    return [...bySource.values()].map((arr) => arr.slice(0, 2).map((p, i) => ({ p, more: i === arr.slice(0, 2).length - 1 ? Math.max(0, arr.length - 2) : 0 }))).flat().sort((a, b) => b.p.score - a.p.score);
  };
  return [
    { key: 'this', label: 'This incident · entries recorded so far', items: collapse(ps.filter((p) => p.source.kind === 'incident' && p.source.id === currentIncidentId)) },
    { key: 'approved', label: 'Approved documents', items: collapse(ps.filter((p) => p.source.kind === 'document' && p.source.approval === 'approved')) },
    { key: 'other', label: 'Other documents · not approved / superseded / draft', items: collapse(ps.filter((p) => p.source.kind === 'document' && p.source.approval !== 'approved')) },
    { key: 'incident', label: 'Other incident records · historical evidence, not protocol', items: collapse(ps.filter((p) => p.source.kind === 'incident' && p.source.id !== currentIncidentId)) },
  ].filter((g) => g.items.length);
}

/** Compact single-select scope controls (used by the Assistant). */
export function ScopeSelects({ sites, setSites, types, setTypes, prefix }: { sites: string[]; setSites: (s: string[]) => void; types: ContentType[]; setTypes: (t: ContentType[]) => void; prefix: string }) {
  return (
    <div className="scopesel" data-testid={`${prefix}-scope`}>
      <label><span className="label">Site</span><select className="select" value={sites[0] ?? ''} onChange={(e) => setSites(e.target.value ? [e.target.value] : [])} data-testid={`${prefix}-scope-site`}><option value="">All sites</option>{SITES.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label><span className="label">Content</span><select className="select" value={types[0] ?? ''} onChange={(e) => setTypes(e.target.value ? [e.target.value as ContentType] : [])} data-testid={`${prefix}-scope-type`}><option value="">All content</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
    </div>
  );
}

function SearchView() {
  const [q, setQ] = useState('');
  const [sites, setSites] = useState<string[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [result, setResult] = useState<RetrievalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const incidentId = useStore((s) => s.incidentId);
  const indexReady = useStore((s) => s.indexReady);
  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const r = await retrieval.search(q, { sites, contentTypes: types, incidentTimeCutoff: { incidentId, t: now() }, limit: 20 });
    setResult(r); setBusy(false);
  };
  const groups = result?.ok ? groupPassages(result.passages, incidentId) : [];
  const terms = tokenize(q);
  return (
    <div className="pane grow" data-testid="knowledge-search">
      <form className="pane-h" onSubmit={run} style={{ gap: 8 }}>
        <Icon name="search" size={15} />
        <input className="input" placeholder="Search documents and incident records" value={q} onChange={(e) => setQ(e.target.value)} data-testid="search-input" style={{ maxWidth: 520 }} />
        <button className="btn sm primary" type="submit" disabled={!q.trim() || busy || !indexReady} data-testid="search-run" data-ready={indexReady}>{indexReady ? 'Search' : 'Indexing…'}</button>
        <span className="sidenote" title={retrieval.description}>{retrieval.name}</span>
      </form>
      <ScopeBar sites={sites} setSites={setSites} types={types} setTypes={setTypes} />
      <div className="pane-b">
        <div className="detail">
          {result && !result.ok && <div className="supnote" data-testid="search-error"><Icon name="warn" size={14} />Retrieval failed: {result.error}. Try again.</div>}
          {result?.ok && result.passages.length === 0 && <p className="sidenote" data-testid="search-empty">No passages matched “{q}” in the selected scope ({result.indexedPassages} passages indexed).</p>}
          {groups.map((g) => (
            <div key={g.key} data-testid={`group-${g.key}`}>
              <h3>{g.label}</h3>
              <div className="plist">{g.items.map(({ p, more }) => <PassageCard key={p.id} p={p} more={more} origin="Knowledge search" terms={terms} current={g.key === 'this'} />)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScopeBar({ sites, setSites, types, setTypes }: { sites: string[]; setSites: (s: string[]) => void; types: ContentType[]; setTypes: (t: ContentType[]) => void }) {
  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <div className="scopebar" data-testid="scope-bar">
      <span className="label">Site</span>
      <button className={`chip ${sites.length === 0 ? 'accent' : 'soft'}`} onClick={() => setSites([])}>All</button>
      {SITES.map((s) => <button key={s} className={`chip ${sites.includes(s) ? 'accent' : 'soft'}`} onClick={() => toggle(sites, s, setSites)} data-testid={`scope-site-${s.replace(/\s+/g, '-')}`}>{s}</button>)}
      <span className="label" style={{ marginLeft: 8 }}>Content</span>
      <button className={`chip ${types.length === 0 ? 'accent' : 'soft'}`} onClick={() => setTypes([])}>All</button>
      {TYPES.map((t) => <button key={t} className={`chip ${types.includes(t) ? 'accent' : 'soft'}`} onClick={() => toggle(types, t, setTypes)} data-testid={`scope-type-${t}`}>{TYPE_LABEL[t]}</button>)}
    </div>
  );
}

// ---------------------------------------------------------------- Documents
function DocumentsView() {
  const docs = useAllDocs();
  const selectedId = useStore((s) => s.knowledgeDoc);
  const setKnowledgeView = useStore((s) => s.setKnowledgeView);
  const [site, setSite] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [eq, setEq] = useState('');
  const [adding, setAdding] = useState(false);
  const [rev, setRev] = useState<string | null>(null);
  const list = docs.filter((d) => (!site || d.site === site) && (!type || d.type === type) && (!eq || d.equipment.some((x) => x.toLowerCase().includes(eq.toLowerCase())) || d.title.toLowerCase().includes(eq.toLowerCase())) && (!status || d.revisions.some((r) => (status === 'effective' ? r.status === 'effective' : status === 'uploaded' ? !!r.upload : status === 'superseded' ? r.status === 'superseded' : r.status === status))));
  const doc = docs.find((d) => d.id === selectedId) ?? list[0];
  const revision = doc?.revisions.find((r) => r.revision === rev) ?? doc?.current;

  return (
    <SplitPane id="knowledge-documents" side="start" defaultSize={380} min={[300, 480]}>
      <div className="pane grow">
        <div className="pane-h"><span className="title">Documents</span><span className="meta sidenote">{list.length} of {docs.length}</span><span className="spacer" /><button className="btn sm" onClick={() => setAdding(true)} data-testid="add-document"><Icon name="plus" size={13} /> Add document</button><PaneMaximize pane="a" /></div>
        <div className="filters" data-testid="document-filters">
          <select className="select" value={site} onChange={(e) => setSite(e.target.value)} data-testid="filter-site"><option value="">All sites</option>{SITES.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} data-testid="filter-type"><option value="">All types</option>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="filter-status"><option value="">Any status</option><option value="effective">Effective</option><option value="superseded">Superseded</option><option value="draft">Draft</option><option value="uploaded">Uploaded</option></select>
          <input className="input" placeholder="Equipment or title" value={eq} onChange={(e) => setEq(e.target.value)} data-testid="filter-equipment" />
        </div>
        <div className="pane-b">
          <div className="list">
            {list.map((x) => (
              <div key={x.id} className="li" role="button" tabIndex={0} aria-selected={doc?.id === x.id} onClick={() => { setKnowledgeView('documents', x.id); setRev(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setKnowledgeView('documents', x.id); setRev(null); } }} data-testid={`doc-${x.id}`}>
                <div className="t"><span className="grow">{x.title}</span></div>
                <div className="m"><span>{x.site}</span><span>{x.type}</span><span>{x.number || x.current.upload?.fileName}</span><span>Rev {x.current.revision}</span>{x.revisions.length > 1 && <span>{x.revisions.length} revisions</span>}{x.current.upload && <span className="chip outline">{x.current.statusLabel}</span>}{x.type === 'Past-incident report' && <span className="chip outline">Reference only</span>}</div>
              </div>
            ))}
            {list.length === 0 && <div className="empty">No documents match</div>}
          </div>
        </div>
      </div>
      <div className="pane grow">
        {adding ? <IngestForm docs={docs} onDone={(id) => { setAdding(false); if (id) setKnowledgeView('documents', id); }} /> : doc && revision ? (
          <>
            <div className="pane-h">
              <span className="title">Original document</span>
              <span className="sidenote">Linked: {doc.equipment.join(', ') || '—'}</span>
              <span className="spacer" />
              {doc.revisions.length > 1 && <span className="seg" data-testid="rev-switch">{doc.revisions.map((r) => <button key={r.revision} aria-pressed={revision.revision === r.revision} onClick={() => setRev(r.revision)}>Rev {r.revision} · {r.upload ? 'uploaded' : r.status}</button>)}</span>}
              <PaneMaximize pane="b" />
            </div>
            {revision.upload && <UploadStates entry={doc} rev={revision} />}
            <div className="pane-b" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <DocViewer key={`${doc.id}-${revision.revision}`} target={{ docId: revision.upload?.id ?? doc.id, revision: revision.revision, page: 1, label: '', locate: 'page-only', origin: 'Knowledge' }} />
            </div>
          </>
        ) : <div className="empty">Select a document</div>}
      </div>
    </SplitPane>
  );
}

function UploadStates({ entry, rev }: { entry: DocEntry; rev: DocEntry['revisions'][number] }) {
  const u = rev.upload!;
  const incidentId = useStore((s) => s.incidentId);
  const refs = useStore((s) => s.records[s.incidentId]?.references ?? []);
  const referenceRevision = useStore((s) => s.referenceRevision);
  const referenced = refs.some((r) => r.docId === u.id && r.revision === u.revision);
  const ex = u.extraction;
  const exLabel = ex.state === 'extracted' ? `Text extracted · ${ex.pages} pages` : ex.state === 'scanned' ? `Scanned · no text layer · OCR not available` : ex.state === 'unsupported' ? `Not extracted · ${ex.reason}` : `Failed · ${ex.reason}`;
  return (
    <div className="states" data-testid="upload-states" data-extraction={ex.state} data-indexed={u.indexReady} data-approval={u.declaredStatus}>
      <span className="st"><b>Stored</b> {dateTime(u.storedAt)} · {u.fileName} · {(u.size / 1024).toFixed(0)} KB</span>
      <span className="st"><b>Extraction</b> <span data-testid="state-extraction">{exLabel}</span></span>
      <span className="st"><b>Index</b> <span data-testid="state-index">{u.indexReady ? 'Searchable with page references' : 'Not searchable'}</span></span>
      <span className="st"><b>Approval</b> <span data-testid="state-approval">{rev.statusLabel}</span>{u.declaredStatus !== 'not-established' && ' · not established by ECC'}</span>
      <span className="st"><b>Use in incident</b> <span data-testid="state-use">{referenced ? `Referenced in ${incidentId} (Rev ${u.revision})` : 'Not referenced'}</span>{!referenced && <button className="link" style={{ marginLeft: 6 }} onClick={() => void referenceRevision(u.id, u.revision, `${entry.title} Rev ${u.revision} (uploaded, ${rev.statusLabel.toLowerCase()})`)} data-testid="reference-revision">Reference this revision</button>}</span>
      <span className="st sidenote">Never used by the agent automatically.</span>
    </div>
  );
}

function IngestForm({ docs, onDone }: { docs: DocEntry[]; onDone: (id: string | null) => void }) {
  const ingest = useStore((s) => s.ingest);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [site, setSite] = useState<string>(SITES[0]);
  const [equipment, setEquipment] = useState('');
  const [type, setType] = useState<KnowledgeDoc['type']>('Procedure');
  const [number, setNumber] = useState('');
  const [revision, setRevision] = useState('1');
  const [declared, setDeclared] = useState<DeclaredStatus>('not-established');
  const [revisionOf, setRevisionOf] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    const doc = await ingest(file, { title: title.trim() || file.name, site, equipment: equipment.split(',').map((x) => x.trim()).filter(Boolean), type, number: number.trim(), revision: revision.trim() || '1', declaredStatus: declared, revisionOf: revisionOf || undefined });
    setBusy(false);
    if (!doc) { setOutcome('The document could not be stored.'); return; }
    onDone(doc.revisionOf ?? doc.id);
  };
  return (
    <form className="detail" onSubmit={submit} data-testid="ingest-form" style={{ maxWidth: 720 }}>
      <h2>Add document</h2>
      <p className="sidenote">The original is stored as uploaded. PDFs are read page by page for search. Uploading does not establish approval or applicability; whatever you enter is shown as declared by you.</p>
      <div className="field"><label>File</label><input type="file" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }} data-testid="ingest-file" /></div>
      <div className="form-grid">
        <div className="field"><label>Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="ingest-title" /></div>
        <div className="field"><label>Site / facility</label><select className="select" value={site} onChange={(e) => setSite(e.target.value)} data-testid="ingest-site">{SITES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label>Equipment applicability (comma separated)</label><input className="input" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder={EQUIPMENT.slice(0, 2).map((x) => x.id).join(', ')} data-testid="ingest-equipment" /></div>
        <div className="field"><label>Document type</label><select className="select" value={type} onChange={(e) => setType(e.target.value as KnowledgeDoc['type'])} data-testid="ingest-type">{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Document number</label><input className="input" value={number} onChange={(e) => setNumber(e.target.value)} data-testid="ingest-number" /></div>
        <div className="field"><label>Revision</label><input className="input" value={revision} onChange={(e) => setRevision(e.target.value)} data-testid="ingest-revision" /></div>
        <div className="field"><label>Approval / effective status</label><select className="select" value={declared} onChange={(e) => setDeclared(e.target.value as DeclaredStatus)} data-testid="ingest-status"><option value="not-established">Not established</option><option value="declared-effective">Effective (declared by uploader)</option><option value="declared-draft">Draft (declared by uploader)</option><option value="declared-superseded">Superseded (declared by uploader)</option></select></div>
        <div className="field"><label>New revision of an existing document</label><select className="select" value={revisionOf} onChange={(e) => setRevisionOf(e.target.value)} data-testid="ingest-revision-of"><option value="">— standalone —</option>{docs.filter((d) => !d.isUpload).map((d) => <option key={d.id} value={d.id}>{d.number} · {d.title}</option>)}</select></div>
      </div>
      {outcome && <div className="supnote"><Icon name="warn" size={13} />{outcome}</div>}
      <div className="row" style={{ display: 'flex', gap: 8 }}><button className="btn primary" type="submit" disabled={!file || busy} data-testid="ingest-submit">{busy ? 'Storing and reading…' : 'Store document'}</button><button className="btn" type="button" onClick={() => onDone(null)}>Cancel</button></div>
    </form>
  );
}

// ---------------------------------------------------------------- Incidents
function IncidentsView() {
  const records = useStore((s) => s.records);
  const currentId = useStore((s) => s.incidentId);
  const selId = useStore((s) => s.knowledgeIncident);
  const setKnowledgeView = useStore((s) => s.setKnowledgeView);
  const d = useDerived();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [site, setSite] = useState('');
  const [year, setYear] = useState('');
  const [equipment, setEquipment] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const all = useMemo(() => Object.values(records).sort((a, b) => b.startedAt - a.startedAt), [records]);
  const list = all.filter((r) => (!q || `${r.id} ${r.title} ${r.site} ${r.equipment.join(' ')}`.toLowerCase().includes(q.toLowerCase())) && (!status || r.status === status) && (!mode || r.mode === mode) && (!site || r.site === site) && (!year || new Date(r.startedAt).getFullYear() === +year) && (!equipment || r.equipment.includes(equipment)) && (!type || incidentTypeOf(r) === type) && (!from || r.startedAt >= new Date(from).getTime()) && (!to || r.startedAt < new Date(to).getTime() + 86400000));
  const cur = records[selId ?? ''] ?? list[0];
  const years = [...new Set(all.map((r) => new Date(r.startedAt).getFullYear()))].sort((a, b) => b - a);
  void d;
  return (
    <SplitPane id="knowledge-incidents" side="start" defaultSize={380} min={[300, 520]}>
      <div className="pane grow">
        <div className="pane-h"><span className="title">Incidents</span><span className="meta sidenote">{list.length} of {all.length}</span><span className="spacer" /><PaneMaximize pane="a" /></div>
        <div className="import-row"><ImportControl /></div>
        <div className="filters" data-testid="incident-filters">
          <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} data-testid="incident-search" />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="incident-status"><option value="">Any status</option><option value="active">Active</option><option value="resolved">Resolved</option><option value="stabilizing">Stabilizing (older records)</option><option value="closed">Closed</option><option value="left-open">Set aside</option></select>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value)} data-testid="incident-mode"><option value="">Real and training</option><option value="real">Real</option><option value="training">Training</option></select>
          <select className="select" value={site} onChange={(e) => setSite(e.target.value)}><option value="">All sites</option>{SITES.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="select" value={year} onChange={(e) => setYear(e.target.value)} data-testid="incident-year"><option value="">Any year</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <select className="select" value={equipment} onChange={(e) => setEquipment(e.target.value)} data-testid="incident-equipment"><option value="">Any equipment</option>{EQUIPMENT.map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}</select>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} data-testid="incident-type"><option value="">Any type</option>{INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <label className="datef">From<input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="incident-from" /></label>
          <label className="datef">To<input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="incident-to" /></label>
        </div>
        <div className="pane-b">
          <div className="list">
            {list.map((r) => (
              <div key={r.id} className="li" role="button" tabIndex={0} aria-selected={cur?.id === r.id} onClick={() => setKnowledgeView('incidents', r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setKnowledgeView('incidents', r.id); }} data-testid={`inc-${r.id}`}>
                <div className="t"><span className={`chip ${r.mode === 'real' ? 'mode-real' : 'mode-training'}`}>{r.mode === 'real' ? 'Real' : 'Training'}</span>{r.id === currentId && <span className="chip accent">Current</span>}<span className="grow">{r.title}</span></div>
                <div className="m"><span>{r.id}</span><span className="num">{dateTime(r.startedAt).slice(0, 10)}</span><span>{r.site}</span><span className="chip outline">{LIFECYCLE_LABEL[r.status]}</span><span>{incidentTypeOf(r)}</span></div>
              </div>
            ))}
            {list.length === 0 && <div className="empty">No incidents match</div>}
          </div>
        </div>
      </div>
      <div className="pane grow">{cur ? <IncidentDetail r={cur} isCurrent={cur.id === currentId} /> : <div className="empty">Select an incident</div>}</div>
    </SplitPane>
  );
}

function IncidentDetail({ r, isCurrent }: { r: IncidentRecord; isCurrent: boolean }) {
  const sum = recordSummary(r);
  const setDialog = useStore((s) => s.setDialog);
  const linkHistorical = useStore((s) => s.linkHistorical);
  const addAddendum = useStore((s) => s.addAddendum);
  const resumeIncident = useStore((s) => s.resumeIncident);
  const current = useStore((s) => s.records[s.incidentId]);
  const [note, setNote] = useState<string | null>(null);
  const [addendum, setAddendum] = useState('');
  const hasOpen = !!current && isOpen(current) && current.id !== r.id;
  const linked = !!current?.linkedIncidents?.some((l) => l.id === r.id);
  const isHistory = r.status === 'closed' && !isCurrent;
  const seed = r.provenance === 'seed';
  return (
    <>
      <div className="pane-h">
        <span className="title">{r.title}</span>
        <span className={`chip ${r.mode === 'real' ? 'mode-real' : 'mode-training'}`}>{r.mode === 'real' ? 'Real incident' : 'Training'}</span>
        <span className="chip outline" data-testid="incident-status-chip">{LIFECYCLE_LABEL[r.status]}</span>
        <span className="spacer" />
        <button className="btn sm" onClick={async () => { const { blob, contents } = await exportIncident(r, now()); downloadBlob(blob, `${r.id}.json`); setNote(contents.attachments); }} data-testid="export-json" title="The complete record and any uploaded originals it references"><Icon name="download" size={13} /> Export</button>
        <PaneMaximize pane="b" />
      </div>
      {!isCurrent && (
        <div className="hist-actions" data-testid="history-actions">
          {r.status === 'closed' && !seed && <button className="btn sm" onClick={() => setDialog({ type: 'reopen', id: r.id })} data-testid="history-reopen">Reopen</button>}
          {r.status === 'left-open' && <button className="btn sm" onClick={() => (hasOpen ? setDialog({ type: 'resume', id: r.id }) : void resumeIncident(r.id))} data-testid="history-resume">Resume</button>}
          {hasOpen && <button className="btn sm" disabled={linked} onClick={() => void linkHistorical(r.id)} data-testid="history-link">{linked ? 'Linked as reference' : 'Link to current incident'}</button>}
          <button className="btn sm" onClick={() => setDialog({ type: 'start', mode: 'real', prefill: { site: r.site, title: '', notification: '', equipment: r.equipment.filter((e) => EQUIPMENT.some((x) => x.id === e)), basedOn: { id: r.id, title: r.title } } })} data-testid="history-start-new">Start new incident from this</button>
          <span className="sidenote">Historical actions are precedent, not applicable protocol.</span>
        </div>
      )}
      {note && <p className="sidenote export-note" data-testid="export-contents">{note}</p>}
      <div className="stats">
        <div className="stat"><span className="v num">{r.events.length}</span><span className="l">Entries</span></div>
        <div className="stat"><span className="v num">{sum.alerts}</span><span className="l">Alerts</span></div>
        <div className="stat"><span className="v num">{sum.decisions}</span><span className="l">Decisions</span></div>
        <div className="stat"><span className="v num">{sum.reports}</span><span className="l">Field reports</span></div>
        <div className="stat"><span className="v num">{r.reportVersions.length}</span><span className="l">SITREP versions</span></div>
        <div className="stat"><span className="v num">{sum.corrections}</span><span className="l">Corrections</span></div>
      </div>
      <div className="pane-b">
        <div className="detail" style={{ paddingBottom: 6 }}>
          <dl className="kv">
            <dt>Identity</dt><dd>{r.id} · {r.site}{r.location ? ` · ${r.location}` : ''} · {incidentTypeOf(r)} · reported by {r.reportedBy}</dd>
            <dt>Times</dt><dd data-testid="incident-times">Occurred {dateTime(r.occurredAt ?? r.startedAt)}{r.createdAt ? ` · record created ${dateTime(r.createdAt)}` : ''}{r.agentRuns?.[0] ? ` · agent started ${dateTime(r.agentRuns[0].startedAt)}` : ''}</dd>
            {r.importedFrom && <><dt>Imported</dt><dd data-testid="incident-imported">Imported record{r.importedFrom !== r.id ? `; copy of ${r.importedFrom}` : ''}</dd></>}
            {r.basedOn && <><dt>Reference</dt><dd data-testid="incident-based-on">Started with reference to {r.basedOn.id}. Precedent only; nothing was copied.</dd></>}
            {r.linkedIncidents?.length ? <><dt>Linked precedents</dt><dd>{r.linkedIncidents.map((l) => <div key={l.id}>{l.id} · {l.title}</div>)}</dd></> : null}
            {r.resolution && <><dt>Resolution</dt><dd data-testid="incident-resolution">{dateTime(r.resolution.t)} · {r.resolution.by} · {r.resolution.summary}. {r.resolution.rationale}</dd></>}
            {r.closure?.sitrep && <><dt>SITREP at closure</dt><dd data-testid="incident-sitrep-state">{r.closure.sitrep}</dd></>}
            {r.closureHistory?.length ? <><dt>Earlier closures</dt><dd data-testid="closure-history">{r.closureHistory.map((c, i) => <div key={i}>{dateTime(c.t)} · {c.by} · {c.rationale}</div>)}</dd></> : null}
            {r.agentRuns?.length ? <><dt>Agent runs</dt><dd data-testid="incident-runs">{r.agentRuns.map((x) => <div key={x.id}>Run {x.number} · {x.status === 'completed' ? 'ended at closure' : x.status} · {dateTime(x.startedAt)} · {configLabel(x.config)}{x.endReason ? ` · ${x.endReason}` : ''}</div>)}</dd></> : null}
            <dt>Equipment</dt><dd>{r.equipment.join(', ')}</dd>
            {r.stabilization && <><dt>Stabilization</dt><dd>{dateTime(r.stabilization.t)} · {r.stabilization.by} · {r.stabilization.rationale}</dd></>}
            {r.closure && <><dt>Closure</dt><dd data-testid="incident-closure">{dateTime(r.closure.t)} · {r.closure.by} · {r.closure.rationale}{r.closure.outstanding.length > 0 && <div className="m" style={{ color: 'var(--high-ink)' }}>Outstanding: {r.closure.outstanding.join('; ')}</div>}</dd></>}
            {r.lessons.length > 0 && <><dt>Lessons</dt><dd>{r.lessons.map((l) => <div key={l.id}>{l.text}</div>)}</dd></>}
            {r.references.length > 0 && <><dt>Referenced revisions</dt><dd>{r.references.map((x, i) => <div key={i}>{x.docId} Rev {x.revision} · {x.note}</div>)}</dd></>}
          </dl>
          <p className="sidenote">{r.provenance === 'seed' && <span data-testid="fixture-note">Illustrative fixture record, not an actual event. </span>}{r.status === 'closed' && !seed ? 'Read-only; later corrections are audited addenda. ' : ''}Stored in this browser only. Past incident actions are historical evidence; they do not become the protocol for a new emergency.</p>
        </div>
        {isHistory && !seed && (
          <div className="detail" style={{ paddingTop: 0, paddingBottom: 6 }}>
            <div className="decision" data-testid="addendum"><textarea className="textarea" placeholder="Later correction or addition. Audited; the closed record itself does not change." value={addendum} onChange={(e) => setAddendum(e.target.value)} data-testid="addendum-text" style={{ minHeight: 44 }} /><div className="row"><button className="btn sm" disabled={!addendum.trim()} onClick={() => { void addAddendum(r.id, addendum.trim()); setAddendum(''); }} data-testid="addendum-save">Append addendum</button></div></div>
          </div>
        )}
        <TimelineView record={r} editable={isCurrent && r.status !== 'closed'} testId="incident-timeline" />
      </div>
    </>
  );
}
