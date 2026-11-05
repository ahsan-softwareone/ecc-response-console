import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ConditionState, DecisionStatus, EvidenceStatus, ExecutionStatus, Severity, SourceHealth } from '../data/types';
import { CONDITION_LABEL, DECISION_LABEL, EVIDENCE_LABEL, EXECUTION_LABEL, SEVERITY_LABEL } from '../lib/derive';
import { Icon } from './Icon';

export function SeverityChip({ s }: { s: Severity }) { return <span className={`chip sev-${s}`}>{SEVERITY_LABEL[s]}</span>; }
export function ConditionChip({ c }: { c: ConditionState }) { return <span className={`chip state-${c}`}>{CONDITION_LABEL[c]}</span>; }
/** Evidence status is never coloured as safe. Neutral outline for all four values. */
export function EvidenceChip({ e }: { e: EvidenceStatus }) { return <span className="chip outline" title="Evidence status">{EVIDENCE_LABEL[e]}</span>; }
export function DecisionChip({ d }: { d: DecisionStatus }) { return <span className={`chip ${d === 'none' ? 'outline' : 'soft'}`}>{DECISION_LABEL[d]}</span>; }
export function ExecutionChip({ e }: { e: ExecutionStatus }) { return <span className={`chip ${e === 'not-started' ? 'outline' : 'soft'}`}>{EXECUTION_LABEL[e]}</span>; }
export function SourceDot({ h, label }: { h: SourceHealth; label?: string }) {
  const text = label ?? (h === 'live' ? 'Live' : h === 'stale' ? 'Stale' : 'Signal lost');
  return <span className={`src ${h}`} title={`Source ${text.toLowerCase()}`}><i />{text}</span>;
}

export function IconButton({ name, title, onClick, className = '', size = 16, pressed, disabled, testId }: { name: string; title: string; onClick?: () => void; className?: string; size?: number; pressed?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button className={`iconbtn ${className}`} title={title} aria-label={title} onClick={onClick} aria-pressed={pressed} disabled={disabled} data-testid={testId}>
      <Icon name={name} size={size} />
    </button>
  );
}

/** Popover anchored below a trigger. Closes on outside click or Escape. */
export function Popover({ trigger, children, align = 'right', width }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  // Keep the popover inside the viewport.
  useLayoutEffect(() => {
    const el = popRef.current; if (!open || !el) return;
    el.style.transform = '';
    const r = el.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (r.right > window.innerWidth - 8) dx = window.innerWidth - 8 - r.right;
    if (r.left + dx < 8) dx = 8 - r.left;
    if (r.bottom > window.innerHeight - 48) dy = -(r.height + 36);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div ref={popRef} className="pop" role="dialog" style={{ top: 'calc(100% + 4px)', [align]: 0, width }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="toast" role="status">{text}</div>;
}
