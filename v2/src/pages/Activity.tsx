import { useState } from 'react';
import type { OperationDef, TaskStepDef } from '../data/types';
import { useDerived, type TaskView } from '../lib/derive';
import { clock, clockSec, tPlus } from '../lib/time';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';

const KIND_LABEL = { procedures: 'Procedures', equipment: 'Equipment context', monitoring: 'Process values', conflict: 'Conflicting reports', assessment: 'Assessment', source: 'Source' } as const;

export function Activity() {
  const d = useDerived();
  const startedAt = useStore((s) => s.startedAt);
  const selected = useStore((s) => s.activityTask);
  const setActivityTask = useStore((s) => s.setActivityTask);
  const task = d.tasks.find((t) => t.id === selected) ?? d.tasks[0] ?? null;

  const groups: { step: number; title: string; tasks: TaskView[] }[] = [];
  for (const t of d.tasks) {
    let g = groups.find((x) => x.step === t.step);
    if (!g) { g = { step: t.step, title: d.steps[t.step - 1].title, tasks: [] }; groups.push(g); }
    g.tasks.push(t);
  }

  return (
    <div className="page" data-testid="page-activity">
      <div className="pane w-side">
        <div className="pane-h"><span className="title">Agent activity</span><span className="meta sidenote">{d.tasks.length} tasks</span></div>
        <div className="pane-b">
          <div className="list">
            {groups.map((g) => (
              <div key={g.step}>
                <div className="group-h label">Step {g.step} · {g.title}</div>
                {g.tasks.map((t) => (
                  <div key={t.id} className="li" role="button" tabIndex={0} aria-selected={task?.id === t.id} onClick={() => setActivityTask(t.id)} onKeyDown={(e) => { if (e.key === 'Enter') setActivityTask(t.id); }} data-testid={`task-${t.id}`}>
                    <div className="t"><StatusDot s={t.status} /><span className="grow">{t.title}</span></div>
                    <div className="m"><span className="num">{clock(t.time)}</span><span>{KIND_LABEL[t.kind]}</span>{t.status === 'error' && <span className="chip outline">Error</span>}{t.status === 'waiting' && <span className="chip outline">Ongoing</span>}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="pane grow">
        {task ? <TaskDetail t={task} startedAt={startedAt} /> : <div className="empty">No activity yet</div>}
      </div>
    </div>
  );
}

function StatusDot({ s }: { s: 'done' | 'error' | 'waiting' }) {
  const color = s === 'error' ? 'var(--crit)' : s === 'waiting' ? 'var(--text-3)' : 'var(--text-2)';
  return <span style={{ width: 8, height: 8, borderRadius: 4, background: s === 'waiting' ? 'transparent' : color, border: `1.5px solid ${color}`, display: 'inline-block', flex: 'none' }} aria-label={s} />;
}

function TaskDetail({ t, startedAt }: { t: TaskView; startedAt: number }) {
  return (
    <>
      <div className="pane-h"><span className="title">{t.title}</span><span className="spacer" /><span className="sidenote num">{clock(t.time)} · {tPlus(t.time, startedAt)}{t.durationSec ? ` · ${t.durationSec} s` : ' · ongoing'}</span></div>
      <div className="pane-b">
        <div className="detail">
          <div>
            <h3>Rationale</h3>
            <p>{t.rationale}</p>
          </div>
          <div>
            <h3>Execution steps</h3>
            <div className="tree">{t.steps.map((s) => <StepNode key={s.id} s={s} base={t.time - t.startSec * 1000} />)}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function StepNode({ s, base }: { s: TaskStepDef; base: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="tnode">
      <div className="th" onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open}>
        <Icon name={open ? 'chevD' : 'chevR'} size={14} />
        <span className="t">{s.name}</span>
        <span className={`result ${s.status === 'error' ? 'error' : ''}`}>{s.status === 'done' ? 'Done' : s.status === 'error' ? 'Error' : 'Waiting'}</span>
        <span className="m">{s.operations.length} operation{s.operations.length !== 1 ? 's' : ''}</span>
      </div>
      {open && <div className="tb">{s.operations.map((o) => <OpNode key={o.id} o={o} base={base} />)}</div>}
    </div>
  );
}

function OpNode({ o, base }: { o: OperationDef; base: number }) {
  const [open, setOpen] = useState(false);
  const setNav = useStore((s) => s.setNav);
  const selectAlert = useStore((s) => s.selectAlert);
  const openViewer = useStore((s) => s.openViewer);
  const setViewerExpanded = useStore((s) => s.setViewerExpanded);
  const d = useDerived();
  return (
    <div className="opnode">
      <div className="oh" onClick={() => setOpen((v) => !v)} role="button" aria-expanded={open} data-testid={`op-${o.id}`}>
        <Icon name={open ? 'chevD' : 'chevR'} size={14} />
        <span className="t">{o.name}</span>
        <span className={`result ${o.result}`}>{o.result === 'ok' ? 'OK' : o.result === 'error' ? 'Error' : o.result === 'retry' ? `Retried ×${o.retries ?? 1}` : 'No result'}</span>
        <span className="m">{clockSec(base + o.startSec * 1000)} · {o.durationMs} ms</span>
      </div>
      {open && (
        <div className="ob">
          <dl className="kv">
            <dt>Source</dt><dd>{o.source}</dd>
            <dt>Result</dt><dd>{o.detail}</dd>
            <dt>Config</dt><dd className="mono">{o.configVersion}</dd>
            {o.linked && o.linked.length > 0 && <><dt>Linked</dt><dd className="linked">{o.linked.map((l) => (
              <button key={l.id + l.label} className="ev" onClick={() => {
                if (l.kind === 'alert') { selectAlert(l.id); setNav('situation'); }
                else if (l.kind === 'doc') { const doc = d.docById.get(l.id); if (doc) { openViewer({ docId: doc.id, revision: doc.current.revision, page: 1, label: '', locate: 'page-only', origin: 'Agent activity' }); setViewerExpanded(true); } }
              }}><Icon name={l.kind === 'doc' ? 'doc' : 'link'} size={13} />{l.label}</button>
            ))}</dd></>}
          </dl>
          <div className="logs" data-testid="op-logs">{o.logs.map((l, i) => <div key={i} className={l.level}><span className="t">{clockSec(base + l.t * 1000)}</span>{l.text}</div>)}</div>
        </div>
      )}
    </div>
  );
}
