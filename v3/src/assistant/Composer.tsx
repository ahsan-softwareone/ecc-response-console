import { useEffect, useMemo, useState } from 'react';
import { EQUIPMENT } from '../data/scenario';
import { agentStateOf, isOpen } from '../lib/agent';
import { now } from '../lib/time';
import { OBSERVATION_SOURCE, type ObservationSource } from '../record/types';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';

const D = { q: 'assistant.q', text: 'assistant.obs.text', eq: 'assistant.obs.equipment', loc: 'assistant.obs.location', time: 'assistant.obs.time', src: 'assistant.obs.source', det: 'assistant.obs.detail', ask: 'assistant.obs.question' };
const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function Composer({ onSearch, busy }: { onSearch: (text: string) => void; busy: boolean }) {
  const mode = useStore((s) => s.assistantMode);
  const setMode = useStore((s) => s.setAssistantMode);
  return (
    <div className="as-composer" data-testid="assistant-composer" data-mode={mode}>
      <div className="seg sm as-mode" role="tablist" aria-label="Assistant input mode">
        <button aria-pressed={mode === 'ask'} onClick={() => setMode('ask')} data-testid="mode-ask">Ask a question</button>
        <button aria-pressed={mode === 'report'} onClick={() => setMode('report')} data-testid="mode-report">Report an observation</button>
      </div>
      {mode === 'ask' ? <AskForm onSearch={onSearch} busy={busy} /> : <ReportForm />}
    </div>
  );
}

function AskForm({ onSearch, busy }: { onSearch: (text: string) => void; busy: boolean }) {
  const q = useStore((s) => s.drafts[D.q] ?? '');
  const setDraft = useStore((s) => s.setDraft);
  const record = useStore((s) => s.records[s.incidentId]);
  const sites = useStore((s) => s.assistantSites); const types = useStore((s) => s.assistantTypes);
  const indexReady = useStore((s) => s.indexReady);
  const submitQuestion = useStore((s) => s.submitQuestion);
  const clear = useStore((s) => s.clearAssistant);
  const hasMessages = useStore((s) => s.assistantMessages.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const recorded = !!record && isOpen(record);
  const send = async () => {
    const text = q.trim(); if (!text) return;
    if (!recorded) { setDraft(D.q, ''); onSearch(text); return; }
    setSending(true); setError(null);
    const res = await submitQuestion(text, { sites, types });
    setSending(false);
    if (res.ok) setDraft(D.q, ''); else setError(res.error);
  };
  return (
    <>
      <form className="as-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input className="input" placeholder={!indexReady ? 'Indexing documents…' : recorded ? 'Ask about this incident or its documents…' : 'Search Knowledge for evidence…'} value={q} onChange={(e) => { setDraft(D.q, e.target.value); setError(null); }} disabled={busy || sending} aria-label="Question" data-testid="assistant-input" />
        <button className="btn primary sm" type="submit" disabled={!q.trim() || busy || sending || !indexReady} data-testid="assistant-send">{recorded ? 'Ask' : 'Search'}</button>
        {hasMessages && <button className="btn sm" type="button" onClick={clear} title="Clear Knowledge searches. Incident questions stay in the record.">Clear</button>}
      </form>
      {!recorded && <div className="sidenote as-note" data-testid="ask-unrecorded">{record ? 'This record is closed. Questions search Knowledge and are not added to it.' : 'No incident is open. Questions search Knowledge and are not recorded.'}</div>}
      {error && <div className="supnote as-note" data-testid="ask-error"><Icon name="warn" size={13} />Question not saved: {error}. Your wording is kept.<button className="link" onClick={() => void send()} data-testid="ask-retry">Retry</button></div>}
    </>
  );
}

function ReportForm() {
  const drafts = useStore((s) => s.drafts);
  const setDraft = useStore((s) => s.setDraft);
  const clearDrafts = useStore((s) => s.clearDrafts);
  const record = useStore((s) => s.records[s.incidentId]);
  const records = useStore((s) => s.records);
  const context = useStore((s) => s.assistantContext);
  const sites = useStore((s) => s.assistantSites); const types = useStore((s) => s.assistantTypes);
  const dashboard = useStore((s) => s.dashboard);
  const submit = useStore((s) => s.submitObservation);
  const setDialog = useStore((s) => s.setDialog);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const v = (k: string) => drafts[k] ?? '';
  const equipment = drafts[D.eq] ?? context.equipmentId ?? '';
  useEffect(() => { if (v(D.text)) setConfirm(null); }, [drafts[D.text]]); // eslint-disable-line react-hooks/exhaustive-deps
  const setAside = useMemo(() => Object.values(records).filter((r) => r.status === 'left-open' && r.provenance !== 'seed'), [records]);

  if (!record) return (
    <div className="as-dest" data-testid="obs-no-incident">
      <p><b>No incident is open.</b> An observation must go into an incident you choose. Your wording below is kept while you choose.</p>
      <textarea className="textarea" rows={2} placeholder="What was observed or reported" value={v(D.text)} onChange={(e) => setDraft(D.text, e.target.value)} aria-label="Observation" data-testid="obs-text" />
      <div className="row">
        <button className="btn sm" onClick={() => setDialog({ type: 'start', mode: 'real' })} data-testid="obs-start-incident">Start incident</button>
        {setAside.map((r) => <button key={r.id} className="btn sm" onClick={() => setDialog({ type: 'resume', id: r.id })} data-testid={`obs-resume-${r.id}`}>Resume {r.id}</button>)}
      </div>
    </div>
  );
  if (!isOpen(record)) return (
    <div className="as-dest" data-testid="obs-closed">
      <p><b>This record is closed and read-only here.</b> Use an addendum to add to it, or reopen it with a reason.</p>
      <div className="row"><button className="btn sm" onClick={() => setDialog({ type: 'closed', id: record.id })} data-testid="obs-closed-options">Addendum or reopen</button></div>
    </div>
  );

  const agent = agentStateOf(record);
  const send = async () => {
    const text = v(D.text).trim(); if (!text) return;
    let observedAt: number | undefined;
    if (v(D.time)) {
      observedAt = new Date(v(D.time)).getTime();
      if (Number.isNaN(observedAt)) { setFieldError('Enter a valid observed time.'); return; }
      if (observedAt > now() + 60_000) { setFieldError('Observed time cannot be in the future.'); return; }
    }
    setFieldError(null); setSending(true); setError(null);
    const res = await submit({ text, equipmentId: equipment || undefined, location: v(D.loc).trim() || undefined, observedAt, sourceType: (v(D.src) || 'field') as ObservationSource, sourceDetail: v(D.det).trim() || undefined, question: v(D.ask).trim() || undefined, alertId: context.alertId }, { sites, types });
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    clearDrafts('assistant.obs.');
    setConfirm(agent === 'running' ? 'Investigation started.' : 'Analysis has not started because the agent is not running.');
  };
  return (
    <div className="as-report" data-testid="obs-form">
      <div className="sidenote" data-testid="obs-destination">Records in <b>{record.id}</b> · {record.title}{record.mode === 'training' ? ' · training' : ''}</div>
      <textarea className="textarea" rows={2} placeholder="What was observed or reported (required)" value={v(D.text)} onChange={(e) => { setDraft(D.text, e.target.value); setError(null); }} aria-label="Observation" data-testid="obs-text" />
      <div className="as-fields">
        <label><span className="label">Equipment</span><select className="select" value={equipment} onChange={(e) => setDraft(D.eq, e.target.value)} data-testid="obs-equipment"><option value="">Not specified</option>{[...dashboard, ...EQUIPMENT.map((x) => x.id).filter((id) => !dashboard.includes(id))].map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
        <label><span className="label">Location</span><input className="input" value={v(D.loc)} onChange={(e) => setDraft(D.loc, e.target.value)} placeholder="Optional" data-testid="obs-location" /></label>
        <label><span className="label">Source</span><select className="select" value={v(D.src) || 'field'} onChange={(e) => setDraft(D.src, e.target.value)} data-testid="obs-source">{(Object.keys(OBSERVATION_SOURCE) as ObservationSource[]).map((k) => <option key={k} value={k}>{OBSERVATION_SOURCE[k]}</option>)}</select></label>
        <label><span className="label">Source details</span><input className="input" value={v(D.det)} onChange={(e) => setDraft(D.det, e.target.value)} placeholder="Who, or which instrument" data-testid="obs-source-detail" /></label>
        <label className="wide"><span className="label">Observed time</span>{v(D.time) ? <span className="as-time"><input className="input" type="datetime-local" value={v(D.time)} max={toLocal(now())} onChange={(e) => setDraft(D.time, e.target.value)} data-testid="obs-time" /><button className="link" type="button" onClick={() => setDraft(D.time, '')} data-testid="obs-time-now">Use now</button></span> : <span className="as-time"><span data-testid="obs-time-default">Now, when you record it</span><button className="link" type="button" onClick={() => setDraft(D.time, toLocal(now()))} data-testid="obs-time-edit">Edit</button></span>}</label>
        <label className="wide"><span className="label">Question, optional</span><input className="input" value={v(D.ask)} onChange={(e) => setDraft(D.ask, e.target.value)} placeholder="What does this change?" data-testid="obs-question" /></label>
      </div>
      {fieldError && <div className="supnote" data-testid="obs-field-error"><Icon name="warn" size={13} />{fieldError}</div>}
      {error && <div className="supnote" data-testid="obs-error"><Icon name="warn" size={13} />Not recorded: {error}. Your entry is kept.<button className="link" onClick={() => void send()} data-testid="obs-retry">Retry</button></div>}
      {confirm && !v(D.text) && <div className="as-confirm" role="status" data-testid="obs-confirm"><Icon name="check" size={13} /><span><b>Observation recorded.</b> Added to the timeline. {confirm}</span></div>}
      <div className="row"><button className="btn primary sm" disabled={!v(D.text).trim() || sending} onClick={() => void send()} data-testid="obs-submit">Record observation</button></div>
    </div>
  );
}
