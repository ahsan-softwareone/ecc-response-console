import { useEffect } from 'react';
import { STEPS, STEP_COUNT } from '../data/scenario';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { Popover } from '../ui/ui';

const AUTOPLAY_MS = 12_000;

/** Facilitator control: deliberately styled apart from operational UI. */
export function Facilitator() {
  const revealed = useStore((s) => s.revealedAt.length);
  const autoplay = useStore((s) => s.autoplay);
  const simFail = useStore((s) => s.simulateRetrievalFailure);
  const saveFail = useStore((s) => s.simulateSaveFailure);
  const training = useStore((s) => s.incidentMode === 'training');
  const hasRecord = useStore((s) => { const r = s.records[s.incidentId]; return !!r && r.status !== 'closed'; });
  const { advance, stepBack, setAutoplay, clearAllLocalData, setSimulateRetrievalFailure, setSimulateSaveFailure, simulateNotification, agentFail, setDialog } = useStore.getState();

  useEffect(() => {
    if (!autoplay || !training) return;
    const t = window.setInterval(() => useStore.getState().advance(), AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [autoplay, training]);

  const step = STEPS[revealed - 1];
  return (
    <div className="facil" role="group" aria-label="Scenario facilitator" data-testid="facilitator">
      <span className="tag">Facilitator</span>
      {training && step ? (
        <>
          <span className="steps" aria-hidden="true">{STEPS.map((s) => <i key={s.index} className={s.index <= revealed ? 'on' : ''} />)}</span>
          <span className="title" data-testid="facil-step">Step {revealed} of {STEP_COUNT} · {step.title}</span>
          <button onClick={stepBack} disabled={revealed <= 1} title="Previous step" data-testid="facil-prev"><Icon name="chevL" size={12} /></button>
          <button onClick={advance} disabled={revealed >= STEP_COUNT} title="Reveal next step" data-testid="facil-next">Next <Icon name="chevR" size={12} /></button>
          <button onClick={() => setAutoplay(!autoplay)} className={autoplay ? 'on' : ''} disabled={revealed >= STEP_COUNT && !autoplay} title="Auto-advance every 12 s" data-testid="facil-auto"><Icon name={autoplay ? 'pause' : 'play'} size={12} /> Auto</button>
        </>
      ) : <span className="title">Demonstration controls</span>}
      <Popover width={290} trigger={(open, toggle) => <button onClick={toggle} aria-expanded={open} className={simFail || saveFail ? 'on' : ''} data-testid="facil-simulate">Simulate <Icon name="chevU" size={12} /></button>}>
        {(close) => (
          <>
            <button className="item" onClick={() => { simulateNotification(); close(); }} data-testid="sim-notification">Incoming incident notification</button>
            <button className="item" disabled={!hasRecord} onClick={() => { void agentFail(); close(); }} data-testid="sim-agent-error">Agent error</button>
            <div className="sep" />
            <button className="item" aria-pressed={simFail} onClick={() => setSimulateRetrievalFailure(!simFail)} data-testid="facil-simfail">Retrieval failure<span className="sub">{simFail ? 'On' : 'Off'}</span></button>
            <button className="item" aria-pressed={saveFail} onClick={() => setSimulateSaveFailure(!saveFail)} data-testid="sim-save-fail">Local save failure<span className="sub">{saveFail ? 'On' : 'Off'}</span></button>
          </>
        )}
      </Popover>
      <button onClick={() => setDialog({ type: 'start', mode: 'training' })} title="Start the training scenario; any open incident needs an explicit choice" data-testid="facil-new">New training</button>
      <button onClick={() => { if (window.confirm('Clear ALL local data? Every incident record, upload and conversation stored in this browser will be deleted. This cannot be undone.')) void clearAllLocalData(); }} title="Delete all browser-local data" data-testid="facil-clear"><Icon name="reset" size={12} /> Clear all local data</button>
    </div>
  );
}
