import { useEffect, useMemo, useRef, useState } from 'react';
import { EQUIPMENT } from '../data/scenario';
import type { ConditionState, Severity } from '../data/types';
import { CONDITION_LABEL, SEVERITY_LABEL, useDerived, type AlertView } from '../lib/derive';
import { clock } from '../lib/time';
import { useStore, type LogFilters } from '../store';
import { Icon } from '../ui/Icon';
import { ConditionChip, Popover, SeverityChip } from '../ui/ui';
import { WindowFrame } from './WindowFrame';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
const STATES: ConditionState[] = ['active', 'unconfirmed', 'reported', 'recovered', 'cleared'];

export function matchesFilters(a: AlertView, f: LogFilters): boolean {
  if (f.severity !== 'all' && a.def.severity !== f.severity) return false;
  if (f.equipment.length && !f.equipment.includes(a.def.equipmentId)) return false;
  if (f.status.length && !f.status.includes(a.condition)) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !`${a.def.title} ${a.def.equipmentId} ${a.equipment.name}`.toLowerCase().includes(q)) return false;
  return true;
}
export function filtersActive(f: LogFilters) { return f.severity !== 'all' || f.equipment.length > 0 || f.status.length > 0 || f.query.trim() !== ''; }

/**
 * Alert log with a compact filter toolbar. Filtering is display-only: the agent,
 * card indicators, nav count and the record keep the full data. New alerts are held
 * behind a "N new" affordance while the user is scrolled away from the top.
 */
export function AlertLog() {
  const d = useDerived();
  const filters = useStore((s) => s.logFilters);
  const setLogFilters = useStore((s) => s.setLogFilters);
  const clearLogFilters = useStore((s) => s.clearLogFilters);
  const selectedId = useStore((s) => s.selectedAlertId);
  const selectAlert = useStore((s) => s.selectAlert);
  const alertUser = useStore((s) => s.alertUser);
  const dashboard = useStore((s) => s.dashboard);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Set<string>>(() => new Set(d.alerts.map((a) => a.id)));
  const [pending, setPending] = useState<string[]>([]);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = bodyRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 880));
    ro.observe(el); setNarrow(el.clientWidth < 880);
    return () => ro.disconnect();
  }, []);

  // New alerts: hold matching ones while the log is scrolled; everything else is processed at once.
  useEffect(() => {
    const unknown = d.alerts.filter((a) => !shown.has(a.id) && !pending.includes(a.id));
    if (unknown.length === 0) return;
    const el = scrollRef.current;
    const scrolled = !!el && el.scrollTop > 4;
    const hold = scrolled ? unknown.filter((a) => matchesFilters(a, filters)) : [];
    const merge = unknown.filter((a) => !hold.includes(a));
    if (hold.length) setPending((p) => [...p, ...hold.map((a) => a.id)]);
    if (merge.length) setShown((s) => new Set([...s, ...merge.map((a) => a.id)]));
  }, [d.alerts, shown, pending, filters]);

  const release = () => {
    setShown((s) => new Set([...s, ...pending]));
    setPending([]);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const all = d.alerts.filter((a) => shown.has(a.id));
  const rows = all.filter((a) => matchesFilters(a, filters));
  const active = filtersActive(filters);
  const pendingMatching = pending.filter((id) => { const a = d.alertById.get(id); return a && matchesFilters(a, filters); });
  const unread = all.filter((a) => !alertUser[a.id]?.readAt).length;
  // Discoverability: Critical (and High) alerts needing attention that the current filters hide.
  const hiddenCritical = d.alerts.filter((a) => a.def.severity === 'critical' && (a.condition === 'active' || a.condition === 'unconfirmed') && !matchesFilters(a, filters));
  const hiddenHigh = d.alerts.filter((a) => a.def.severity === 'high' && (a.condition === 'active' || a.condition === 'unconfirmed') && !matchesFilters(a, filters));
  const reveal = () => {
    // Change filters minimally so the hidden Critical/High alerts match; nothing else changes.
    const targets = [...hiddenCritical, ...hiddenHigh];
    const patch: Partial<LogFilters> = {};
    if (filters.severity !== 'all' && targets.some((a) => a.def.severity !== filters.severity)) patch.severity = 'all';
    if (filters.equipment.length) { const add = targets.map((a) => a.def.equipmentId).filter((id) => !filters.equipment.includes(id)); if (add.length) patch.equipment = [...new Set([...filters.equipment, ...add])]; }
    if (filters.status.length) { const add = targets.map((a) => a.condition).filter((c) => !filters.status.includes(c)); if (add.length) patch.status = [...new Set([...filters.status, ...add])]; }
    const q = filters.query.trim().toLowerCase();
    if (q && targets.some((a) => !`${a.def.title} ${a.def.equipmentId} ${a.equipment.name}`.toLowerCase().includes(q))) patch.query = '';
    setLogFilters(patch);
    setShown((s) => new Set([...s, ...targets.map((a) => a.id)]));
    setPending((p) => p.filter((id) => !targets.some((a) => a.id === id)));
  };

  const equipmentOptions = useMemo(() => {
    const ids = new Set<string>([...dashboard, ...d.alerts.map((a) => a.def.equipmentId)]);
    return EQUIPMENT.filter((e) => ids.has(e.id));
  }, [dashboard, d.alerts]);
  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <WindowFrame id="log" title="Alert log" meta={<span data-testid="log-meta">{all.length} {all.length === 1 ? 'alert' : 'alerts'}{unread ? ` · ${unread} unread` : ''}</span>}>
      <div className="win-b" ref={bodyRef}>
        <div className={`logbar ${narrow ? 'narrow' : ''}`} data-testid="log-toolbar" data-active={active}>
          {narrow ? (
            <select className="select sm" value={filters.severity} onChange={(e) => setLogFilters({ severity: e.target.value as LogFilters['severity'] })} aria-label="Severity" data-testid="filter-severity-select">
              <option value="all">All severities</option>{SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
            </select>
          ) : (
            <span className="seg sm" role="group" aria-label="Severity" data-testid="filter-severity">
              <button aria-pressed={filters.severity === 'all'} onClick={() => setLogFilters({ severity: 'all' })} data-testid="sev-all">All</button>
              {SEVERITIES.map((s) => <button key={s} aria-pressed={filters.severity === s} onClick={() => setLogFilters({ severity: s })} data-testid={`sev-${s}`}>{SEVERITY_LABEL[s]}</button>)}
            </span>
          )}
          <Popover width={240} trigger={(open, toggle) => (
            <button className={`btn sm ${filters.equipment.length ? 'on' : ''}`} onClick={toggle} aria-expanded={open} data-testid="filter-equipment">
              {filters.equipment.length === 0 ? 'Equipment' : filters.equipment.length === 1 ? filters.equipment[0] : `${filters.equipment.length} equipment`}<Icon name="chevD" size={12} />
            </button>
          )}>
            {() => (
              <>
                {equipmentOptions.map((e) => (
                  <button key={e.id} className="item" onClick={() => setLogFilters({ equipment: toggleIn(filters.equipment, e.id) })} aria-pressed={filters.equipment.includes(e.id)} data-testid={`eq-opt-${e.id}`}>
                    {filters.equipment.includes(e.id) ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}<b>{e.id}</b> {e.name}{!dashboard.includes(e.id) && <span className="sub">no card</span>}
                  </button>
                ))}
                {filters.equipment.length > 0 && <><div className="sep" /><button className="item" onClick={() => setLogFilters({ equipment: [] })}>All equipment</button></>}
              </>
            )}
          </Popover>
          <Popover width={220} trigger={(open, toggle) => (
            <button className={`btn sm ${filters.status.length ? 'on' : ''}`} onClick={toggle} aria-expanded={open} data-testid="filter-status">
              {filters.status.length === 0 ? 'Status' : filters.status.map((s) => CONDITION_LABEL[s]).join(', ')}<Icon name="chevD" size={12} />
            </button>
          )}>
            {() => (
              <>
                {STATES.map((s) => (
                  <button key={s} className="item" onClick={() => setLogFilters({ status: toggleIn(filters.status, s) })} aria-pressed={filters.status.includes(s)} data-testid={`status-opt-${s}`}>
                    {filters.status.includes(s) ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{CONDITION_LABEL[s]}
                  </button>
                ))}
                {filters.status.length > 0 && <><div className="sep" /><button className="item" onClick={() => setLogFilters({ status: [] })}>Any status</button></>}
              </>
            )}
          </Popover>
          <span className="logsearch"><Icon name="search" size={13} /><input className="input sm" placeholder={narrow ? 'Search' : 'Search alerts or tag'} value={filters.query} onChange={(e) => setLogFilters({ query: e.target.value })} aria-label="Search alerts" data-testid="filter-search" /></span>
          <span className="logcount num" data-testid="log-count">{active ? `${rows.length} of ${all.length}` : `${all.length}`}</span>
          {(hiddenCritical.length > 0 || hiddenHigh.length > 0) && (
            <button className="hiddenind" onClick={reveal} title="Alerts needing attention that the current filters hide. Click to adjust the filters so they show." data-testid="hidden-indicator" data-critical={hiddenCritical.length} data-high={hiddenHigh.length}>
              <Icon name="warn" size={12} />{hiddenCritical.length > 0 && <span>{hiddenCritical.length} Critical</span>}{hiddenCritical.length > 0 && hiddenHigh.length > 0 && <span>·</span>}{hiddenHigh.length > 0 && <span>{hiddenHigh.length} High</span>}<span>hidden</span>
            </button>
          )}
          {active && <button className="btn sm quiet" onClick={clearLogFilters} data-testid="clear-filters"><Icon name="close" size={12} /> Clear filters</button>}
        </div>
        <div className="win-b" style={{ position: 'relative' }}>
          {pendingMatching.length > 0 && (
            <div className="newpill"><button onClick={release} data-testid="new-pill"><Icon name="up" size={13} />{pendingMatching.length} new alert{pendingMatching.length > 1 ? 's' : ''}</button></div>
          )}
          <div className="scroll" ref={scrollRef} data-testid="log-scroll">
            <table className="log" data-testid="log-table">
              <thead><tr><th>Severity</th><th>Equipment</th><th>Alert</th><th>Time</th><th>State</th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const u = alertUser[a.id];
                  return (
                    <tr key={a.id} className={`row ${!u?.readAt ? 'unread' : ''} ${a.condition === 'cleared' ? 'cleared' : ''}`} aria-selected={selectedId === a.id} onClick={() => selectAlert(a.id)} data-testid={`alert-${a.id}`} data-severity={a.def.severity} data-time={a.time} data-condition={a.condition} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAlert(a.id); } }}>
                      <td className="sev"><SeverityChip s={a.def.severity} /></td>
                      <td className="eq">{a.def.equipmentId}</td>
                      <td className="desc"><div className="t"><span className="unread-dot" aria-hidden="true" /><span className="wrap">{a.def.title}</span>{a.processedLate && <span className="late" title={`Occurred ${clock(a.time)}; the agent analysed it at ${clock(a.processedLate)} because it was not running`} data-testid={`late-${a.id}`}>analysed {clock(a.processedLate)}</span>}{a.count > 1 && <span className="count" title={`Repeated ${a.count} times while unchanged; last ${clock(a.lastTime)}`}>×{a.count}</span>}</div></td>
                      <td className="time">{clock(a.time)}</td>
                      <td className="state"><ConditionChip c={a.condition} /></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="empty" data-testid="log-empty">{active ? <>No alerts match the current filters. <button className="link" onClick={clearLogFilters}>Clear filters</button></> : 'No alerts yet'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}
