import { ArrowRight, ArrowUpRight, Check, Circle, CircleDot, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openConsequential, possibleImpact } from '../../domain/brief';
import { briefAt, briefNarrative, citedProcedure, conditionUnits, focalUnit, isSituationRailId, quietItems, unattachedResponse, type ConditionUnit, type FocalKind, type UnitKey } from '../../domain/situation';
import { useEcc } from '../../domain/store';
import { OUTCOME_LABEL, type PrepStep } from '../../domain/types';
import { useUi } from '../App';
import { Dialog } from '../components/Dialog';
import { RefLink } from '../components/RefLink';
import { SeverityTag } from '../components/Severity';
import { Feed } from '../feed/Feed';
import { fmt, plural } from '../util';

/* Status line: what work is underway, and the way to everything that left the default view ------- */

function StepGlyph({ status }: { status: PrepStep['status'] }) {
  if (status === 'done') return <Check size={12} aria-hidden="true" className="step-glyph step-done" />;
  if (status === 'attention') return <TriangleAlert size={12} aria-hidden="true" className="step-glyph step-attention" />;
  if (status === 'active') return <CircleDot size={12} aria-hidden="true" className="step-glyph step-active" />;
  return <Circle size={12} aria-hidden="true" className="step-glyph step-pending" />;
}

function StatusLine({ onOpenFeed }: { onOpenFeed: () => void }) {
  const { state } = useEcc();
  const ui = useUi();
  const unread = openConsequential(state).length;
  return (
    <div className="sit-status">
      <span className="agent-pulse" aria-hidden="true" />
      <span className="sit-status-text">{state.preparing ? 'Preparing brief' : state.agentWork}</span>
      {state.preparing && (
        <ol className="sit-prep" aria-label="Preparation steps">
          {state.prepSteps.map((p) => (
            <li key={p.label} className={`sit-prep-step prep-${p.status}`} title={p.outcome}>
              <StepGlyph status={p.status} />
              <span>{p.label}</span>
            </li>
          ))}
        </ol>
      )}
      <span className="sit-status-tools">
        <button type="button" className="link-btn" onClick={onOpenFeed}>
          View all updates
          {unread > 0 && <span className="sit-unread">{unread} unread</span>}
        </button>
        <button type="button" className="link-btn" onClick={ui.openMonitoring}>
          Monitoring
        </button>
      </span>
    </div>
  );
}

/* Freshness: changed since the reader last opened the unit reads as "updated", a reader state ------ */

function useSeen() {
  const seen = useRef<Map<UnitKey, number> | null>(null);
  const init = (units: ConditionUnit[]) => {
    if (seen.current === null) seen.current = new Map(units.map((u) => [u.key, u.changedAt]));
  };
  const changed = (u: ConditionUnit) => (seen.current?.get(u.key) ?? Infinity) < u.changedAt;
  const markSeen = (u: ConditionUnit) => seen.current?.set(u.key, u.changedAt);
  return { init, changed, markSeen };
}

function Fresh({ u, changed }: { u: ConditionUnit; changed: boolean }) {
  return (
    <span className="sit-fresh t-num">
      {changed ? 'updated ' : ''}
      {fmt(u.changedAt)}
    </span>
  );
}

function EvidenceLink({ u, onOpen }: { u: ConditionUnit; onOpen: () => void }) {
  if (u.evidence.length === 0) return <span className="sit-evid muted">No evidence cited</span>;
  return (
    <button type="button" className="sit-evid link-btn" onClick={onOpen}>
      Evidence ({u.evidence.length})
    </button>
  );
}

/* The focal unit: observed condition, cited protocol, suggested action, status, one action --------- */

const FOCAL_KICKER: Record<FocalKind | 'held', string> = { decision: 'Next decision', verification: 'Next step', condition: 'Leading open condition', alert: 'Leading condition', held: 'In focus' };

function Focal({ u, kind, changed, onOpen }: { u: ConditionUnit; kind: FocalKind | 'held'; changed: boolean; onOpen: () => void }) {
  const { state } = useEcc();
  const ui = useUi();
  const proc = u.rec ? citedProcedure(state, u.rec) : undefined;
  const responses = [...(u.act ? [{ act: u.act, dec: u.dec }] : []), ...u.linked];
  return (
    <section className="sit-focal" aria-labelledby="sit-focal-h">
      <div className="sit-focal-k">
        {FOCAL_KICKER[kind]} · {u.label}
      </div>
      <div className="sit-focal-grid">
        <div className="sit-focal-body">
          <h2 id="sit-focal-h" className="sit-focal-title">
            {u.value}
          </h2>
          <p className="sit-focal-state">{u.state}</p>
          {proc && (
            <div className="sit-line">
              <span className="sit-k">Cited procedure</span>
              <span>
                <button type="button" className="link-btn" onClick={() => ui.openSource(proc.citation.id)}>
                  {proc.label}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </button>
                {proc.citation.excerpt && <span className="sit-excerpt"> “{proc.citation.excerpt}”</span>}
              </span>
            </div>
          )}
          {u.rec && u.rec.status !== 'decided' && (
            <div className="sit-line sit-line-rec">
              <span className="sit-k">Suggested</span>
              <span className="sit-rec-title">{u.rec.title}</span>
            </div>
          )}
          {u.dec && (
            <div className="sit-line">
              <span className="sit-k">Decision</span>
              <span>
                <RefLink id={u.dec.id} label={OUTCOME_LABEL[u.dec.outcome]} /> <span className="muted">· {u.dec.recordedByRole}, </span>
                <span className="t-num muted">{fmt(u.dec.at)}</span>
              </span>
            </div>
          )}
          {responses.map(({ act }) => {
            const last = act.updates[act.updates.length - 1];
            return (
              <div className="sit-line" key={act.id}>
                <span className="sit-k">Response</span>
                <span>
                  <RefLink id={act.id} label={act.title} className="ref-plain" />
                  {last && (
                    <span className="muted">
                      {' '}
                      · {last.reportedBy}, <span className="t-num">{fmt(last.at)}</span>
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="sit-focal-aside">
          {u.alerts.map((a) => (
            <span key={a.id} className="sit-alert">
              <SeverityTag display={a.display} source={a.sourceSeverity} size="sm" /> {a.message}
            </span>
          ))}
          {u.statusShort && <span className={`sit-statusline is-${u.statusTone}`}>{u.statusShort}</span>}
          <Fresh u={u} changed={changed} />
          <button type="button" className="btn btn-primary sit-focal-btn" onClick={onOpen}>
            {u.next.label}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
          <EvidenceLink u={u} onOpen={onOpen} />
        </div>
      </div>
    </section>
  );
}

/* The other condition units: label, state, one status, urgency where configured, freshness --------- */

function UnitRow({ u, changed, onOpen }: { u: ConditionUnit; changed: boolean; onOpen: () => void }) {
  const urgent = u.alerts.some((a) => a.display === 'urgent');
  return (
    <li className={`sit-unit ${u.attention ? 'is-attention' : ''} ${urgent ? 'is-urgent' : ''}`}>
      <span className="sit-unit-mark" aria-hidden="true" />
      <div className="sit-unit-body">
        <span className="sit-unit-label">{u.label}</span>
        <div className="sit-unit-content">
          <div className="sit-unit-head">
            <button type="button" className="sit-unit-value" onClick={onOpen}>
              {u.value}
            </button>
            {u.alerts.map((a) => (
              <span key={a.id} className="sit-alert">
                <SeverityTag display={a.display} source={a.sourceSeverity} size="sm" /> {a.message}
              </span>
            ))}
          </div>
          {u.note && <p className="sit-unit-note">{u.note}</p>}
          <div className="sit-unit-meta">
            {u.status && <span className={`sit-statusline is-${u.statusTone}`}>{u.status}</span>}
            <Fresh u={u} changed={changed} />
            <EvidenceLink u={u} onOpen={onOpen} />
          </div>
        </div>
      </div>
      <button type="button" className="btn btn-sm sit-unit-btn" onClick={onOpen}>
        {u.next.label}
        <ArrowRight size={13} aria-hidden="true" />
      </button>
    </li>
  );
}

/* Main column: the focal unit held steady while a person works in it ------------------------------ */

function Conditions() {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const units = conditionUnits(state);
  const focal = focalUnit(state);
  const { init, changed, markSeen } = useSeen();
  init(units);

  const top = state.rail.stack[state.rail.stack.length - 1];
  const investigating = state.rail.open && !!top && isSituationRailId(top);
  const [focused, setFocused] = useState(false);
  const hold = investigating || focused;

  // The focal slot does not change under a person who is working in it; a newer one is offered quietly.
  const heldKey = useRef<UnitKey | undefined>(focal?.unit.key);
  if (!hold) heldKey.current = focal?.unit.key;
  const shownFocal = hold && heldKey.current ? units.find((u) => u.key === heldKey.current) : focal?.unit;
  const shownKind: FocalKind | 'held' | undefined = shownFocal && focal && shownFocal.key === focal.unit.key ? focal.kind : shownFocal ? 'held' : undefined;
  const pending = hold && focal?.unit.key !== heldKey.current;
  const rest = units.filter((u) => u.key !== shownFocal?.key);

  const [announce, setAnnounce] = useState('');
  const attention = units.filter((u) => u.attention).length;
  const lastAttention = useRef(attention);
  useEffect(() => {
    if (attention > lastAttention.current && ui.settings.announceUpdates) setAnnounce(`${plural(attention - lastAttention.current, 'condition')} now needs attention`);
    lastAttention.current = attention;
  }, [attention, ui.settings.announceUpdates]);

  const open = (u: ConditionUnit) => {
    markSeen(u);
    dispatch({ type: 'OPEN_RECORD', id: u.railId });
  };

  return (
    <div className="sit-main" onFocus={() => setFocused(true)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFocused(false)}>
      {shownFocal && shownKind ? (
        <Focal u={shownFocal} kind={shownKind} changed={top === shownFocal.railId ? false : changed(shownFocal)} onOpen={() => open(shownFocal)} />
      ) : (
        <section className="sit-focal is-empty" aria-label="Next step">
          <div className="sit-focal-k">Next step</div>
          <p className="sit-focal-state">{state.preparing ? 'Nothing is waiting for a person yet. Items appear as the brief is prepared.' : 'Nothing is waiting for a decision. The conditions below stay as assessed.'}</p>
        </section>
      )}
      {pending && (
        <p className="sit-pending">
          A different step is now waiting.{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              heldKey.current = focal?.unit.key;
              setFocused(false);
            }}
          >
            Show it
          </button>
        </p>
      )}
      <ol className="sit-units" aria-label="Conditions">
        {rest.map((u) => {
          if (top === u.railId) markSeen(u);
          return <UnitRow key={u.key} u={u} changed={changed(u)} onOpen={() => open(u)} />;
        })}
      </ol>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  );
}

/* Quiet column: response not attached to a condition, open items, possible impact ------------------ */

function Side() {
  const { state } = useEcc();
  const ui = useUi();
  const lines = unattachedResponse(state);
  const quiet = quietItems(state);
  const impact = possibleImpact(state);
  const total = state.actions.length + state.recommendations.filter((r) => r.status !== 'decided').length;
  return (
    <aside className="sit-side">
      <section className="sit-side-sec" aria-labelledby="sit-resp-h">
        <div className="sit-side-head">
          <h2 id="sit-resp-h">Response</h2>
          <button type="button" className="link-btn" onClick={() => ui.openAction(lines[0]?.id ?? state.actions[0]?.id ?? '')}>
            Open Actions{total > 0 && ` (${total})`} <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
        {lines.length === 0 ? (
          <p className="sit-side-empty">{state.actions.length === 0 ? 'No response reported yet.' : 'Every response item is shown with the condition it was decided on.'}</p>
        ) : (
          <ul className="sit-rs">
            {lines.map((r) => {
              const caution = r.response && (r.response.status === 'completion-reported' || r.response.status === 'could-not-complete');
              return (
                <li key={r.id} className="sit-r">
                  <RefLink id={r.response?.id ?? r.id} label={r.title} className="ref-plain sit-r-title" />
                  <span className={`sit-r-status ${caution ? 'is-caution' : ''}`}>
                    {r.response ? r.response.statusLabel : r.decision ? `${r.decision.outcomeLabel}, nothing to track` : 'Nothing to track'}
                    {r.response?.lastAt !== undefined && <span className="muted t-num"> · {fmt(r.response.lastAt)}</span>}
                  </span>
                  {!r.decision && <span className="muted small">No ECC decision; reported from the field</span>}
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" className="btn btn-sm" onClick={() => ui.openFieldUpdate()}>
          Record field update
        </button>
      </section>
      <section className="sit-side-sec" aria-labelledby="sit-open-h">
        <h2 id="sit-open-h">Also open</h2>
        {quiet.length === 0 ? (
          <p className="sit-side-empty">No other open questions or source limits.</p>
        ) : (
          <ul className="sit-quiet">
            {quiet.map((q) => (
              <li key={q.id} title={q.detail}>
                <RefLink id={q.ref} label={q.label} className="ref-plain" />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="sit-side-sec sit-possible" aria-labelledby="sit-poss-h">
        <h2 id="sit-poss-h">Possible, not observed</h2>
        <p>
          {impact.statement} <RefLink id={impact.ref} label="How this is assessed" />
        </p>
      </section>
    </aside>
  );
}

/* The page ----------------------------------------------------------------------------------- */

export function Situation() {
  const { state } = useEcc();
  const [feedOpen, setFeedOpen] = useState(false);
  const closeFeed = useCallback(() => setFeedOpen(false), []);

  // Opening a record from the feed drawer hands over to the detail panel; the drawer gets out of its way.
  const depth = state.rail.open ? state.rail.stack.length : 0;
  const lastDepth = useRef(depth);
  useEffect(() => {
    if (feedOpen && depth > lastDepth.current) setFeedOpen(false);
    lastDepth.current = depth;
  }, [depth, feedOpen]);

  return (
    <div className="sit">
      <StatusLine onOpenFeed={() => setFeedOpen(true)} />
      <section className="sit-brief" aria-labelledby="sit-brief-h">
        <div className="sit-kicker">
          <h2 id="sit-brief-h">Current brief</h2>
          <span className="t-num">as of {fmt(briefAt(state))}</span>
        </div>
        <p className="sit-narrative">{briefNarrative(state)}</p>
      </section>
      <div className="sit-cols">
        <Conditions />
        <Side />
      </div>
      {feedOpen && (
        <Dialog title="Incident feed" onClose={closeFeed} variant="slide" className="feed-dialog" labelledBy="feed-dialog-title">
          <Feed />
        </Dialog>
      )}
    </div>
  );
}
