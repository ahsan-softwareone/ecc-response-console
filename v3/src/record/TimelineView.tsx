import { useEffect, useMemo, useState } from 'react';
import { clock, dateTime, now } from '../lib/time';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { Popover, SeverityChip } from '../ui/ui';
import { Citation } from '../ui/Citation';
import { CATEGORIES, CATEGORY, gapStatus, timeline, type Category } from './timeline';
import type { MeasurementEvent } from './types';
import type { IncidentRecord, PinnedEvidence, RecordEvent } from './types';

const SEV_CATS = new Set<Category>(['Alert']);

export function EvidenceChips({ evidence, origin }: { evidence?: PinnedEvidence[]; origin: string }) {
  if (!evidence?.length) return null;
  return (
    <div className="evs" style={{ marginTop: 6 }} data-testid="timeline-evidence-list">
      {evidence.map((e, i) => <Citation key={i} cite={{ docId: e.docId, revision: e.revision, page: e.page, label: e.label, quote: e.quote, region: e.region, locate: e.locate, title: e.title, number: e.number }} origin={origin} testId="timeline-evidence" />)}
    </div>
  );
}

export function TimelineView({ record, editable, onCountChange, testId = 'timeline' }: { record: IncidentRecord; editable?: boolean; onCountChange?: (shown: number, total: number, filtered: boolean) => void; testId?: string }) {
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<Category[]>([]);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [newestFirst, setNewestFirst] = useState(true);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correction, setCorrection] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const gaps = useMemo(() => gapStatus(record, now()), [record]);
  const addCorrection = useStore((s) => s.addCorrection);
  const rows = useMemo(() => timeline(record, { query, categories: cats, asOf: asOf ?? undefined }, newestFirst), [record, query, cats, asOf, newestFirst]);
  const filtered = !!(query || cats.length || asOf != null);
  const total = record.events.length;
  useEffect(() => { onCountChange?.(rows.length, total, filtered); }, [rows.length, total, filtered, onCountChange]);
  const present = CATEGORIES.filter((c) => record.events.some((e) => CATEGORY[e.kind] === c));

  return (
    <div className="tlv" data-testid={testId} data-shown={rows.length} data-total={total} data-filtered={filtered}>
      <div className="tlv-bar">
        <div className="search" style={{ border: 0, padding: 0, flex: 1 }}><Icon name="search" size={15} /><input className="input" placeholder="Search the timeline" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="timeline-search" /></div>
        <Popover width={260} trigger={(open, toggle) => <button className={`btn sm ${cats.length ? 'primary' : ''}`} onClick={toggle} aria-expanded={open} data-testid="timeline-filter"><Icon name="filter" size={13} /> {cats.length ? `${cats.length} categories` : 'Categories'}</button>}>
          {() => (
            <>
              {present.map((c) => <button key={c} className="item" onClick={() => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))} data-testid={`cat-${c}`}>{cats.includes(c) ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />}{c}</button>)}
              {cats.length > 0 && <><div className="sep" /><button className="item" onClick={() => setCats([])}>Clear categories</button></>}
            </>
          )}
        </Popover>
        <button className="btn sm" onClick={() => setNewestFirst((v) => !v)} title="Toggle order">{newestFirst ? 'Newest first' : 'Oldest first'}</button>
      </div>
      {(filtered || asOf != null) && (
        <div className="tlv-note" data-testid="timeline-filter-note">
          <Icon name="filter" size={13} />
          <span>Showing {rows.length} of {total} entries{asOf != null ? ` known at ${clock(asOf)}` : ''}. Downloads and exports always include all {total}.</span>
          <button className="link" style={{ marginLeft: 'auto' }} onClick={() => { setQuery(''); setCats([]); setAsOf(null); }}>Clear</button>
        </div>
      )}
      <div className="tl-list">
        {rows.map(({ ev, category, correctedBy }) => (
          <div key={ev.id} className={`tl ${correctedBy ? 'corrected' : ''} ${ev.kind === 'correction' ? 'is-correction' : ''}`} data-testid="timeline-row" data-kind={ev.kind} data-time={ev.t}>
            <div className="t" title={dateTime(ev.t)}>{clock(ev.t)}</div>
            <div className="c">{category}{SEV_CATS.has(category) && 'severity' in ev && <> <SeverityChip s={(ev as { severity: 'critical' | 'high' | 'medium' | 'low' }).severity} /></>}</div>
            <div>
              <div className="tl-title">{ev.title}{ev.kind === 'gap' && gaps.get(ev.id) && gaps.get(ev.id) !== 'open' && <span className="chip outline" style={{ marginLeft: 8 }} data-testid="gap-status">{gaps.get(ev.id) === 'resolved' ? 'Resolved' : 'No longer applicable'}</span>}</div>
              {ev.kind === 'measurement' && (
                <div className="m wrap" data-testid="measurement-changes">
                  {((ev as MeasurementEvent).changes ?? []).map((c, i) => <div key={i}>{c}</div>)}
                  {expanded.has(ev.id) ? <div style={{ marginTop: 4 }} data-testid="measurement-full">{(ev as MeasurementEvent).values.map((v) => `${v.watcherId.replace(':', ' ')} ${v.value}${v.unit === 'status' ? '' : ` ${v.unit}`}`).join(' · ')}</div> : <button className="link" style={{ fontSize: 11.5 }} onClick={() => setExpanded((x) => new Set([...x, ev.id]))} data-testid="measurement-expand">All {(ev as MeasurementEvent).values.length} values</button>}
                </div>
              )}
              {ev.detail && ev.kind !== 'measurement' && <div className="m wrap" style={{ whiteSpace: 'pre-line' }}>{ev.detail}</div>}
              <div className="m">{[ev.by, ev.equipmentId, ev.source === 'agent' ? 'ECC agent' : ev.source === 'system' ? 'System' : null].filter(Boolean).join(' · ')}</div>
              <EvidenceChips evidence={ev.evidence} origin={`${record.id} · ${ev.title}`} />
              {ev.kind === 'knowledge' && ev.meta?.docId && <div className="evs" style={{ marginTop: 6 }}><Citation cite={{ docId: String(ev.meta.docId), revision: String(ev.meta.revision) }} origin={`${record.id} · ${ev.title}`} testId="knowledge-cite" /></div>}
              {ev.kind === 'decision' && <button className="link" style={{ fontSize: 11.5 }} onClick={() => setAsOf(ev.t)} data-testid="known-at">Show what was known at {clock(ev.t)} ({(ev as { knownEventCount?: number }).knownEventCount ?? '…'} entries)</button>}
              {correctedBy && <div className="m" style={{ color: 'var(--high-ink)' }}>Corrected {clock(correctedBy.t)}: {correctedBy.title} — original retained above</div>}
              {editable && ev.kind !== 'correction' && !correctedBy && (
                correcting === ev.id ? (
                  <div className="decision" style={{ marginTop: 6 }}>
                    <textarea className="textarea" placeholder="Corrected statement (the original stays in the record)" value={correction} onChange={(e) => setCorrection(e.target.value)} data-testid="correction-text" />
                    <div className="row"><button className="btn primary sm" disabled={!correction.trim()} onClick={() => { void addCorrection(record.id, ev.id, correction.trim()); setCorrecting(null); setCorrection(''); }} data-testid="correction-save">Append correction</button><button className="btn sm" onClick={() => setCorrecting(null)}>Cancel</button></div>
                  </div>
                ) : <button className="link correct-link" style={{ fontSize: 11.5 }} onClick={() => setCorrecting(ev.id)} data-testid="correct-btn">Correct</button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">No entries match</div>}
      </div>
    </div>
  );
}

export function isUserEvent(e: RecordEvent) { return e.source === 'user'; }
