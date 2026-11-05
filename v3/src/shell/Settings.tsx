import { useEffect, useState } from 'react';
import { CAPABILITIES, configLabel, currentRun, describeConfig } from '../lib/agent';
import { useAgentDisplay } from '../lib/agentStatus';
import { clock, dateTime, now } from '../lib/time';
import { asCopy, exportAll, parseImport, type ParsedImport } from '../record/backup';
import { downloadBlob } from '../record/exports';
import type { AgentConfig, CapabilityGroup } from '../record/types';
import { ASSISTANT_DEFAULT, useStore } from '../store';
import { useEscape } from '../ui/esc';
import { Icon } from '../ui/Icon';

/** Settings drawer: application, defaults for future incidents, and the current incident. */
export function Settings() {
  const open = useStore((s) => s.settingsOpen);
  const tab = useStore((s) => s.settingsTab);
  const setSettings = useStore((s) => s.setSettings);
  useEscape(open, () => setSettings(false));
  if (!open) return null;
  return (
    <div className="drawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettings(false); }}>
      <aside className="drawer" role="dialog" aria-label="Settings" data-testid="settings">
        <header className="modal-h"><span className="title">Settings</span><span className="spacer" /><button className="iconbtn sm" onClick={() => setSettings(false)} title="Close settings" aria-label="Close settings"><Icon name="close" size={14} /></button></header>
        <div className="drawer-tabs"><span className="seg">
          <button aria-pressed={tab === 'application'} onClick={() => setSettings(true, 'application')} data-testid="settings-application">Application</button>
          <button aria-pressed={tab === 'defaults'} onClick={() => setSettings(true, 'defaults')} data-testid="settings-defaults">Agent defaults</button>
          <button aria-pressed={tab === 'incident'} onClick={() => setSettings(true, 'incident')} data-testid="settings-incident">This incident</button>
        </span></div>
        <div className="drawer-b">
          {tab === 'application' && <ApplicationTab />}
          {tab === 'defaults' && <DefaultsTab />}
          {tab === 'incident' && <IncidentTab />}
        </div>
      </aside>
    </div>
  );
}

function ApplicationTab() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const records = useStore((s) => s.records);
  const uploads = useStore((s) => s.uploads);
  const storageError = useStore((s) => s.storageError);
  const role = useStore((s) => s.role);
  const agentView = useStore((s) => s.agentView);
  const setAgentView = useStore((s) => s.setAgentView);
  const setAssistantWidth = useStore((s) => s.setAssistantWidth);
  const resetPanels = useStore((s) => s.resetPanels);
  const clearAllLocalData = useStore((s) => s.clearAllLocalData);
  const setToast = useStore((s) => s.setToast);
  const [usage, setUsage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { void navigator.storage?.estimate?.().then((e) => { if (e.usage != null && e.quota) setUsage(`${(e.usage / 1048576).toFixed(1)} MB used of about ${Math.round(e.quota / 1048576)} MB`); }); }, []);
  const list = Object.values(records);
  const own = list.filter((r) => r.provenance !== 'seed').length;
  return (
    <>
      <section><h3>Appearance and workspace</h3>
        <div className="setrow"><span>Theme</span><span className="seg sm"><button aria-pressed={theme === 'light'} onClick={() => setTheme('light')} data-testid="set-theme-light">Light</button><button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} data-testid="set-theme-dark">Dark</button></span></div>
        {role === 'admin' && <div className="setrow"><span>Agent Log view</span><span className="seg sm"><button aria-pressed={agentView === 'business'} onClick={() => setAgentView('business')}>Business</button><button aria-pressed={agentView === 'detailed'} onClick={() => setAgentView('detailed')}>Detailed</button></span></div>}
        <div className="setrow"><span>Window layouts on every tab</span><button className="btn sm" onClick={() => { resetPanels(['situation.equipment', 'situation.log', 'situation.response', 'situation.document', 'sitrep.a', 'sitrep.b', 'agentlog.a', 'agentlog.b', 'knowledge-documents.a', 'knowledge-documents.b', 'knowledge-incidents.a', 'knowledge-incidents.b'], ['sitrep', 'agentlog', 'knowledge-documents', 'knowledge-incidents'], true); setAssistantWidth(ASSISTANT_DEFAULT); setToast('Window layouts restored to their defaults'); }} data-testid="set-reset-layouts">Reset all</button></div>
      </section>
      <section><h3>Storage</h3>
        <p data-testid="storage-info">This prototype stores everything in this browser only (IndexedDB and local storage), on this device and profile. Nothing is sent to a server. Clearing site data, or using another browser, loses it unless you have exported a backup.</p>
        <dl className="kv"><dt>Incident records</dt><dd data-testid="storage-counts">{own} of yours, {list.length - own} illustrative fixtures</dd><dt>Uploaded originals</dt><dd>{uploads.length}</dd><dt>Space</dt><dd>{usage ?? 'Not reported by this browser'}</dd>{storageError && <><dt>Problem</dt><dd className="concern">{storageError}</dd></>}</dl>
      </section>
      <section><h3>Backup</h3>
        <p className="sidenote">Includes every incident record you have and the original files of all uploads. Built-in fixture documents ship with the application and are referenced by id only. Layout preferences and the Assistant conversation are not included.</p>
        <div className="setrow left"><button className="btn sm" onClick={async () => { const { blob, contents, count } = await exportAll(list, uploads, now()); downloadBlob(blob, `ecc-backup-${now()}.json`); setNote(`${count} record${count === 1 ? '' : 's'} exported. ${contents.attachments}`); }} data-testid="export-all"><Icon name="download" size={13} /> Export backup</button><ImportControl /></div>
        {note && <p className="sidenote" data-testid="backup-note">{note}</p>}
      </section>
      <section><h3>Clear local data</h3>
        <div className="setrow"><span className="sidenote">Deletes every record, upload and conversation in this browser. It cannot be undone.</span><button className="btn sm" onClick={() => { if (window.confirm('Clear ALL local data? Every incident record, upload and conversation stored in this browser will be deleted. This cannot be undone.')) void clearAllLocalData(); }} data-testid="set-clear">Clear</button></div>
      </section>
    </>
  );
}

/** Validates first and handles duplicates explicitly; an existing record is never overwritten. */
export function ImportControl() {
  const records = useStore((s) => s.records);
  const importRecords = useStore((s) => s.importRecords);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const dups = parsed ? parsed.records.filter((r) => records[r.id]) : [];
  const fresh = parsed ? parsed.records.filter((r) => !records[r.id]) : [];
  const run = async (copyDups: boolean) => {
    if (!parsed) return;
    const ids = new Set(Object.keys(records));
    const copies = copyDups ? dups.map((r) => { const c = asCopy(r, ids); ids.add(c.id); return c; }) : [];
    const list = [...fresh.map((r) => ({ ...r, provenance: r.provenance ?? ('imported' as const), importedFrom: r.importedFrom ?? r.id })), ...copies];
    const res = await importRecords(list, parsed.docs);
    setResult(res.ok ? `Imported ${list.length} record${list.length === 1 ? '' : 's'}${parsed.docs.length ? ` and ${parsed.docs.length} original${parsed.docs.length === 1 ? '' : 's'}` : ''}.${!copyDups && dups.length ? ` Skipped ${dups.length} already present.` : ''}` : `Not imported: ${res.error}`);
    setParsed(null);
  };
  return (
    <span className="importctl">
      <label className="btn sm"><Icon name="up" size={13} /> Import<input type="file" accept="application/json,.json" style={{ display: 'none' }} data-testid="import-file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setResult(null); setParsed(parseImport(await f.text())); }} /></label>
      {result && <span className="sidenote" data-testid="import-result">{result}</span>}
      {parsed && parsed.errors.length > 0 && <span className="supnote block" data-testid="import-errors"><Icon name="warn" size={13} /> Not imported, nothing changed. {parsed.errors.slice(0, 4).join(' ')}<button className="link" onClick={() => setParsed(null)}>Dismiss</button></span>}
      {parsed && parsed.errors.length === 0 && (
        <span className="choice block" data-testid="import-review">
          <b>{parsed.records.length} valid record{parsed.records.length === 1 ? '' : 's'}{parsed.docs.length ? `, ${parsed.docs.length} original${parsed.docs.length === 1 ? '' : 's'}` : ''}.</b> {parsed.contents?.attachments}
          {dups.length > 0 && <span className="block" data-testid="import-dups">Already present: {dups.map((r) => r.id).join(', ')}. They will not be overwritten.</span>}
          <span className="row-end">
            <button className="btn sm" onClick={() => setParsed(null)}>Cancel</button>
            {dups.length > 0 && <button className="btn sm" onClick={() => void run(true)} data-testid="import-as-copy">Import duplicates as copies</button>}
            <button className="btn sm" disabled={fresh.length === 0 && parsed.docs.length === 0} onClick={() => void run(false)} data-testid="import-confirm">{dups.length ? `Import ${fresh.length} new, skip duplicates` : 'Import'}</button>
          </span>
        </span>
      )}
    </span>
  );
}

function ConfigForm({ config, onChange, disabled }: { config: AgentConfig; onChange: (p: Partial<AgentConfig>) => void; disabled?: boolean }) {
  const toggle = (id: CapabilityGroup) => onChange({ capabilities: config.capabilities.includes(id) ? config.capabilities.filter((x) => x !== id) : [...config.capabilities, id] });
  return (
    <>
      <div className="label" style={{ marginTop: 8 }}>Capability groups (simulated)</div>
      {CAPABILITIES.map((c) => <label className="check setcheck" key={c.id}><input type="checkbox" disabled={disabled} checked={config.capabilities.includes(c.id)} onChange={() => toggle(c.id)} data-testid={`cap-${c.id}`} /><span>{c.label}<span className="sidenote block">{c.note}</span></span></label>)}
      <p className="sidenote">Monitoring, alerting and source checks always run.</p>
      <div className="setrow"><span>Agent's Knowledge search scope<span className="sidenote block">Applied to the search run on user-created incidents</span></span><span className="seg sm"><button disabled={disabled} aria-pressed={config.retrievalScope === 'incident-site'} onClick={() => onChange({ retrievalScope: 'incident-site' })} data-testid="scope-site">Incident site</button><button disabled={disabled} aria-pressed={config.retrievalScope === 'all-sites'} onClick={() => onChange({ retrievalScope: 'all-sites' })} data-testid="scope-all">All sites</button></span></div>
    </>
  );
}

function DefaultsTab() {
  const defaults = useStore((s) => s.agentDefaults);
  const log = useStore((s) => s.defaultsLog);
  const role = useStore((s) => s.role);
  const setAgentDefaults = useStore((s) => s.setAgentDefaults);
  const admin = role === 'admin';
  return (
    <section>
      <h3>Defaults for future incidents · {configLabel(defaults)}</h3>
      <p className="sidenote" data-testid="defaults-note">These apply to incidents started from now on. They do not change an open incident. {admin ? 'You are in the Admin demonstration role.' : 'Editing needs the Admin demonstration role (profile menu). This is a demonstration switch, not real authorization.'}</p>
      <div className="setrow"><span>Start the agent automatically when an incident begins</span><label className="check"><input type="checkbox" disabled={!admin} checked={defaults.autoStart} onChange={(e) => setAgentDefaults({ autoStart: e.target.checked })} data-testid="default-autostart" /> {defaults.autoStart ? 'On' : 'Off'}</label></div>
      <ConfigForm config={defaults} disabled={!admin} onChange={setAgentDefaults} />
      <p className="sidenote">The simulation has no adjustable monitoring cadence, so none is offered.</p>
      {log.length > 0 && <><div className="label" style={{ marginTop: 10 }}>Change log</div><ul className="plain" data-testid="defaults-log">{log.map((l, i) => <li key={i}><span className="num">{clock(l.t)}</span> · v{l.version} · {l.text} · {l.by}</li>)}</ul></>}
    </section>
  );
}

function IncidentTab() {
  const record = useStore((s) => s.records[s.incidentId]);
  const setIncidentConfig = useStore((s) => s.setIncidentConfig);
  const a = useAgentDisplay();
  if (!record) return <section><p data-testid="settings-no-incident">No incident is open, so there is nothing to control. Defaults for future incidents are under Agent defaults.</p></section>;
  const cfg = record.agentConfig;
  const run = currentRun(record);
  const closed = record.status === 'closed';
  const pendingChange = !!cfg && !!run && cfg.version !== run.config.version;
  return (
    <>
      <section data-testid="settings-incident-body">
        <h3>{record.id}</h3>
        <p className="sidenote">Changes here apply to this incident only, from its next run. A run keeps the version it started with. Use the agent status control in the status bar to start, pause, resume or stop.</p>
        <dl className="kv"><dt>Agent</dt><dd data-testid="settings-agent-state">{a.label}</dd><dt>Current config</dt><dd data-testid="settings-config">{cfg ? `${configLabel(cfg)} · ${describeConfig(cfg)}` : 'None'}{pendingChange && <span className="chip outline" style={{ marginLeft: 6 }} data-testid="config-pending">Applies at next run</span>}</dd></dl>
        {cfg && !closed && <ConfigForm config={cfg} onChange={(p) => void setIncidentConfig(p)} />}
      </section>
      <section><h3>Runs</h3>
        {(record.agentRuns ?? []).length === 0 && <p className="sidenote">No runs yet.</p>}
        <table className="runs" data-testid="agent-runs"><tbody>{(record.agentRuns ?? []).map((r) => (
          <tr key={r.id} data-testid={`run-${r.number}`}><td><b>Run {r.number}</b></td><td>{r.status === 'completed' ? 'Ended at closure' : r.status[0].toUpperCase() + r.status.slice(1)}</td><td className="num">{dateTime(r.startedAt)}{r.endedAt ? ` to ${clock(r.endedAt)}` : ''}</td><td>{configLabel(r.config)}</td><td className="sidenote">{r.by}{r.endReason ? ` · ${r.endReason}` : ''}{r.pauses.length ? ` · ${r.pauses.length} pause${r.pauses.length === 1 ? '' : 's'}` : ''}</td></tr>
        ))}</tbody></table>
      </section>
    </>
  );
}
