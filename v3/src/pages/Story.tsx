// Timeline workspace: one chronological view of the response (left) and the Sit. Rep (right), from the same facts.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_DASHBOARD } from '../data/scenario';
import { useDerived, useIncidentNow } from '../lib/derive';
import { clock } from '../lib/time';
import { buildBrief, buildTimeline, type Moment, type StoryKind } from '../record/story';
import { TimelineView } from '../record/TimelineView';
import type { IncidentRecord } from '../record/types';
import { useRoom } from '../situation/issues';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { SeverityChip } from '../ui/ui';

/** The Timeline and the brief, built once from the record as of now. */
export function useStoryData(record: IncidentRecord) {
  const room = useRoom();
  const d = useDerived();
  const dashboard = useStore((s) => s.dashboard);
  const t = useIncidentNow(5000);
  // As of now, and never earlier than the newest entry, so what you just recorded (a correction, a decision) shows at once.
  const newest = record.events.reduce((m, e) => Math.max(m, e.t), 0);
  const asOf = record.closure ? Math.min(Math.max(t, newest), record.closure.t) : Math.max(t, newest);
  return useMemo(() => {
    const moments = buildTimeline(record, room, asOf);
    const brief = buildBrief(record, room, moments, asOf, d.scenario ? d.phase : null, [...new Set([...dashboard, ...DEFAULT_DASHBOARD])]);
    return { moments, brief, room, asOf };
  }, [record, room, asOf, d.scenario, d.phase, dashboard]);
}

type Filter = 'all' | 'developments' | 'decisions' | 'actions';
const FILTERS: { k: Filter; label: string; kinds: StoryKind[] | null }[] = [
  { k: 'all', label: 'All', kinds: null },
  { k: 'developments', label: 'Developments', kinds: ['development'] },
  { k: 'decisions', label: 'Decisions', kinds: ['decision'] },
  { k: 'actions', label: 'Actions & results', kinds: ['action', 'result', 'verified'] },
];
const KIND: Record<string, string> = { development: 'Development', decision: 'Decision', action: 'Action', result: 'Result', verified: 'Verified' };
const MARK: Record<string, string> = { development: 'info', decision: 'check', action: 'arrowR', result: 'pulse', verified: 'check' };

/** One chronological view: a short headline per significant moment, its history and detail collapsed beneath it. */
export function TimelinePane({ record, moments }: { record: IncidentRecord; moments: Moment[] }) {
  const jump = useStore((s) => s.timelineScope);
  const focus = useStore((s) => s.storyFocus);
  const setTimeline = useStore((s) => s.setTimeline);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [on, setOn] = useState<string | null>(null);
  const [knownAt, setKnownAt] = useState<number | null>(null);
  const ref = useRef<HTMLOListElement>(null);
  const kinds = FILTERS.find((f) => f.k === filter)!.kinds;
  const q = query.trim().toLowerCase();
  const events = useMemo(() => new Map(record.events.map((e) => [e.id, e])), [record.events]);
  const text = (m: Moment) => `${m.headline} ${m.title} ${m.detail ?? ''} ${m.who ?? ''} ${m.group.map((id) => events.get(id)?.title ?? '').join(' ')}`.toLowerCase();
  const rows = moments.filter((m) => (knownAt == null || m.t <= knownAt) && (!kinds || kinds.includes(m.kind)) && (!q || text(m).includes(q)));

  // From an issue: jump to its latest moment and open its history. From a Sit. Rep link: the moment holding that event.
  useEffect(() => {
    const target = jump ? [...moments].reverse().find((m) => m.issueId === jump) : focus ? moments.find((m) => [...m.events, ...(m.also ?? []), ...m.group].includes(focus)) : undefined;
    if (!target) return;
    setFilter('all'); setQuery('');
    setOpen((s) => new Set([...s, target.id])); setOn(target.id); pinned.current = false;
    window.setTimeout(() => { const el = ref.current?.querySelector<HTMLElement>(`[data-moment="${CSS.escape(target.id)}"]`); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }); }, 0);
    setTimeline({ timelineScope: null, storyFocus: null });
  }, [jump, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  // The view opens at the latest moments and stays there as new ones arrive, unless the manager has scrolled up to read.
  // The page stays mounted between visits, so this also runs each time the Timeline tab is shown again.
  const pinned = useRef(true);
  const shown = useStore((s) => s.nav === 'sitrep');
  useLayoutEffect(() => { const el = ref.current; if (el && shown && pinned.current && !jump && !focus) el.scrollTop = el.scrollHeight; }, [shown, moments.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => { const el = ref.current; if (el && el.clientHeight > 0) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="tl2" data-testid="story">
      <div className="tl2-bar">
        <span className="seg sm" role="group" aria-label="Show">
          {FILTERS.map((f) => <button key={f.k} aria-pressed={filter === f.k} onClick={() => setFilter(f.k)} data-testid={`story-filter-${f.k}`}>{f.label}</button>)}
        </span>
        <span className="tl2-search"><Icon name="search" size={13} /><input className="input sm" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the timeline" data-testid="timeline-search" /></span>
      </div>
      {knownAt != null && <div className="tl2-known" data-testid="timeline-filter-note"><Icon name="filter" size={13} /><span>Showing what was known at {clock(knownAt)}.</span><button className="link" onClick={() => setKnownAt(null)} data-testid="known-clear">Show everything</button></div>}
      <ol className="tl2-list" ref={ref} onScroll={onScroll} data-testid="story-list">
        {rows.map((m) => {
          const expanded = open.has(m.id) || (!!q && m.group.some((id) => (events.get(id)?.title ?? '').toLowerCase().includes(q)));
          const extra = m.detail || m.title !== m.headline;
          const n = m.group.length;
          return (
            <li key={m.id} className={`tl2-m k-${m.kind} ${on === m.id ? 'on' : ''}`} tabIndex={-1} data-moment={m.id} data-testid="story-item" data-kind={m.kind} data-issue={m.issueId ?? ''} data-basis={m.basis ?? ''} data-events={[...m.events, ...(m.also ?? [])].join(' ')}>
              <time className="num">{clock(m.t)}</time>
              <span className="tl2-dot" aria-hidden="true"><Icon name={MARK[m.kind]} size={11} strokeWidth={2.4} /></span>
              <div className="tl2-b">
                <div className="tl2-h">
                  <span className="tl2-k">{KIND[m.kind]}</span>
                  {m.severity && m.kind === 'development' && (m.severity === 'critical' || m.severity === 'high') && <SeverityChip s={m.severity} />}
                  <span className="tl2-t" data-testid="moment-headline">{m.headline}</span>
                </div>
                <div className="tl2-q">
                  {m.qualifier && <span className={`tl2-qual ${m.basis === 'reported' || m.decisionOnly ? 'warn' : m.basis === 'verified' ? 'ok' : ''}`} data-testid="moment-qualifier">{m.qualifier}</span>}
                  {m.who && m.kind !== 'verified' && <span className="tl2-who">{m.kind === 'decision' ? 'by ' : (m.kind === 'action' || m.kind === 'result') && m.basis !== 'measured' ? 'reported by ' : ''}{m.who}</span>}
                  {n > 0 && <button className="tl2-more" aria-expanded={expanded} onClick={() => toggle(m.id)} data-testid="moment-toggle">{expanded ? 'Hide' : 'Show'} history and detail <span className="num">({n})</span><Icon name={expanded ? 'chevU' : 'chevD'} size={11} /></button>}
                </div>
                {expanded && (
                  <div className="tl2-group" data-testid="moment-group">
                    {extra && <p className="tl2-detail">{m.title !== m.headline ? m.title : ''}{m.detail ? `${m.title !== m.headline ? ' ' : ''}${m.kind === 'decision' ? `“${m.detail}”` : m.detail}` : ''}</p>}
                    {m.group.length > 0 && <TimelineView record={record} editable only={knownAt == null ? m.group : m.group.filter((id) => (events.get(id)?.t ?? 0) <= knownAt)} onKnownAt={setKnownAt} testId="timeline" />}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="quiet tl2-empty" data-testid="story-empty">{q ? 'Nothing matches.' : 'Nothing recorded yet.'}</li>}
      </ol>
    </div>
  );
}
