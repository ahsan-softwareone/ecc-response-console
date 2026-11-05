import { SEVERITY_LABEL, SOURCE_STATE_LABEL, type DisplaySeverity, type SourceState } from '../../domain/types';

/** Operational severity as displayed. Red is reserved for the most urgent level of the illustrative scheme. */
export function SeverityTag({ display, source, size = 'md' }: { display: DisplaySeverity; source?: string; size?: 'sm' | 'md' }) {
  return (
    <span className={`sev sev-${display} sev-${size}`} title={source ? `Source severity ${source}, shown as ${SEVERITY_LABEL[display]} (illustrative mapping)` : undefined}>
      {SEVERITY_LABEL[display]}
    </span>
  );
}

/** Source health, in words. Connected says the link works; it says nothing about the equipment. */
export function SourceHealth({ state, size = 'md' }: { state: SourceState; size?: 'sm' | 'md' }) {
  return (
    <span className={`srch srch-${state} srch-${size}`}>
      <span className="srch-dot" aria-hidden="true" />
      {SOURCE_STATE_LABEL[state]}
    </span>
  );
}
