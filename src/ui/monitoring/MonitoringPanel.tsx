// Monitored conditions: readings, active alerts and source health, kept as three separate things.
// Verified is not safe; connected is not healthy equipment; no alert is not an all-clear.
import { latestSample, monitorAge, monitoringSummary } from '../../domain/brief';
import { recordLabel } from '../../domain/content';
import { useEcc } from '../../domain/store';
import { SEVERITY_LABEL, SEVERITY_MAPPING, type Monitor } from '../../domain/types';
import { useUi } from '../App';
import { Dialog } from '../components/Dialog';
import { SeverityTag, SourceHealth } from '../components/Severity';
import { ageLabel, fmt, plural } from '../util';

function MonitorRow({ m, after }: { m: Monitor; after: (fn: () => void) => void }) {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const src = state.sources.find((x) => x.id === m.sourceId);
  const latest = latestSample(m);
  const age = monitorAge(state, m);
  const degraded = src && src.state !== 'connected';
  return (
    <tr className={`mon-row ${m.alert ? `has-alert alert-${m.alert.display}` : ''}`}>
      <td>
        <div className="mon-name">{m.name}</div>
        <button type="button" className="tag-btn" onClick={() => after(() => ui.openAsset(m.assetId))}>
          {recordLabel(state, m.assetId)}
        </button>
      </td>
      <td>
        <span className="mon-value">
          {latest.value}
          {m.unit && <span className="reading-unit"> {m.unit}</span>}
        </span>
      </td>
      <td className="t-num">
        <div>{fmt(latest.observedAt)}</div>
        {latest.receivedAt !== latest.observedAt && <div className="muted small">received {fmt(latest.receivedAt)}</div>}
      </td>
      <td className={age > 5 || degraded ? 'is-old' : ''}>{ageLabel(age)}</td>
      <td>
        {src && <SourceHealth state={src.state} size="sm" />}
        {degraded && src?.effect && <div className="muted small mon-effect">{src.effect}</div>}
      </td>
      <td>
        {m.alert ? (
          <div className="mon-alert">
            <SeverityTag display={m.alert.display} source={m.alert.sourceSeverity} size="sm" />
            <span>{m.alert.message}</span>
            <span className="muted small t-num">
              since {fmt(m.alert.raisedAt)} · {plural(m.alert.notifications.length, 'notification')}
            </span>
          </div>
        ) : (
          <span className="muted">None</span>
        )}
      </td>
      <td>
        <button type="button" className="link-btn" onClick={() => after(() => dispatch({ type: 'OPEN_RECORD', id: m.id }))}>
          History
        </button>
      </td>
    </tr>
  );
}

export function MonitoringPanel({ onClose }: { onClose: () => void }) {
  const { state } = useEcc();
  const sum = monitoringSummary(state);
  const byDisplay = (d: string) => sum.alerts.filter((a) => a.display === d).length;
  // Leaving for a record or an asset closes this drawer first, so what opens is not hidden behind it.
  const after = (fn: () => void) => {
    onClose();
    fn();
  };
  return (
    <Dialog title="Monitoring" onClose={onClose} variant="slide" className="monitoring-dialog" labelledBy="mon-title">
      <div className="mon-summary">
        <div className="mon-sum-item">
          <span className="mon-sum-k">Monitored</span>
          <span className="mon-sum-v">{sum.monitored}</span>
        </div>
        <div className="mon-sum-item">
          <span className="mon-sum-k">Active alerts</span>
          <span className="mon-sum-v">
            {sum.alerts.length}
            {sum.alerts.length > 0 && (
              <span className="mon-sum-sub">
                {(['urgent', 'warning', 'advisory'] as const).filter((d) => byDisplay(d) > 0).map((d) => (
                  <SeverityTag key={d} display={d} size="sm" />
                ))}
              </span>
            )}
          </span>
        </div>
        <div className="mon-sum-item">
          <span className="mon-sum-k">Source limitations</span>
          <span className="mon-sum-v">{sum.degraded.length}</span>
        </div>
      </div>
      {sum.alerts.length === 0 && <p className="mon-note">No active alerts. That does not establish that the area is safe: it means no monitored source has raised one.</p>}
      {sum.degraded.length > 0 && (
        <ul className="mon-degraded">
          {sum.degraded.map((s) => (
            <li key={s.id}>
              <SourceHealth state={s.state} size="sm" /> <strong>{s.name}</strong>
              {s.lastSuccess !== null && <span className="muted t-num"> · last update {fmt(s.lastSuccess)}</span>}
              {s.effect && <div className="muted small">{s.effect}</div>}
            </li>
          ))}
        </ul>
      )}
      <div className="table-wrap">
        <table className="table mon-table">
          <thead>
            <tr>
              <th>Monitor</th>
              <th>Reading</th>
              <th>Observed</th>
              <th>Age</th>
              <th>Source</th>
              <th>Active alert</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.monitors.map((m) => (
              <MonitorRow key={m.id} m={m} after={after} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mon-foot">
        <p className="muted small">
          Severity shown is an illustrative mapping of the source's own value ({SEVERITY_MAPPING.map((x) => `${x.source} → ${SEVERITY_LABEL[x.display]}`).join(', ')}), not approved policy. Source health describes the connection, not the equipment. Source updates are simulated for training.
        </p>
      </div>
    </Dialog>
  );
}
