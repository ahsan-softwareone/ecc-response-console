import { useMemo, useState, type ReactNode } from 'react';
import { EMERGENCY_META, EQUIPMENT, SITES } from '../data/scenario';
import { currentRun, INCIDENT_TYPES, isOpen, LIFECYCLE_LABEL } from '../lib/agent';
import { useAgentDisplay } from '../lib/agentStatus';
import { ATTENTION, useDerived } from '../lib/derive';
import { clock, dateTime, now, pad2 } from '../lib/time';
import { exportIncident } from '../record/backup';
import { downloadBlob } from '../record/exports';
import { useStore, type Dialog, type Result } from '../store';
import { useEscape } from '../ui/esc';
import { Icon } from '../ui/Icon';

const toLocal = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
/** Form text lives in the store, so dismissing a dialog never discards what was typed. */
function useDraft(key: string, initial = ''): [string, (v: string) => void] {
  const v = useStore((s) => s.drafts[key]);
  const setDraft = useStore((s) => s.setDraft);
  return [v ?? initial, (x) => setDraft(key, x)];
}
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function Modal({ title, onClose, children, footer, testId, wide }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; testId: string; wide?: boolean }) {
  useEscape(true, onClose);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} aria-modal="true" data-testid={testId}>
        <header className="modal-h"><span className="title">{title}</span><span className="spacer" /><button className="iconbtn sm" onClick={onClose} title="Dismiss (Esc). What you typed is kept." aria-label="Dismiss"><Icon name="close" size={14} /></button></header>
        <div className="modal-b">{children}</div>
        <footer className="modal-f">{footer}</footer>
      </div>
    </div>
  );
}
const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => <label className="field"><span className="label">{label}</span>{children}{hint && <span className="sidenote">{hint}</span>}</label>;
const ErrorBox = ({ text }: { text: string | null }) => (text ? <div className="supnote" data-testid="dialog-error"><Icon name="warn" size={13} />{text}</div> : null);

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  if (!dialog) return null;
  if (dialog.type === 'start') return <StartDialog key={dialog.mode} dialog={dialog} />;
  if (dialog.type === 'resolve') return <ResolveDialog />;
  if (dialog.type === 'return-active') return <ReasonDialog title="Return to Active" testId="return-active-dialog" explain="Use this when conditions have deteriorated. The earlier resolution stays in the record, with who changed it, when and why." submit="Return to Active" draftKey="return" run={(r) => useStore.getState().returnToActive(r)} />;
  if (dialog.type === 'close') return <CloseDialog />;
  if (dialog.type === 'closed') return <ClosedDialog id={dialog.id} />;
  if (dialog.type === 'stop-agent') return <StopDialog />;
  if (dialog.type === 'reopen') return <ReasonDialog title={`Reopen ${dialog.id}`} testId="reopen-dialog" explain="The closed record returns to Active under the same identity. The closure stays in its history. If another incident is open, it is set aside first with its record kept." submit="Reopen incident" draftKey="reopen" run={(r) => useStore.getState().reopenIncident(dialog.id, r, { setAside: true })} />;
  if (dialog.type === 'resume') return <ReasonDialog title={`Resume ${dialog.id}`} testId="resume-dialog" explain="The set-aside incident becomes current again. The incident open now is set aside with its record kept." submit="Set aside and resume" draftKey="resume" optional run={() => useStore.getState().resumeIncident(dialog.id, { setAside: true })} />;
  return null;
}

function StartDialog({ dialog }: { dialog: Extract<Dialog, { type: 'start' }> }) {
  const setDialog = useStore((s) => s.setDialog);
  const startIncident = useStore((s) => s.startIncident);
  const clearDrafts = useStore((s) => s.clearDrafts);
  const current = useStore((s) => s.records[s.incidentId]);
  const conflict = !!current && isOpen(current);
  const p = dialog.prefill;
  const training = dialog.mode === 'training';
  const [site, setSite] = useDraft('start.site', p?.site ?? SITES[0]);
  const [title, setTitle] = useDraft('start.title', p?.title ?? '');
  const [note, setNote] = useDraft('start.note', p?.notification ?? '');
  const [occurred, setOccurred] = useDraft('start.occurred', toLocal(now()));
  const [eq, setEq] = useDraft('start.eq', (p?.equipment ?? []).join(','));
  const [location, setLocation] = useDraft('start.location', p?.location ?? '');
  const [type, setType] = useDraft('start.type', p?.incidentType ?? '');
  const [aside, setAside] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const equipment = eq ? eq.split(',').filter(Boolean) : [];
  const siteEquipment = EQUIPMENT;
  const canStart = (training || (title.trim() && note.trim())) && (!conflict || aside) && !busy;
  const submit = async () => {
    setBusy(true); setErr(null);
    const t = new Date(occurred).getTime();
    const res = await startIncident(training
      ? { mode: 'training', site: EMERGENCY_META.facility, title: EMERGENCY_META.title, notification: 'Drone intercepted at the north perimeter; debris zone includes the propane recovery area.', via: EMERGENCY_META.reportedBy, equipment: [], incidentType: 'Security' }
      : { mode: 'real', site, title: title.trim(), notification: note.trim(), via: p?.via ?? 'Entered by the Shift Manager', occurredAt: Number.isNaN(t) ? undefined : t, equipment, location: location.trim() || undefined, incidentType: type || undefined, basedOn: p?.basedOn }, { setAside: aside });
    setBusy(false);
    if (res.ok) clearDrafts('start.'); else setErr(`The record was not saved, so nothing has started: ${res.error} Your entries are kept; try again.`);
  };
  return (
    <Modal title={training ? 'Start training scenario' : 'Start incident'} onClose={() => setDialog(null)} testId="start-dialog" footer={
      <><span className="sidenote grow">The record is saved first. {training ? 'Developments then unfold through the facilitator controls.' : 'Nothing is scripted for a real incident.'}</span>
        <button className="btn sm" onClick={() => setDialog(null)} data-testid="start-cancel">{conflict ? 'Keep current incident' : 'Cancel'}</button>
        <button className="btn sm primary" disabled={!canStart} onClick={() => void submit()} data-testid="start-submit">{conflict ? 'Set aside and start' : training ? 'Start training' : 'Create and save'}</button></>
    }>
      {conflict && (
        <div className="choice" data-testid="start-conflict">
          <b>{current!.id} is open ({LIFECYCLE_LABEL[current!.status]}).</b>
          <p className="sidenote">Starting another will not reset it. Its record is saved as it stands and its agent run stops; resume it later from this workspace or Knowledge → Incidents.</p>
          <label className="check"><input type="checkbox" checked={aside} onChange={(e) => setAside(e.target.checked)} data-testid="start-setaside" /> Set {current!.id} aside and start a new incident</label>
        </div>
      )}
      {training ? (
        <dl className="kv"><dt>Scenario</dt><dd>{EMERGENCY_META.title}</dd><dt>Site</dt><dd>{EMERGENCY_META.facility}</dd><dt>Data</dt><dd>Illustrative. Developments are revealed step by step.</dd></dl>
      ) : (
        <div className="form-grid">
          {p?.basedOn && <div className="choice full" data-testid="based-on-note"><b>Reference: {p.basedOn.id}</b><p className="sidenote">This creates a new incident with its own identity. No decisions, measurements or completed actions are copied. Historical actions are precedent, not applicable protocol.</p></div>}
          <Field label="Site / facility"><select className="select" value={site} onChange={(e) => setSite(e.target.value)} data-testid="start-site">{SITES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Occurred at" hint="Defaults to now; change it if the event began earlier."><input className="input" type="datetime-local" value={occurred} max={toLocal(now())} onChange={(e) => setOccurred(e.target.value)} data-testid="start-occurred" /></Field>
          <div className="full"><Field label="Short title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is happening, in a few words" data-testid="start-title" /></Field></div>
          <div className="full"><Field label="Initial notification"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was reported, and by whom" data-testid="start-notification" /></Field></div>
          <Field label="Equipment, if known">
            <div className="checks" data-testid="start-equipment">{siteEquipment.map((e) => <label className="check" key={e.id}><input type="checkbox" checked={equipment.includes(e.id)} onChange={() => setEq((equipment.includes(e.id) ? equipment.filter((x) => x !== e.id) : [...equipment, e.id]).join(','))} data-testid={`start-eq-${e.id}`} /> {e.id}</label>)}</div>
          </Field>
          <div>
            <Field label="Location, if known"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} data-testid="start-location" /></Field>
            <Field label="Type, if known"><select className="select" value={type} onChange={(e) => setType(e.target.value)} data-testid="start-type"><option value="">Not stated</option>{INCIDENT_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
        </div>
      )}
      <ErrorBox text={err} />
    </Modal>
  );
}

function ResolveDialog() {
  const record = useStore((s) => s.records[s.incidentId])!;
  const setDialog = useStore((s) => s.setDialog);
  const resolveIncident = useStore((s) => s.resolveIncident);
  const clearDrafts = useStore((s) => s.clearDrafts);
  const d = useDerived();
  const a = useAgentDisplay();
  const [summary, setSummary] = useDraft('resolve.summary');
  const [rationale, setRationale] = useDraft('resolve.rationale');
  const [time, setTime] = useDraft('resolve.time', toLocal(now()));
  const [ev, setEv] = useDraft('resolve.evidence');
  const [risks, setRisks] = useDraft('resolve.risks');
  const [follow, setFollow] = useDraft('resolve.follow');
  const [err, setErr] = useState<string | null>(null);
  const chosen = ev ? ev.split('\n') : [];
  // The same words can be recorded as an observation and as a report; offer them once.
  const candidates = useMemo(() => [...new Set(record.events.filter((e) => e.kind === 'observation' || e.kind === 'report' || e.kind === 'measurement').slice(-8).reverse().map((e) => `${clock(e.t)} ${e.title}`))], [record.events]);
  const unresolved = d.alerts.filter((x) => ATTENTION.includes(x.condition));
  const submit = async () => {
    const t = new Date(time).getTime();
    const outstanding = [...unresolved.map((x) => `Unresolved alert: ${x.def.title}`), ...(a.heldCount ? [`${a.heldCount} update${a.heldCount === 1 ? '' : 's'} received but not analysed by the agent`] : []), ...lines(risks)];
    const res = await resolveIncident({ t: Number.isNaN(t) ? now() : t, summary: summary.trim(), rationale: rationale.trim(), evidence: chosen, outstanding, followUp: lines(follow) });
    if (res.ok) { clearDrafts('resolve.'); setDialog(null); } else setErr(`Not saved, so the incident stays Active: ${res.error}`);
  };
  return (
    <Modal wide title="Resolve incident" onClose={() => setDialog(null)} testId="resolve-dialog" footer={
      <><span className="sidenote grow">Your judgement, recorded with your name. It is never inferred from falling readings or completed actions. The agent keeps running until you stop it or close the incident.</span>
        <button className="btn sm" onClick={() => setDialog(null)}>Cancel</button>
        <button className="btn sm primary" disabled={!summary.trim() || !rationale.trim()} onClick={() => void submit()} data-testid="resolve-submit">Record resolution</button></>
    }>
      <div className="form-grid">
        <div className="full"><Field label="Resolution summary"><input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="The emergency is stabilized or resolved because…" data-testid="resolve-summary" /></Field></div>
        <div className="full"><Field label="Rationale"><textarea className="textarea" value={rationale} onChange={(e) => setRationale(e.target.value)} data-testid="resolve-rationale" /></Field></div>
        <Field label="Resolution time"><input className="input" type="datetime-local" value={time} max={toLocal(now())} onChange={(e) => setTime(e.target.value)} data-testid="resolve-time" /></Field>
        <div />
        <div className="full">
          <span className="label">Supporting observations or evidence</span>
          <div className="checks col" data-testid="resolve-evidence">{candidates.length === 0 && <span className="sidenote">No observations or readings recorded yet.</span>}{candidates.map((c) => <label className="check" key={c}><input type="checkbox" checked={chosen.includes(c)} onChange={() => setEv((chosen.includes(c) ? chosen.filter((x) => x !== c) : [...chosen, c]).join('\n'))} /> <span className="wrap">{c}</span></label>)}</div>
        </div>
        <div className="full" data-testid="resolve-unresolved">
          <span className="label">Unresolved alerts carried forward · {unresolved.length}</span>
          {unresolved.length ? <ul className="plain">{unresolved.map((x) => <li key={x.id}>{x.def.title.startsWith(x.def.equipmentId) ? x.def.title : `${x.def.equipmentId}: ${x.def.title}`}</li>)}</ul> : <p className="sidenote">None needing attention at this time.</p>}
          {a.heldCount > 0 && <p className="sidenote">{a.heldCount} update{a.heldCount === 1 ? '' : 's'} received but not analysed by the agent will also be listed.</p>}
        </div>
        <Field label="Outstanding risks, one per line"><textarea className="textarea" value={risks} onChange={(e) => setRisks(e.target.value)} data-testid="resolve-risks" /></Field>
        <Field label="Follow-up work, one per line"><textarea className="textarea" value={follow} onChange={(e) => setFollow(e.target.value)} data-testid="resolve-follow" /></Field>
      </div>
      <ErrorBox text={err} />
    </Modal>
  );
}

function CloseDialog() {
  const record = useStore((s) => s.records[s.incidentId])!;
  const setDialog = useStore((s) => s.setDialog);
  const closeIncident = useStore((s) => s.closeIncident);
  const clearDrafts = useStore((s) => s.clearDrafts);
  const d = useDerived();
  const a = useAgentDisplay();
  const initialOutstanding = useMemo(() => [...new Set([...(record.resolution?.outstanding ?? []), ...d.alerts.filter((x) => ATTENTION.includes(x.condition)).map((x) => `Unresolved alert: ${x.def.title}`), ...(record.resolution?.followUp ?? []).map((f) => `Follow-up: ${f}`)])].join('\n'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [rationale, setRationale] = useDraft('close.rationale');
  const [outstanding, setOutstanding] = useDraft('close.outstanding', initialOutstanding);
  const [reviewed, setReviewed] = useState(false);
  const last = record.reportVersions[record.reportVersions.length - 1];
  const [snapshot, setSnapshot] = useState(!last || last.status !== 'approved');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = currentRun(record);
  const sitrepState = last ? `SITREP ${last.number} is ${last.status === 'approved' ? 'approved' : last.status === 'review' ? 'in review, not approved' : 'a draft, not approved'}` : 'No SITREP exists yet';
  const submit = async () => {
    setBusy(true); setErr(null);
    const res = await closeIncident(rationale.trim(), lines(outstanding), { snapshot });
    setBusy(false);
    if (res.ok) clearDrafts('close.'); else setErr(`Not closed. ${res.error} The incident stays open and your working record is intact. Retry, or export it now.`);
  };
  return (
    <Modal wide title="Closure review" onClose={() => setDialog(null)} testId="close-dialog" footer={
      <><span className="sidenote grow">Closing finalizes this record for historical review. It does not state that equipment is safe.</span>
        {err && <button className="btn sm" onClick={async () => { const { blob } = await exportIncident(record, now()); downloadBlob(blob, `${record.id}.json`); }} data-testid="close-export">Export record</button>}
        <button className="btn sm" onClick={() => setDialog(null)}>Cancel</button>
        <button className="btn sm primary" disabled={!rationale.trim() || !reviewed || busy} onClick={() => void submit()} data-testid="close-save">{err ? 'Retry closing' : 'Close incident'}</button></>
    }>
      <div className="form-grid">
        <div className="full">
          <span className="label">Resolution</span>
          <p data-testid="close-resolution"><b>{record.resolution?.summary}</b> <span className="sidenote">· {record.resolution ? `${dateTime(record.resolution.t)} · ${record.resolution.by}` : ''}</span></p>
          <p className="sidenote">{record.resolution?.rationale}</p>
          <label className="check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} data-testid="close-reviewed" /> I have reviewed the resolution summary and the outstanding items below</label>
        </div>
        <div className="full"><Field label="Outstanding items carried into the closed record, one per line"><textarea className="textarea" style={{ minHeight: 84 }} value={outstanding} onChange={(e) => setOutstanding(e.target.value)} data-testid="close-outstanding" /></Field></div>
        <div className="full"><Field label="Closure rationale"><textarea className="textarea" value={rationale} onChange={(e) => setRationale(e.target.value)} data-testid="close-rationale" /></Field></div>
        <div>
          <span className="label">Final timeline and SITREP</span>
          <p data-testid="close-sitrep-state">{sitrepState}. The state is preserved as it is; closing approves nothing.</p>
          <label className="check"><input type="checkbox" checked={snapshot} onChange={(e) => setSnapshot(e.target.checked)} data-testid="close-snapshot" /> Add a final SITREP snapshot from the record (saved as a draft, not approved)</label>
        </div>
        <div>
          <span className="label">Effect on the agent</span>
          <p data-testid="close-agent-effect">{run && run.endedAt == null ? `Run ${run.number} ends and its final status is kept.` : run ? `Run ${run.number} has already ended; its status is kept.` : 'The agent never ran on this incident.'} {a.heldCount > 0 ? `${a.heldCount} update${a.heldCount === 1 ? '' : 's'} will remain unanalysed. ` : ''}Site-wide systems are not affected.</p>
        </div>
      </div>
      <ErrorBox text={err} />
    </Modal>
  );
}

function ClosedDialog({ id }: { id: string }) {
  const record = useStore((s) => s.records[id]);
  const setDialog = useStore((s) => s.setDialog);
  const returnToWorkspace = useStore((s) => s.returnToWorkspace);
  const setNav = useStore((s) => s.setNav);
  const setKnowledgeView = useStore((s) => s.setKnowledgeView);
  const [note, setNote] = useState<string | null>(null);
  if (!record) return null;
  return (
    <Modal title="Incident closed and saved" onClose={() => setDialog(null)} testId="closed-dialog" footer={
      <><span className="spacer" />
        <button className="btn sm" onClick={() => { setDialog(null); setNav('knowledge'); setKnowledgeView('incidents', id); }} data-testid="closed-view">View closed record</button>
        <button className="btn sm" onClick={async () => { const { blob, contents } = await exportIncident(record, now()); downloadBlob(blob, `${id}.json`); setNote(contents.attachments); }} data-testid="closed-export"><Icon name="download" size={13} /> Export complete record</button>
        <button className="btn sm primary" onClick={returnToWorkspace} data-testid="closed-return">Return to workspace</button></>
    }>
      <p>{id} is saved in this browser and available in Knowledge → Incidents. The same identity is kept; nothing was duplicated or deleted.</p>
      <dl className="kv" style={{ marginTop: 10 }}>
        <dt>Closed</dt><dd>{record.closure ? `${dateTime(record.closure.t)} · ${record.closure.by}` : ''}</dd>
        <dt>SITREP</dt><dd data-testid="closed-sitrep">{record.closure?.sitrep}</dd>
        <dt>Outstanding</dt><dd>{record.closure?.outstanding.length ?? 0} item{record.closure?.outstanding.length === 1 ? '' : 's'} carried in the record</dd>
      </dl>
      {note && <p className="sidenote" style={{ marginTop: 8 }} data-testid="export-contents">{note}</p>}
    </Modal>
  );
}

function StopDialog() {
  const setDialog = useStore((s) => s.setDialog);
  const agentStop = useStore((s) => s.agentStop);
  const clearDrafts = useStore((s) => s.clearDrafts);
  const a = useAgentDisplay();
  const [reason, setReason] = useDraft('stop.reason');
  return (
    <Modal title="Stop the agent?" onClose={() => setDialog(null)} testId="stop-dialog" footer={
      <><span className="spacer" /><button className="btn sm" onClick={() => setDialog(null)}>Keep running</button>
        <button className="btn sm primary" disabled={!reason.trim()} onClick={() => { void agentStop(reason.trim(), a.inFlight); clearDrafts('stop.'); setDialog(null); }} data-testid="stop-confirm">Stop agent</button></>
    }>
      <ul className="plain">
        <li>New analysis ceases: no new alerts, findings or recommendations.{a.inFlight.length ? ` In progress and cancelled: ${a.inFlight.join(', ')}.` : ' Nothing is in progress.'}</li>
        <li>All prior work stays in the record.</li>
        <li>Readings and field reports keep updating, but nothing interprets them.</li>
        <li>The incident stays open. Stopping the agent does not close it.</li>
        <li>Start again later creates a new recorded run, which catches up on what arrived.</li>
      </ul>
      <div style={{ marginTop: 10 }}><Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="stop-reason" /></Field></div>
    </Modal>
  );
}

function ReasonDialog({ title, testId, explain, submit, draftKey, run, optional }: { title: string; testId: string; explain: string; submit: string; draftKey: string; optional?: boolean; run: (reason: string) => Promise<Result> }) {
  const setDialog = useStore((s) => s.setDialog);
  const clearDrafts = useStore((s) => s.clearDrafts);
  const [reason, setReason] = useDraft(`reason.${draftKey}`);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={() => setDialog(null)} testId={testId} footer={
      <><span className="spacer" /><button className="btn sm" onClick={() => setDialog(null)}>Cancel</button>
        <button className="btn sm primary" disabled={!optional && !reason.trim()} onClick={async () => { const res = await run(reason.trim()); if (res.ok) { clearDrafts(`reason.${draftKey}`); setDialog(null); } else setErr(res.error); }} data-testid="reason-submit">{submit}</button></>
    }>
      <p>{explain}</p>
      {!optional && <div style={{ marginTop: 10 }}><Field label="Reason"><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reason-text" /></Field></div>}
      <ErrorBox text={err} />
    </Modal>
  );
}
