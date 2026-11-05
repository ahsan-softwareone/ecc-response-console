import { useId, useState } from 'react';
import { RECORDERS } from '../../domain/scenario';
import { useEcc } from '../../domain/store';
import { ACTION_STATUS_LABEL, type ActionStatus } from '../../domain/types';
import { fmt } from '../util';

const STATUSES: ActionStatus[] = ['in-progress', 'could-not-complete', 'completion-reported'];

/** Shared field-update form. Adds what someone reported; it never verifies anything. */
export function FieldUpdateForm({ initialActionId, onDone }: { initialActionId?: string; onDone: () => void }) {
  const { state, dispatch } = useEcc();
  const linkable = state.actions.filter((a) => a.status !== 'completion-verified');
  const [actionId, setActionId] = useState(initialActionId && linkable.some((a) => a.id === initialActionId) ? initialActionId : '');
  const [reportedBy, setReportedBy] = useState('');
  const [status, setStatus] = useState<ActionStatus | ''>('');
  const [observed, setObserved] = useState('');
  const [text, setText] = useState('');
  const [enteredById, setEnteredById] = useState(RECORDERS[0].id);
  const [tried, setTried] = useState(false);
  const id = useId();

  const textError = tried && !text.trim() ? 'Say what was reported.' : '';
  const timeError = tried && observed && !/^\d{1,2}:\d{2}$/.test(observed.trim()) ? 'Use HH:MM, or leave blank.' : '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!text.trim() || (observed && !/^\d{1,2}:\d{2}$/.test(observed.trim()))) return;
    let observedAt: number | undefined;
    if (observed.trim()) {
      const [h, m] = observed.trim().split(':').map(Number);
      observedAt = h * 60 + m;
    }
    dispatch({
      type: 'RECORD_FIELD_UPDATE',
      actionId: actionId || undefined,
      reportedBy,
      status: actionId && status ? status : undefined,
      text,
      observedAt,
      enteredById,
    });
    onDone();
  };

  return (
    <form className="form field-update-form" onSubmit={submit} noValidate>
      <label className="form-field">
        <span>Response item (optional)</span>
        <select value={actionId} onChange={(e) => setActionId(e.target.value)}>
          <option value="">Not linked to a response item</option>
          {linkable.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} · {a.title}
            </option>
          ))}
        </select>
      </label>
      {actionId && (
        <label className="form-field">
          <span>Reported status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ActionStatus | '')}>
            <option value="">Unchanged ({ACTION_STATUS_LABEL[state.actions.find((a) => a.id === actionId)?.status ?? 'no-report']})</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACTION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <span className="form-hint">Verification is recorded separately, by a person, after completion is reported.</span>
        </label>
      )}
      <label className="form-field">
        <span>Reported by</span>
        <input type="text" value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Name or role of the person reporting" data-autofocus />
      </label>
      <label className="form-field">
        <span>Observed time (optional)</span>
        <input type="text" inputMode="numeric" value={observed} onChange={(e) => setObserved(e.target.value)} placeholder={`HH:MM, for example ${fmt(state.now)}`} aria-invalid={!!timeError} aria-describedby={timeError ? `${id}-t` : undefined} className="input-time" />
        {timeError && (
          <span className="form-error" id={`${id}-t`} role="alert">
            {timeError}
          </span>
        )}
      </label>
      <label className="form-field">
        <span>
          What was reported <em className="req">(required)</em>
        </span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-invalid={!!textError} aria-describedby={textError ? `${id}-x` : undefined} />
        {textError && (
          <span className="form-error" id={`${id}-x`} role="alert">
            {textError}
          </span>
        )}
      </label>
      <label className="form-field">
        <span>Entered by</span>
        <select value={enteredById} onChange={(e) => setEnteredById(e.target.value)}>
          {RECORDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {p.role}
            </option>
          ))}
        </select>
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Record field update
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <span className="form-note">Added as reported, not verified.</span>
      </div>
    </form>
  );
}
