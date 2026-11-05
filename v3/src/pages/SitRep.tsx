import { useLayoutEffect, useRef, useState } from 'react';
import { clock, dateTime, now } from '../lib/time';
import { downloadBlob, sitrepPdf, timelineReportPdf } from '../record/exports';
import { TimelineView } from '../record/TimelineView';
import type { IncidentRecord, ReportVersion, SitrepSectionKey } from '../record/types';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { PaneMaximize, SplitPane } from '../ui/Split';
import { Citation } from '../ui/Citation';

const SECTIONS: { k: SitrepSectionKey; l: string }[] = [{ k: 'situation', l: 'Situation' }, { k: 'response', l: 'Response' }, { k: 'decisions', l: 'Decisions' }, { k: 'outstanding', l: 'Outstanding concerns' }, { k: 'priorities', l: 'Priorities' }];

export function SitRep() {
  const incidentId = useStore((s) => s.incidentId);
  const record = useStore((s) => s.records[s.incidentId]);
  const storageError = useStore((s) => s.storageError);
  const [counts, setCounts] = useState({ shown: 0, total: 0, filtered: false });
  if (!record) return <div className="page"><div className="pane grow"><div className="empty">Loading the incident record…</div></div></div>;
  const closed = record.status === 'closed';
  return (
    <div className="page" data-testid="page-sitrep">
      <SplitPane id="sitrep" side="end" defaultSize={440} min={[360, 520]}>
      <div className="pane grow">
        <div className="pane-h">
          <span className="title">Incident timeline</span>
          <span className="sidenote" data-testid="sitrep-record-id">{incidentId} · {record.events.length} entries</span>
          {closed && <span className="chip outline" data-testid="closed-chip">Closed</span>}
          {record.status === 'stabilizing' && <span className="chip soft">Stabilizing</span>}
          {storageError && <span className="chip outline" title={storageError} style={{ color: 'var(--crit-ink)' }}>Not saved locally</span>}
          <span className="spacer" />
          <button className="btn sm" onClick={() => downloadBlob(timelineReportPdf(record, now()), `${record.id}-timeline-report.pdf`)} data-testid="download-timeline" title={counts.filtered ? `Includes all ${counts.total} entries, not only the ${counts.shown} shown` : 'Full chronological record as PDF'}>
            <Icon name="download" size={14} /> Timeline Report (PDF){counts.filtered ? ` · all ${counts.total}` : ''}
          </button>
          <PaneMaximize pane="a" />
        </div>
        <div className="pane-b">
          <TimelineView record={record} editable onCountChange={(shown, total, filtered) => { if (shown !== counts.shown || total !== counts.total || filtered !== counts.filtered) setCounts({ shown, total, filtered }); }} />
        </div>
      </div>
      <div className="pane grow">
        <ReportsPane record={record} />
      </div>
      </SplitPane>
    </div>
  );
}

function ReportsPane({ record }: { record: IncidentRecord }) {
  const { createSitrepVersion, editSitrepSection, refreshSitrepDraft, resolveSitrepPending, submitSitrepReview, approveSitrep, addLesson } = useStore.getState();
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<'reports' | 'status'>('reports');
  const versions = [...record.reportVersions].sort((a, b) => b.number - a.number);
  const v = versions.find((x) => x.id === sel) ?? versions[0] ?? null;
  const closed = record.status === 'closed';

  return (
    <>
      <div className="pane-h">
        <span className="seg"><button aria-pressed={mode === 'reports'} onClick={() => setMode('reports')} data-testid="side-reports">SITREP</button><button aria-pressed={mode === 'status'} onClick={() => setMode('status')} data-testid="side-status">Status & closure</button></span>
        <span className="spacer" />
        {mode === 'reports' && !closed && <button className="btn sm action" onClick={() => void createSitrepVersion(now())} data-testid="sitrep-new"><Icon name="plus" size={13} /> New draft</button>}
        <PaneMaximize pane="b" />
      </div>
      <div className="pane-b">
        {mode === 'reports' ? (
          <div className="detail">
            {versions.length === 0 && <p className="sidenote">No SITREP yet. A draft is generated from the record as of the moment you create it.</p>}
            {versions.length > 0 && (
              <div className="vlist" data-testid="sitrep-versions">
                {versions.map((x) => (
                  <button key={x.id} className={`vrow ${v?.id === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)} data-testid={`sitrep-v-${x.number}`}>
                    <b>SITREP {x.number}</b><span className={`chip ${x.status === 'approved' ? 'soft' : 'outline'}`}>{x.status === 'approved' ? 'Approved' : x.status === 'review' ? 'In review' : 'Draft'}</span><span className="sidenote num">as of {clock(x.asOf)}</span>
                  </button>
                ))}
              </div>
            )}
            {v && <VersionEditor v={v} record={record} onEdit={(k, t) => void editSitrepSection(v.id, k, t)} onRefresh={() => void refreshSitrepDraft(v.id, now())} onResolve={(k, take) => void resolveSitrepPending(v.id, k, take)} onReview={() => void submitSitrepReview(v.id)} onApprove={() => void approveSitrep(v.id)} />}
          </div>
        ) : <StatusPane record={record} onLesson={(t) => void addLesson(record.id, t)} />}
      </div>
    </>
  );
}

function AutoTextarea({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } }, [value]);
  return <textarea ref={ref} className="textarea autogrow" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
}

function VersionEditor({ v, record, onEdit, onRefresh, onResolve, onReview, onApprove }: { v: ReportVersion; record: IncidentRecord; onEdit: (k: SitrepSectionKey, t: string) => void; onRefresh: () => void; onResolve: (k: SitrepSectionKey, take: 'mine' | 'new') => void; onReview: () => void; onApprove: () => void }) {
  const editable = v.status !== 'approved';
  const evidence = (() => { const m = new Map<string, { docId: string; revision: string; page: number; label: string }>(); for (const e of record.events) if (e.t <= v.asOf) for (const x of e.evidence ?? []) m.set(`${x.docId}:${x.revision}:${x.page}`, { docId: x.docId, revision: x.revision, page: x.page, label: x.label }); return [...m.values()]; })();
  return (
    <div data-testid="sitrep-editor" data-version={v.number} data-status={v.status}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="sidenote">As of {dateTime(v.asOf)} · {v.status === 'approved' ? `approved by ${v.approvedBy} · ${clock(v.approvedAt!)}` : v.status === 'review' ? 'in review · editable' : 'draft · editable'}</span>
        <span style={{ flex: 1 }} />
        {editable && <button className="btn sm" onClick={onRefresh} title="Regenerate from the record as of now; your edited sections are kept until you choose" data-testid="sitrep-refresh">Refresh</button>}
        {v.status === 'draft' && <button className="btn sm" onClick={onReview} data-testid="sitrep-review">Submit for review</button>}
        {v.status === 'review' && <button className="btn sm primary" onClick={onApprove} data-testid="sitrep-approve"><Icon name="check" size={13} /> Approve</button>}
        <button className="btn sm" onClick={() => downloadBlob(sitrepPdf(record, v), `${record.id}-SITREP-${v.number}.pdf`)} data-testid="download-sitrep"><Icon name="download" size={13} /> PDF</button>
      </div>
      {evidence.length > 0 && (
        <div style={{ marginBottom: 10 }} data-testid="sitrep-evidence">
          <div className="label" style={{ marginBottom: 4 }}>Evidence as of {clock(v.asOf)} · revisions pinned</div>
          <div className="evs">{evidence.map((e, i) => <Citation key={i} cite={e} origin={`SITREP ${v.number}`} />)}</div>
        </div>
      )}
      <div className="sitrep-grid">
        {SECTIONS.map((s) => {
          const pending = v.pending?.[s.k];
          const edited = v.sections[s.k] !== v.generated[s.k];
          return (
            <div key={s.k} className="sitrep-field" data-testid={`sitrep-field-${s.k}`} data-edited={edited}>
              <label className="label">{s.l}{edited && <span className="chip outline" style={{ marginLeft: 6 }}>edited</span>}</label>
              {editable ? <AutoTextarea value={v.sections[s.k]} onChange={(t) => onEdit(s.k, t)} testId={`sitrep-input-${s.k}`} /> : <div className="ro">{v.sections[s.k]}</div>}
              {pending != null && (
                <div className="supnote" data-testid={`sitrep-pending-${s.k}`} style={{ marginTop: 6, flexDirection: 'column', gap: 6 }}>
                  <div><Icon name="warn" size={13} /> Newer text is available from the record. Your edit has been kept.</div>
                  <div className="ro" style={{ background: 'transparent', color: 'var(--text)' }}>{pending}</div>
                  <div style={{ display: 'flex', gap: 6 }}><button className="btn sm" onClick={() => onResolve(s.k, 'mine')} data-testid={`sitrep-keep-${s.k}`}>Keep mine</button><button className="btn sm" onClick={() => onResolve(s.k, 'new')} data-testid={`sitrep-take-${s.k}`}>Take new text</button></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPane({ record, onLesson }: { record: IncidentRecord; onLesson: (t: string) => void }) {
  const [lesson, setLesson] = useState('');
  const [observation, setObservation] = useState('');
  const setDialog = useStore((s) => s.setDialog);
  const addObservation = useStore((s) => s.addObservation);
  const closed = record.status === 'closed';
  const active = record.status === 'active' || record.status === 'stabilizing';
  return (
    <div className="detail" data-testid="status-pane">
      <div>
        <h3>Lifecycle</h3>
        <p className="lifecycle" data-testid="lifecycle-steps"><span className={active ? 'on' : ''}>Active</span> → <span className={record.status === 'resolved' ? 'on' : ''}>Resolved</span> → <span className={closed ? 'on' : ''}>Closed</span></p>
        {record.stabilization && <p data-testid="stabilization-recorded">Stabilization recorded {dateTime(record.stabilization.t)} by {record.stabilization.by}: {record.stabilization.rationale}</p>}
        {active && <div className="row"><button className="btn sm" onClick={() => setDialog({ type: 'resolve' })} data-testid="status-resolve">Resolve incident</button><span className="sidenote">Your judgement, recorded with your name. Never inferred from readings.</span></div>}
      </div>
      {record.resolution && (
        <div data-testid="resolution-recorded">
          <h3>Resolution</h3>
          <p><b>{record.resolution.summary}</b></p>
          <p className="sidenote">{dateTime(record.resolution.t)} · {record.resolution.by}</p>
          <p style={{ marginTop: 4 }}>{record.resolution.rationale}</p>
          {record.resolution.evidence.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Evidence</div><ul className="plain">{record.resolution.evidence.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {record.resolution.outstanding.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Outstanding</div><ul className="plain">{record.resolution.outstanding.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {record.resolution.followUp.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Follow-up</div><ul className="plain">{record.resolution.followUp.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {record.status === 'resolved' && <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setDialog({ type: 'close' })} data-testid="status-close">Review and close</button><button className="btn sm" onClick={() => setDialog({ type: 'return-active' })} data-testid="status-return-active">Return to Active</button></div>}
        </div>
      )}
      {closed && (
        <div data-testid="closure-recorded">
          <h3>Closure</h3>
          <p>Closed {dateTime(record.closure!.t)} by {record.closure!.by}.</p>
          <p style={{ marginTop: 4 }}>{record.closure!.rationale}</p>
          {record.closure!.sitrep && <p className="sidenote" style={{ marginTop: 4 }} data-testid="closure-sitrep">{record.closure!.sitrep}</p>}
          <div className="label" style={{ marginTop: 10 }}>Outstanding at closure</div>
          {record.closure!.outstanding.length ? <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{record.closure!.outstanding.map((o, i) => <li key={i} data-testid="outstanding-item">{o}</li>)}</ul> : <p className="sidenote">None recorded.</p>}
          <p className="sidenote" style={{ marginTop: 8 }}>The record is read-only except for appended corrections, addenda and lessons learned. Closing did not change equipment or alert state.</p>
        </div>
      )}
      {!closed && (
        <div>
          <h3>Log an observation</h3>
          <div className="decision"><textarea className="textarea" placeholder="What was seen or reported" value={observation} onChange={(e) => setObservation(e.target.value)} data-testid="observation-text" style={{ minHeight: 48 }} /><div className="row"><button className="btn sm" disabled={!observation.trim()} onClick={() => { void addObservation(observation.trim()); setObservation(''); }} data-testid="observation-save">Add to record</button></div></div>
        </div>
      )}
      <div>
        <h3>Lessons learned</h3>
        {record.lessons.length ? <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{record.lessons.map((l) => <li key={l.id} data-testid="lesson-item">{l.text} <span className="sidenote">— {l.by}, {clock(l.t)}</span></li>)}</ul> : <p className="sidenote" style={{ marginBottom: 8 }}>None recorded.</p>}
        <div className="decision"><textarea className="textarea" placeholder="Add a lesson learned" value={lesson} onChange={(e) => setLesson(e.target.value)} data-testid="lesson-text" style={{ minHeight: 48 }} /><div className="row"><button className="btn sm" disabled={!lesson.trim()} onClick={() => { onLesson(lesson.trim()); setLesson(''); }} data-testid="lesson-save">Append lesson</button></div></div>
      </div>
    </div>
  );
}
