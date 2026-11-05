import { latestSample, monitorAge } from '../../domain/brief';
import { recordLabel } from '../../domain/content';
import { useEcc } from '../../domain/store';
import { SEVERITY_LABEL, SEVERITY_MAPPING, type Monitor } from '../../domain/types';
import { useUi } from '../App';
import { Field } from '../components/bits';
import { SeverityTag, SourceHealth } from '../components/Severity';
import { ageLabel, fmt, plural } from '../util';

/** The reading, its source, its alert and its history, with gaps shown rather than smoothed over. */
export function ReadingDetail({ m, citationId }: { m: Monitor; citationId?: string }) {
  const { state } = useEcc();
  const cit = citationId ? state.citations.find((c) => c.id === citationId) : undefined;
  const ui = useUi();
  const src = state.sources.find((x) => x.id === m.sourceId);
  const latest = latestSample(m);
  const age = monitorAge(state, m);
  const unit = m.unit ? ` ${m.unit}` : '';
  const rows = [...m.samples].reverse();
  const mapping = m.alert ? SEVERITY_MAPPING.find((x) => x.source === m.alert!.sourceSeverity) : undefined;

  return (
    <div className="reading">
      {cit?.reading && (
        <div className="reading-cited">
          <div className="field-label">As cited{cit.observedAt !== undefined ? `, observed ${fmt(cit.observedAt)}` : ''}</div>
          <dl className="kv">
            {cit.reading.map((r) => (
              <div key={r.label} className="kv-row">
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className="field-label">Latest reading</div>
      <div className="reading-now">
        <div className="reading-value">
          {latest.value}
          {unit && <span className="reading-unit">{unit}</span>}
        </div>
        <dl className="reading-meta">
          <div>
            <dt>Observed</dt>
            <dd className="t-num">{fmt(latest.observedAt)}</dd>
          </div>
          {latest.receivedAt !== latest.observedAt && (
            <div>
              <dt>Received</dt>
              <dd className="t-num">{fmt(latest.receivedAt)}</dd>
            </div>
          )}
          <div>
            <dt>Age</dt>
            <dd className={age > 5 ? 'is-old' : ''}>{ageLabel(age)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {src?.name} {src && <SourceHealth state={src.state} size="sm" />}
            </dd>
          </div>
          <div>
            <dt>Equipment or area</dt>
            <dd>
              <button type="button" className="tag-btn" onClick={() => ui.openAsset(m.assetId)}>
                {recordLabel(state, m.assetId)}
              </button>
            </dd>
          </div>
        </dl>
      </div>
      {src?.effect && src.state !== 'connected' && <p className="reading-limit">{src.effect}</p>}
      {m.limits && <p className="reading-limit">{m.limits}</p>}

      {m.alert && (
        <div className={`alert-block alert-${m.alert.display}`}>
          <div className="alert-head">
            <SeverityTag display={m.alert.display} source={m.alert.sourceSeverity} />
            <span className="alert-msg">{m.alert.message}</span>
          </div>
          <dl className="kv alert-kv">
            <div className="kv-row">
              <dt>Raised</dt>
              <dd className="t-num">
                {fmt(m.alert.raisedAt)}
                {m.alert.receivedAt !== m.alert.raisedAt && ` · received ${fmt(m.alert.receivedAt)}`}
              </dd>
            </div>
            <div className="kv-row">
              <dt>Notifications</dt>
              <dd>
                {plural(m.alert.notifications.length, 'notification')} grouped, latest {fmt(m.alert.notifications[m.alert.notifications.length - 1])}
              </dd>
            </div>
            <div className="kv-row">
              <dt>Severity</dt>
              <dd>
                Source sent <span className="mono">{m.alert.sourceSeverity}</span>, shown as {SEVERITY_LABEL[m.alert.display]}
                {mapping ? '' : ' (no mapping defined)'}. Illustrative mapping, not approved policy.
              </dd>
            </div>
          </dl>
          <p className="muted small">Not acknowledged or cleared here: ECC has no such control.</p>
        </div>
      )}

      <Field label="History">
        <ol className="samples">
          {rows.map((s, i) => {
            const next = rows[i + 1];
            const gap = next ? s.observedAt - next.observedAt : 0;
            return (
              <li key={s.observedAt} className="sample-row">
                <div className="sample">
                  <span className="t-num">{fmt(s.observedAt)}</span>
                  <span className="sample-v">
                    {s.value}
                    {unit}
                  </span>
                  {s.receivedAt !== s.observedAt && <span className="muted small t-num">received {fmt(s.receivedAt)}</span>}
                </div>
                {gap > 1 && (
                  <div className="sample-gap">
                    No readings between {fmt(next.observedAt)} and {fmt(s.observedAt)} ({gap} min)
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="muted small">Simulated readings for training. Sorted by observation time, newest first.</p>
      </Field>
    </div>
  );
}
