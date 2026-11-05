import { FastForward, Pause, Play, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { isScenarioFinished } from '../../domain/brief';
import { INCIDENT, SCRIPT } from '../../domain/scenario';
import { useEcc } from '../../domain/store';
import { useUi } from '../App';
import { Dialog } from '../components/Dialog';
import { fmt } from '../util';

/**
 * Facilitator controls for the training simulation. Pausing here stops scripted events from
 * arriving. It is a different thing from pausing the feed, which only holds entries on screen.
 */
export function TrainingControls({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const [confirmReset, setConfirmReset] = useState(false);
  const next = SCRIPT[state.scriptIndex];
  const finished = isScenarioFinished(state);
  const upcoming = SCRIPT.slice(state.scriptIndex);

  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  const firstRec = state.recommendations.find((r) => r.status === 'awaiting-review' || r.status === 'deferred') ?? state.recommendations[state.recommendations.length - 1];
  const lastDecision = state.decisions[state.decisions.length - 1];

  const steps: { title: string; text: string; verb: string; run: () => void }[] = [
    { title: 'Notification and preparation', text: 'Watch the brief form as the agent identifies equipment and retrieves records. "View all updates" opens the full feed.', verb: 'Open Situation', run: () => dispatch({ type: 'NAVIGATE', view: 'situation' }) },
    { title: 'Prepared brief', text: 'The brief, the next decision in focus, and the four conditions each with its linked response.', verb: state.preparing ? 'Skip preparation, open Situation' : 'Open Situation', run: () => { if (state.preparing) dispatch({ type: 'SIM_SKIP_PREP' }); dispatch({ type: 'NAVIGATE', view: 'situation' }); } },
    { title: 'Evidence behind an item', text: 'Open an attention item and its cited procedure: the original document opens at the cited page with the passage highlighted.', verb: 'Open Situation', run: () => dispatch({ type: 'NAVIGATE', view: 'situation' }) },
    { title: 'Monitoring', text: 'Readings, active alerts and source health, each kept separate.', verb: 'Open monitoring', run: () => ui.openMonitoring() },
    { title: 'Equipment and drawings', text: 'The real P&ID and plot plan sheets with selectable equipment, and the dependency view.', verb: 'Open Assets & Areas', run: () => dispatch({ type: 'NAVIGATE', view: 'assets' }) },
    { title: 'Recommendation review', text: 'The suggestion, why it was surfaced, and the decision form.', verb: 'Open recommendation', run: () => { if (firstRec) ui.openAction(firstRec.id); else dispatch({ type: 'NAVIGATE', view: 'actions' }); } },
    { title: 'Recorded decision', text: 'The decision as written, with the assessment it rested on.', verb: lastDecision ? 'Open decision' : 'Open Actions', run: () => { if (lastDecision) ui.openAction(lastDecision.recommendationId); else dispatch({ type: 'NAVIGATE', view: 'actions' }); } },
    { title: 'Field update', text: 'Record what someone reported from the field.', verb: 'Record field update', run: () => ui.openFieldUpdate() },
    { title: 'Revised assessment', text: 'Step to the fire team report and see what changed, what was superseded and what stayed as written.', verb: finished ? 'Open Situation' : 'Step and open Situation', run: () => { if (!finished) dispatch({ type: 'SIM_STEP' }); dispatch({ type: 'NAVIGATE', view: 'situation' }); } },
    { title: 'Procedure revision', text: 'ERP-T-07 Rev D becomes effective; earlier citations keep Rev C.', verb: 'Open Knowledge', run: () => ui.openKnowledge('KD-ERP07') },
    { title: 'Agent activity', text: 'Each task, its outcome or blocker, then steps and execution records on demand.', verb: 'Open Agent activity', run: () => dispatch({ type: 'NAVIGATE', view: 'activity' }) },
    { title: 'Situation report', text: 'Draft, edit, refresh and mark reviewed.', verb: 'Open SITREPs', run: () => dispatch({ type: 'NAVIGATE', view: 'reports' }) },
  ];

  return (
    <Dialog title="Training controls" onClose={onClose} variant="slide" className="training-dialog" labelledBy="training-title">
      <div className="training-scenario">
        <div className="training-k">Scenario</div>
        <div className="training-v">{INCIDENT.scenarioName}</div>
        <div className="training-note">Fictional data. Names, tags, records and procedure references are invented.</div>
      </div>

      <section className="training-section" aria-labelledby="t-sim">
        <h3 id="t-sim">Simulation</h3>
        <div className="sim-state">
          <span className={`sim-dot ${state.sim.running ? 'is-running' : ''}`} aria-hidden="true" />
          <span>
            {finished ? 'Finished. Every scripted event has been applied.' : state.sim.running ? 'Running: events arrive on a timer.' : 'Paused: no events arrive until resumed.'}
            <span className="muted small"> Clock {fmt(state.now)}</span>
          </span>
        </div>
        {!finished && (
          <div className="sim-next">
            <span className="muted small">Next event</span>
            <span>
              <span className="mono">{fmt(next.at)}</span> {next.label}
            </span>
          </div>
        )}
        <div className="form-actions sim-actions">
          {!finished && (
            <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'SIM_SET_RUNNING', running: !state.sim.running })}>
              {state.sim.running ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
              {state.sim.running ? 'Pause simulation' : state.scriptIndex === 0 ? 'Start simulation' : 'Resume simulation'}
            </button>
          )}
          {!finished && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'SIM_STEP' })}>
              <SkipForward size={14} aria-hidden="true" />
              Step to next event
            </button>
          )}
          {state.preparing && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'SIM_SKIP_PREP' })}>
              <FastForward size={14} aria-hidden="true" />
              Skip preparation
            </button>
          )}
        </div>
        <p className="muted small">Pausing the simulation stops scripted events. It is separate from "Pause following" on the feed, which only holds entries on screen.</p>
      </section>

      <section className="training-section" aria-labelledby="t-up">
        <h3 id="t-up">Upcoming events</h3>
        {upcoming.length === 0 ? (
          <p className="muted small">None left.</p>
        ) : (
          <ol className="training-list">
            {upcoming.map((e) => (
              <li key={e.id}>
                <span className="mono">{fmt(e.at)}</span> {e.label}
                {e.isPrep && <span className="muted small"> · preparation</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="training-section" aria-labelledby="t-walk">
        <h3 id="t-walk">Suggested walkthrough</h3>
        <ol className="walkthrough">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="walk-n">{i + 1}</span>
              <span className="walk-body">
                <span className="walk-title">{s.title}</span>
                <span className="walk-text">{s.text}</span>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => go(s.run)}>
                {s.verb}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="training-section" aria-labelledby="t-log">
        <h3 id="t-log">Facilitator log</h3>
        <p className="muted small">Not part of the incident record.</p>
        {state.trainingLog.length === 0 ? (
          <p className="muted small">None yet.</p>
        ) : (
          <ol className="training-list">
            {state.trainingLog.map((t, i) => (
              <li key={i}>
                <span className="mono">{fmt(t.at)}</span> {t.text}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="training-section" aria-labelledby="t-reset">
        <h3 id="t-reset">Reset</h3>
        {confirmReset ? (
          <div className="reset-confirm" role="group" aria-label="Confirm reset">
            <p>This clears every decision, update, draft and question asked, and returns to the first notification. Personal settings are kept.</p>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  dispatch({ type: 'RESET' });
                  setConfirmReset(false);
                  onClose();
                }}
              >
                Reset now
              </button>
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                Keep going
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmReset(true)}>
            Reset scenario
          </button>
        )}
      </section>
    </Dialog>
  );
}
