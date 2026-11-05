import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useEcc } from '../../domain/store';
import { useUi } from '../App';
import { RefLink } from './RefLink';

export function ToastHost() {
  const { state, dispatch } = useEcc();
  const { settings } = useUi();
  const t = settings.confirmations ? state.toast : null;
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => dispatch({ type: 'DISMISS_TOAST' }), 6500);
    return () => clearTimeout(h);
  }, [t, dispatch]);
  return (
    <div className="toast-host" role="status" aria-live="polite" aria-atomic="true">
      {t && (
        <div className="toast" key={t.id}>
          <span className="toast-text">{t.message}</span>
          {t.ref && <RefLink id={t.ref} label="Open record" className="ref-on-dark" />}
          <button type="button" className="btn btn-icon btn-on-dark" aria-label="Dismiss" onClick={() => dispatch({ type: 'DISMISS_TOAST' })}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
