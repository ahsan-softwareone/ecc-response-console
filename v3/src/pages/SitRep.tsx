import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clock, dateTime, now } from '../lib/time';
import type React from 'react';
import { downloadBlob, sitrepPdf, timelineReportPdf } from '../record/exports';
import type { IncidentRecord, ReportVersion, SitrepSectionKey } from '../record/types';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { PaneMaximize, SplitPane } from '../ui/Split';
import { IconButton } from '../ui/ui';
import { TimelinePane, useStoryData } from './Story';
import { sectionsFromBrief, type Brief } from '../record/story';
import { Citation } from '../ui/Citation';

const SECTIONS: { k: SitrepSectionKey; l: string }[] = [{ k: 'situation', l: 'Assessment' }, { k: 'response', l: 'Current situation' }, { k: 'decisions', l: 'Actions and results' }, { k: 'outstanding', l: 'What needs attention' }, { k: 'priorities', l: 'Notes' }];

export function SitRep() {
  const record = useStore((s) => s.records[s.incidentId]);
  if (!record) return <div className="page"><div className="pane grow"><div className="empty">Loading the incident record…</div></div></div>;
  return <Workspace record={record} />;
}

/** Timeline and Sit. Rep: what happened and what we did about it, and what to tell someone now. */
function Workspace({ record }: { record: IncidentRecord }) {
  const incidentId = useStore((s) => s.incidentId);
  const storageError = useStore((s) => s.storageError);
  const briefHidden = useStore((s) => !!s.hiddenPanels['sitrep.b']);
  const showPanel = useStore((s) => s.showPanel);
  const { moments, brief } = useStoryData(record);
  const closed = record.status === 'closed';
  return (
    <div className="page" data-testid="page-sitrep">
      <SplitPane id="sitrep" side="end" defaultSize={480} min={[360, 520]}>
      <div className="pane grow">
        <div className="pane-h">
          <span className="title">Timeline</span>
          <span className="sidenote" data-testid="sitrep-record-id">{incidentId} · {moments.length} key moments · {record.events.length} records</span>
          {closed && <span className="chip outline" data-testid="closed-chip">Closed</span>}
          {storageError && <span className="chip outline" title={storageError} style={{ color: 'var(--crit-ink)' }}>Not saved locally</span>}
          <span className="spacer" />
          <button className="btn sm quiet" onClick={() => downloadBlob(timelineReportPdf(record, now()), `${record.id}-timeline-report.pdf`)} data-testid="download-timeline" title="The full chronological record as a PDF"><Icon name="download" size={14} /> Full record (PDF)</button>
          {briefHidden && <button className="btn sm action" onClick={() => showPanel('sitrep.b')} data-testid="brief-reopen" title="Open the Sit. Rep beside the timeline"><Icon name="doc" size={13} />Sit. Rep</button>}
          <PaneMaximize pane="a" />
        </div>
        <div className="pane-b"><TimelinePane record={record} moments={moments} /></div>
      </div>
      <div className="pane grow">
        <ReportsPane record={record} brief={brief} />
      </div>
      </SplitPane>
    </div>
  );
}

function ReportsPane({ record, brief }: { record: IncidentRecord; brief: Brief }) {
  const { createSitrepVersion, editSitrepSection, resolveSitrepPending } = useStore.getState();
  const hidePanel = useStore((s) => s.hidePanel);
  const [sel, setSel] = useState<string | null>(null);
  const [shut, setShut] = useState<Set<string>>(new Set());
  const versions = [...record.reportVersions].sort((a, b) => b.createdAt - a.createdAt || b.number - a.number);
  const current = versions[0] ?? null;
  const [notice, setNotice] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const listRef = useRef<HTMLDetailsElement>(null);
  // The confirmation goes away on its own after a few seconds.
  useEffect(() => { if (notice == null) return; const id = window.setTimeout(() => setNotice(null), 8000); return () => window.clearTimeout(id); }, [notice]);
  const viewing = versions.find((x) => x.id === sel) ?? current;
  const isPast = !!viewing && viewing !== current;
  const closed = record.status === 'closed';
  // A fresh report from the latest incident information; the current one moves to Past reports with its edits.
  const generate = () => { setSel(null); setNotice(brief.asOf); void createSitrepVersion(brief.asOf, sectionsFromBrief(brief)); };
  const showList = () => { setListOpen(true); setNotice(null); window.setTimeout(() => listRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0); };
  const toggle = (k: string) => setShut((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <>
      <div className="pane-h">
        <span className="title" data-testid="side-reports">Sit. Rep</span>
        <span className="spacer" />
        <IconButton className="sm" name="chevR" title="Collapse the Sit. Rep for more timeline space" onClick={() => hidePanel('sitrep.b')} testId="brief-collapse" />
        <PaneMaximize pane="b" />
      </div>
      <div className="pane-b">
          <div className="detail sitrep2" data-testid="brief">
            {!current && (
              <div className="sr2-empty" data-testid="sitrep-none">
                <p>No report yet. Generate one from the latest incident information, edit it, then download it as a PDF.</p>
                {!closed && <button className="btn primary" onClick={generate} data-testid="sitrep-generate">Generate report</button>}
              </div>
            )}
            {notice != null && current && (
              <div className="sr2-notice" role="status" data-testid="sitrep-generated-note">
                <Icon name="check" size={13} /><span>Report generated as of <b className="num">{clock(notice)}</b>. You can view it in Generated reports.</span>
                <button className="link" onClick={showList} data-testid="sitrep-generated-show">Show</button>
                <IconButton className="sm" name="close" title="Dismiss" onClick={() => setNotice(null)} />
              </div>
            )}
            {isPast && (
              <div className="sr2-past-note" data-testid="sitrep-viewing-past">
                <span>Earlier report · as of <b className="num">{dateTime(viewing!.asOf)}</b> · read only</span>
                <button className="btn sm" onClick={() => setSel(null)} data-testid="sitrep-back-current"><Icon name="chevL" size={13} /> Back to current report</button>
              </div>
            )}
            {viewing && <ReportView key={viewing.id} v={viewing} record={record} onGenerate={!isPast && !closed ? generate : undefined} editable={!isPast && !closed && viewing.status !== 'approved'} shut={shut} onToggle={toggle} onEdit={(k, t) => void editSitrepSection(viewing.id, k, t)} onResolve={(k, take) => void resolveSitrepPending(viewing.id, k, take)} />}
            {versions.length > 0 && (
              <details className="sr2-pastlist" ref={listRef} open={listOpen} onToggle={(e) => setListOpen((e.target as HTMLDetailsElement).open)} data-testid="sitrep-past">
                <summary data-testid="sitrep-past-toggle">Generated reports ({versions.length})</summary>
                <ul>
                  {versions.map((x) => (
                    <li key={x.id} className={viewing?.id === x.id ? 'on' : ''} data-testid="sitrep-past-item" data-version={x.number}>
                      <span className="num">{dateTime(x.asOf)}</span>{x === current && <span className="sidenote" data-testid="sitrep-latest">Latest</span>}
                      {Object.keys(x.sections).some((k) => x.sections[k as SitrepSectionKey] !== x.generated[k as SitrepSectionKey]) && <span className="sidenote">edited</span>}
                      <span style={{ flex: 1 }} />
                      {viewing?.id === x.id ? <span className="sidenote">Showing</span> : <button className="link" onClick={() => setSel(x === current ? null : x.id)} data-testid={`sitrep-past-open-${x.number}`}>Open</button>}
                      <button className="link" onClick={() => downloadBlob(sitrepPdf(record, x), fileName(record, x))} data-testid={`sitrep-past-download-${x.number}`}><Icon name="download" size={12} /> PDF</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
      </div>
    </>
  );
}
// The report number keeps two reports generated in the same minute from overwriting each other in Downloads.
const fileName = (r: IncidentRecord, v: ReportVersion) => `${r.id}-SitRep-${v.number}-${dateTime(v.asOf).replace(/[-: ]/g, '').slice(0, 12)}.pdf`;

function AutoTextarea({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } }, [value]);
  return <textarea ref={ref} className="textarea autogrow" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
}

const PREVIEW = 3;
/** One report: its as-of time, the download, and collapsible sections. Collapsing changes only the view. */
function ReportView({ v, record, editable, shut, onToggle, onEdit, onResolve, onGenerate }: { v: ReportVersion; record: IncidentRecord; editable: boolean; onGenerate?: () => void; shut: Set<string>; onToggle: (k: string) => void; onEdit: (k: SitrepSectionKey, t: string) => void; onResolve: (k: SitrepSectionKey, take: 'mine' | 'new') => void }) {
  const [more, setMore] = useState(false);
  const evidence = (() => { const m = new Map<string, { docId: string; revision: string; page: number; label: string }>(); for (const e of record.events) if (e.t <= v.asOf) for (const x of e.evidence ?? []) m.set(`${x.docId}:${x.revision}:${x.page}`, { docId: x.docId, revision: x.revision, page: x.page, label: x.label }); return [...m.values()]; })();
  const head = (k: string, label: string, extra?: React.ReactNode) => (
    <button className="sr2-sh" aria-expanded={!shut.has(k)} onClick={() => onToggle(k)} data-testid={`sitrep-toggle-${k}`}>
      <Icon name={shut.has(k) ? 'chevR' : 'chevD'} size={12} /><span>{label}</span>{extra}
    </button>
  );
  return (
    <div data-testid="sitrep-editor" data-version={v.number} data-asof={v.asOf} data-editable={editable}>
      <div className="sr2-bar">
        <div className="sr2-asof"><span className="label">As of</span> <b className="num" data-testid="sitrep-asof">{dateTime(v.asOf)}</b></div>
        <span className="sr2-actions">
        {onGenerate && <button className="btn sm" onClick={onGenerate} data-testid="sitrep-generate" title="Generate a fresh report from the latest incident information. This report stays under Generated reports with its edits."><Icon name="reset" size={13} /> Generate report</button>}
        <button className="btn sm primary" onClick={() => downloadBlob(sitrepPdf(record, v), fileName(record, v))} data-testid="download-sitrep"><Icon name="download" size={13} /> Download PDF</button>
        </span>
      </div>
      {!editable && v.status === 'approved' && <p className="sidenote" style={{ margin: '0 0 8px' }}>Approved under the earlier workflow; kept as it was. Generate a report to work on a fresh one.</p>}
      <div className="sr2-secs">
        {SECTIONS.filter((s) => s.k !== 'priorities' || v.sections.priorities || v.generated.priorities).map((s) => {
          const pending = v.pending?.[s.k];
          const edited = v.sections[s.k] !== v.generated[s.k];
          const open = !shut.has(s.k);
          return (
            <section key={s.k} className="sr2-sec" data-testid={`sitrep-field-${s.k}`} data-edited={edited}>
              {head(s.k, s.l, edited ? <em className="sr2-edited">edited</em> : null)}
              {open && (editable ? <AutoTextarea value={v.sections[s.k]} onChange={(t) => onEdit(s.k, t)} testId={`sitrep-input-${s.k}`} /> : <div className="ro" data-testid={`sitrep-text-${s.k}`}>{v.sections[s.k] || '—'}</div>)}
              {open && editable && pending != null && (
                <div className="supnote" data-testid={`sitrep-pending-${s.k}`} style={{ marginTop: 6, flexDirection: 'column', gap: 6 }}>
                  <div><Icon name="warn" size={13} /> Newer text is available from the record. Your edit has been kept.</div>
                  <div className="ro" style={{ background: 'transparent', color: 'var(--text)' }}>{pending}</div>
                  <div style={{ display: 'flex', gap: 6 }}><button className="btn sm" onClick={() => onResolve(s.k, 'mine')} data-testid={`sitrep-keep-${s.k}`}>Keep mine</button><button className="btn sm" onClick={() => onResolve(s.k, 'new')} data-testid={`sitrep-take-${s.k}`}>Take new text</button></div>
                </div>
              )}
            </section>
          );
        })}
        {evidence.length > 0 && (
          <section className="sr2-sec" data-testid="sitrep-evidence">
            {head('evidence', 'Evidence', <span className="sidenote num">{evidence.length} · revisions as of {clock(v.asOf)}</span>)}
            {!shut.has('evidence') && (
              <>
                <div className="evs">{(more ? evidence : evidence.slice(0, PREVIEW)).map((e, i) => <Citation key={i} cite={e} origin={`Sit. Rep ${v.number}`} />)}</div>
                {evidence.length > PREVIEW && <button className="link" style={{ marginTop: 6 }} onClick={() => setMore((x) => !x)} data-testid="sitrep-evidence-more">{more ? 'Show less' : `Show more (${evidence.length - PREVIEW})`}</button>}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
