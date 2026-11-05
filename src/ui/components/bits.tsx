import { ChevronRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

/** Small labelled field for detail panes. */
export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className}`}>
      <div className="field-label">{label}</div>
      <div className="field-value">{children}</div>
    </div>
  );
}

/** Plain disclosure built on a real button, so it is keyboard and screen-reader friendly. */
export function Disclosure({ label, children, defaultOpen = false, className = '' }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`disclosure ${open ? 'is-open' : ''} ${className}`}>
      <button type="button" className="disclosure-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={14} aria-hidden="true" className="disclosure-chev" />
        <span>{label}</span>
      </button>
      {open && (
        <div id={id} className="disclosure-body">
          {children}
        </div>
      )}
    </div>
  );
}

/** Quiet verbatim quote, used for report text so it is never mistaken for a summary. */
export function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="quote">{children}</blockquote>;
}
