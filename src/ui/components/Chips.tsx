import { Boxes, ChevronRight, CircleHelp, Database, FileText, Gauge, Gavel, Lightbulb, Map, MessageSquare, Radio, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { recordLabel, resolveRecord } from '../../domain/content';
import { useEcc } from '../../domain/store';
import type { AnyRecord } from '../../domain/types';
import { plural } from '../util';

function iconFor(r: AnyRecord | undefined) {
  if (!r) return CircleHelp;
  switch (r.kind) {
    case 'citation':
      return r.openFailure ? TriangleAlert : r.sourceType === 'diagram' ? Map : r.sourceType === 'reading' ? Gauge : r.sourceType === 'record' ? Database : FileText;
    case 'report':
      return MessageSquare;
    case 'document':
      return r.availability === 'unavailable' ? TriangleAlert : Database;
    case 'asset':
      return Boxes;
    case 'decision':
      return Gavel;
    case 'recommendation':
      return Lightbulb;
    case 'action':
      return Radio;
    case 'issue':
      return CircleHelp;
    case 'kdoc':
      return FileText;
    default:
      return FileText;
  }
}

/** A reference chip with a meaningful label. Opens the record in the panel without leaving the view. */
function RefChip({ id, label, tone }: { id: string; label?: string; tone?: 'default' | 'quiet' }) {
  const { state, dispatch } = useEcc();
  const r = resolveRecord(state, id);
  const Icon = iconFor(r);
  const selected = state.rail.open && state.rail.stack[state.rail.stack.length - 1] === id;
  const failed = (r?.kind === 'citation' && !!r.openFailure) || (r?.kind === 'document' && r.availability === 'unavailable');
  const illustrative = r?.kind === 'citation' && r.illustrative;
  return (
    <button type="button" className={`chip-ref ${tone === 'quiet' ? 'is-quiet' : ''} ${selected ? 'is-selected' : ''} ${failed ? 'is-failed' : ''}`} onClick={() => dispatch({ type: 'OPEN_RECORD', id })} aria-pressed={selected} title={r ? undefined : id}>
      <Icon size={13} aria-hidden="true" />
      <span>{label ?? recordLabel(state, id)}</span>
      {illustrative && <span className="chip-ref-note">illustrative</span>}
    </button>
  );
}

export function RefChips({ ids, emptyNote }: { ids: string[]; emptyNote?: string }) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return emptyNote ? <span className="no-support">{emptyNote}</span> : null;
  return (
    <div className="chips">
      {unique.map((id) => (
        <RefChip key={id} id={id} />
      ))}
    </div>
  );
}

/**
 * A count where a list would be noise: "3 sources" opens the chips in place. One source opens directly.
 * `note` replaces the count when nothing can be cited, so a missing source is never silent.
 */
export function EvidenceCount({ ids, note, noun = 'source' }: { ids: string[]; note?: string; noun?: string }) {
  const { state, dispatch } = useEcc();
  const [open, setOpen] = useState(false);
  const id = useId();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const failed = unique.filter((x) => {
    const r = resolveRecord(state, x);
    return (r?.kind === 'citation' && !!r.openFailure) || (r?.kind === 'document' && r.availability === 'unavailable');
  }).length;
  if (unique.length === 0) return <span className="evid evid-none">{note ?? 'No source cited'}</span>;
  if (unique.length === 1)
    return (
      <button type="button" className={`evid ${failed ? 'is-failed' : ''}`} onClick={() => dispatch({ type: 'OPEN_RECORD', id: unique[0] })}>
        {recordLabel(state, unique[0])}
      </button>
    );
  return (
    <span className="evid-wrap">
      <button type="button" className={`evid ${open ? 'is-open' : ''} ${failed ? 'is-failed' : ''}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={12} aria-hidden="true" className="evid-chev" />
        {plural(unique.length, noun)}
        {note && <span className="evid-note"> · {note}</span>}
      </button>
      {open && (
        <span id={id} className="chips evid-chips">
          {unique.map((x) => (
            <RefChip key={x} id={x} />
          ))}
        </span>
      )}
    </span>
  );
}
