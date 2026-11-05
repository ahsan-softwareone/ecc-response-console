import { Menu, MessageCircleQuestion, SlidersHorizontal } from 'lucide-react';
import { agentHeadline, briefHealth } from '../../domain/brief';
import { INCIDENT } from '../../domain/scenario';
import { useEcc } from '../../domain/store';
import { useUi } from '../App';
import { elapsedLabel, fmt } from '../util';

/** One slim band: which incident, how far along, how fresh the brief is, and where help is. */
export function IncidentHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const health = briefHealth(state);
  const assistantOpen = state.rail.open && state.rail.tab === 'assistant';
  const activeStep = state.prepSteps.find((p) => p.status === 'active');
  const main = state.preparing ? 'Preparing brief' : `Updated ${fmt(health.updatedAt)}`;
  const sub = state.preparing ? activeStep?.label ?? '' : health.label;
  return (
    <header className="inc-header">
      <button type="button" className="btn btn-icon nav-drawer-btn" onClick={onOpenNav} aria-label="Open navigation">
        <Menu size={18} aria-hidden="true" />
      </button>
      <div className="inc-id-block">
        <h1 className="inc-title">{INCIDENT.shortTitle}</h1>
        <span className="inc-where">
          <span className="mono">{INCIDENT.id}</span> · {INCIDENT.area} · {INCIDENT.facility}
        </span>
      </div>
      <dl className="inc-stats">
        <div>
          <dt>Elapsed</dt>
          <dd className="t-num">{elapsedLabel(state.now, INCIDENT.firstAlarmAt)}</dd>
        </div>
        <div>
          <dt>Clock</dt>
          <dd className="t-num">{fmt(state.now)}</dd>
        </div>
        <div>
          <dt>Brief</dt>
          <dd>
            <button type="button" className={`health health-${health.state}`} onClick={() => dispatch({ type: 'NAVIGATE', view: 'activity' })} aria-label={`${agentHeadline(state)}. ${health.label}. Open agent activity`}>
              <span className="health-dot" aria-hidden="true" />
              <span className="health-main">{main}</span>
              {sub && <span className="health-sub">· {sub}</span>}
            </button>
          </dd>
        </div>
      </dl>
      <div className="inc-tools">
        <button type="button" className="training-pill" onClick={ui.openTraining} aria-label="Training scenario with fictional data. Open training controls">
          <span className="training-dot" aria-hidden="true" />
          <span className="training-text">Training · Fictional data</span>
          <span className="training-short">Training</span>
          <SlidersHorizontal size={13} aria-hidden="true" />
        </button>
        <button type="button" className={`btn assistant-btn ${assistantOpen ? 'is-open' : ''}`} aria-pressed={assistantOpen} onClick={() => (assistantOpen ? dispatch({ type: 'RAIL_CLOSE' }) : dispatch({ type: 'RAIL_TAB', tab: 'assistant' }))}>
          <MessageCircleQuestion size={16} aria-hidden="true" />
          <span>Assistant</span>
        </button>
      </div>
    </header>
  );
}
