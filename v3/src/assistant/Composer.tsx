import { useMemo, useState } from 'react';
import { EQUIPMENT } from '../data/scenario';
import { agentStateOf, isOpen } from '../lib/agent';
import { useRoom } from '../situation/issues';
import { useOpenUpdate } from '../situation/Situation';
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
        <button aria-pressed={mode === 'ask'} onClick={() => setMode('ask')} data-testid="mode-ask"><Icon name="search" size={13} />Ask a question</button>
        <button aria-pressed={mode === 'report'} onClick={() => setMode('report')} data-testid="mode-report"><Icon name="plus" size={13} />Report an observation</button>
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
  const [savedId, setSavedId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const v = (k: string) => drafts[k] ?? '';
  const equipment = drafts[D.eq] ?? context.equipmentId ?? '';
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

  const send = async () => {
    const text = v(D.text).trim(); if (!text) return;
    let observedAt: number | undefined;
    if (v(D.time)) {
      observedAt = new Date(v(D.time)).getTime();
      if (Number.isNaN(observedAt)) { setFieldError('Enter a valid observed time.'); setMore(true); return; }
      if (observedAt > now() + 60_000) { setFieldError('Observed time cannot be in the future.'); setMore(true); return; }
    }
    setFieldError(null); setSending(true); setError(null);
    const before = new Set((record.investigations ?? []).map((x) => x.id));
    const res = await submit({ text, equipmentId: equipment || undefined, location: v(D.loc).trim() || undefined, observedAt, sourceType: (v(D.src) || 'field') as ObservationSource, sourceDetail: v(D.det).trim() || undefined, question: v(D.ask).trim() || undefined, alertId: context.alertId }, { sites, types });
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    const saved = (useStore.getState().records[record.id]?.investigations ?? []).find((x) => !before.has(x.id));
    clearDrafts('assistant.obs.'); setMore(false);
    setSavedId(saved ? `inv-${saved.id}` : null);
  };
  return (
    <div className="as-report" data-testid="obs-form">
      {savedId && <SavedResult id={savedId} onDone={() => setSavedId(null)} />}
      <label className="as-obs-q" htmlFor="obs-text">What happened?</label>
      <textarea id="obs-text" className="textarea" rows={2} placeholder="What the field team said, or what you saw" value={v(D.text)} onChange={(e) => { setDraft(D.text, e.target.value); setError(null); if (e.target.value) setSavedId(null); }} data-testid="obs-text" />
      <label className="as-eq"><span>Equipment, if known</span><select className="select" value={equipment} onChange={(e) => setDraft(D.eq, e.target.value)} data-testid="obs-equipment"><option value="">Not known</option>{[...dashboard, ...EQUIPMENT.map((x) => x.id).filter((id) => !dashboard.includes(id))].map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
      <details className="as-more" open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)} data-testid="obs-more">
        <summary>More details <span className="sidenote">who reported it, when, where</span></summary>
        <div className="as-fields">
          <label><span className="label">Source</span><select className="select" value={v(D.src) || 'field'} onChange={(e) => setDraft(D.src, e.target.value)} data-testid="obs-source">{(Object.keys(OBSERVATION_SOURCE) as ObservationSource[]).map((k) => <option key={k} value={k}>{OBSERVATION_SOURCE[k]}</option>)}</select></label>
          <label><span className="label">Who</span><input className="input" value={v(D.det)} onChange={(e) => setDraft(D.det, e.target.value)} placeholder="Who, or which instrument" data-testid="obs-source-detail" /></label>
          <label><span className="label">Location</span><input className="input" value={v(D.loc)} onChange={(e) => setDraft(D.loc, e.target.value)} placeholder="Optional" data-testid="obs-location" /></label>
          <label><span className="label">Observed time</span>{v(D.time) ? <span className="as-time"><input className="input" type="datetime-local" value={v(D.time)} max={toLocal(now())} onChange={(e) => setDraft(D.time, e.target.value)} data-testid="obs-time" /><button className="link" type="button" onClick={() => setDraft(D.time, '')} data-testid="obs-time-now">Use now</button></span> : <span className="as-time"><span data-testid="obs-time-default">Now</span><button className="link" type="button" onClick={() => setDraft(D.time, toLocal(now()))} data-testid="obs-time-edit">Edit</button></span>}</label>
          <label className="wide"><span className="label">Question for ECC, optional</span><input className="input" value={v(D.ask)} onChange={(e) => setDraft(D.ask, e.target.value)} placeholder="What does this change?" data-testid="obs-question" /></label>
        </div>
      </details>
      {fieldError && <div className="supnote" data-testid="obs-field-error"><Icon name="warn" size={13} />{fieldError}</div>}
      {error && <div className="supnote" data-testid="obs-error"><Icon name="warn" size={13} />Not saved: {error}. Your entry is kept.<button className="link" onClick={() => void send()} data-testid="obs-retry">Retry</button></div>}
      <div className="row"><button className="btn primary sm" disabled={!v(D.text).trim() || sending} onClick={() => void send()} data-testid="obs-submit">Save report</button><span className="sidenote as-dest-line" data-testid="obs-destination">Saves to {record.id} · {record.title}{record.mode === 'training' ? ' · training' : ''}</span></div>
    </div>
  );
}

/** Where the report went, in one line: added to an issue, or waiting in Incident Updates for someone to place it. */
function SavedResult({ id, onDone }: { id: string; onDone: () => void }) {
  const room = useRoom();
  const openUpdate = useOpenUpdate();
  const u = room.updateById.get(id);
  const record = useStore((s) => s.records[s.incidentId]);
  const assessing = !record || agentStateOf(record) === 'running';
  if (!u) return null;
  const issue = u.place.issueId ? room.byId.get(u.place.issueId) : undefined;
  const linked = (u.place.kind === 'joins' || u.place.kind === 'opens') && issue;
  return (
    <div className={`as-saved ${linked ? 'ok' : 'review'}`} role="status" data-testid="obs-confirm" data-place={u.place.kind}>
      <Icon name={linked ? 'check' : 'info'} size={14} />
      <div className="as-saved-b">
        <b data-testid="obs-result">{linked ? (u.place.kind === 'opens' && issue!.updates.length === 1 ? <>Added to Open issues as a new issue: “{issue!.title}”</> : <>Added to “{issue!.title}”</>) : u.place.closedIssue ? 'Saved. It is about an issue already closed: reopen it, or keep it closed.' : 'Saved to Incident Updates.'}</b>
        {!assessing && <span className="sidenote" data-testid="obs-not-assessed">ECC has not assessed it yet because the agent is not running.</span>}
        <span className="as-saved-a">
          <button className="link" onClick={() => openUpdate(id)} data-testid="obs-view">View report</button>
          <button className="link" onClick={onDone} data-testid="obs-done">Done</button>
        </span>
      </div>
    </div>
  );
}
