import { Activity, BookOpen, Boxes, ClipboardList, FileText, Info, ListChecks, PanelLeftClose, PanelLeftOpen, Radar, Settings, Shield, UserRound, X } from 'lucide-react';
import { actionGroups, openConsequential } from '../../domain/brief';
import { useEcc } from '../../domain/store';
import type { ViewId } from '../../domain/types';
import { useUi } from '../App';
import wordmark from '../assets/ecc-wordmark.png';
import mark from '../assets/ecc-mark.png';

interface Item {
  id: ViewId;
  label: string;
  icon: typeof Radar;
  cue?: number;
  cueLabel?: string;
}

/**
 * Compact left navigation. The incident group is what responders use; the platform group is
 * shared reference and administration. The logo sits on its own exact-navy surface.
 */
export function Sidebar({ drawerOpen, onCloseDrawer }: { drawerOpen: boolean; onCloseDrawer: () => void }) {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const groups = actionGroups(state);
  const waiting = groups.needsDecision.length + groups.completionReported.length;
  const unreviewed = openConsequential(state).length;

  const incident: Item[] = [
    { id: 'situation', label: 'Situation', icon: Radar, cue: unreviewed, cueLabel: `${unreviewed} important updates unread` },
    { id: 'assets', label: 'Assets & Areas', icon: Boxes },
    { id: 'information', label: 'Information', icon: Info },
    { id: 'actions', label: 'Actions', icon: ListChecks, cue: waiting, cueLabel: `${waiting} waiting for a person` },
    { id: 'reports', label: 'SITREPs', icon: FileText },
    { id: 'activity', label: 'Agent activity', icon: Activity },
  ];
  const platform: Item[] = [
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
    { id: 'admin', label: 'Administration', icon: Shield },
  ];

  const render = (it: Item) => {
    const Icon = it.icon;
    const active = state.view === it.id;
    return (
      <li key={it.id}>
        <button type="button" className={`nav-item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} aria-label={it.cue ? `${it.label}, ${it.cueLabel}` : it.label} onClick={() => {
            dispatch({ type: 'NAVIGATE', view: it.id });
            onCloseDrawer();
          }} title={it.label}>
          <Icon size={17} aria-hidden="true" className="nav-icon" />
          <span className="nav-label">{it.label}</span>
          {it.cue ? (
            <span className="nav-cue" aria-hidden="true">
              {it.cue}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  const collapsed = ui.settings.sidebar === 'collapsed';

  return (
    <>
      <div className={`nav-scrim ${drawerOpen ? 'is-open' : ''}`} onClick={onCloseDrawer} aria-hidden="true" />
      <aside className={`sidebar ${drawerOpen ? 'is-drawer-open' : ''}`} aria-label="Navigation">
        <div className="brand">
          <img className="brand-wordmark" src={wordmark} alt="ECC" width={118} />
          <img className="brand-mark" src={mark} alt="ECC" width={38} />
          <button type="button" className="btn btn-icon btn-on-dark nav-drawer-close" onClick={onCloseDrawer} aria-label="Close navigation">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <div className="nav-group-title">Incident</div>
            <ul>{incident.map(render)}</ul>
          </div>
          <div className="nav-group">
            <div className="nav-group-title">Platform</div>
            <ul>{platform.map(render)}</ul>
          </div>
        </nav>
        <div className="nav-foot">
          <ul>
            <li>
              <button type="button" className={`nav-item ${state.view === 'settings' ? 'is-active' : ''}`} aria-current={state.view === 'settings' ? 'page' : undefined} aria-label="Settings" onClick={() => dispatch({ type: 'NAVIGATE', view: 'settings' })} title="Settings">
                <Settings size={17} aria-hidden="true" className="nav-icon" />
                <span className="nav-label">Settings</span>
              </button>
            </li>
            <li>
              <button type="button" className="nav-item" onClick={ui.openProfile} title="User profile" aria-label={`User profile. Prototype role: ${state.prototypeRole}`}>
                <UserRound size={17} aria-hidden="true" className="nav-icon" />
                <span className="nav-label">
                  User profile
                  <span className="nav-sub">Prototype role: {state.prototypeRole}</span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="nav-item nav-training" onClick={ui.openTraining} title="Training controls" aria-label={`Training controls. ${state.sim.running ? 'Simulation running' : 'Simulation paused'}`}>
                <ClipboardList size={17} aria-hidden="true" className="nav-icon" />
                <span className="nav-label">
                  Training controls
                  <span className="nav-sub">{state.sim.running ? 'Simulation running' : 'Simulation paused'}</span>
                </span>
              </button>
            </li>
          </ul>
          <button type="button" className="nav-collapse" onClick={() => ui.updateSettings({ sidebar: collapsed ? 'expanded' : 'collapsed' })} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        </div>
      </aside>
    </>
  );
}
