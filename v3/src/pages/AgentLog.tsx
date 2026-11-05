import { useEffect, useMemo, useRef, useState } from 'react';
import { EQUIPMENT } from '../data/scenario';
import { AGENT_CATEGORIES, businessAccount, categoryOf, equipmentOf, flatLog, impactOf, OUTCOME_LABEL, outcomeOf, type Outcome, operationLevel } from '../lib/agentlog';
import { clock, clockSec, tPlus } from '../lib/time';
import type { AgentEvent } from '../record/types';
import { useStore, type AgentFilters } from '../store';
import { Icon } from '../ui/Icon';
import { PaneMaximize, SplitPane } from '../ui/Split';
import { Popover } from '../ui/ui';
import { Citation } from '../ui/Citation';

const LEVELS = ['info', 'warn', 'error'] as const;

function matches(t: AgentEvent, f: AgentFilters, detailed: boolean): boolean {
  if (f.categories.length && !f.categories.includes(categoryOf(t))) return false;
  if (f.outcomes.length && !f.outcomes.includes(outcomeOf(t))) return false;
  if (f.equipment.length && !equipmentOf(t).some((e) => f.equipment.includes(e))) return false;
  const q = f.query.trim().toLowerCase();
  if (q) {
    const plain = [t.title, businessAccount(t).headline, ...t.documents, ...t.findings, ...impactOf(t), ...equipmentOf(t).flatMap((id) => [id, EQUIPMENT.find((e) => e.id === id)?.name ?? '']), categoryOf(t)].join(' ').toLowerCase();
    const tech = detailed ? [t.runId, t.configVersion, ...t.sources, ...t.technical.steps.flatMap((s) => s.operations.flatMap((o) => [o.name, o.detail, ...o.logs.map((l) => l.text)]))].join(' ').toLowerCase() : '';
    if (!plain.includes(q) && !tech.includes(q)) return false;
  }
  if (detailed && f.levels.length && !t.technical.steps.some((s) => s.operations.some((o) => o.logs.some((l) => f.levels.includes(l.level)) || f.levels.includes(operationLevel(s, o))))) return false;
  return true;
}
const activeFilters = (f: AgentFilters, detailed: boolean) => f.query.trim() !== '' || f.categories.length > 0 || f.outcomes.length > 0 || f.equipment.length > 0 || (detailed && f.levels.length > 0);

export function AgentLog() {
  const record = useStore((s) => s.records[s.incidentId]);
  const role = useStore((s) => s.role);
  const agentView = useStore((s) => s.agentView);
  const setAgentView = useStore((s) => s.setAgentView);
  const filters = useStore((s) => s.agentFilters);
  const setAgentFilters = useStore((s) => s.setAgentFilters);
  const clearAgentFilters = useStore((s) => s.clearAgentFilters);
  const group = useStore((s) => s.agentGroup);
  const setAgentGroup = useStore((s) => s.setAgentGroup);
  const sub = useStore((s) => s.agentSub);
  const setAgentSub = useStore((s) => s.setAgentSub);
  const startedAt = useStore((s) => s.startedAt);
  const selected = useStore((s) => s.activityTask);
  const setActivityTask = useStore((s) => s.setActivityTask);
  const admin = role === 'admin';
  const detailed = admin && agentView === 'detailed';

  const tasks = useMemo(() => (record?.events.filter((e): e is AgentEvent => e.kind === 'agent') ?? []).sort((a, b) => b.t - a.t), [record]);
  const shownTasks = tasks.filter((t) => matches(t, filters, detailed));
  const active = activeFilters(filters, detailed);
  const task = tasks.find((t) => t.taskId === selected) ?? shownTasks[0] ?? null;
  const selectedHidden = !!task && !shownTasks.includes(task);
  const hiddenFailures = tasks.filter((t) => (outcomeOf(t) === 'failed' || outcomeOf(t) === 'retried') && !matches(t, filters, detailed));
  const equipmentOptions = useMemo(() => { const ids = new Set(tasks.flatMap(equipmentOf)); return EQUIPMENT.filter((e) => ids.has(e.id)); }, [tasks]);
  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  // Live updates: tasks arriving while the list is scrolled are held behind a pill.
  const listRef = useRef<HTMLDivElement>(null);
  const [shownIds, setShownIds] = useState<Set<string>>(() => new Set(tasks.map((t) => t.id)));
  const [held, setHeld] = useState<string[]>([]);
  useEffect(() => {
    const unknown = tasks.filter((t) => !shownIds.has(t.id) && !held.includes(t.id));
    if (!unknown.length) return;
    const scrolled = !!listRef.current && listRef.current.scrollTop > 4;
    if (scrolled) setHeld((h) => [...h, ...unknown.map((t) => t.id)]); else setShownIds((s) => new Set([...s, ...unknown.map((t) => t.id)]));
  }, [tasks, shownIds, held]);
  const release = () => { setShownIds((s) => new Set([...s, ...held])); setHeld([]); listRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); };
  const visible = shownTasks.filter((t) => shownIds.has(t.id));
  const heldMatching = held.filter((id) => { const t = tasks.find((x) => x.id === id); return t && matches(t, filters, detailed); });

  const reveal = () => {
    const patch: Partial<AgentFilters> = {};
    const need = [...new Set(hiddenFailures.map(outcomeOf))];
    if (filters.outcomes.length) patch.outcomes = [...new Set([...filters.outcomes, ...need])];
    if (filters.categories.length) patch.categories = [...new Set([...filters.categories, ...hiddenFailures.map(categoryOf)])];
    if (filters.equipment.length) { const add = hiddenFailures.flatMap(equipmentOf).filter((e) => !filters.equipment.includes(e)); if (add.length) patch.equipment = [...new Set([...filters.equipment, ...add])]; else patch.equipment = []; }
    if (filters.query.trim() && hiddenFailures.some((t) => !matches(t, { ...filters, ...patch, query: filters.query }, detailed))) patch.query = '';
    if (detailed && filters.levels.length) patch.levels = [];
    setAgentFilters(patch);
    setShownIds((s) => new Set([...s, ...hiddenFailures.map((t) => t.id)]));
  };

  const groups: { label: string; items: AgentEvent[] }[] = group === 'category'
    ? AGENT_CATEGORIES.map((c) => ({ label: c, items: visible.filter((t) => categoryOf(t) === c) })).filter((g) => g.items.length)
    : [{ label: '', items: visible }];

  return (
    <div className="page" data-testid="page-agentlog" data-role={role} data-view={detailed ? 'detailed' : 'business'}>
      <SplitPane id="agentlog" side="start" defaultSize={380} min={[300, 480]}>
        <div className="pane grow">
          <div className="pane-h">
            <span className="title">Agent log</span>
            {!admin && <span className="meta sidenote">{active ? `${shownTasks.length} of ${tasks.length}` : `${tasks.length} tasks`}</span>}
            <span className="chip outline" data-testid="simulated-marker" title="All agent activity in this prototype is simulated from scenario data">Simulated</span>
            <span className="spacer" />
            {admin && <span className="seg sm" data-testid="agent-view-toggle"><button aria-pressed={agentView === 'business'} onClick={() => setAgentView('business')} data-testid="view-business">Business</button><button aria-pressed={agentView === 'detailed'} onClick={() => setAgentView('detailed')} data-testid="view-detailed">Detailed</button></span>}
            <PaneMaximize pane="a" />
          </div>
          <div className="logbar" data-testid="agent-toolbar" data-active={active}>
            <span className="logsearch"><Icon name="search" size={13} /><input className="input sm" placeholder={detailed ? 'Search, incl. run ID' : 'Search'} title={detailed ? 'Searches task text, run IDs, sources and log lines' : undefined} value={filters.query} onChange={(e) => setAgentFilters({ query: e.target.value })} aria-label="Search agent log" data-testid="agent-search" /></span>
            <span className="seg sm" data-testid="agent-group" title="Order the list"><button aria-pressed={group === 'chrono'} onClick={() => setAgentGroup('chrono')} title="Chronological">Time</button><button aria-pressed={group === 'category'} onClick={() => setAgentGroup('category')} title="Group by category">Category</button></span>
            {admin && <span className="meta sidenote">{active ? `${shownTasks.length} of ${tasks.length}` : `${tasks.length} tasks`}</span>}
            <Popover width={250} trigger={(open, toggle) => <button className={`btn sm ${filters.categories.length ? 'on' : ''}`} onClick={toggle} aria-expanded={open} data-testid="agent-filter-category">{filters.categories.length ? (filters.categories.length === 1 ? filters.categories[0] : `${filters.categories.length} categories`) : 'Category'}<Icon name="chevD" size={12} /></button>}>
              {() => <>{AGENT_CATEGORIES.map((c) => <button key={c} className="item" onClick={() => setAgentFilters({ categories: toggleIn(filters.categories, c) })} aria-pressed={filters.categories.includes(c)} data-testid={`agent-cat-${c.replace(/[^a-z]+/gi, '-')}`}>{filters.categories.includes(c) ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{c}</button>)}</>}
            </Popover>
            <Popover width={200} trigger={(open, toggle) => <button className={`btn sm ${filters.outcomes.length ? 'on' : ''}`} onClick={toggle} aria-expanded={open} data-testid="agent-filter-outcome">{filters.outcomes.length ? filters.outcomes.map((o) => OUTCOME_LABEL[o]).join(', ') : 'Outcome'}<Icon name="chevD" size={12} /></button>}>
              {() => <>{(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => <button key={o} className="item" onClick={() => setAgentFilters({ outcomes: toggleIn(filters.outcomes, o) })} aria-pressed={filters.outcomes.includes(o)} data-testid={`agent-outcome-${o}`}>{filters.outcomes.includes(o) ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{OUTCOME_LABEL[o]}</button>)}</>}
            </Popover>
            <Popover width={230} trigger={(open, toggle) => <button className={`btn sm ${filters.equipment.length ? 'on' : ''}`} onClick={toggle} aria-expanded={open} data-testid="agent-filter-equipment">{filters.equipment.length ? filters.equipment.join(', ') : 'Equipment'}<Icon name="chevD" size={12} /></button>}>
              {() => <>{equipmentOptions.map((e) => <button key={e.id} className="item" onClick={() => setAgentFilters({ equipment: toggleIn(filters.equipment, e.id) })} aria-pressed={filters.equipment.includes(e.id)} data-testid={`agent-eq-${e.id}`}>{filters.equipment.includes(e.id) ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}<b>{e.id}</b> {e.name}</button>)}</>}
            </Popover>
            {detailed && (
              <Popover width={160} trigger={(open, toggle) => <button className={`btn sm ${filters.levels.length ? 'on' : ''}`} onClick={toggle} aria-expanded={open} data-testid="agent-filter-level">{filters.levels.length ? filters.levels.join(', ') : 'Level'}<Icon name="chevD" size={12} /></button>}>
                {() => <>{LEVELS.map((l) => <button key={l} className="item" onClick={() => setAgentFilters({ levels: toggleIn(filters.levels, l) })} aria-pressed={filters.levels.includes(l)} data-testid={`agent-level-${l}`}>{filters.levels.includes(l) ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{l}</button>)}</>}
              </Popover>
            )}
            {!admin && <span className="sidenote agent-view-note" data-testid="business-note">Business view</span>}
            {hiddenFailures.length > 0 && <button className="hiddenind" onClick={reveal} data-testid="agent-hidden-failures" title="Failed or retried tasks hidden by the current filters">{hiddenFailures.length} {hiddenFailures.length === 1 ? 'failure' : 'failures'} hidden</button>}
            {active && <button className="btn sm quiet" onClick={clearAgentFilters} data-testid="agent-clear-filters"><Icon name="close" size={12} /> Clear filters</button>}
          </div>
          <div className="pane-b" ref={listRef} style={{ position: 'relative' }}>
            {heldMatching.length > 0 && <div className="newpill"><button onClick={release} data-testid="agent-new-pill"><Icon name="up" size={13} />{heldMatching.length} new</button></div>}
            <div className="list">
              {groups.map((g) => (
                <div key={g.label || 'all'}>
                  {g.label && <div className="group-h label" data-testid="agent-group-header">{g.label} · {g.items.length}</div>}
                  {g.items.map((t) => {
                    const oc = outcomeOf(t); const cat = categoryOf(t);
                    return (
                      <div key={t.id} className="li" role="button" tabIndex={0} aria-selected={task?.id === t.id} onClick={() => setActivityTask(t.taskId)} onKeyDown={(e) => { if (e.key === 'Enter') setActivityTask(t.taskId); }} data-testid={`task-${t.taskId}`} data-category={cat} data-outcome={oc}>
                        <div className="t"><StatusDot s={t.status} /><span className="grow" data-testid="task-headline">{detailed ? (t.headline || t.title) : businessAccount(t).headline}</span></div>
                        <div className="m"><span className="num">{clock(t.t)}</span><span className="chip soft" data-testid="task-category">{cat}</span>{oc !== 'completed' && <span className="chip outline" data-testid="task-outcome">{OUTCOME_LABEL[oc]}</span>}{record?.agentRuns?.find((r) => r.number === t.meta?.agentRun)?.cancelled?.includes(t.title) && <span className="chip outline" data-testid="task-cancelled">Cancelled at stop</span>}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {visible.length === 0 && <div className="empty" data-testid="agent-empty">{active ? <>No tasks match the current filters. <button className="link" onClick={clearAgentFilters}>Clear filters</button></> : 'No agent activity recorded yet'}</div>}
            </div>
          </div>
        </div>
        <div className="pane grow">
          {task ? (
            <>
              <div className="pane-h" data-testid="task-head">
                <span className="title">{detailed ? (task.headline || task.title) : businessAccount(task).headline}</span>
                {selectedHidden && <span className="sidenote" data-testid="selected-hidden">not in the current list</span>}
                <span className="spacer" />
                {detailed && <span className="seg sm" data-testid="agent-sub"><button aria-pressed={sub === 'task'} onClick={() => setAgentSub('task')} data-testid="sub-task">Task detail</button><button aria-pressed={sub === 'log'} onClick={() => setAgentSub('log')} data-testid="sub-log">Technical log</button></span>}
                <span className="sidenote num">{clock(task.t)} · {tPlus(task.t, startedAt)}</span>
                <PaneMaximize pane="b" />
              </div>
              <div className="pane-b">
                {detailed && sub === 'log' ? <TechnicalLog tasks={tasks} filters={filters} onPick={(id) => { setActivityTask(id); setAgentSub('task'); }} /> : detailed ? <TaskDetail t={task} /> : <BusinessDetail t={task} />}
              </div>
            </>
          ) : <div className="empty">Select a task</div>}
        </div>
      </SplitPane>
    </div>
  );
}

function StatusDot({ s }: { s: 'done' | 'error' | 'waiting' }) {
  const color = s === 'error' ? 'var(--crit)' : s === 'waiting' ? 'var(--text-3)' : 'var(--text-2)';
  return <span style={{ width: 8, height: 8, borderRadius: 4, background: s === 'waiting' ? 'transparent' : color, border: `1.5px solid ${color}`, display: 'inline-block', flex: 'none' }} aria-label={s} />;
}

/** Business view: what happened and why it matters, in plain words. */
function BusinessDetail({ t }: { t: AgentEvent }) {
  const acc = businessAccount(t); const impacts = impactOf(t); const oc = outcomeOf(t);
  return (
    <div className="detail" data-testid="business-detail">
      <div><h3>What the agent did</h3><p>{acc.headline}</p></div>
      <dl className="kv" data-testid="task-summary">
        <dt>Category</dt><dd>{categoryOf(t)}</dd>
        <dt>Outcome</dt><dd>{OUTCOME_LABEL[oc]}{oc === 'ongoing' ? ' — still monitoring' : ''}</dd>
        <dt>Documents consulted</dt><dd>{t.docRefs?.length ? <div className="evs" data-testid="agent-citations">{t.docRefs.map((r, i) => <Citation key={i} cite={{ docId: r.docId, revision: r.revision, page: r.page, label: r.page ? `p.${r.page}` : '' }} origin={`Agent log · ${t.title}`} plain testId={`agent-cite-${r.docId}`} />)}</div> : t.documents.length ? t.documents.join(', ') : '—'}</dd>
        <dt>Findings</dt><dd>{t.findings.length ? t.findings.join(', ') : '—'}</dd>
        {categoryOf(t) === 'Assessment updates' && <><dt>Assessment change</dt><dd>{t.detail}</dd></>}
        <dt>Problems</dt><dd>{impacts.length ? impacts.map((x, i) => <div key={i}>{x}</div>) : 'None'}</dd>
        <dt>Equipment</dt><dd>{equipmentOf(t).join(', ') || '—'}</dd>
      </dl>
      <div>
        <h3>Steps</h3>
        <div className="tree">{acc.steps.map((s, i) => <div key={i} className="tnode"><div className="th"><span className="t">{s.name}</span><span className={`result ${s.done ? '' : 'error'}`}>{s.done ? 'Done' : 'Did not complete'}</span></div></div>)}</div>
      </div>
    </div>
  );
}

/** Detailed (Admin) view: Task → steps → operations → logs with run id, timings, retries, config. */
function TaskDetail({ t }: { t: AgentEvent }) {
  return (
    <div className="detail" data-testid="task-detail">
      <div><h3>What the agent did</h3><p>{t.detail}</p></div>
      <dl className="kv" data-testid="task-summary">
        <dt>Category</dt><dd>{categoryOf(t)}</dd>
        <dt>Sources checked</dt><dd>{t.sources.join(', ') || '—'}</dd>
        <dt>Documents consulted</dt><dd>{t.docRefs?.length ? <div className="evs" data-testid="agent-citations">{t.docRefs.map((r, i) => <Citation key={i} cite={{ docId: r.docId, revision: r.revision, page: r.page, label: r.page ? `p.${r.page}` : '' }} origin={`Agent log · ${t.title}`} testId={`agent-cite-${r.docId}`} />)}</div> : t.documents.join(', ') || '—'}</dd>
        <dt>Findings produced</dt><dd>{t.findings.join(', ') || '—'}</dd>
        <dt>Failures / retries</dt><dd>{t.failures.length ? t.failures.join('; ') : 'None'}</dd>
        <dt>Outcome</dt><dd>{OUTCOME_LABEL[outcomeOf(t)]}</dd>
      </dl>
      <div><h3>Execution steps</h3><div className="tree">{t.technical.steps.map((s, i) => <StepNode key={i} s={s} />)}</div></div>
      <dl className="kv" data-testid="admin-technical">
        <dt>Run</dt><dd className="mono">{t.runId}</dd>
        {t.meta?.agentRun != null && <><dt>Agent run</dt><dd data-testid="task-agent-run">Run {String(t.meta.agentRun)} · config v{String(t.meta.agentConfig)}</dd></>}
        <dt>Config</dt><dd className="mono">{t.configVersion}</dd>
        <dt>Started</dt><dd className="num">{clockSec(t.t)}</dd>
      </dl>
    </div>
  );
}

function StepNode({ s }: { s: AgentEvent['technical']['steps'][number] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="tnode" data-testid="step-node">
      <div className="th" onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open}>
        <Icon name={open ? 'chevD' : 'chevR'} size={14} /><span className="t">{s.name}</span>
        <span className={`result ${s.status === 'error' ? 'error' : ''}`}>{s.status === 'done' ? 'Done' : s.status === 'error' ? 'Did not complete' : 'Waiting'}</span>
        <span className="m">{s.operations.length} operation{s.operations.length !== 1 ? 's' : ''}</span>
      </div>
      {open && <div className="tb">{s.operations.map((o, i) => <OpNode key={i} o={o} />)}</div>}
    </div>
  );
}

function OpNode({ o }: { o: AgentEvent['technical']['steps'][number]['operations'][number] }) {
  const [open, setOpen] = useState(false);
  const plain = o.result === 'ok' ? 'Succeeded' : o.result === 'error' ? 'Failed' : o.result === 'retry' ? 'Retried, then gave up' : 'Nothing found';
  return (
    <div className="opnode" data-testid="op-node">
      <div className="oh" onClick={() => setOpen((v) => !v)} role="button" aria-expanded={open}>
        <Icon name={open ? 'chevD' : 'chevR'} size={14} /><span className="t">{o.name}</span>
        <span className={`result ${o.result}`}>{plain}</span>
        <span className="m">{clockSec(o.startedAt)} · {o.durationMs} ms{o.retries ? ` · ${o.retries} retries` : ''}</span>
      </div>
      {open && (
        <div className="ob">
          <dl className="kv"><dt>Source</dt><dd>{o.source}</dd><dt>Result</dt><dd>{o.detail}</dd></dl>
          <div className="logs" data-testid="op-logs">{o.logs.map((l, i) => <div key={i} className={l.level}><span className="t">{clockSec(l.t)}</span>{l.text}</div>)}</div>
        </div>
      )}
    </div>
  );
}

/** Flat chronological technical log across all tasks (operations and log lines). */
function TechnicalLog({ tasks, filters, onPick }: { tasks: AgentEvent[]; filters: AgentFilters; onPick: (taskId: string) => void }) {
  const detailedFilter = (t: AgentEvent) => matches(t, { ...filters, levels: [] }, true);
  const rows = useMemo(() => flatLog(tasks.filter(detailedFilter)).filter((r) => !filters.levels.length || filters.levels.includes(r.level)), [tasks, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="scroll" style={{ position: 'relative' }}>
      <table className="log techlog" data-testid="technical-log" data-rows={rows.length}>
        <thead><tr><th>Time</th><th>Level</th><th>Task</th><th>Source / tool</th><th>Message</th><th>Run</th><th>Duration</th><th>Retries</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`row lvl-${r.level}`} onClick={() => onPick(r.taskId)} data-testid="techlog-row" data-task={r.taskId} data-kind={r.kind} tabIndex={0}>
              <td className="time num">{clockSec(r.t)}</td><td><span className={`chip ${r.level === 'error' ? 'sev-critical' : r.level === 'warn' ? 'sev-high' : 'soft'}`}>{r.level}</span></td><td>{r.task}</td><td>{r.source}</td><td className="wrap mono">{r.message}</td><td className="mono">{r.runId}</td><td className="num">{r.durationMs != null ? `${r.durationMs} ms` : ''}</td><td className="num">{r.retries ?? ''}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="empty">No log lines match</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
