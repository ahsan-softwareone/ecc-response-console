import { recordLabel } from '../../domain/content';
import { useEcc } from '../../domain/store';

/** An evidence link. Opens the record in the Details rail without leaving the current view. */
export function RefLink({ id, label, className = '' }: { id: string; label?: string; className?: string }) {
  const { state, dispatch } = useEcc();
  return (
    <button type="button" className={`ref ${className}`} onClick={() => dispatch({ type: 'OPEN_RECORD', id })}>
      {label ?? recordLabel(state, id)}
    </button>
  );
}

export function RefList({ ids, label = 'Evidence' }: { ids: string[]; label?: string }) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return <span className="muted">No linked evidence</span>;
  return (
    <span className="reflist">
      {label && <span className="reflist-label">{label}</span>}
      {unique.map((id) => (
        <RefLink key={id} id={id} />
      ))}
    </span>
  );
}
