import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: traps focus, closes on Esc, restores focus to the opener.
 * `variant` "slide" is a slide-over; "modal" is centred; "full" takes the whole window for focused work.
 */
export function Dialog({
  title,
  onClose,
  children,
  variant = 'modal',
  className = '',
  labelledBy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  variant?: 'modal' | 'slide' | 'full';
  className?: string;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (items.length === 0) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [onClose]);

  const titleId = labelledBy ?? 'dialog-title';
  return (
    <div className={`dialog-backdrop dialog-backdrop-${variant}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`dialog dialog-${variant} ${className}`}>
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className={`btn ${variant === 'full' ? 'btn-sm' : 'btn-icon'}`} onClick={onClose} aria-label="Close (Esc)">
            <X size={16} aria-hidden="true" />
            {variant === 'full' && <span>Close</span>}
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
