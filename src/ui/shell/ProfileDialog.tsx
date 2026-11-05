import { useEcc } from '../../domain/store';
import type { PlatformRole } from '../../domain/types';
import { Dialog } from '../components/Dialog';

const ROLES: PlatformRole[] = ['Incident user', 'Knowledge steward', 'Administrator', 'Observer'];

const ROLE_NOTE: Record<PlatformRole, string> = {
  'Incident user': 'Sees the incident and can record decisions and updates. Cannot publish knowledge or change configuration.',
  'Knowledge steward': 'Can publish document revisions in Knowledge (simulated). Otherwise as an incident user.',
  Administrator: 'Can change platform roles, activate agent configuration and test sources (all simulated).',
  Observer: 'Read only. Detailed execution records are hidden.',
};

/**
 * There is no sign-in in this prototype. The role switch below only changes which platform
 * controls are shown. It is not a statement of who is responsible for the incident.
 */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useEcc();
  return (
    <Dialog title="User profile" onClose={onClose} className="dialog-form" labelledBy="profile-title">
      <div className="profile">
        <p className="muted">No sign-in exists in this prototype. Attribution on decisions and updates is chosen on each form.</p>
        <fieldset className="radio-group">
          <legend>
            Prototype role <span className="tag tag-proto">Prototype control</span>
          </legend>
          <p className="form-hint">Shows or hides platform controls for demonstration. It does not assign responsibility for the incident and changes nothing on the incident record.</p>
          {ROLES.map((r) => (
            <label key={r} className="radio radio-block">
              <input type="radio" name="proto-role" value={r} checked={state.prototypeRole === r} onChange={() => dispatch({ type: 'SET_PROTOTYPE_ROLE', role: r })} />
              <span>
                <span className="radio-title">{r}</span>
                <span className="radio-note">{ROLE_NOTE[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Dialog>
  );
}
