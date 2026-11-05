// Agent activity: the work first, in plain words; execution records on demand, sanitised. No reasoning.
import { Check, Circle, CircleDot, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { agentTasks, briefHealth, execRecords, taskOutputs, taskSteps } from '../../domain/brief';
import { useEcc } from '../../domain/store';
import { EXEC_LABEL, SOURCE_STATE_LABEL, TASK_STATUS_LABEL, type AgentTask, type ExecRecord, type PrepStep } from '../../domain/types';
import { useUi } from '../App';
import { Disclosure, Field } from '../components/bits';
import { RefChips } from '../components/Chips';
import { SourceHealth } from '../components/Severity';
import { Tabs, TabPanel } from '../components/Tabs';
import { durationLabel, fmt, plural } from '../util';

function StepGlyph({ status }: { status: PrepStep['status'] }) {
  if (status === 'done') return <Check size={13} aria-hidden="true" className="step-glyph step-done" />;
  if (status === 'attention') return <TriangleAlert size={13} aria-hidden="true" className="step-glyph step-attention" />;
  if (status === 'active') return <CircleDot size={13} aria-hidden="true" className="step-glyph step-active" />;
  return <Circle size={13} aria-hidden="true" className="step-glyph step-pending" />;
}

/** A failed step that a later attempt of the same operation completed. The task did not fail. */
function retriedOk(all: ExecRecord[], r: ExecRecord): boolean {
  return r.status === 'failed' && all.some((x) => x.taskId === r.taskId && x.operation === r.operation && x.input === r.input && x.startMs > r.startMs && x.status === 'ok');
}

function stepResult(all: ExecRecord[], r: ExecRecord): { label: string; tone: 'ok' | 'failed' | 'recovered' } {
  if (r.status === 'ok') return { label: 'OK', tone: 'ok' };
  if (retriedOk(all, r)) return { label: 'Failed, retry succeeded', tone: 'recovered' };
  return { label: 'Failed', tone: 'failed' };
}

function endMs(r: ExecRecord) {
  return r.startMs + (r.durationMs ?? 0);
}

const fmtMs = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3);
  return `${fmt(m)}:${s.padStart(6, '0')}`;
};

/* --- Tasks ------------------------------------------------------------------------------------- */

function SourceList({ names }: { names: string[] }) {
  const { state } = useEcc();
  if (names.length === 0) return <span className="muted">Incident record only</span>;
  return (
    <span className="task-sources">
      {names.map((n) => {
        const src = state.sources.find((s) => s.name === n);
        return (
          <span key={n} className="task-source">
            {n}
            {src && src.state !== 'connected' && <SourceHealth state={src.state} size="sm" />}
          </span>
        );
      })}
    </span>
  );
}

function TaskCard({ t, selected, onSelect }: { t: AgentTask; selected: boolean; onSelect: () => void }) {
  const { state, dispatch } = useEcc();
  const steps = taskSteps(state, t.id);
  const all = execRecords(state);
  const failed = steps.filter((s) => s.status === 'failed');
  const recovered = failed.filter((s) => retriedOk(all, s));
  const outputs = taskOutputs(state, t.id);
  const [allOutputs, setAllOutputs] = useState(false);
  const observer = state.prototypeRole === 'Observer';
  return (
    <li className={`task task-${t.status} ${selected ? 'is-selected' : ''}`}>
      <div className="task-head">
        <span className={`task-status task-status-${t.status}`}>{TASK_STATUS_LABEL[t.status]}</span>
        <span className="muted small t-num">
          {t.startedAt !== undefined ? `Started ${fmt(t.startedAt)}` : 'Not started'}
          {t.updatedAt !== undefined && t.updatedAt !== t.startedAt && ` · updated ${fmt(t.updatedAt)}`}
        </span>
      </div>
      <h3 className="task-title">{t.title}</h3>
      <p className="task-purpose">{t.purpose}</p>
      {t.outcome && (
        <p className="task-line">
          <span className="fe-k">Outcome</span>
          <span>{t.outcome}</span>
        </p>
      )}
      {t.blocker && (
        <p className="task-line task-blocker">
          <span className="fe-k">Blocker</span>
          <span>{t.blocker}</span>
        </p>
      )}
      {t.consequence && (
        <p className="task-line task-consequence">
          <span className="fe-k">Consequence</span>
          <span>{t.consequence}</span>
        </p>
      )}
      <p className="task-line">
        <span className="fe-k">Sources</span>
        <SourceList names={t.sources} />
      </p>
      {outputs.length > 0 && (
        <p className="task-line">
          <span className="fe-k">Outputs</span>
          <span className="task-outputs">
            {(allOutputs ? outputs : outputs.slice(0, 2)).map((o) => (
              <button key={o.id} type="button" className="link-btn" onClick={() => dispatch({ type: 'OPEN_RECORD', id: o.id })}>
                {o.title}
              </button>
            ))}
            {outputs.length > 2 && !allOutputs && (
              <button type="button" className="link-btn" onClick={() => setAllOutputs(true)}>
                {outputs.length - 2} more
              </button>
            )}
          </span>
        </p>
      )}
      {!observer && steps.length > 0 && (
        <div className="task-foot">
          <span className="muted small">
            {plural(steps.length, 'step')}
            {failed.length > 0 && recovered.length === failed.length && ` · ${plural(failed.length, 'failed step')} retried successfully`}
            {failed.length > 0 && recovered.length < failed.length && ` · ${plural(failed.length - recovered.length, 'failed step')}`}
          </span>
          <button type="button" className={`btn btn-sm ${selected ? 'is-on' : ''}`} aria-pressed={selected} onClick={onSelect}>
            {selected ? 'Hide steps' : 'Show steps'}
          </button>
        </div>
      )}
    </li>
  );
}

/** Low-level detail of one execution record. Sanitised metadata only. */
export function StepDetail({ r }: { r: ExecRecord }) {
  const { state } = useEcc();
  const all = execRecords(state);
  const task = state.tasks.find((t) => t.id === r.taskId);
  const res = stepResult(all, r);
  return (
    <div className="step-detail">
      <div className="step-detail-head">
        <span className="detail-kicker">
          {EXEC_LABEL[r.execType]} <span className="detail-id">{r.id}</span>
        </span>
        <span className={`exec-status exec-${res.tone}`}>{res.label}</span>
      </div>
      <h4 className="step-detail-title">{r.label}</h4>
      <dl className="kv kv-tight">
        <div className="kv-row">
          <dt>Run</dt>
          <dd className="mono">{r.runId}</dd>
        </div>
        <div className="kv-row">
          <dt>Parent task</dt>
          <dd>
            {task?.title ?? r.taskId} <span className="muted mono">{r.taskId}</span>
          </dd>
        </div>
        <div className="kv-row">
          <dt>Operation</dt>
          <dd className="mono">{r.operation}</dd>
        </div>
        <div className="kv-row">
          <dt>Start</dt>
          <dd className="t-num">{fmtMs(r.startMs)}</dd>
        </div>
        <div className="kv-row">
          <dt>End</dt>
          <dd className="t-num">{r.durationMs !== undefined ? fmtMs(endMs(r)) : <span className="muted">Not recorded</span>}</dd>
        </div>
        <div className="kv-row">
          <dt>Duration</dt>
          <dd className="t-num">{durationLabel(r.durationMs) || <span className="muted">Not recorded</span>}</dd>
        </div>
        {r.attempt !== undefined && (
          <div className="kv-row">
            <dt>Attempt</dt>
            <dd>{r.attempt}</dd>
          </div>
        )}
        {r.errorCode && (
          <div className="kv-row">
            <dt>Error</dt>
            <dd>
              <span className="mono">{r.errorCode}</span>
              {r.errorMessage && ` · ${r.errorMessage}`}
            </dd>
          </div>
        )}
        {r.input && (
          <div className="kv-row">
            <dt>Input</dt>
            <dd className="mono">{r.input}</dd>
          </div>
        )}
        {r.output && (
          <div className="kv-row">
            <dt>Output</dt>
            <dd className="mono">{r.output}</dd>
          </div>
        )}
        {r.source && (
          <div className="kv-row">
            <dt>Source</dt>
            <dd>
              {r.source}
              {(() => {
                const s = state.sources.find((x) => x.name === r.source);
                return s ? (
                  <>
                    {' '}
                    <SourceHealth state={s.state} size="sm" />
                  </>
                ) : null;
              })()}
            </dd>
          </div>
        )}
        <div className="kv-row">
          <dt>Configuration</dt>
          <dd className="mono">{r.configVersion}</dd>
        </div>
        <div className="kv-row">
          <dt>Produced</dt>
          <dd>{r.outputs.length ? <RefChips ids={r.outputs} /> : <span className="muted">No feed entry</span>}</dd>
        </div>
      </dl>
    </div>
  );
}

function StepsTable({ rows, selected, onSelect, highlight = [] }: { rows: ExecRecord[]; selected?: string; onSelect: (id: string) => void; highlight?: string[] }) {
  const { state } = useEcc();
  const all = execRecords(state);
  const firstRef = useRef<HTMLTableRowElement>(null);
  const firstHighlight = rows.find((r) => highlight.includes(r.id))?.id;
  useEffect(() => {
    firstRef.current?.scrollIntoView({ block: 'center' });
  }, [firstHighlight]);
  return (
    <div className="table-wrap">
      <table className="table exec-table">
        <thead>
          <tr>
            <th>Start</th>
            <th>Step</th>
            <th>Source</th>
            <th>Result</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const res = stepResult(all, r);
            return (
              <tr key={r.id} ref={r.id === firstHighlight ? firstRef : undefined} className={`exec-row ${res.tone === 'failed' ? 'is-failed' : ''} ${highlight.includes(r.id) ? 'is-highlighted' : ''} ${selected === r.id ? 'is-selected' : ''}`} onClick={() => onSelect(r.id)}>
                <td className="t-num">{fmt(r.at)}</td>
                <td>
                  <button type="button" className="exec-open" aria-pressed={selected === r.id} onClick={() => onSelect(r.id)}>
                    {r.label}
                  </button>
                  <div className="muted small">
                    {EXEC_LABEL[r.execType]}
                    {r.attempt !== undefined && ` · attempt ${r.attempt}`}
                  </div>
                </td>
                <td>{r.source ?? <span className="muted">—</span>}</td>
                <td>
                  <span className={`exec-status exec-${res.tone}`}>{res.label}</span>
                </td>
                <td className="t-num">{durationLabel(r.durationMs) || <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TasksView() {
  const { state } = useEcc();
  const ui = useUi();
  const tasks = agentTasks(state);
  const health = briefHealth(state);
  const observer = state.prototypeRole === 'Observer';
  const { taskId, stepId } = ui.ws.activity;
  const task = tasks.find((t) => t.id === taskId);
  const steps = task ? taskSteps(state, task.id) : [];
  const step = steps.find((s) => s.id === stepId);
  const setA = (patch: Partial<typeof ui.ws.activity>) => ui.setWs({ activity: { ...ui.ws.activity, ...patch } });

  return (
    <TabPanel id="tasks">
      <div className="act-top">
        <div className={`agent-now ${state.preparing ? 'is-preparing' : ''}`}>
          <span className="agent-pulse" aria-hidden="true" />
          <span className="agent-now-text">
            <span className="agent-now-k">Agent now</span>
            <span>{state.agentWork}</span>
          </span>
        </div>
        <div className={`health-line health-${health.state}`}>
          <span className="health-dot" aria-hidden="true" />
          <span>
            <strong>{health.label}</strong>
            <span className="muted"> · brief last updated {fmt(health.updatedAt)}</span>
          </span>
        </div>
      </div>
      {state.preparing && (
        <ol className="prep act-prep" aria-label="Preparing the brief">
          {state.prepSteps.map((p) => (
            <li key={p.label} className={`prep-step prep-${p.status}`}>
              <StepGlyph status={p.status} />
              <span className="prep-text">
                <span className="prep-label">{p.label}</span>
                {p.outcome && <span className="prep-outcome">{p.outcome}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {health.limits.length > 0 && (
        <ul className="limit-list">
          {health.limits.map((l) => (
            <li key={l.source.id}>
              <span className="limit-src">{l.source.name}</span>
              <SourceHealth state={l.source.state} size="sm" />
              <span className="limit-effect">{l.effect}</span>
            </li>
          ))}
        </ul>
      )}

      <div className={`act-layout ${task ? 'has-detail' : ''}`}>
        <ol className="tasks" aria-label="Agent tasks">
          {tasks.map((t) => (
            <TaskCard key={t.id} t={t} selected={t.id === taskId} onSelect={() => setA({ taskId: t.id === taskId ? undefined : t.id, stepId: undefined })} />
          ))}
        </ol>
        {task && !observer && (
          <section className="task-detail" aria-label={`Steps of ${task.title}`}>
            <div className="section-head">
              <h3>{task.title}: steps</h3>
              <span className="muted small">Sorted by start time</span>
            </div>
            <StepsTable rows={steps} selected={stepId} onSelect={(id) => setA({ stepId: id === stepId ? undefined : id })} />
            {step ? <StepDetail r={step} /> : <p className="muted small">Select a step for its record: operation, timing, attempt, error and input/output metadata.</p>}
          </section>
        )}
      </div>

      <Disclosure label="All sources" className="act-sources">
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Health</th>
              <th>Last successful update</th>
              <th>Effect on the brief</th>
            </tr>
          </thead>
          <tbody>
            {state.sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <div>{s.name}</div>
                  <div className="muted small">{s.description}</div>
                </td>
                <td>
                  <SourceHealth state={s.state} size="sm" />
                </td>
                <td className="t-num">{s.lastSuccess === null ? 'None' : fmt(s.lastSuccess)}</td>
                <td>{s.effect ?? <span className="muted">None</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">{SOURCE_STATE_LABEL.connected} means the link works. It says nothing about the equipment or whether a source's content is complete.</p>
      </Disclosure>
    </TabPanel>
  );
}

/* --- Execution records --------------------------------------------------------------------- */

function RecordsView() {
  const { state } = useEcc();
  const ui = useUi();
  const { highlight, stepId } = ui.ws.activity;
  const [q, setQ] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const [taskFilter, setTaskFilter] = useState('');
  const needle = q.trim().toLowerCase();
  const all = execRecords(state);
  const rows = useMemo(
    () =>
      all
        .filter((r) => !failedOnly || r.status === 'failed')
        .filter((r) => !taskFilter || r.taskId === taskFilter)
        .filter((r) => !needle || r.label.toLowerCase().includes(needle) || (r.source ?? '').toLowerCase().includes(needle) || EXEC_LABEL[r.execType].toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle) || r.operation.toLowerCase().includes(needle) || (r.errorCode ?? '').toLowerCase().includes(needle)),
    [all, failedOnly, taskFilter, needle],
  );
  const step = all.find((r) => r.id === stepId);
  const setA = (patch: Partial<typeof ui.ws.activity>) => ui.setWs({ activity: { ...ui.ws.activity, ...patch } });

  return (
    <TabPanel id="records">
      <div className="list-tools">
        <label className="search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search execution records</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records" />
        </label>
        <label className="inline-field">
          <span className="sr-only">Task</span>
          <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
            <option value="">All tasks</option>
            {state.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
          <span>Failed only</span>
        </label>
        {highlight.length > 0 && (
          <span className="muted small">
            {plural(highlight.length, 'record')} from a feed entry.{' '}
            <button type="button" className="link-btn" onClick={() => setA({ highlight: [] })}>
              Clear
            </button>
          </span>
        )}
        <span className="muted small list-tools-end">
          Sorted by start time · Run <span className="mono">{all[0]?.runId ?? ''}</span>
        </span>
      </div>
      {step && (
        <Field label="Selected record">
          <StepDetail r={step} />
        </Field>
      )}
      {rows.length === 0 ? (
        <div className="empty-block">
          <p className="empty-title">No records match</p>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setQ('');
              setFailedOnly(false);
              setTaskFilter('');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <StepsTable rows={rows} selected={stepId} onSelect={(id) => setA({ stepId: id === stepId ? undefined : id })} highlight={highlight} />
      )}
    </TabPanel>
  );
}

export function Activity() {
  const { state } = useEcc();
  const ui = useUi();
  const level = ui.ws.activity.level;
  const observer = state.prototypeRole === 'Observer';
  return (
    <div className="page">
      <Tabs
        tabs={[
          { id: 'tasks', label: 'Tasks' },
          { id: 'records', label: 'Execution records', count: observer ? undefined : state.activity.length },
        ]}
        active={level}
        onChange={(l) => ui.setWs({ activity: { ...ui.ws.activity, level: l } })}
        label="Agent activity"
      />
      {level === 'tasks' && <TasksView />}
      {level === 'records' &&
        (observer ? (
          <TabPanel id="records">
            <div className="empty-block">
              <p className="empty-title">Execution records are hidden for the Observer prototype role</p>
              <p>They are shown to incident users, knowledge stewards and administrators. The task overview remains available.</p>
              <button type="button" className="btn btn-sm" onClick={ui.openProfile}>
                Switch prototype role in User profile
              </button>
            </div>
          </TabPanel>
        ) : (
          <RecordsView />
        ))}
    </div>
  );
}
