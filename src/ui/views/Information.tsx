import { ArrowUp, CircleHelp, Clock, Plus, Search, Split, Unlink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { incomingReports, timeline } from '../../domain/brief';
import { EXPECTED_LABEL, expectedReports } from '../../domain/content';
import { useEcc } from '../../domain/store';
import { LOG_KIND_LABEL, type Issue, type IssueType, type LogKind, type Report } from '../../domain/types';
import { useUi } from '../App';
import { Disclosure, Quote } from '../components/bits';
import { RefChips } from '../components/Chips';
import { RefLink } from '../components/RefLink';
import { Tabs, TabPanel } from '../components/Tabs';
import { TrustMark } from '../components/TrustTag';
import { useHeld } from '../components/useHeld';
import { CHANNEL_LABEL, fmt, ISSUE_STATUS_LABEL, ISSUE_TYPE_LABEL, logSource, OBSERVATION_LABEL, plural } from '../util';

/* Reports: what people said, verbatim ------------------------------------------------------ */

function ReportRow({ r }: { r: Report }) {
  const { state, dispatch } = useEcc();
  const selected = state.rail.open && state.rail.stack[state.rail.stack.length - 1] === r.id;
  const linked = r.assetIds.filter((a) => state.assets.find((x) => x.id === a)?.identified);
  return (
    <li className={`rpt ${selected ? 'is-selected' : ''}`}>
      <div className="rpt-head">
        <span className="rpt-channel">{CHANNEL_LABEL[r.channel]}</span>
        <span className="rpt-source">
          <strong>{r.sourceName}</strong> · {r.sourceRole}
        </span>
        <span className="rpt-meta t-num">
          Observed {r.observedAt === null ? 'not given' : fmt(r.observedAt)} · Received {fmt(r.receivedAt)}
        </span>
      </div>
      <Quote>{r.text}</Quote>
      <div className="rpt-foot">
        <TrustMark trust={r.trust} />
        <span className="muted small">{OBSERVATION_LABEL[r.observation]}</span>
        {r.enteredBy && <span className="muted small">Entered by {r.enteredBy}</span>}
        {r.actionId && (
          <span className="small">
            Response: <RefLink id={r.actionId} />
          </span>
        )}
        {linked.length > 0 && <RefChips ids={linked} />}
        <button type="button" className="link-btn" onClick={() => dispatch({ type: 'OPEN_RECORD', id: r.id })}>
          Open report
        </button>
      </div>
    </li>
  );
}

function Reports() {
  const { state } = useEcc();
  const ui = useUi();
  const items = useMemo(() => incomingReports(state).map((r) => ({ ...r, seq: state.reports.indexOf(r) + 1 })), [state]);
  const { shown, heldCount, showAll } = useHeld(items);
  return (
    <TabPanel id="reports">
      <div className="list-tools">
        <span className="muted small">Originals, as received. Newest first, by time received.</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => ui.openFieldUpdate()}>
          <Plus size={14} aria-hidden="true" />
          Record field update
        </button>
      </div>
      {heldCount > 0 && (
        <div className="feed-held">
          <button type="button" className="btn btn-sm btn-primary" onClick={showAll}>
            <ArrowUp size={13} aria-hidden="true" />
            {plural(heldCount, 'new report')}
          </button>
        </div>
      )}
      {shown.length === 0 ? <p className="empty">No reports received yet.</p> : <ol className="rpt-list">{shown.map((r) => <ReportRow key={r.id} r={r} />)}</ol>}
    </TabPanel>
  );
}

/* Questions and conflicts ------------------------------------------------------------------ */

const ISSUE_ICON: Record<IssueType, typeof Split> = { conflict: Split, missing: CircleHelp, stale: Clock, unavailable: Unlink };

function IssueRow({ issue }: { issue: Issue }) {
  const { state, dispatch } = useEcc();
  const Icon = ISSUE_ICON[issue.type];
  const selected = state.rail.open && state.rail.stack[state.rail.stack.length - 1] === issue.id;
  return (
    <li className={`issue issue-${issue.type} status-${issue.status} ${selected ? 'is-selected' : ''}`}>
      <span className="issue-type">
        <Icon size={14} aria-hidden="true" />
        {ISSUE_TYPE_LABEL[issue.type]}
      </span>
      <span className="issue-body">
        <span className="issue-title">{issue.title}</span>
        <span className="issue-detail">{issue.detail}</span>
        <span className="issue-why">
          <span className="fe-k">Why it matters</span> {issue.whyItMatters}
        </span>
      </span>
      <span className="issue-side">
        <span className="issue-status">{ISSUE_STATUS_LABEL[issue.status]}</span>
        <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'OPEN_RECORD', id: issue.id })}>
          {issue.type === 'conflict' ? 'Compare reports' : 'Open question'}
        </button>
      </span>
    </li>
  );
}

function Questions() {
  const { state } = useEcc();
  const open = state.issues.filter((i) => i.status !== 'answered');
  const answered = state.issues.filter((i) => i.status === 'answered');
  const expected = expectedReports(state);
  return (
    <TabPanel id="questions">
      <div className="two-col">
        <section aria-labelledby="q-open">
          <div className="section-head">
            <h3 id="q-open">Open questions {open.length > 0 && <span className="count">{open.length}</span>}</h3>
          </div>
          {open.length === 0 ? <p className="empty">{state.preparing ? 'None raised yet. The agent raises questions as it checks reports against each other.' : 'No open questions on the record. Other things may still be unknown.'}</p> : <ol className="issue-list">{open.map((i) => <IssueRow key={i.id} issue={i} />)}</ol>}
          {answered.length > 0 && (
            <Disclosure label={`Answered (${answered.length})`}>
              <ol className="issue-list">
                {answered.map((i) => (
                  <IssueRow key={i.id} issue={i} />
                ))}
              </ol>
            </Disclosure>
          )}
        </section>
        <section aria-labelledby="q-exp">
          <div className="section-head">
            <h3 id="q-exp">Expected reports</h3>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Report</th>
                <th>From</th>
                <th>By</th>
                <th>Status</th>
                <th>Linked</th>
              </tr>
            </thead>
            <tbody>
              {expected.map((e) => (
                <tr key={e.id} className={`exp-${e.status}`}>
                  <td>{e.label}</td>
                  <td>{e.from}</td>
                  <td className="t-num">{fmt(e.expectedBy)}</td>
                  <td>
                    <span className="exp-status">{EXPECTED_LABEL[e.status]}</span>
                  </td>
                  <td>{e.ref ? <RefLink id={e.ref} label={e.ref.startsWith('ISS') ? 'Open question' : undefined} /> : <span className="muted">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Expected-by times are placeholders for this training scenario. They need the customer's reporting intervals before they mean anything.</p>
        </section>
      </div>
    </TabPanel>
  );
}

/* Timeline --------------------------------------------------------------------------------- */

const KINDS: LogKind[] = ['report', 'record', 'assessment', 'recommendation', 'decision', 'response', 'agent'];

function Timeline() {
  const { state } = useEcc();
  const [kinds, setKinds] = useState<Set<LogKind>>(new Set());
  const [q, setQ] = useState('');
  const newestFirst = useMemo(() => timeline(state), [state]);
  const { shown, heldCount, showAll } = useHeld(newestFirst);
  const needle = q.trim().toLowerCase();
  const entries = shown.filter((l) => kinds.size === 0 || kinds.has(l.kind)).filter((l) => !needle || l.title.toLowerCase().includes(needle) || (l.ref ?? '').toLowerCase().includes(needle) || logSource(state, l).toLowerCase().includes(needle));
  const toggleKind = (k: LogKind) =>
    setKinds((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const filtered = kinds.size > 0 || needle !== '';
  return (
    <TabPanel id="timeline">
      <div className="list-tools">
        <div className="chip-filters" role="group" aria-label="Filter by kind">
          {KINDS.map((k) => (
            <button key={k} type="button" className={`chip ${kinds.has(k) ? 'is-on' : ''}`} aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>
              {LOG_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search the timeline</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the timeline" />
        </label>
      </div>
      <div className="list-status">
        {heldCount > 0 ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={showAll}>
            <ArrowUp size={13} aria-hidden="true" />
            {plural(heldCount, 'new entry', 'new entries')}
          </button>
        ) : (
          <span className="muted small">Newest first, by time entered on the record · {plural(entries.length, 'entry', 'entries')}</span>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="empty-block">
          <p className="empty-title">{filtered ? 'No entries match' : 'No entries yet'}</p>
          {filtered && (
            <>
              <p>Nothing on the timeline matches {needle ? `“${q}”` : 'these filters'}.</p>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setKinds(new Set());
                  setQ('');
                }}
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <ol className="timeline">
          {entries.map((l) => (
            <li key={l.seq} className={`tl-row kind-${l.kind}`}>
              <span className="tl-time t-num">
                {l.eventAt !== undefined && l.eventAt !== l.at ? (
                  <>
                    <span>Observed {fmt(l.eventAt)}</span>
                    <span className="tl-time-sub">Received {fmt(l.at)}</span>
                  </>
                ) : (
                  <span>{fmt(l.at)}</span>
                )}
              </span>
              <span className="tl-kind">{LOG_KIND_LABEL[l.kind]}</span>
              <span className="tl-body">
                {l.ref ? <RefLink id={l.ref} label={l.title} className="ref-plain" /> : <span>{l.title}</span>}
                <span className="tl-source">{logSource(state, l)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </TabPanel>
  );
}

export function Information() {
  const { state } = useEcc();
  const ui = useUi();
  const tab = ui.ws.information.tab;
  const openCount = state.issues.filter((i) => i.status !== 'answered').length;
  return (
    <div className="page">
      <Tabs
        tabs={[
          { id: 'reports', label: 'Incoming reports', count: state.reports.length },
          { id: 'questions', label: 'Questions & conflicts', count: openCount },
          { id: 'timeline', label: 'Timeline' },
        ]}
        active={tab}
        onChange={(t) => ui.setWs({ information: { tab: t } })}
        label="Information"
      />
      {tab === 'reports' && <Reports />}
      {tab === 'questions' && <Questions />}
      {tab === 'timeline' && <Timeline />}
    </div>
  );
}
