import { useEffect, useRef, useState } from 'react';
import { useDerived } from '../lib/derive';
import { clock } from '../lib/time';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { ConditionChip, SeverityChip } from '../ui/ui';
import { WindowFrame } from './WindowFrame';

/**
 * Alert log. New alerts are held in a "N new" affordance while the user is
 * scrolled away from the top, so nothing being read moves. Read state is set
 * only by selecting; acknowledgement and decisions live elsewhere.
 */
export function AlertLog() {
  const d = useDerived();
  const filter = useStore((s) => s.logFilter);
  const setLogFilter = useStore((s) => s.setLogFilter);
  const selectedId = useStore((s) => s.selectedAlertId);
  const selectAlert = useStore((s) => s.selectAlert);
  const alertUser = useStore((s) => s.alertUser);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Set<string>>(() => new Set(d.alerts.map((a) => a.id)));
  const [pending, setPending] = useState<string[]>([]);

  // Merge new alerts immediately when the log is at the top; otherwise hold them.
  useEffect(() => {
    const unknown = d.alerts.filter((a) => !shown.has(a.id) && !pending.includes(a.id)).map((a) => a.id);
    if (unknown.length === 0) return;
    const el = scrollRef.current;
    if (el && el.scrollTop > 4) setPending((p) => [...p, ...unknown]);
    else setShown((s) => new Set([...s, ...unknown]));
  }, [d.alerts, shown, pending]);

  const release = () => {
    setShown((s) => new Set([...s, ...pending]));
    setPending([]);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const all = d.alerts.filter((a) => shown.has(a.id));
  const rows = filter ? all.filter((a) => a.def.equipmentId === filter) : all;
  const hiddenImportant = filter ? all.filter((a) => a.def.equipmentId !== filter && a.condition !== 'cleared' && (a.def.severity === 'critical' || a.def.severity === 'high')) : [];
  const unread = all.filter((a) => !alertUser[a.id]?.readAt).length;
  const eq = filter ? d.equipmentById.get(filter) : null;

  return (
    <WindowFrame id="log" title="Alert log" meta={<span data-testid="log-meta">{all.length} alerts{unread ? ` · ${unread} unread` : ''}</span>}>
      {filter && (
        <div className="filterbar" data-testid="filterbar">
          <Icon name="filter" size={14} />
          <span>Showing <b>{eq?.id}</b> {eq?.name} only</span>
          <button className="btn sm x" onClick={() => setLogFilter(null)} data-testid="clear-filter"><Icon name="close" size={13} /> Clear filter</button>
        </div>
      )}
      <div className="win-b">
        {pending.length > 0 && (
          <div className="newpill"><button onClick={release} data-testid="new-pill"><Icon name="up" size={13} />{pending.length} new alert{pending.length > 1 ? 's' : ''}</button></div>
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
                    <td className="desc"><div className="t"><span className="unread-dot" aria-hidden="true" /><span className="wrap">{a.def.title}</span>{a.count > 1 && <span className="count" title={`Repeated ${a.count} times while unchanged; last ${clock(a.lastTime)}`}>×{a.count}</span>}</div></td>
                    <td className="time">{clock(a.time)}</td>
                    <td className="state"><ConditionChip c={a.condition} /></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5} className="empty">No alerts{filter ? ' for this equipment' : ' yet'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {hiddenImportant.length > 0 && (
        <div className="hiddennote" data-testid="hidden-note">
          <Icon name="warn" size={14} />
          <span>{hiddenImportant.length} {hiddenImportant.length === 1 ? 'alert' : 'alerts'} rated Critical or High on other equipment {hiddenImportant.length === 1 ? 'is' : 'are'} hidden by this filter.</span>
          <button className="link" style={{ marginLeft: 'auto' }} onClick={() => setLogFilter(null)}>Show all</button>
        </div>
      )}
    </WindowFrame>
  );
}
