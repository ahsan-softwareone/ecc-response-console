import type { ReactNode } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/** Plain tab strip. Arrow keys move between tabs; the parent renders the active panel. */
export function Tabs<T extends string>({ tabs, active, onChange, label, aside }: { tabs: TabDef<T>[]; active: T; onChange: (id: T) => void; label: string; aside?: ReactNode }) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="tabs-row">
      <div className="tabs" role="tablist" aria-label={label}>
        {tabs.map((t, i) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`} tabIndex={active === t.id ? 0 : -1} className={`tab ${active === t.id ? 'is-active' : ''}`} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      {aside && <div className="tabs-aside">{aside}</div>}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="tab-panel">
      {children}
    </div>
  );
}
