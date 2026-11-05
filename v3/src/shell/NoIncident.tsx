import { LIFECYCLE_LABEL } from '../lib/agent';
import { dateTime } from '../lib/time';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';

/** Calm starting point: nothing is being monitored and the application says so. */
export function NoIncident() {
  const setDialog = useStore((s) => s.setDialog);
  const setNav = useStore((s) => s.setNav);
  const setKnowledgeView = useStore((s) => s.setKnowledgeView);
  const resumeIncident = useStore((s) => s.resumeIncident);
  const records = useStore((s) => s.records);
  const ready = useStore((s) => s.storageReady);
  const setAside = Object.values(records).filter((r) => r.status === 'left-open').sort((a, b) => b.startedAt - a.startedAt).slice(0, 3);
  return (
    <div className="noincident" data-testid="no-incident">
      <div className="ni-card">
        <h2>No active incident</h2>
        <p className="sidenote">Nothing is being monitored in this workspace. Past records stay available in Knowledge.</p>
        <div className="ni-actions">
          <button className="ni-action primary-action" disabled={!ready} onClick={() => setDialog({ type: 'start', mode: 'real' })} data-testid="start-incident"><Icon name="plus" size={16} /><span><b>Start incident</b><small>Record a real emergency. Simulated data in this prototype.</small></span></button>
          <button className="ni-action" disabled={!ready} onClick={() => setDialog({ type: 'start', mode: 'training' })} data-testid="start-training"><Icon name="play" size={16} /><span><b>Start training scenario</b><small>SG GSP drone interception, revealed progressively.</small></span></button>
          <button className="ni-action" onClick={() => { setNav('knowledge'); setKnowledgeView('incidents'); }} data-testid="browse-history"><Icon name="link" size={16} /><span><b>Browse historical incidents</b><small>Knowledge → Incidents</small></span></button>
        </div>
        {setAside.length > 0 && (
          <div className="ni-aside" data-testid="set-aside-list">
            <div className="label">Set aside, still open</div>
            {setAside.map((r) => <button key={r.id} className="item" onClick={() => void resumeIncident(r.id)} data-testid={`resume-${r.id}`}><span>{r.title}</span><span className="sub">{r.id} · {LIFECYCLE_LABEL[r.status]} · {dateTime(r.startedAt)} · resume</span></button>)}
          </div>
        )}
      </div>
    </div>
  );
}
