import { useEffect, useMemo, useRef, useState } from 'react';
import { useDerived, ATTENTION } from '../lib/derive';
import { retrieval, tokenize } from '../lib/retrieval';
import { clock, now } from '../lib/time';
import { groupPassages, PassageCard, ScopeSelects } from '../pages/Knowledge';
import { ASSISTANT_DEFAULT, useStore } from '../store';
import { Divider } from '../ui/Split';
import { Icon } from '../ui/Icon';
import { IconButton, Popover } from '../ui/ui';
import { Composer } from './Composer';
import { InvestigationEntry } from './Investigation';

/** Right-hand Assistant: questions and observations start a simulated, recorded investigation. No language model is connected. */
export function Assistant({ overlay, width }: { overlay: boolean; width: number }) {
  const messages = useStore((s) => s.assistantMessages);
  const push = useStore((s) => s.pushAssistantMessage);
  const sites = useStore((s) => s.assistantSites);
  const types = useStore((s) => s.assistantTypes);
  const setScope = useStore((s) => s.setAssistantScope);
  const setOpen = useStore((s) => s.setAssistantOpen);
  const incidentId = useStore((s) => s.incidentId);
  const record = useStore((s) => s.records[s.incidentId]);
  const context = useStore((s) => s.assistantContext);
  const setContext = useStore((s) => s.setAssistantContext);
  const dashboard = useStore((s) => s.dashboard);
  const setAssistantWidth = useStore((s) => s.setAssistantWidth);
  const d = useDerived();
  const [busy, setBusy] = useState(false);
  const lastReplyRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const invs = useMemo(() => record?.investigations ?? [], [record]);
  const entries = useMemo(() => [...messages.map((m) => ({ t: m.t, m, inv: null })), ...invs.map((inv) => ({ t: inv.t, m: null, inv }))].sort((a, b) => a.t - b.t), [messages, invs]);
  const lastEntry = entries[entries.length - 1];
  const replyCount = messages.filter((m) => m.role === 'assistant').length + invs.reduce((n, i) => n + i.responses.length, 0);
  // After a reply arrives, scroll to its start (not its end). A new entry comes into view as soon as it is saved.
  useEffect(() => { lastReplyRef.current?.scrollIntoView({ block: 'start' }); }, [replyCount]);
  useEffect(() => { if (entries.length) endRef.current?.scrollIntoView({ block: 'end' }); }, [entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastReplyIdx = messages.map((m) => m.role).lastIndexOf('assistant');
  const attachedAlert = context.alertId ? d.alertById.get(context.alertId) : undefined;
  const attachable = d.alerts.filter((a) => ATTENTION.includes(a.condition)).slice(0, 12);

  const search = async (text: string) => {
    setBusy(true);
    const scopeLabel = `${sites.length ? sites.join(', ') : 'All sites'} · ${types.length ? types.join(', ') : 'all content'}`;
    push({ id: `m-${now()}`, role: 'user', t: now(), text, scope: scopeLabel });
    const r = await retrieval.search(text, { sites, contentTypes: types, incidentTimeCutoff: { incidentId, t: now() }, limit: 14 });
    push({ id: `m-${now()}-r`, role: 'assistant', t: now(), text: r.ok ? (r.passages.length ? `${r.passages.length} cited passages` : 'No evidence found') : 'Retrieval error', result: r.ok ? { ok: true, passages: r.passages, indexed: r.indexedPassages } : { ok: false, error: r.error } });
    setBusy(false);
  };

  return (
    <aside id="assistant-panel" className={`assistant ${overlay ? 'as-overlay' : ''}`} style={{ width }} data-testid="assistant" data-mode={overlay ? 'overlay' : 'push'} data-width={width} aria-label="Assistant">
      <Divider orientation="vertical" className="as-edge" onDelta={(px) => setAssistantWidth(useStore.getState().assistantWidth - px)} onReset={() => setAssistantWidth(ASSISTANT_DEFAULT)} label="Resize assistant" testId="split-assistant" />
      <div className="as-h">
        <span className="title">Assistant</span>
        <span className="chip outline" title="Fixed rules and keyword search over the incident record and Knowledge. No language model is connected." data-testid="assistant-simulated">Simulated</span>
        <span className="spacer" />
        <IconButton className="sm" name="close" title="Close assistant" onClick={() => setOpen(false)} testId="assistant-close" />
      </div>
      <div className="as-scope">
        <div className="as-ctxline">
          <span className="sidenote grow" data-testid="assistant-context" title="Fixed rules and keyword search; no language model is connected">{record ? <>{record.status === 'closed' ? 'Closed record' : 'Incident'} {incidentId} · no language model</> : 'No incident · Knowledge search · no language model'}</span>
          {record && (
            <Popover width={280} trigger={(open, toggle) => <button className="link" onClick={toggle} aria-expanded={open} data-testid="context-attach">{context.equipmentId || context.alertId ? 'Change' : 'Attach'}</button>}>
              {(close) => (
                <>
                  <div className="head label">Equipment</div>
                  {dashboard.map((id) => <button key={id} className="item" onClick={() => { setContext({ ...context, equipmentId: id }); close(); }} data-testid={`attach-eq-${id}`}><span>{id}</span><span className="sub">{d.equipmentById.get(id)?.name}</span></button>)}
                  {attachable.length > 0 && <><div className="sep" /><div className="head label">Open alerts</div>{attachable.map((a) => <button key={a.id} className="item" onClick={() => { setContext({ ...context, alertId: a.id, equipmentId: context.equipmentId ?? a.def.equipmentId }); close(); }} data-testid={`attach-alert-${a.id}`}><span>{a.def.title}</span></button>)}</>}
                </>
              )}
            </Popover>
          )}
        </div>
        {(context.equipmentId || attachedAlert) && (
          <div className="as-chips" data-testid="assistant-attached">
            {context.equipmentId && <span className="as-chip" data-testid="context-equipment"><span className="grow">{context.equipmentId}</span><button onClick={() => setContext({ ...context, equipmentId: undefined })} title={`Remove ${context.equipmentId}`} aria-label={`Remove ${context.equipmentId}`} data-testid="context-remove-equipment"><Icon name="close" size={11} /></button></span>}
            {attachedAlert && <span className="as-chip" data-testid="context-alert" title={attachedAlert.def.title}><span className="grow">Alert: {attachedAlert.def.title}</span><button onClick={() => setContext({ ...context, alertId: undefined })} title="Remove alert" aria-label="Remove alert" data-testid="context-remove-alert"><Icon name="close" size={11} /></button></span>}
          </div>
        )}
        <ScopeSelects sites={sites} setSites={(s) => setScope(s, types)} types={types} setTypes={(t) => setScope(sites, t)} prefix="assistant" />
      </div>
      <div className="as-list" data-testid="assistant-messages">
        {entries.length === 0 && <p className="sidenote" style={{ padding: '14px 16px' }} data-testid="assistant-intro">{record ? 'Ask about this incident, or report what has been seen. ECC checks the record, current readings and Knowledge, and answers with its evidence. It never issues instructions.' : 'Ask for a procedure, a limit, a drawing or a past incident. Replies are ranked cited passages from Knowledge, never a synthesized instruction.'}</p>}
        {entries.map((e) => e.inv && record ? <InvestigationEntry key={e.inv.id} inv={e.inv} record={record} replyRef={lastEntry === e ? lastReplyRef : undefined} /> : e.m && (
          e.m.role === 'user' ? (
            <div key={e.m.id} className="as-q" data-testid="assistant-user"><div>{e.m.text}</div><div className="sidenote">{clock(e.m.t)} · {e.m.scope}</div></div>
          ) : (
            <div key={e.m.id} className="as-a" ref={messages.indexOf(e.m) === lastReplyIdx && lastEntry === e ? lastReplyRef : undefined} data-testid="assistant-reply" data-state={e.m.result ? (e.m.result.ok ? (e.m.result.passages.length ? 'results' : 'empty') : 'error') : 'none'}>
              {e.m.result && !e.m.result.ok && <div className="supnote" data-testid="assistant-error"><Icon name="warn" size={13} />Retrieval failed: {e.m.result.error}. Try again.</div>}
              {e.m.result?.ok && e.m.result.passages.length === 0 && <div className="sidenote" data-testid="assistant-empty">No evidence found in the selected scope ({e.m.result.indexed} passages indexed). Widen the site or content scope.</div>}
              {e.m.result?.ok && groupPassages(e.m.result.passages, incidentId).map((g) => (
                <div key={g.key} className="as-group" data-testid={`assistant-group-${g.key}`}>
                  <div className="label">{g.label}</div>
                  {g.items.map(({ p, more }) => <PassageCard key={p.id} p={p} more={more} origin="Assistant" terms={tokenize(messages[messages.indexOf(e.m!) - 1]?.text ?? '')} current={g.key === 'this'} />)}
                </div>
              ))}
            </div>
          )
        ))}
        <div ref={endRef} />
      </div>
      <Composer onSearch={(t) => void search(t)} busy={busy} />
    </aside>
  );
}
