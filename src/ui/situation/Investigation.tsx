import { ArrowUpRight } from 'lucide-react';
import { latestSample, monitorAge } from '../../domain/brief';
import { citedProcedure, conditionUnit, type ConditionUnit, type LinkedResponse } from '../../domain/situation';
import { useEcc } from '../../domain/store';
import { ACTION_STATUS_LABEL, OUTCOME_LABEL, SEVERITY_LABEL, TRUST_LABEL, type Issue, type Monitor, type Recommendation, type Report, type ResponseAction } from '../../domain/types';
import { useUi } from '../App';
import { ActionStatusTag } from '../components/ActionStatus';
import { Field, Quote } from '../components/bits';
import { RefChips } from '../components/Chips';
import { RefLink } from '../components/RefLink';
import { SeverityTag, SourceHealth } from '../components/Severity';
import { TrustTag } from '../components/TrustTag';
import { DecisionForm } from '../forms/DecisionForm';
import { VerifyForm } from '../forms/VerifyForm';
import { ReportCard } from '../rail/Details';
import { ageLabel, fmt, plural } from '../util';

const REC_STATUS: Record<Recommendation['status'], string> = { 'awaiting-review': 'Awaiting review', deferred: 'Deferred, still on the review list', decided: 'Decided' };

/**
 * A focused investigation of one condition unit: the condition as assessed, then the recommendation
 * with its current decision state and controls, the response as reported, the procedure cited, the
 * readings and reports behind it, and the history. Decision controls come before supporting history
 * on purpose. Opening this acknowledges nothing and decides nothing.
 */
export function Investigation({ railId }: { railId: string }) {
  const { state } = useEcc();
  const u = conditionUnit(state, railId);
  if (!u) return <p className="empty">This condition is not on the brief. Its records stay in the feed and in Actions.</p>;
  return (
    <div className="detail inv">
      <div className="detail-kicker">
        {u.label}
        {u.alerts.map((a) => (
          <span key={a.id}>
            {' · '}
            <SeverityTag display={a.display} source={a.sourceSeverity} size="sm" />
          </span>
        ))}
        {' · '}as of <span className="t-num">{fmt(u.changedAt)}</span>
      </div>
      <h3 className="detail-title">{u.value}</h3>
      <p className="emphasis">{u.state}</p>
      <div className="inv-tags">
        <TrustTag trust={u.trust} />
        {u.status && <span className="inv-status">{u.status}</span>}
      </div>
      {u.rec && <RecommendationBlock u={u} rec={u.rec} />}
      {u.linked.map((l) => (
        <LinkedBlock key={l.act.id} l={l} />
      ))}
      {u.alerts.map((a) => {
        const m = state.monitors.find((x) => x.id === a.monitorId);
        return m ? <ReadingBlock key={m.id} m={m} /> : null;
      })}
      {u.issue?.type === 'conflict' && <ConflictBlock issue={u.issue} />}
      {u.issue && u.issue.type !== 'conflict' && (
        <Field label="Open question">
          <RefLink id={u.issue.id} label={u.issue.title} />
          <p className="muted small">{u.issue.status === 'answered' ? 'Answered on the record.' : u.issue.whatWouldHelp}</p>
        </Field>
      )}
      <Field label={`Assessment line: ${u.row.label.toLowerCase()}`}>
        <p>{u.row.statement}</p>
        <div className="inv-tags">
          <TrustTag trust={u.row.trust} size="sm" />
          <span className="muted t-num">as of {fmt(u.row.at)}</span>
          <RefLink id={u.row.id} label="How this line is reached" />
        </div>
      </Field>
      <Field label="Evidence">
        <RefChips ids={u.evidence} emptyNote="No reference cited." />
      </Field>
    </div>
  );
}

function RecommendationBlock({ u, rec }: { u: ConditionUnit; rec: Recommendation }) {
  const { state } = useEcc();
  const ui = useUi();
  const dec = u.dec;
  const proc = citedProcedure(state, rec);
  return (
    <section className="inv-block" aria-label="Recommendation and decision">
      <div className="inv-block-k">
        Recommendation · {REC_STATUS[rec.status]} · surfaced <span className="t-num">{fmt(rec.surfacedAt)}</span>
      </div>
      <p className="inv-rec-title">{rec.title}</p>
      <p className="inv-rec-why">
        <span className="inv-k">Why</span> {rec.why}
      </p>
      {dec && (
        <div className="inv-decision">
          <span className="inv-k">Decision</span>
          <span>
            <RefLink id={dec.id} label={OUTCOME_LABEL[dec.outcome]} /> <span className="muted">· {dec.recordedByRole}, </span>
            <span className="t-num muted">{fmt(dec.at)}</span>
            {dec.rationale && <span className="muted"> · {dec.rationale}</span>}
          </span>
        </div>
      )}
      {rec.status !== 'decided' && <DecisionForm rec={rec} />}
      {u.act ? (
        <ResponseBlock act={u.act} />
      ) : dec ? (
        <p className="muted small">{dec.outcome === 'defer' ? 'Nothing to track while deferred. A decision can still be recorded above.' : 'Nothing to track: the decision was not to proceed. The open question stays open.'}</p>
      ) : null}
      {proc && (
        <Field label="Procedure cited">
          <button type="button" className="link-btn" onClick={() => ui.openSource(proc.citation.id)}>
            {proc.label}
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
          {proc.citation.excerpt && <Quote>{proc.citation.excerpt}</Quote>}
          <p className="muted small">
            Retrieved for this incident. Retrieval does not establish that it applies.
            {proc.newer && ` ${proc.newer.rev} became effective later and is offered in the viewer; this citation keeps ${proc.citation.revision}.`}
          </p>
        </Field>
      )}
      <Field label="Uncertainty">{rec.uncertainty}</Field>
      {rec.updates.length > 0 && (
        <Field label="Since it was surfaced">
          <ul className="history">
            {rec.updates.map((x, i) => (
              <li key={i}>
                <span className="mono muted">{fmt(x.at)}</span> <span>{x.text}</span>
                <RefChips ids={x.refs} />
              </li>
            ))}
          </ul>
        </Field>
      )}
      <p className="muted small">
        <button type="button" className="link-btn" onClick={() => ui.openAction(rec.id)}>
          Open in Actions <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      </p>
    </section>
  );
}

/** A response item attached because its decision was recorded on this condition line. */
function LinkedBlock({ l }: { l: LinkedResponse }) {
  const { state } = useEcc();
  const ui = useUi();
  const proc = l.rec ? citedProcedure(state, l.rec) : undefined;
  return (
    <section className="inv-block" aria-label="Response decided on this condition">
      <div className="inv-block-k">Decided on this condition{l.rec && ` · ${REC_STATUS[l.rec.status]}`}</div>
      {l.rec && <p className="inv-rec-title">{l.rec.title}</p>}
      {l.dec && (
        <div className="inv-decision">
          <span className="inv-k">Decision</span>
          <span>
            <RefLink id={l.dec.id} label={OUTCOME_LABEL[l.dec.outcome]} /> <span className="muted">· {l.dec.recordedByRole}, </span>
            <span className="t-num muted">{fmt(l.dec.at)}</span>
            {l.dec.rationale && <span className="muted"> · {l.dec.rationale}</span>}
          </span>
        </div>
      )}
      <ResponseBlock act={l.act} />
      {proc && (
        <p className="small">
          <span className="inv-k">Procedure cited</span>
          <button type="button" className="link-btn" onClick={() => ui.openSource(proc.citation.id)}>
            {proc.label}
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </p>
      )}
    </section>
  );
}

function ResponseBlock({ act }: { act: ResponseAction }) {
  const { state } = useEcc();
  const ui = useUi();
  const updates = [...act.updates].reverse();
  const dec = act.decisionId ? state.decisions.find((d) => d.id === act.decisionId) : undefined;
  return (
    <div className="inv-response">
      <div className="inv-response-head">
        <span className="inv-k">Response</span>
        <ActionStatusTag status={act.status} />
      </div>
      <p className="inv-response-title">
        <RefLink id={act.id} label={act.title} className="ref-plain" />
        {!dec && <span className="muted"> · no ECC decision; reported from the field</span>}
      </p>
      {act.verification && (
        <p className="small">
          <TrustTag trust="verified" size="sm" /> by {act.verification.by} at <span className="t-num">{fmt(act.verification.at)}</span>: {act.verification.basis}
        </p>
      )}
      {act.status === 'completion-reported' && (
        <>
          <p className="muted small">Completion has been reported from the field. It stays pending until a person records verification; completion does not establish the intended outcome.</p>
          <VerifyForm act={act} />
        </>
      )}
      {updates.length === 0 ? (
        <p className="muted small">Nobody has reported on this yet.</p>
      ) : (
        <ul className="history">
          {updates.slice(0, 3).map((x, i) => (
            <li key={i}>
              <div>
                <span className="mono muted">{fmt(x.at)}</span> <span className="muted small">{x.reportedBy} · {ACTION_STATUS_LABEL[x.status]}</span>
              </div>
              <div>{x.text}</div>
              <RefLink id={x.reportId} />
            </li>
          ))}
          {updates.length > 3 && (
            <li>
              <RefLink id={act.id} label={`All ${plural(updates.length, 'update')}`} />
            </li>
          )}
        </ul>
      )}
      {act.status !== 'completion-verified' && (
        <div className="detail-actions">
          <button type="button" className="btn btn-sm" onClick={() => ui.openFieldUpdate(act.id)}>
            Record field update
          </button>
        </div>
      )}
    </div>
  );
}

function ReadingBlock({ m }: { m: Monitor }) {
  const { state, dispatch } = useEcc();
  const src = state.sources.find((x) => x.id === m.sourceId);
  const latest = latestSample(m);
  const age = monitorAge(state, m);
  return (
    <Field label="Reading">
      <div className="inv-reading">
        <span className="inv-reading-value">
          {latest.value}
          {m.unit && <span className="inv-reading-unit"> {m.unit}</span>}
        </span>
        <span className="inv-reading-meta">
          {m.name} · observed <span className="t-num">{fmt(latest.observedAt)}</span> · {ageLabel(age).toLowerCase()}
          {src && (
            <>
              {' · '}
              <SourceHealth state={src.state} size="sm" />
            </>
          )}
        </span>
      </div>
      {m.alert && (
        <p className="small">
          Alert raised <span className="t-num">{fmt(m.alert.raisedAt)}</span>: {m.alert.message}. Source severity <span className="mono">{m.alert.sourceSeverity}</span>, shown as {SEVERITY_LABEL[m.alert.display]} (illustrative mapping, not approved policy). {plural(m.alert.notifications.length, 'notification')} grouped.
        </p>
      )}
      <p className="muted small">No configured threshold is held for this point; {m.alert ? 'the alarm is as raised by the source.' : 'the reading is shown as received.'} {m.limits ?? ''}</p>
      <button type="button" className="link-btn" onClick={() => dispatch({ type: 'OPEN_RECORD', id: m.id })}>
        Open reading and history
      </button>
    </Field>
  );
}

function ConflictBlock({ issue }: { issue: Issue }) {
  const { state } = useEcc();
  const reports = issue.reportIds?.map((id) => state.reports.find((r) => r.id === id)).filter((r): r is Report => !!r) ?? [];
  return (
    <Field label="Reports, as received">
      {reports.length === 2 && (
        <div className="compare inv-compare">
          {reports.map((r) => (
            <ReportCard key={r.id} r={r} compact />
          ))}
        </div>
      )}
      {issue.pointOfConflict && <p className="small">{issue.pointOfConflict}</p>}
      {issue.resolution && (
        <p className="small">
          <span className="inv-k">Later information</span> {issue.resolution.text} <span className="muted">({TRUST_LABEL[issue.resolution.trust].toLowerCase()}, {fmt(issue.resolution.at)})</span>
        </p>
      )}
      <p className="muted small">{issue.whatWouldHelp}</p>
      <RefLink id={issue.id} label="Open the comparison" />
    </Field>
  );
}
