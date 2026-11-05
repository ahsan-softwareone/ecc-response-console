import { useEffect } from 'react';
import { STEPS, STEP_COUNT } from '../data/scenario';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';

const AUTOPLAY_MS = 12_000;

/** Facilitator control: deliberately styled apart from operational UI. */
export function Facilitator() {
  const revealed = useStore((s) => s.revealedAt.length);
  const autoplay = useStore((s) => s.autoplay);
  const { advance, stepBack, reset, setAutoplay } = useStore.getState();

  useEffect(() => {
    if (!autoplay) return;
    const t = window.setInterval(() => useStore.getState().advance(), AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [autoplay]);

  const step = STEPS[revealed - 1];
  return (
    <div className="facil" role="group" aria-label="Scenario facilitator" data-testid="facilitator">
      <span className="tag">Facilitator</span>
      <span className="steps" aria-hidden="true">{STEPS.map((s) => <i key={s.index} className={s.index <= revealed ? 'on' : ''} />)}</span>
      <span className="title" data-testid="facil-step">Step {revealed} of {STEP_COUNT} · {step.title}</span>
      <button onClick={stepBack} disabled={revealed <= 1} title="Previous step" data-testid="facil-prev"><Icon name="chevL" size={12} /></button>
      <button onClick={advance} disabled={revealed >= STEP_COUNT} title="Reveal next step" data-testid="facil-next">Next <Icon name="chevR" size={12} /></button>
      <button onClick={() => setAutoplay(!autoplay)} className={autoplay ? 'on' : ''} disabled={revealed >= STEP_COUNT && !autoplay} title="Auto-advance every 12 s" data-testid="facil-auto"><Icon name={autoplay ? 'pause' : 'play'} size={12} /> Auto</button>
      <button onClick={() => { if (window.confirm('Reset the demo emergency? Decisions, reports and SITREP versions will be cleared.')) reset(); }} title="Reset demo" data-testid="facil-reset"><Icon name="reset" size={12} /> Reset</button>
    </div>
  );
}
