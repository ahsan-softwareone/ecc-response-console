import { useId, useState } from 'react';
import { RECORDERS } from '../../domain/scenario';
import { useEcc } from '../../domain/store';
import { OUTCOME_LABEL, type DecisionOutcome, type Recommendation } from '../../domain/types';

const OUTCOMES: DecisionOutcome[] = ['proceed', 'proceed-with-changes', 'do-not-proceed', 'defer'];

export function DecisionForm({ rec }: { rec: Recommendation }) {
  const { dispatch } = useEcc();
  const [outcome, setOutcome] = useState<DecisionOutcome | ''>('');
  const [byId, setById] = useState(RECORDERS[0].id);
  const [rationale, setRationale] = useState('');
  const [tried, setTried] = useState(false);
  const id = useId();

  const needsRationale = outcome === 'proceed-with-changes';
  const outcomeError = tried && !outcome ? 'Choose an outcome.' : '';
  const rationaleError = tried && needsRationale && !rationale.trim() ? 'Say what changes. Required for "Proceed with changes".' : '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!outcome || (needsRationale && !rationale.trim())) return;
    dispatch({ type: 'RECORD_DECISION', recommendationId: rec.id, outcome, recordedById: byId, rationale });
  };

  return (
    <form className="form decision-form" onSubmit={submit} noValidate>
      <h4 className="form-title">Record a decision</h4>
      <fieldset className="radio-group" aria-describedby={outcomeError ? `${id}-oe` : undefined}>
        <legend>Outcome</legend>
        {OUTCOMES.map((o) => (
          <label key={o} className="radio">
            <input type="radio" name={`${id}-outcome`} value={o} checked={outcome === o} onChange={() => setOutcome(o)} />
            <span>{OUTCOME_LABEL[o]}</span>
          </label>
        ))}
        {outcomeError && (
          <p className="form-error" id={`${id}-oe`} role="alert">
            {outcomeError}
          </p>
        )}
      </fieldset>
      <label className="form-field">
        <span>Recorded by</span>
        <select value={byId} onChange={(e) => setById(e.target.value)}>
          {RECORDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {p.role}
            </option>
          ))}
        </select>
        <span className="form-hint">Attribution only. In production this would come from sign-in.</span>
      </label>
      <label className="form-field">
        <span>
          Rationale {needsRationale ? <em className="req">(required)</em> : <em className="muted">(optional)</em>}
        </span>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} aria-invalid={!!rationaleError} aria-describedby={rationaleError ? `${id}-re` : undefined} />
        {rationaleError && (
          <span className="form-error" id={`${id}-re`} role="alert">
            {rationaleError}
          </span>
        )}
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Record decision
        </button>
        <span className="form-note">This records a decision only. Nothing is sent to the field, and no equipment is operated.</span>
      </div>
    </form>
  );
}
