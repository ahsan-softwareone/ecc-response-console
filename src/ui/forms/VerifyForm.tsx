import { useId, useState } from 'react';
import { RECORDERS } from '../../domain/scenario';
import { useEcc } from '../../domain/store';
import type { ResponseAction } from '../../domain/types';

export function VerifyForm({ act }: { act: ResponseAction }) {
  const { dispatch } = useEcc();
  const [byId, setById] = useState(RECORDERS[0].id);
  const [basis, setBasis] = useState('');
  const [tried, setTried] = useState(false);
  const id = useId();
  const error = tried && !basis.trim() ? 'Say what the verification is based on, for example who confirmed it and how.' : '';
  return (
    <form
      className="form verify-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!basis.trim()) return;
        dispatch({ type: 'VERIFY_ACTION', actionId: act.id, byId, basis });
      }}
    >
      <h4 className="form-title">Record verification</h4>
      <label className="form-field">
        <span>Verified by</span>
        <select value={byId} onChange={(e) => setById(e.target.value)}>
          {RECORDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {p.role}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>
          Basis <em className="req">(required)</em>
        </span>
        <textarea value={basis} onChange={(e) => setBasis(e.target.value)} rows={3} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} />
        {error && (
          <span className="form-error" id={`${id}-e`} role="alert">
            {error}
          </span>
        )}
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Record verification
        </button>
        <span className="form-note">Only after this is the completion shown as verified.</span>
      </div>
    </form>
  );
}
