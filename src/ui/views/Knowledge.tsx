import { ArrowUpRight, FileText, Search, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { documentUse } from '../../domain/brief';
import { useEcc } from '../../domain/store';
import { APPROVAL_LABEL, PROCESSING_LABEL, type KDoc, type KDocType, type KRevision } from '../../domain/types';
import { useUi } from '../App';
import { Dialog } from '../components/Dialog';
import { RefChips } from '../components/Chips';

type Filter = 'all' | 'effective' | 'superseded' | 'draft' | 'failed' | 'used';
const FILTER_LABEL: Record<Filter, string> = { all: 'All', effective: 'Effective', superseded: 'Has superseded revision', draft: 'Not approved', failed: 'Processing failed or partial', used: 'Used in this incident' };
const TYPES: KDocType[] = ['Emergency procedure', 'Policy', 'P&ID', 'Area layout', 'Equipment manual', 'Equipment record', 'Maintenance history'];

function currentRev(d: KDoc): KRevision {
  return d.revisions.find((r) => r.approval === 'effective') ?? d.revisions[0];
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const { dispatch } = useEcc();
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<KDocType>('Emergency procedure');
  const [tried, setTried] = useState(false);
  const err = tried && !title.trim() ? 'Give the document a title.' : '';
  return (
    <Dialog title="Upload document (simulated)" onClose={onClose} className="dialog-form" labelledBy="upload-title">
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!title.trim()) return;
          dispatch({ type: 'KNOWLEDGE_UPLOAD', title, docType });
          onClose();
        }}
      >
        <p className="muted">No file is read. This simulates an upload so the processing and approval steps can be seen. Uploading does not make a document effective, and processing a drawing does not mean the agent has understood it correctly.</p>
        <label className="form-field">
          <span>
            Title <em className="req">(required)</em>
          </span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus aria-invalid={!!err} />
          {err && (
            <span className="form-error" role="alert">
              {err}
            </span>
          )}
        </label>
        <label className="form-field">
          <span>Type</span>
          <select value={docType} onChange={(e) => setDocType(e.target.value as KDocType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Simulate upload
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DocViewer({ d }: { d: KDoc }) {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const want = ui.ws.knowledge.rev;
  const rev = d.revisions.find((r) => r.rev === want) ?? currentRev(d);
  const effective = d.revisions.find((r) => r.approval === 'effective');
  const other = rev.approval === 'superseded' ? effective : d.revisions.find((r) => r.approval === 'superseded');
  const [compare, setCompare] = useState(false);
  useEffect(() => setCompare(false), [d.id, rev.rev]);
  const use = documentUse(state, d);
  const canPublish = state.prototypeRole === 'Knowledge steward' || state.prototypeRole === 'Administrator';
  const publishable = rev.approval !== 'effective' && (rev.processing === 'searchable' || rev.processing === 'partial');
  const sectionId = ui.ws.knowledge.sectionId;
  const diffs = other ? rev.sections.filter((s) => s.text !== (other.sections.find((o) => o.id === s.id)?.text ?? '')) : [];

  return (
    <div className="kdoc">
      <div className="kdoc-head">
        <div className="detail-kicker">
          {d.docType} · <span className="mono">{d.docNumber}</span>
        </div>
        <h2 className="kdoc-title">{d.title}</h2>
        <dl className="kdoc-meta">
          <div>
            <dt>Applies to</dt>
            <dd>
              {d.area}
              {d.equipment.length > 0 && ` · ${d.equipment.join(', ')}`}
            </dd>
          </div>
          <div>
            <dt>Facility</dt>
            <dd>{d.facility}</dd>
          </div>
          <div>
            <dt>Access scope</dt>
            <dd>{d.accessScope}</dd>
          </div>
        </dl>
      </div>

      <div className="rev-switch" role="group" aria-label="Revisions">
        {d.revisions.map((r) => (
          <button key={r.rev} type="button" className={`rev-btn ${r.rev === rev.rev ? 'is-active' : ''}`} aria-pressed={r.rev === rev.rev} onClick={() => ui.setWs({ knowledge: { ...ui.ws.knowledge, rev: r.rev, sectionId: undefined } })}>
            <span className="rev-name">{r.rev}</span>
            <span className={`tag tag-${r.approval}`}>{APPROVAL_LABEL[r.approval]}</span>
          </button>
        ))}
      </div>

      <dl className="status-strip">
        <div>
          <dt>Uploaded</dt>
          <dd>{rev.uploadedAt}</dd>
        </div>
        <div className={rev.processing === 'failed' ? 'is-failed' : rev.processing === 'partial' ? 'is-partial' : ''}>
          <dt>Processing</dt>
          <dd>{PROCESSING_LABEL[rev.processing]}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>
            {APPROVAL_LABEL[rev.approval]}
            {rev.effectiveFrom && rev.approval === 'effective' && <span className="muted"> · from {rev.effectiveFrom}</span>}
          </dd>
        </div>
        <div>
          <dt>Used by the agent in this incident</dt>
          <dd>{use.length ? `${use.length} ${use.length === 1 ? 'reference' : 'references'}` : 'Not used'}</dd>
        </div>
      </dl>
      {rev.processingNote && <p className={`notice-inline ${rev.processing === 'failed' ? 'is-failed' : ''}`}>{rev.processingNote}</p>}

      <div className="kdoc-actions">
        {rev.file ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => ui.openSource(d.id, rev.rev)}>
            <FileText size={13} aria-hidden="true" />
            Open original ({rev.file.split('.').pop()?.toUpperCase()})
          </button>
        ) : (
          <span className="muted small">No original file is held for this revision.</span>
        )}
        {rev.sheet && (
          <button type="button" className="btn btn-sm" onClick={() => ui.openSheet(rev.sheet!, d.equipment)}>
            Open in Assets &amp; Areas <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        )}
        {other && diffs.length > 0 && (
          <button type="button" className={`btn btn-sm ${compare ? 'is-on' : ''}`} aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
            {compare ? 'Hide comparison' : `Compare with ${other.rev} (${APPROVAL_LABEL[other.approval].toLowerCase()})`}
          </button>
        )}
        {publishable &&
          (canPublish ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'KNOWLEDGE_PUBLISH', id: d.id, rev: rev.rev })}>
              Publish {rev.rev} as effective (simulated)
            </button>
          ) : (
            <span className="gate-note">
              Publishing needs the Knowledge steward or Administrator prototype role.{' '}
              <button type="button" className="link-btn" onClick={ui.openProfile}>
                Switch in User profile
              </button>
            </span>
          ))}
      </div>

      {rev.processing === 'failed' ? (
        <div className="notice notice-failed">
          <p className="notice-title">Processing failed. No content is available.</p>
          <p>{rev.processingNote}</p>
        </div>
      ) : rev.processing === 'uploaded' || rev.processing === 'processing' ? (
        <div className="notice">
          <p className="notice-title">{PROCESSING_LABEL[rev.processing]}</p>
          <p>Content appears once processing finishes. Simulated.</p>
        </div>
      ) : rev.sections.length === 0 ? (
        <p className="empty">No sections were extracted.</p>
      ) : (
        <div className="kdoc-body">
          <div className="kdoc-body-k">Extracted text, not the original</div>
          {rev.sections.map((s) => {
            const o = other?.sections.find((x) => x.id === s.id);
            const differs = compare && o && o.text !== s.text;
            return (
              <section key={s.id} className={`ksec ${sectionId === s.id ? 'is-target' : ''} ${s.extractionFailed ? 'is-failed' : ''}`} aria-labelledby={`ks-${s.id}`}>
                <div className="ksec-head">
                  <h3 id={`ks-${s.id}`}>{s.title}</h3>
                  <span className="muted small t-num">Page {s.page}</span>
                </div>
                {s.extractionFailed ? (
                  <div className="notice notice-failed">
                    <p className="notice-title">Could not be read</p>
                    <p>{s.extractionFailed} The page exists in the document, but ECC cannot show or search its text.</p>
                  </div>
                ) : differs ? (
                  <div className="rev-compare">
                    <div>
                      <div className="rev-compare-k">
                        {rev.rev} ({APPROVAL_LABEL[rev.approval].toLowerCase()})
                      </div>
                      <p>{s.text}</p>
                    </div>
                    <div>
                      <div className="rev-compare-k">
                        {other!.rev} ({APPROVAL_LABEL[other!.approval].toLowerCase()})
                      </div>
                      <p>{o!.text || <span className="muted">Not present in this revision.</span>}</p>
                    </div>
                  </div>
                ) : (
                  <p className="ksec-text">{s.text}</p>
                )}
                {compare && o && o.text === s.text && <p className="muted small">Same text in {other!.rev}.</p>}
              </section>
            );
          })}
        </div>
      )}

      <section className="kdoc-use" aria-labelledby="ku">
        <h3 id="ku">Use in this incident</h3>
        {use.length === 0 ? (
          <p className="muted small">The agent has not cited this document in this incident. Being in the library is not use.</p>
        ) : (
          <ul className="use-list">
            {use.map((u) => (
              <li key={u.citation.id}>
                <div className="use-head">
                  <RefChips ids={[u.citation.id]} />
                  <span className="muted small">{u.citation.revision}</span>
                </div>
                <div className="use-supports">{u.citation.supports}</div>
                <div className="use-entries">
                  <span className="fe-k">Cited by</span>
                  <RefChips ids={u.entries.map((e) => e.id)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function Knowledge() {
  const { state } = useEcc();
  const ui = useUi();
  const [filter, setFilter] = useState<Filter>('all');
  const [upload, setUpload] = useState(false);
  const q = ui.ws.knowledge.query;
  const needle = q.trim().toLowerCase();
  const docs = useMemo(
    () =>
      state.knowledge.filter((d) => {
        const cur = currentRev(d);
        if (needle && !`${d.title} ${d.docNumber} ${d.docType} ${d.area} ${d.equipment.join(' ')}`.toLowerCase().includes(needle)) return false;
        switch (filter) {
          case 'effective':
            return d.revisions.some((r) => r.approval === 'effective');
          case 'superseded':
            return d.revisions.some((r) => r.approval === 'superseded');
          case 'draft':
            return cur.approval === 'draft';
          case 'failed':
            return d.revisions.some((r) => r.processing === 'failed' || r.processing === 'partial');
          case 'used':
            return documentUse(state, d).length > 0;
          default:
            return true;
        }
      }),
    [state, needle, filter],
  );
  const selected = state.knowledge.find((d) => d.id === ui.ws.knowledge.docId);

  return (
    <div className="knowledge">
      <aside className="k-list" aria-label="Library">
        <div className="k-tools">
          <label className="search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Search the library</span>
            <input type="search" value={q} onChange={(e) => ui.setWs({ knowledge: { ...ui.ws.knowledge, query: e.target.value } })} placeholder="Search title, number, equipment" />
          </label>
          <button type="button" className="btn btn-sm" onClick={() => setUpload(true)}>
            <Upload size={14} aria-hidden="true" />
            Upload
          </button>
        </div>
        <label className="inline-field k-filter">
          <span className="sr-only">Filter</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <option key={f} value={f}>
                {FILTER_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        {docs.length === 0 ? (
          <p className="empty">No documents match.</p>
        ) : (
          <ul className="k-items">
            {docs.map((d) => {
              const cur = currentRev(d);
              const used = documentUse(state, d).length > 0;
              return (
                <li key={d.id}>
                  <button type="button" className={`k-item ${selected?.id === d.id ? 'is-selected' : ''}`} aria-pressed={selected?.id === d.id} onClick={() => ui.setWs({ knowledge: { ...ui.ws.knowledge, docId: d.id, rev: undefined, sectionId: undefined } })}>
                    <span className="k-item-top">
                      <span className="k-item-num mono">{d.docNumber}</span>
                      <span className="k-item-type">{d.docType}</span>
                    </span>
                    <span className="k-item-title">{d.title}</span>
                    <span className="k-item-meta">
                      <span>{d.area}</span>
                      <span className="muted">{d.accessScope}</span>
                    </span>
                    <span className="k-item-tags">
                      <span className="tag">{cur.rev}</span>
                      <span className={`tag tag-${cur.approval}`}>{APPROVAL_LABEL[cur.approval]}</span>
                      {cur.processing !== 'searchable' && <span className={`tag ${cur.processing === 'failed' ? 'tag-failed' : ''}`}>{PROCESSING_LABEL[cur.processing]}</span>}
                      {used && <span className="tag tag-used">Used in this incident</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className="k-view" aria-label="Document">
        {selected ? (
          <DocViewer key={selected.id} d={selected} />
        ) : (
          <div className="empty-block">
            <p className="empty-title">No document selected</p>
            <p>Select a document to open the original, read its extracted text, switch revisions, compare a superseded revision with the current one, and see where the agent has cited it in this incident.</p>
          </div>
        )}
      </section>
      {upload && <UploadDialog onClose={() => setUpload(false)} />}
    </div>
  );
}
