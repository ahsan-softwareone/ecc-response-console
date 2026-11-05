import { ArrowLeft, FileText, MessageCircleQuestion, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { recordLabel, resolveRecord } from '../../domain/content';
import { conditionUnit, isSituationRailId } from '../../domain/situation';
import { useEcc } from '../../domain/store';
import type { EccState } from '../../domain/types';
import { isPseudoRailId, RAIL_DRAFT_PREFIX } from '../util';
import { Investigation } from '../situation/Investigation';
import { Assistant } from './Assistant';
import { DraftVersion } from './DraftVersion';
import { Details } from './Details';

function railTitle(state: EccState, id: string, label: (id: string) => string): string {
  if (id.startsWith(RAIL_DRAFT_PREFIX)) return `Draft ${id.slice(RAIL_DRAFT_PREFIX.length)}`;
  if (isSituationRailId(id)) return conditionUnit(state, id)?.label ?? "condition";
  return label(id);
}

/**
 * The contextual panel. Details and the Assistant share it; the segmented control switches
 * between them and the selected item stays in focus either way. Arrivals in the feed never
 * change what is selected here.
 */
export function Rail() {
  const { state, dispatch } = useEcc();
  const { open, tab, stack } = state.rail;
  const top = stack[stack.length - 1];
  const prev = stack[stack.length - 2];
  const label = (id: string) => recordLabel(state, id);

  const panelRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opener.current = document.activeElement as HTMLElement | null;
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
    else if (wasOpen.current && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, top, tab]);

  if (!open) return null;

  return (
    <>
      <div className="panel-scrim" onClick={() => dispatch({ type: 'RAIL_CLOSE' })} aria-hidden="true" />
      <aside className="panel" aria-label="Detail panel" tabIndex={-1} ref={panelRef}>
        <div className="panel-head">
          <div className="seg" role="tablist" aria-label="Panel">
            <button type="button" role="tab" aria-selected={tab === 'details'} className={`seg-btn ${tab === 'details' ? 'is-active' : ''}`} onClick={() => dispatch({ type: 'RAIL_TAB', tab: 'details' })}>
              <FileText size={14} aria-hidden="true" />
              Details
            </button>
            <button type="button" role="tab" aria-selected={tab === 'assistant'} className={`seg-btn ${tab === 'assistant' ? 'is-active' : ''}`} onClick={() => dispatch({ type: 'RAIL_TAB', tab: 'assistant' })}>
              <MessageCircleQuestion size={14} aria-hidden="true" />
              Assistant
            </button>
          </div>
          <button type="button" className="btn btn-icon panel-close" onClick={() => dispatch({ type: 'RAIL_CLOSE' })} aria-label="Close panel (Esc)">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {tab === 'assistant' ? (
          <Assistant />
        ) : (
          <div className="panel-body" role="tabpanel">
            {stack.length > 1 && (
              <button type="button" className="panel-back" onClick={() => dispatch({ type: 'RAIL_BACK' })}>
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Back to {railTitle(state, prev, label)}</span>
              </button>
            )}
            {!top ? (
              <p className="empty">Nothing selected. Open a condition, attention item, feed entry or reference to see its details here.</p>
            ) : top.startsWith(RAIL_DRAFT_PREFIX) ? (
              <DraftVersion version={Number(top.slice(RAIL_DRAFT_PREFIX.length))} />
            ) : isSituationRailId(top) ? (
              <Investigation key={top} railId={top} />
            ) : isPseudoRailId(top) || !resolveRecord(state, top) ? (
              <p className="empty">This item is not on the record.</p>
            ) : (
              <Details key={top} id={top} />
            )}
          </div>
        )}
      </aside>
    </>
  );
}
