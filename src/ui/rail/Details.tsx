import { ArrowUpRight } from 'lucide-react';
import { assetConnections, assetLinks, execForFeed, linkedConcern } from '../../domain/brief';
import { ROW_REASONING, resolveRecord } from '../../domain/content';
import { useEcc } from '../../domain/store';
import { CONNECTION_LABEL, EXEC_LABEL, OUTCOME_LABEL, RELATION_LABEL, TRUST_LABEL, type Asset, type AssessmentRow, type Decision, type FeedEntry, type Issue, type Recommendation, type Report, type ResponseAction } from '../../domain/types';
import { useUi } from '../App';
import { ActionStatusTag } from '../components/ActionStatus';
import { Field, Quote } from '../components/bits';
import { RefChips } from '../components/Chips';
import { RefLink, RefList } from '../components/RefLink';
import { TrustMark, TrustTag } from '../components/TrustTag';
import { DecisionForm } from '../forms/DecisionForm';
import { VerifyForm } from '../forms/VerifyForm';
import { FeedEntryCard } from '../feed/FeedEntry';
import { SourceViewer } from '../viewer/SourceViewer';
import { durationLabel, fmt, ISSUE_STATUS_LABEL, ISSUE_TYPE_LABEL } from '../util';

export function Details({ id }: { id: string }) {
  const { state } = useEcc();
  const r = resolveRecord(state, id);
  if (!r) return null;
  switch (r.kind) {
    // Originals of every kind open in the one viewer.
    case 'report':
    case 'document':
    case 'citation':
    case 'kdoc':
    case 'monitor':
      return <SourceViewer id={id} mode="panel" />;
    case 'issue':
      return <IssueDetails i={r} />;
    case 'asset':
      return <AssetDetail a={r} inRail />;
    case 'assessment':
      return <RowDetails row={r} />;
    case 'recommendation':
      return <RecommendationDetails rec={r} />;
    case 'decision':
      return <DecisionDetails dec={r} />;
    case 'action':
      return <ActionDetails act={r} />;
    case 'feed':
      return <FeedDetails e={r} />;
  }
}

export function ReportCard({ r, compact = false }: { r: Report; compact?: boolean }) {
  return (
    <div className={`report-card ${compact ? 'is-compact' : ''}`}>
      <div className="report-card-head">{r.observation === 'direct' ? 'Seen on scene' : 'Instrument reading'}</div>
      <div className="report-card-source">
        <strong>{r.sourceName}</strong>
        <br />
        {r.sourceRole}
      </div>
      <div className="report-card-meta">
        <TrustMark trust={r.trust} />
        <span className="t-num">
          Observed {r.observedAt === null ? 'time not given' : fmt(r.observedAt)} · Received {fmt(r.receivedAt)}
        </span>
      </div>
      <Quote>{r.text}</Quote>
    </div>
  );
}

function IssueDetails({ i }: { i: Issue }) {
  const { state } = useEcc();
  const reports = i.reportIds?.map((id) => state.reports.find((r) => r.id === id)).filter((r): r is Report => !!r) ?? [];
  return (
    <div className="detail">
      <div className="detail-kicker">
        {i.type === 'conflict' ? 'Conflicting reports' : i.type === 'missing' ? 'Open question' : ISSUE_TYPE_LABEL[i.type]} · {ISSUE_STATUS_LABEL[i.status]} · raised {fmt(i.raisedAt)} <span className="detail-id">{i.id}</span>
      </div>
      <h3 className="detail-title">{i.title}</h3>
      {i.type === 'conflict' && i.pointOfConflict && (
        <Field label="Point of conflict">
          <p className="emphasis">{i.pointOfConflict}</p>
        </Field>
      )}
      {reports.length === 2 && (
        <Field label="The two reports, as received">
          <div className="compare">
            {reports.map((r) => (
              <ReportCard key={r.id} r={r} compact />
            ))}
          </div>
        </Field>
      )}
      <Field label="Detail">{i.detail}</Field>
      <Field label="Why it matters">{i.whyItMatters}</Field>
      <Field label="What would help">{i.whatWouldHelp}</Field>
      {i.resolution && (
        <Field label={i.type === 'conflict' ? 'Later information' : 'Answer on the record'} className="resolution">
          <div className="detail-tags">
            <TrustTag trust={i.resolution.trust} />
            <span className="muted">{fmt(i.resolution.at)}</span>
          </div>
          <p>{i.resolution.text}</p>
          <RefChips ids={i.resolution.refs} />
          {i.type === 'conflict' && <p className="muted small">This is {TRUST_LABEL[i.resolution.trust].toLowerCase()}, not a resolution of the record. Both original reports stay as received above.</p>}
        </Field>
      )}
      <Field label="Linked">
        <RefChips ids={i.refs} />
      </Field>
    </div>
  );
}

/** Equipment or area. Used in the Assets & Areas workspace and, in shorter form, in the panel. */
export function AssetDetail({ a, inRail = false }: { a: Asset; inRail?: boolean }) {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const links = assetLinks(state, a.id);
  const cons = assetConnections(state, a.id);
  const other = (c: { from: string; to: string }) => (c.from === a.id ? c.to : c.from);
  const verified = a.condition.trust === 'verified' || a.relation === 'verified-involved';
  return (
    <div className={`detail asset-detail ${inRail ? '' : 'is-full'}`}>
      <div className="detail-kicker">
        {a.assetType === 'area' ? 'Area' : 'Equipment'} · {a.area}
      </div>
      <h3 className="detail-title">
        {a.tag} <span className="detail-title-sub">{a.name}</span>
      </h3>
      <div className="detail-tags">
        <span className={`relation relation-${a.relation}`}>{RELATION_LABEL[a.relation]}</span>
        {inRail && (
          <button type="button" className="link-btn" onClick={() => ui.openAsset(a.id)}>
            Open in Assets &amp; Areas <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      <Field label="Why it is listed">{a.whyIncluded}</Field>
      <div className="condition-block">
        <div className="condition-head">
          <span className="field-label">Current reported condition</span>
          <TrustTag trust={a.condition.trust} size="sm" />
          <span className="muted t-num">{fmt(a.condition.at)}</span>
        </div>
        <p className="condition-text">{a.condition.statement}</p>
        <RefChips ids={a.condition.refs} emptyNote="No report describes it." />
        {a.conditionHistory.length > 0 && (
          <ul className="history">
            {a.conditionHistory
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  <span className="mono muted">{fmt(h.at)}</span> <TrustTag trust={h.trust} size="sm" /> <span>{h.statement}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
      <Field label="Verification and uncertainty">
        {verified ? 'Involvement verified: an instrument reading and a direct observation agree on the pump state. Verification says how far the statement can be relied on, not that the condition is acceptable.' : a.condition.trust === 'reported' ? 'Reported by a person or instrument, not verified by a second source.' : a.condition.trust === 'conflict' ? 'Reports disagree. Neither is verified.' : a.condition.trust === 'confirmed-absent' ? 'Someone checked and found nothing. Reported, not independently verified.' : 'Nothing reported about this item. Absence of a report is not evidence of its condition.'}
      </Field>
      {a.possibleConsequence && (
        <div className="possible">
          <div className="possible-title">Possible consequence · not a current condition</div>
          <p>{a.possibleConsequence}</p>
        </div>
      )}
      <Field label="Connections">
        {cons.length === 0 ? (
          <span className="muted">None between items identified so far.</span>
        ) : (
          <ul className="conn-list">
            {cons.map((c) => (
              <li key={c.id} className={`conn conn-${c.connectionKind}`}>
                <span className="conn-kind">{CONNECTION_LABEL[c.connectionKind]}</span>
                <span className="conn-body">
                  <RefLink id={other(c)} className="ref-plain" /> · {c.label}
                </span>
                <span className="conn-prov">
                  <RefChips ids={c.provenance} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {cons.length > 0 && <p className="muted small">A connection shows how items relate on record. It does not establish that this item is affected now.</p>}
      </Field>
      {!inRail && (
        <>
          <Field label="Procedures and documents">
            {links.documents.length === 0 ? (
              <span className="muted">None in the library name this item.</span>
            ) : (
              <ul className="link-list">
                {links.documents.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="link-btn" onClick={() => ui.openKnowledge(d.id)}>
                      {d.docNumber}: {d.title}
                    </button>
                    <span className="muted small"> {d.docType} · {d.revisions.find((r) => r.approval === 'effective')?.rev ?? d.revisions[0]?.rev}</span>
                  </li>
                ))}
              </ul>
            )}
          </Field>
          <Field label="Findings mentioning it">{links.feed.length ? <RefChips ids={links.feed.map((e) => e.id)} /> : <span className="muted">None</span>}</Field>
          <Field label="Open questions">{links.issues.filter((i) => i.status !== 'answered').length ? <RefChips ids={links.issues.filter((i) => i.status !== 'answered').map((i) => i.id)} /> : <span className="muted">None open</span>}</Field>
          <Field label="Recommendations">{links.recommendations.length ? <RefChips ids={links.recommendations.map((r) => r.id)} /> : <span className="muted">None</span>}</Field>
          <Field label="Response reported">
            {links.actions.length ? (
              <ul className="link-list">
                {links.actions.map((x) => (
                  <li key={x.id}>
                    <RefLink id={x.id} className="ref-plain" /> <ActionStatusTag status={x.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted">None</span>
            )}
          </Field>
          <Field label="Assessment lines that use it">{links.rows.length ? <RefChips ids={links.rows.map((r) => r.id)} /> : <span className="muted">None</span>}</Field>
        </>
      )}
      {inRail && (
        <Field label="Findings mentioning it">
          {links.feed.length ? (
            <ul className="link-list">
              {links.feed.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <button type="button" className="link-btn" onClick={() => dispatch({ type: 'OPEN_RECORD', id: e.id })}>
                    {e.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted">None</span>
          )}
        </Field>
      )}
    </div>
  );
}

function RowDetails({ row }: { row: AssessmentRow }) {
  return (
    <div className="detail">
      <div className="detail-kicker">Assessment line</div>
      <h3 className="detail-title">{row.label}</h3>
      <div className="detail-tags">
        <TrustTag trust={row.trust} />
        <span className="muted">as of {fmt(row.at)}</span>
      </div>
      <p className="emphasis">{row.statement}</p>
      <Field label="How this line is reached">{ROW_REASONING[row.id] ?? 'Not described.'}</Field>
      <Field label="Linked evidence">
        <RefChips ids={row.refs} emptyNote="No linked evidence." />
      </Field>
      <Field label="Revision history">
        {row.history.length === 0 ? (
          <span className="muted">Not revised since the initial report</span>
        ) : (
          <ul className="history">
            {row.history
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  <div>
                    <span className="mono muted">{fmt(h.at)}</span> <TrustTag trust={h.trust} size="sm" />
                  </div>
                  <div>{h.statement}</div>
                  {h.refs.length > 0 && <RefList ids={h.refs} label="" />}
                </li>
              ))}
          </ul>
        )}
      </Field>
    </div>
  );
}

const REC_STATUS: Record<Recommendation['status'], string> = { 'awaiting-review': 'Awaiting review', deferred: 'Deferred, still on the review list', decided: 'Decided' };

export function RecommendationDetails({ rec, withForm = true }: { rec: Recommendation; withForm?: boolean }) {
  const { state } = useEcc();
  const dec = rec.decisionId ? state.decisions.find((d) => d.id === rec.decisionId) : undefined;
  return (
    <div className="detail">
      <div className="detail-kicker">
        Recommendation · surfaced {fmt(rec.surfacedAt)} · {REC_STATUS[rec.status]} <span className="detail-id">{rec.id}</span>
      </div>
      <h3 className="detail-title">{rec.title}</h3>
      <div className="detail-tags">
        <TrustTag trust="assessment" />
        <span className="muted">A suggestion for a person to consider. Not an instruction.</span>
      </div>
      <Field label="Why it was surfaced">{rec.why}</Field>
      <Field label="Uncertainty">{rec.uncertainty}</Field>
      <Field label="Supporting evidence">
        <RefChips ids={rec.evidence} />
      </Field>
      {rec.procedureRef && (
        <Field label="Procedure reference (placeholder)">
          <RefChips ids={[rec.procedureRef]} />
          <p className="muted small">A retrieved procedure is not automatically applicable to this incident.</p>
        </Field>
      )}
      <Field label="Updates since surfaced">
        {rec.updates.length === 0 ? (
          <span className="muted">None. The text above is as first surfaced.</span>
        ) : (
          <ul className="history">
            {rec.updates.map((u, i) => (
              <li key={i}>
                <span className="mono muted">{fmt(u.at)}</span> <span>{u.text}</span> <RefList ids={u.refs} label="" />
              </li>
            ))}
          </ul>
        )}
      </Field>
      {dec && (
        <Field label="Decision recorded">
          <RefLink id={dec.id} label={`${OUTCOME_LABEL[dec.outcome]} · ${dec.recordedBy} · ${fmt(dec.at)}`} />
        </Field>
      )}
      {withForm && rec.status !== 'decided' && <DecisionForm rec={rec} />}
    </div>
  );
}

export function DecisionDetails({ dec }: { dec: Decision }) {
  const { state } = useEcc();
  const revised = state.rows.filter((r) => r.history.length > 0 && r.at > dec.at && dec.basis.lines.some((l) => l.label === r.label));
  const act = dec.actionId ? state.actions.find((a) => a.id === dec.actionId) : undefined;
  return (
    <div className="detail">
      <div className="detail-kicker">
        Decision · recorded {fmt(dec.at)} <span className="detail-id">{dec.id}</span>
      </div>
      <h3 className="detail-title">
        {OUTCOME_LABEL[dec.outcome]} <span className="detail-title-sub">{state.recommendations.find((r) => r.id === dec.recommendationId)?.shortTitle}</span>
      </h3>
      <div className="field-grid">
        <Field label="Recorded by">
          <div>
            {dec.recordedBy}
            <div className="muted">{dec.recordedByRole}</div>
          </div>
        </Field>
        <Field label="On recommendation">
          <RefLink id={dec.recommendationId} />
        </Field>
      </div>
      <Field label="Rationale">{dec.rationale ? <Quote>{dec.rationale}</Quote> : <span className="muted">None given</span>}</Field>
      <Field label={`What the assessment said at ${fmt(dec.basis.asOf)}`} className="basis">
        <ul className="basis-lines">
          {dec.basis.lines.map((l) => (
            <li key={l.label}>
              <div className="basis-label">{l.label}</div>
              <div>{l.statement}</div>
              <TrustTag trust={l.trust} size="sm" />
            </li>
          ))}
        </ul>
        {revised.length > 0 && (
          <p className="basis-revised">
            The assessment has been revised since. This record stays as written. <RefList ids={revised.map((r) => r.id)} label="Current:" />
          </p>
        )}
      </Field>
      <Field label="Response item">
        {act ? (
          <>
            <ActionStatusTag status={act.status} /> <RefLink id={act.id} />
          </>
        ) : (
          <span className="muted">{dec.outcome === 'defer' ? 'None while deferred' : 'None: the decision was not to proceed'}</span>
        )}
      </Field>
      <p className="muted small">This records a decision only. Nothing was sent to the field, and no equipment was operated.</p>
    </div>
  );
}

export function ActionDetails({ act }: { act: ResponseAction }) {
  const { state } = useEcc();
  const ui = useUi();
  const dec = act.decisionId ? state.decisions.find((d) => d.id === act.decisionId) : undefined;
  return (
    <div className="detail">
      <div className="detail-kicker">
        Response item <span className="detail-id">{act.id}</span>
      </div>
      <h3 className="detail-title">{act.title}</h3>
      <div className="detail-tags">
        <ActionStatusTag status={act.status} />
      </div>
      <Field label="From decision">{dec ? <RefLink id={dec.id} label={`${OUTCOME_LABEL[dec.outcome]} · ${dec.recordedBy} · ${fmt(dec.at)}`} /> : <span className="muted">No decision recorded in ECC. This was reported to the record by the people doing it.</span>}</Field>
      {act.verification && (
        <Field label="Verification" className="verified-block">
          <TrustTag trust="verified" /> by {act.verification.by} at {fmt(act.verification.at)}
          <Quote>{act.verification.basis}</Quote>
        </Field>
      )}
      <Field label="Reported updates">
        {act.updates.length === 0 ? (
          <span className="muted">Nobody has reported on this yet.</span>
        ) : (
          <ul className="history">
            {act.updates
              .slice()
              .reverse()
              .map((u, i) => (
                <li key={i}>
                  <div>
                    <span className="mono muted">{fmt(u.at)}</span> <ActionStatusTag status={u.status} />
                  </div>
                  <div className="muted small">Reported by {u.reportedBy}</div>
                  <div>{u.text}</div>
                  <RefLink id={u.reportId} />
                </li>
              ))}
          </ul>
        )}
      </Field>
      <div className="detail-actions">
        {act.status !== 'completion-verified' && (
          <button type="button" className="btn btn-sm" onClick={() => ui.openFieldUpdate(act.id)}>
            Record field update
          </button>
        )}
      </div>
      {act.status === 'completion-reported' && <VerifyForm act={act} />}
      {act.status === 'completion-reported' && <p className="muted small">Completion has been reported by someone in the field. It stays pending until a person records verification here.</p>}
    </div>
  );
}

function FeedDetails({ e }: { e: FeedEntry }) {
  const { state } = useEcc();
  const ui = useUi();
  const recs = execForFeed(state, e.id);
  const concern = linkedConcern(state, e);
  return (
    <div className="detail">
      <div className="detail-kicker">
        Feed entry <span className="detail-id">{e.id}</span>
      </div>
      <FeedEntryCard e={e} defaultOpen />
      {concern && (
        <Field label="Attention item">
          <RefLink id={concern.action.ref} label={concern.title} />
          {concern.status && <span className="muted"> · {concern.status}</span>}
        </Field>
      )}
      <Field label="How this was produced">
        {state.prototypeRole === 'Observer' ? (
          <span className="muted">Execution records are hidden for the Observer prototype role.</span>
        ) : recs.length === 0 ? (
          <span className="muted">No execution record is linked. Entries recorded by a person have none.</span>
        ) : (
          <>
            <ul className="exec-mini">
              {recs.map((r) => (
                <li key={r.id} className={r.status === 'failed' ? 'is-failed' : ''}>
                  <span className="mono muted">{fmt(r.at)}</span>
                  <span className="exec-type">{EXEC_LABEL[r.execType]}</span>
                  <span>{r.label}</span>
                  <span className="muted small">
                    {r.status === 'failed' ? 'Failed' : 'OK'}
                    {r.durationMs !== undefined && ` · ${durationLabel(r.durationMs)}`}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="link-btn" onClick={() => ui.openActivity(e.activity)}>
              Open in Agent activity <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </>
        )}
      </Field>
    </div>
  );
}
