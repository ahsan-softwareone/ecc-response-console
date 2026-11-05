import { useState } from 'react';
import { currentRun, configLabel, LIFECYCLE_LABEL } from '../lib/agent';
import { useAgentDisplay } from '../lib/agentStatus';
import { clock, clockSec, dateTime, elapsedParts, now, pad2, useNow } from '../lib/time';
import { downloadBlob } from '../record/exports';
import { exportIncident } from '../record/backup';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { focusPanel, resetCurrentTab, usePanels } from '../ui/panels';
import { IconButton, Popover } from '../ui/ui';

/** Identity and status of the incident in view, visible on every tab and while a panel is maximized. */
export function StatusBar() {
  const incidentId = useStore((s) => s.incidentId);
  const record = useStore((s) => s.records[s.incidentId]);
  const setDialog = useStore((s) => s.setDialog);
  const setSettings = useStore((s) => s.setSettings);
  const returnToWorkspace = useStore((s) => s.returnToWorkspace);
  return (
    <div className="statusbar" data-testid="statusbar" data-lifecycle={record?.status ?? 'none'}>
      {incidentId && record ? (
        <>
          <IncidentIdentity />
          <span className="spacer" />
          <SaveIndicator />
          {(record.status === 'active' || record.status === 'stabilizing') && <button className="btn sm" onClick={() => setDialog({ type: 'resolve' })} data-testid="lifecycle-resolve">Resolve incident</button>}
          {record.status === 'resolved' && <button className="btn sm" onClick={() => setDialog({ type: 'close' })} data-testid="lifecycle-close">Review and close</button>}
          {record.status === 'closed' && <button className="btn sm" onClick={returnToWorkspace} data-testid="lifecycle-return">Return to workspace</button>}
        </>
      ) : (
        <>
          <span className="sb-none" data-testid="no-incident-label">No active incident</span>
          <span className="spacer" />
        </>
      )}
      <AgentStatus />
      <WindowsControl />
      <IconButton className="sm" name="gear" title="Settings" onClick={() => setSettings(true)} testId="settings-open" />
    </div>
  );
}

function IncidentIdentity() {
  const record = useStore((s) => s.records[s.incidentId])!;
  const setDialog = useStore((s) => s.setDialog);
  const n = useNow(5000);
  const occurred = record.occurredAt ?? record.startedAt;
  const end = record.closure?.t ?? n;
  const { h, m } = elapsedParts(end - occurred);
  const run0 = record.agentRuns?.[0];
  const training = record.mode === 'training';
  return (
    <Popover width={360} align="left" trigger={(open, toggle) => (
      <button className="sb-id" onClick={toggle} aria-expanded={open} title="Incident details" data-testid="incident-identity">
        <span className={`chip ${training ? 'mode-training' : 'mode-real'}`} data-testid="mode-marker"><span className="full">{training ? 'Training · illustrative' : 'Real incident · simulated data'}</span><span className="short">{training ? 'Training' : 'Real'}</span></span>
        <span className="sb-title" data-testid="emergency-title">{record.title}</span>
        <span className="sb-meta"><span data-testid="incident-id">{record.id}</span> · {record.site}</span>
        <span className="chip outline" data-testid="lifecycle-chip">{LIFECYCLE_LABEL[record.status]}</span>
        <span className="sb-meta num" data-testid="start-time">Started {clock(occurred)}</span>
      </button>
    )}>
      {() => (
        <div className="sb-pop" data-testid="incident-details">
          <div className="head"><b>{record.title}</b></div>
          <dl className="kv">
            <dt>Identifier</dt><dd>{record.id}</dd>
            <dt>Site</dt><dd>{record.site}{record.location ? ` · ${record.location}` : ''}</dd>
            <dt>Type</dt><dd>{training ? 'Training scenario · illustrative data' : 'Real incident · simulated data in this prototype'}</dd>
            <dt>Status</dt><dd>{LIFECYCLE_LABEL[record.status]}</dd>
            <dt>Occurred</dt><dd className="num" data-testid="time-occurred">{dateTime(occurred)} · {clockSec(occurred)}</dd>
            <dt>Record created</dt><dd className="num" data-testid="time-created">{record.createdAt ? `${dateTime(record.createdAt)} · ${clockSec(record.createdAt)}` : 'Not recorded (older record)'}</dd>
            <dt>Agent started</dt><dd className="num" data-testid="time-agent">{run0 ? `${dateTime(run0.startedAt)} · ${clockSec(run0.startedAt)}` : 'Not started'}</dd>
            <dt>Elapsed</dt><dd className="num">{pad2(h)} h {pad2(m)} m{record.closure ? ` · closed ${clock(record.closure.t)}` : ''}</dd>
            {record.notification?.text && <><dt>Notification</dt><dd>{record.notification.text}</dd></>}
            {record.basedOn && <><dt>Reference</dt><dd>{record.basedOn.id}: precedent only, nothing copied</dd></>}
          </dl>
          {record.status === 'resolved' && <div className="row-end"><button className="btn sm" onClick={() => setDialog({ type: 'return-active' })} data-testid="lifecycle-return-active">Return to Active</button></div>}
        </div>
      )}
    </Popover>
  );
}

export function SaveIndicator() {
  const save = useStore((s) => s.save);
  const record = useStore((s) => s.records[s.incidentId]);
  const retrySave = useStore((s) => s.retrySave);
  const [exporting, setExporting] = useState(false);
  if (save.state === 'failed') return (
    <span className="save failed" data-testid="save-indicator" data-state="failed" title={save.error}>
      <Icon name="warn" size={13} /> Save failed
      <button className="link" onClick={() => void retrySave()} data-testid="save-retry">Retry</button>
      {record && <button className="link" disabled={exporting} onClick={async () => { setExporting(true); try { const { blob } = await exportIncident(record, now()); downloadBlob(blob, `${record.id}.json`); } finally { setExporting(false); } }} data-testid="save-export">Export</button>}
    </span>
  );
  const at = save.at ?? record?.updatedAt;
  return <span className="save" data-testid="save-indicator" data-state={save.state} title="Saved in this browser only">{save.state === 'saving' ? 'Saving…' : <><Icon name="check" size={12} /> Saved{at ? ` ${clock(at)}` : ''}</>}</span>;
}

/** Proactive agent state. Separate from the Assistant, which is the conversation panel. */
function AgentStatus() {
  const a = useAgentDisplay();
  const record = useStore((s) => s.records[s.incidentId]);
  const setNav = useStore((s) => s.setNav);
  const setDialog = useStore((s) => s.setDialog);
  const { agentStart, agentPause, agentResume } = useStore.getState();
  const [reason, setReason] = useState('');
  const run = currentRun(record);
  const closed = record?.status === 'closed';
  const icon = a.attention ? 'warn' : a.state === 'paused' ? 'pause' : null;
  const simulated = record?.mode === 'training' ? 'Simulated from the training scenario' : 'Simulated in this prototype';
  return (
    <Popover width={340} trigger={(open, toggle) => (
      <button className={`agent-status s-${a.attention ? 'attention' : a.state} ${a.busy ? 'busy' : ''}`} onClick={toggle} aria-expanded={open} data-testid="agent-status" data-state={a.state} data-attention={a.attention} data-busy={a.busy} data-concerns={a.concerns.length} title={`${a.label}${a.activity ? ` · ${a.activity}` : ''}. This is not a statement about sources or equipment.`}>
        {icon ? <Icon name={icon} size={13} /> : <i className="agent-dot" aria-hidden="true" />}
        <span className="agent-label" data-testid="agent-label">{a.label}</span>
        {a.activity && <span className="agent-activity" data-testid="agent-activity">{a.activity}</span>}
        {a.concerns.length > 0 && a.state === 'running' && !a.attention && <span className="agent-concern" data-testid="agent-concern"><Icon name="warn" size={12} />{a.concerns.length}</span>}
      </button>
    )}>
      {(close) => (
        <div className="sb-pop" data-testid="agent-summary">
          <div className="head"><b>{a.label}</b>{run && <span className="sidenote"> · run {run.number} · {configLabel(run.config)}</span>}</div>
          <p className="sidenote" style={{ padding: '0 10px' }}>{simulated}. Agent state says nothing about whether sources are available or the facility is safe.</p>
          <dl className="kv">
            <dt>Current activity</dt><dd data-testid="agent-current">{a.activity ?? (a.state === 'paused' ? 'Analysis suspended' : a.state === 'none' ? 'None: no incident is open' : a.state === 'not-started' ? 'None: agent not started' : run?.endReason ?? 'None')}</dd>
            <dt>Last check</dt><dd data-testid="agent-last-check">{a.lastCheckAt ? `${a.lastCheckTitle} · ${clockSec(a.lastCheckAt)}` : 'None yet'}</dd>
            <dt>Sources</dt><dd data-testid="agent-sources">{a.concerns.length ? a.concerns.map((c) => <div key={c} className="concern">{c}</div>) : a.state === 'none' ? 'Not monitoring' : 'No loss or staleness detected'}</dd>
            {a.heldCount > 0 && <><dt>Awaiting analysis</dt><dd data-testid="agent-held">{a.heldCount} update{a.heldCount === 1 ? '' : 's'} received</dd></>}
          </dl>
          {record && !closed && (
            <div className="agent-actions">
              {a.state === 'running' && <input className="input sm" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="agent-reason" />}
              {a.state === 'not-started' && <button className="btn sm action" onClick={() => { void agentStart(); close(); }} data-testid="agent-start"><Icon name="play" size={12} /> Start agent</button>}
              {a.state === 'running' && <button className="btn sm" onClick={() => { void agentPause(reason.trim() || undefined); setReason(''); close(); }} data-testid="agent-pause"><Icon name="pause" size={12} /> Pause</button>}
              {a.state === 'paused' && <button className="btn sm action" onClick={() => { void agentResume(a.received); close(); }} data-testid="agent-resume"><Icon name="play" size={12} /> Resume</button>}
              {(a.state === 'running' || a.state === 'paused') && <button className="btn sm" onClick={() => { setDialog({ type: 'stop-agent' }); close(); }} data-testid="agent-stop"><Icon name="stop" size={12} /> Stop</button>}
              {(a.state === 'stopped' || a.state === 'error') && <button className="btn sm action" onClick={() => { void agentStart(); close(); }} data-testid="agent-start-again"><Icon name="play" size={12} /> Start again</button>}
            </div>
          )}
          <div className="sep" />
          <button className="item" onClick={() => { setNav('agentlog'); close(); }} data-testid="agent-open-log">Open Agent Log</button>
        </div>
      )}
    </Popover>
  );
}

/** What the current tab offers, open or hidden. */
function WindowsControl() {
  const panels = usePanels();
  const hidden = useStore((s) => s.hiddenPanels);
  const maxPanes = useStore((s) => s.maximizedPanes);
  const maxWin = useStore((s) => s.layout.maximized);
  return (
    <Popover width={270} trigger={(open, toggle) => <button className="btn sm quiet" onClick={toggle} aria-expanded={open} title="Windows on this tab" data-testid="windows-open"><Icon name="windows" size={13} /> Windows</button>}>
      {(close) => (
        <div data-testid="windows-menu">
          <div className="head label">Panels on this tab</div>
          {panels.length === 0 && <div className="item sidenote">This view has no panels to arrange.</div>}
          {panels.map((p) => {
            const isHidden = !!hidden[p.key];
            const isMax = p.split ? maxPanes[p.split] === p.pane : p.window === maxWin;
            return (
              <button key={p.key} className="item" onClick={() => { focusPanel(p); close(); }} data-testid={`win-${p.key}`} data-hidden={isHidden} title={isHidden ? 'Reopen this panel' : 'Bring this panel forward'}>
                <span>{p.label}</span><span className="sub">{isHidden ? 'Hidden · reopen' : isMax ? 'Maximized' : 'Open · focus'}</span>
              </button>
            );
          })}
          {panels.length > 0 && <><div className="sep" /><button className="item" onClick={() => { resetCurrentTab(); close(); }} data-testid="windows-reset">Reset this tab to its default layout</button></>}
        </div>
      )}
    </Popover>
  );
}

/** One line under the status bar, only when analysis is not current or something has just changed. */
export function AgentNotice() {
  const a = useAgentDisplay();
  const record = useStore((s) => s.records[s.incidentId]);
  const dismissed = useStore((s) => s.dismissedNotice);
  const setDismissed = useStore((s) => s.setDismissedNotice);
  const setDialog = useStore((s) => s.setDialog);
  const returnToWorkspace = useStore((s) => s.returnToWorkspace);
  const { agentStart, agentResume } = useStore.getState();
  const [more, setMore] = useState(false);
  if (!record) return null;
  if (record.status === 'closed') return (
    <div className="notice" data-testid="closed-notice"><Icon name="check" size={13} /><span className="grow">Closed record. Monitoring and agent work ended at {clock(record.closure!.t)}. Closing does not mean equipment is safe.</span><button className="link" onClick={() => setDialog({ type: 'closed', id: record.id })}>View options</button><button className="link" onClick={returnToWorkspace}>Return to workspace</button></div>
  );
  const held = a.heldCount > 0 ? ` ${a.heldCount} update${a.heldCount === 1 ? '' : 's'} awaiting analysis.` : '';
  if (a.state === 'not-started') return <div className="notice" data-testid="agent-notice" data-state="not-started"><Icon name="info" size={13} /><span className="grow">Agent not started. Readings are updating; nothing is being analysed.{held}</span><button className="link" onClick={() => void agentStart()} data-testid="notice-start">Start agent</button></div>;
  if (a.state === 'paused' || a.state === 'stopped' || a.state === 'error') {
    const since = a.suspendedSince ? clock(a.suspendedSince) : '';
    const what = a.state === 'paused' ? `Agent analysis suspended since ${since}` : a.state === 'error' ? `Agent error at ${since}; analysis is not happening` : `Agent stopped at ${since}`;
    return (
      <div className={`notice ${a.state === 'error' ? 'attn' : ''}`} data-testid="agent-notice" data-state={a.state}>
        <Icon name={a.state === 'paused' ? 'pause' : a.state === 'error' ? 'warn' : 'stop'} size={13} />
        <span className="grow">{what}. Readings and field reports keep updating; alerts, findings and recommendations only reflect information up to then.{held}</span>
        {a.state === 'paused' ? <button className="link" onClick={() => void agentResume(a.received)} data-testid="notice-resume">Resume</button> : <button className="link" onClick={() => void agentStart()} data-testid="notice-start-again">Start again</button>}
      </div>
    );
  }
  // After a resume: the account of what arrived, until dismissed.
  const run = currentRun(record);
  const last = run?.pauses[run.pauses.length - 1];
  const key = last?.to ? `${run!.id}:${last.to}` : null;
  if (key && key !== dismissed && a.state === 'running') {
    const items = last!.received ?? [];
    return (
      <div className="notice" data-testid="resume-notice">
        <Icon name="play" size={13} />
        <span className="grow">Agent resumed {clock(last!.to!)} after a pause from {clock(last!.from)}. {items.length ? `${items.length} item${items.length === 1 ? '' : 's'} received during the pause.` : 'Nothing new was received.'}{more && items.length > 0 && <span data-testid="resume-items"> {items.join(' · ')}</span>}</span>
        {items.length > 0 && <button className="link" onClick={() => setMore(!more)} data-testid="resume-more">{more ? 'Less' : 'Show'}</button>}
        <button className="link" onClick={() => setDismissed(key)} data-testid="resume-dismiss">Dismiss</button>
      </div>
    );
  }
  return null;
}

export function NotificationBanner() {
  const n = useStore((s) => s.pendingNotification);
  const active = useStore((s) => { const r = s.records[s.incidentId]; return !!r && r.status !== 'closed'; });
  const setDialog = useStore((s) => s.setDialog);
  const dismiss = useStore((s) => s.dismissNotification);
  const addToCurrent = useStore((s) => s.addNotificationToCurrent);
  if (!n) return null;
  return (
    <div className="notice incoming" data-testid="incoming-notification" role="status">
      <Icon name="bell" size={13} />
      <span className="grow"><b>Incoming notification (simulated)</b> · {n.site} · {n.title} · {clock(n.t)}</span>
      <button className="link" onClick={() => setDialog({ type: 'start', mode: 'real', prefill: { site: n.site, title: n.title, notification: n.text, via: n.via, location: n.location, equipment: n.equipment } })} data-testid="incoming-review">{active ? 'Start separate incident' : 'Review and start'}</button>
      {active && <button className="link" onClick={() => void addToCurrent()} data-testid="incoming-add">Add to current incident</button>}
      <button className="link" onClick={dismiss} data-testid="incoming-later">Later</button>
    </div>
  );
}
