import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useDerived } from '../lib/derive';
import { retrieval, tokenize } from '../lib/retrieval';
import { clock, now } from '../lib/time';
import { groupPassages, PassageCard, ScopeSelects } from '../pages/Knowledge';
import { ASSISTANT_DEFAULT, useStore } from '../store';
import { Divider } from '../ui/Split';
import { Icon } from '../ui/Icon';
import { IconButton, SeverityChip } from '../ui/ui';

/** Right-hand Assistant: retrieved, cited evidence. No language model is connected. */
export function Assistant({ overlay, width }: { overlay: boolean; width: number }) {
  const messages = useStore((s) => s.assistantMessages);
  const push = useStore((s) => s.pushAssistantMessage);
  const clear = useStore((s) => s.clearAssistant);
  const sites = useStore((s) => s.assistantSites);
  const types = useStore((s) => s.assistantTypes);
  const setScope = useStore((s) => s.setAssistantScope);
  const setOpen = useStore((s) => s.setAssistantOpen);
  const incidentId = useStore((s) => s.incidentId);
  const selectAlert = useStore((s) => s.selectAlert);
  const setNav = useStore((s) => s.setNav);
  const alertUser = useStore((s) => s.alertUser);
  const indexReady = useStore((s) => s.indexReady);
  const setAssistantWidth = useStore((s) => s.setAssistantWidth);
  const d = useDerived();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastReplyRef = useRef<HTMLDivElement>(null);
  // After a reply arrives, scroll to its start (not its end).
  useEffect(() => { const el = lastReplyRef.current; if (el) el.scrollIntoView({ block: 'start' }); }, [messages.length]);

  const critical = d.alerts.find((a) => a.def.severity === 'critical' && a.condition === 'active' && !alertUser[a.id]?.readAt) ?? d.alerts.find((a) => a.def.severity === 'critical' && a.condition === 'active');
  const lastReplyIdx = messages.map((m) => m.role).lastIndexOf('assistant');

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim(); if (!text) return;
    setQ(''); setBusy(true);
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
        <span className="spacer" />
        <IconButton className="sm" name="close" title="Close assistant" onClick={() => setOpen(false)} testId="assistant-close" />
      </div>
      {critical && (
        <button className="as-critical" onClick={() => { setNav('situation'); selectAlert(critical.id); }} data-testid="assistant-critical" title="Open this alert on Situation">
          <SeverityChip s="critical" /><span className="grow">{critical.def.title.startsWith(critical.def.equipmentId) ? critical.def.title : `${critical.def.equipmentId} · ${critical.def.title}`}</span><span className="num sidenote">{clock(critical.time)}</span>
        </button>
      )}
      <div className="as-scope">
        <div className="sidenote" data-testid="assistant-context">Retrieved evidence only · no language model · {incidentId} · as of now</div>
        <ScopeSelects sites={sites} setSites={(s) => setScope(s, types)} types={types} setTypes={(t) => setScope(sites, t)} prefix="assistant" />
      </div>
      <div className="as-list" ref={listRef} data-testid="assistant-messages">
        {messages.length === 0 && <p className="sidenote" style={{ padding: '14px 16px' }}>Ask for a procedure, a limit, a drawing or a past incident. Replies are ranked cited passages from Knowledge, never a synthesized instruction.</p>}
        {messages.map((m, i) => m.role === 'user' ? (
          <div key={m.id} className="as-q" data-testid="assistant-user"><div>{m.text}</div><div className="sidenote">{clock(m.t)} · {m.scope}</div></div>
        ) : (
          <div key={m.id} className="as-a" ref={i === lastReplyIdx ? lastReplyRef : undefined} data-testid="assistant-reply" data-state={m.result ? (m.result.ok ? (m.result.passages.length ? 'results' : 'empty') : 'error') : 'none'}>
            {m.result && !m.result.ok && <div className="supnote" data-testid="assistant-error"><Icon name="warn" size={13} />Retrieval failed: {m.result.error}. Try again.</div>}
            {m.result?.ok && m.result.passages.length === 0 && <div className="sidenote" data-testid="assistant-empty">No evidence found in the selected scope ({m.result.indexed} passages indexed). Widen the site or content scope.</div>}
            {m.result?.ok && groupPassages(m.result.passages, incidentId).map((g) => (
              <div key={g.key} className="as-group" data-testid={`assistant-group-${g.key}`}>
                <div className="label">{g.label}</div>
                {g.items.map(({ p, more }) => <PassageCard key={p.id} p={p} more={more} origin="Assistant" terms={tokenize(messages[i - 1]?.text ?? '')} current={g.key === 'this'} />)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <form className="as-input" onSubmit={ask}>
        <input className="input" placeholder={indexReady ? 'Search Knowledge for evidence…' : 'Indexing documents…'} value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} data-testid="assistant-input" />
        <button className="btn primary sm" type="submit" disabled={!q.trim() || busy || !indexReady} data-testid="assistant-send">Ask</button>
        {messages.length > 0 && <button className="btn sm" type="button" onClick={clear} title="Clear conversation">Clear</button>}
      </form>
    </aside>
  );
}
