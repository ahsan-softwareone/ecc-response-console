import { useIncidentNow } from '../lib/derive';
// Situation Room: Equipment watch at the top, one worklist below it (Open issues or Incident Updates),
// and the issue's response panel on the right only while an issue is open.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Divider } from '../ui/Split';
import { useEscape } from '../ui/esc';
import { clock } from '../lib/time';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { ConditionChip, SeverityChip } from '../ui/ui';
import { IssuePanel, UpdatePanel } from './IssuePanel';
import { AnalysisChip } from './Concern';
import { outcomeOf } from '../investigate/followThrough';
import { EquipmentWatch } from './Watch';
import { ASK_LABEL, followUpDue, ORIGIN_LABEL, useRoom, type Issue, type Origin, type RoomData, type Update } from './issues';

/** Below this the Equipment watch shows the compact strip; above it, every reading. */
const STRIP_SNAP = 190;
const STRIP_MIN = 156;
const WORK_MIN = 240;

export function Situation() {
  const room = useRoom();
  const r = useStore((s) => s.room);
  const setRoom = useStore((s) => s.setRoom);
  const close = useStore((s) => s.closeRoomPanel);
  // Resolve what the drawer shows: an issue, or an update (which opens its issue when it has one).
  const upd = r.update ? room.updateById.get(r.update) ?? null : null;
  const issueId = r.issue ?? (upd && r.sub !== 'place' && (upd.place.kind === 'opens' || upd.place.kind === 'joins') ? upd.place.issueId! : null);
  const issue = issueId ? room.byId.get(issueId) ?? null : null;
  const panel = issue ? 'issue' : upd ? 'update' : null;
  const wide = !!panel && r.dock === 'wide';
  const main = useRef<HTMLDivElement>(null);
  const watch = useRef<HTMLElement>(null);

  // The drawer returns keyboard focus to whatever opened it.
  const opener = useRef<HTMLElement | null>(null);
  const key = panel ? `${panel}:${issue?.id ?? upd?.id}` : null;
  const was = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (key && !was.current) opener.current = document.activeElement as HTMLElement | null;
    if (!key && was.current) {
      const back = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>(`[data-issue="${was.current.split(':')[1]}"], [data-update="${was.current.split(':')[1]}"] button`);
      window.setTimeout(() => back?.focus(), 0);
    }
    was.current = key;
  }, [key]);
  useEscape(!!panel, close);

  // The divider between Equipment watch and the worklist. Dragging down past the strip shows every reading.
  const onDelta = useCallback((px: number) => {
    const m = main.current, w = watch.current; if (!m || !w) return;
    const h = m.clientHeight;
    const cur = w.getBoundingClientRect().height + px;
    const next = Math.max(0, Math.min(h - WORK_MIN - 12, cur)); // 12: the divider itself
    // The height follows the drag; at the strip's own height it returns to the strip, and past STRIP_SNAP every reading shows.
    setRoom({ watchFrac: next <= STRIP_MIN ? null : next / h, watch: next >= STRIP_SNAP });
  }, [setRoom]);

  return (
    <div className="sr" data-testid="dock" data-panel={panel ?? 'none'} data-dock={panel ? r.dock : ''}>
      <RoomBar room={room} issue={issue} upd={panel === 'update' ? upd : null} />
      <div className="sr-body">
        <div className="sr-main" data-testid="room-mid" ref={main}>
          <EquipmentWatch ref={watch} />
          <Divider orientation="horizontal" onDelta={onDelta} onReset={() => setRoom({ watchFrac: null, watch: false })} label="Resize Equipment watch and the worklist" testId="divider-y" className="sr-divider" />
          <Worklist room={room} issue={issue} current={issue?.id ?? null} currentUpdate={panel === 'update' ? upd?.id ?? null : null} />
        </div>
      </div>
      {panel && (
        <div className="sr-drawer-back side-sheet-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-testid="drawer-backdrop">
          <div className={`sr-dock side-sheet ${wide ? 'wide' : ''}`} data-testid="room-dock">
            {panel === 'issue' && issue && <IssuePanel key={issue.id} issue={issue} room={room} focus={r.focus} />}
            {panel === 'update' && upd && <UpdatePanel key={upd.id} u={upd} room={room} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Where you are, and the way back to the briefing. */
function RoomBar({ room, issue, upd }: { room: RoomData; issue: Issue | null; upd: Update | null }) {
  const setNav = useStore((s) => s.setNav);
  const from = useStore((s) => s.overview.fromOverview);
  const quick = useStore((s) => s.overview.quick);
  const close = useStore((s) => s.closeRoomPanel);
  const needs = room.open.filter((i) => ['decision', 'respond', 'verify'].includes(i.ask)).length;
  return (
    <div className="sr-bar" data-testid="room-bar">
      <nav className="sr-crumbs" aria-label="Breadcrumb">
        <button className={`sr-crumb-back ${from ? 'from' : ''}`} onClick={() => setNav('overview')} data-testid={from ? 'ov-return-btn' : 'room-to-overview'} title={from ? 'Return to the briefing where you left it' : 'Go to the Incident Overview'}>
          {from ? <><span aria-hidden="true">←</span> Back to Overview{quick ? ' (Quick detail)' : ''}</> : <><Icon name="chevL" size={13} />Overview</>}
        </button>
        <span className="sr-sep" aria-hidden="true">/</span>
        {issue || upd ? <button className="sr-crumb" onClick={close} data-testid="crumb-room">Situation Room</button> : <span className="sr-crumb here" aria-current="page">Situation Room</span>}
        {(issue || upd) && <><span className="sr-sep" aria-hidden="true">/</span><span className="sr-crumb here" aria-current="page" data-testid="crumb-issue">{issue ? issue.title : 'Update'}</span></>}
      </nav>
      <span className="spacer" />
      <span className="sr-counts" data-testid="room-counts">
        <b>{room.open.length}</b> open {room.open.length === 1 ? 'issue' : 'issues'}
        {needs > 0 && <> · <b>{needs}</b> need you</>}
        {room.review.length > 0 && <> · <b>{room.review.length}</b> about closed issues</>}
      </span>
    </div>
  );
}

const SEV_RANK = { critical: 'crit', high: 'high', medium: 'med', low: 'low' } as const;
const ACTION: Record<Issue['ask'], string> = { decision: 'Review response', deferred: 'Review response', respond: 'Record a response', field: 'Record field report', verify: 'Review verification', close: 'Review and close', closed: 'View record' };

/** One worklist, two views of the same incident: what needs attention, and what came in. */
/** Below this width the worklist uses tabs even when Split view is chosen; two panes would be too narrow to read. */
const SPLIT_MIN = 900;

function Worklist({ room, issue, current, currentUpdate }: { room: RoomData; issue: Issue | null; current: string | null; currentUpdate: string | null }) {
  const view = useStore((s) => (s.room.view === 'updates' ? 'updates' : 'issues'));
  const setRoom = useStore((s) => s.setRoom);
  const list = useStore((s) => s.room.list);
  const layout = useStore((s) => s.room.layout ?? 'tabs');
  const frac = useStore((s) => s.room.splitFrac ?? 0.46);
  const pickId = useStore((s) => s.room.pick ?? null);
  const feedMode = useStore((s) => s.room.feedMode ?? 'all');
  // The worklist's own width decides whether two panes fit. Tabs and Split render different elements, so watch whichever is current.
  const ref = useRef<HTMLElement | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const [w, setW] = useState(1200);
  const setRef = useCallback((el: HTMLElement | null) => { ro.current?.disconnect(); ref.current = el; if (el) { ro.current = new ResizeObserver(() => setW(el.clientWidth)); ro.current.observe(el); setW(el.clientWidth); } }, []);
  useEffect(() => { const on = () => { if (ref.current) setW(ref.current.clientWidth); }; window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  const narrow = w < SPLIT_MIN;
  const split = layout === 'split' && !narrow;
  // The selected issue: the one picked in the list, else the one open in the drawer.
  const picked = (pickId ? room.byId.get(pickId) : null) ?? issue;
  const control = (
    <span className="seg sm sr-layout" role="group" aria-label="Worklist layout" title={layout === 'split' && narrow ? 'Too narrow for Split view; showing tabs' : undefined}>
      <button aria-pressed={!split} onClick={() => setRoom({ layout: 'tabs' })} data-testid="layout-tabs" title="Tabbed view: one list at a time">Tabs</button>
      <button aria-pressed={split} onClick={() => setRoom({ layout: 'split' })} disabled={narrow} data-testid="layout-split" title={narrow ? 'Needs a wider window' : 'Split view: Open issues beside Incident Updates'}>Split</button>
    </span>
  );
  const listSeg = (
    <span className="seg sm" role="group" aria-label="Show open or closed issues">
      <button aria-pressed={list === 'open'} onClick={() => setRoom({ list: 'open' })} data-testid="list-open">Open <span className="num">{room.open.length}</span></button>
      <button aria-pressed={list === 'closed'} onClick={() => setRoom({ list: 'closed' })} data-testid="list-closed">Closed <span className="num">{room.closed.length}</span></button>
    </span>
  );
  if (split) {
    // Read the current share on every step of a drag; a value captured at render would lose the steps in between.
    const onDelta = (px: number) => { const total = ref.current?.clientWidth ?? 1000; const cur = useStore.getState().room.splitFrac ?? 0.46; setRoom({ splitFrac: Math.min(0.7, Math.max(0.3, cur + px / total)) }); };
    // Two panels with a 14 px gutter of page background between them; each keeps a readable minimum as the divider moves.
    const cols = `minmax(340px, ${frac}fr) 14px minmax(380px, ${1 - frac}fr)`;
    return (
      <section className="sr-work split" ref={setRef} aria-label="Incident worklist" data-testid="worklist" data-view="split" data-layout="split">
        <div className="sr-split-bar" data-testid="split-bar"><span className="sidenote">Open issues beside Incident Updates</span><span className="spacer" />{control}</div>
        <div className="sr-split" style={{ gridTemplateColumns: cols }}>
          <div className="sr-pane" data-testid="pane-issues">
            <header className="sr-work-h sr-pane-h">
              <h3 className="sr-pane-t">{list === 'open' ? 'Open issues' : 'Closed issues'} <span className="num">{list === 'open' ? room.open.length : room.closed.length}</span></h3>
              <span className="spacer" />{listSeg}
            </header>
            <IssueList room={room} current={current} currentUpdate={currentUpdate} split picked={picked?.id ?? null} />
          </div>
          <Divider orientation="vertical" onDelta={onDelta} onReset={() => setRoom({ splitFrac: 0.46 })} label="Resize Open issues and Incident Updates" testId="divider-split" className="sr-split-div" />
          <div className="sr-pane" data-testid="pane-updates">
            <header className="sr-work-h sr-pane-h">
              <h3 className="sr-pane-t">Incident Updates <span className="num">{room.updates.length}</span></h3>
              <span className="spacer" />
              {picked && (
                <span className="seg sm" role="group" aria-label="Which updates">
                  <button aria-pressed={feedMode === 'issue'} onClick={() => setRoom({ feedMode: 'issue' })} data-testid="feed-this-issue" title={`Only the updates in “${picked.title}”`}>This issue</button>
                  <button aria-pressed={feedMode !== 'issue'} onClick={() => setRoom({ feedMode: 'all' })} data-testid="feed-all">All updates</button>
                </span>
              )}
            </header>
            <Feed room={room} issue={picked} only={feedMode === 'issue' ? picked : null} />
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="sr-work" ref={setRef} aria-label="Incident worklist" data-testid="worklist" data-view={view} data-layout="tabs">
      <header className="sr-work-h">
        <div className="sr-views" role="tablist" aria-label="Worklist view">
          <button role="tab" aria-selected={view === 'issues'} onClick={() => setRoom({ view: 'issues' })} data-testid="view-issues">Open issues <span className="num">{room.open.length}</span>{room.review.length > 0 && <span className="sr-views-n" title={`${room.review.length} new ${room.review.length === 1 ? 'update is' : 'updates are'} about an issue you closed`}>+{room.review.length} closed</span>}</button>
          <button role="tab" aria-selected={view === 'updates'} onClick={() => setRoom({ view: 'updates' })} data-testid="view-updates">Incident Updates <span className="num">{room.updates.length}</span></button>
        </div>
        <span className="sidenote sr-work-note">{view === 'issues' ? 'What needs a decision, a check or follow-up' : 'What came in, and where it went'}</span>
        <span className="spacer" />
        {view === 'issues' && listSeg}
        {control}
      </header>
      {view === 'issues' ? <IssueList room={room} current={current} currentUpdate={currentUpdate} /> : <Feed room={room} issue={issue} />}
    </section>
  );
}

function IssueList({ room, current, currentUpdate, split, picked }: { room: RoomData; current: string | null; currentUpdate: string | null; split?: boolean; picked?: string | null }) {
  const setRoom = useStore((s) => s.setRoom);
  const list = useStore((s) => s.room.list);
  const openIssue = useStore((s) => s.openIssue);
  const openUpdate = useOpenUpdate();
  const items = list === 'open' ? room.open : room.closed;
  const t = useIncidentNow(5000);
  return (
    <div className="sr-list-b" data-testid="issue-list" data-list={list}>
      {list === 'open' && room.review.length > 0 && (
        <div className="sr-review" data-testid="review-list">
          <div className="sr-review-h"><Icon name="warn" size={13} />About closed issues <span className="num">{room.review.length}</span><span className="sidenote">New updates about issues you closed. Reopen the issue, or keep it closed.</span></div>
          {room.review.map((u) => (
            <button key={u.id} className={`sr-review-row ${currentUpdate === u.id ? 'on' : ''}`} onClick={() => openUpdate(u.id)} aria-current={currentUpdate === u.id || undefined} data-testid="review-item" data-id={u.id}>
              <OriginTag o={u.origin} /><span className="t">{u.plain}</span><span className="m num">{clock(u.t)}{u.place.closedIssue && room.byId.get(u.place.closedIssue) ? ` · “${room.byId.get(u.place.closedIssue)!.title}”` : ''}</span>
              <span className="go">Decide →</span>
            </button>
          ))}
        </div>
      )}
      {items.map((i) => split ? (
        // Split view: choosing a card selects it and highlights its updates; Review response opens the drawer.
        <div key={i.id} role="button" tabIndex={0} className={`sr-issue split ${picked === i.id ? 'picked' : ''} ${current === i.id ? 'on' : ''}`} data-sev={i.severity && !i.closed ? SEV_RANK[i.severity] : 'none'} onClick={() => setRoom({ pick: picked === i.id ? null : i.id })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRoom({ pick: picked === i.id ? null : i.id }); } }} aria-pressed={picked === i.id} data-testid="issue-card" data-issue={i.id} data-ask={i.ask}>
          <span className="sr-issue-c">
            <span className="sr-issue-f">
              <span className={`sr-ask ask-${i.ask}`} data-testid="issue-ask">{ASK_LABEL[i.ask]}</span>
              {i.severity && list === 'open' && <SeverityChip s={i.severity} />}
              <span className="sr-issue-tags">{i.equipment.join(' · ')}</span>
              {list === 'open' && followUpDue(i, t) && <span className="sr-due" data-testid="issue-followup" title={`No field update since ${followUpDue(i, t)!.contact.to} was told at ${clock(followUpDue(i, t)!.since)}`}>Follow-up due</span>}
              {list === 'open' && (i.fresh ? <span className="sr-new" data-testid="issue-new">New</span> : i.unseen > 0 ? <span className="sr-new" data-testid="issue-new">{i.unseen} new</span> : null)}
            </span>
            <span className="sr-issue-t">{i.title}</span>
            {i.lead.plain.replace(/…$/, '') !== i.title.replace(/…$/, '') && !i.lead.plain.startsWith(i.title.replace(/…$/, '')) && <span className="sr-issue-m">{i.lead.plain}</span>}
          </span>
          <span className="sr-issue-a">
            <button className="go link" onClick={(e) => { e.stopPropagation(); openIssue(i.id); }} data-testid="issue-open">{ACTION[i.ask]} →</button>
            <span className="sidenote num">{i.updates.length} {i.updates.length === 1 ? 'update' : 'updates'} · {list === 'open' ? `latest ${clock(i.latest.t)}` : `closed ${clock(i.closed!.t)}`}</span>
          </span>
        </div>
      ) : (
        <button key={i.id} className={`sr-issue ${current === i.id ? 'on' : ''}`} data-sev={i.severity && !i.closed ? SEV_RANK[i.severity] : 'none'} onClick={() => openIssue(i.id)} aria-current={current === i.id || undefined} data-testid="issue-card" data-issue={i.id} data-ask={i.ask}>
          <span className="sr-issue-c">
            <span className="sr-issue-f">
              <span className={`sr-ask ask-${i.ask}`} data-testid="issue-ask">{ASK_LABEL[i.ask]}</span>
              {i.severity && list === 'open' && <SeverityChip s={i.severity} />}
              <span className="sr-issue-tags">{i.equipment.join(' · ')}</span>
              {list === 'open' && followUpDue(i, t) && <span className="sr-due" data-testid="issue-followup" title={`No field update since ${followUpDue(i, t)!.contact.to} was told at ${clock(followUpDue(i, t)!.since)}`}>Follow-up due</span>}
              {list === 'open' && (i.fresh ? <span className="sr-new" data-testid="issue-new">New</span> : i.unseen > 0 ? <span className="sr-new" data-testid="issue-new">{i.unseen} new</span> : null)}
            </span>
            <span className="sr-issue-t">{i.title}</span>
            {i.lead.plain.replace(/…$/, '') !== i.title.replace(/…$/, '') && !i.lead.plain.startsWith(i.title.replace(/…$/, '')) && <span className="sr-issue-m">{i.lead.plain}</span>}
          </span>
          <span className="sr-issue-a">
            <span className="go">{ACTION[i.ask]} →</span>
            <span className="sidenote num">{i.updates.length} {i.updates.length === 1 ? 'update' : 'updates'} · {list === 'open' ? `latest ${clock(i.latest.t)}` : `closed ${clock(i.closed!.t)}`}</span>
          </span>
        </button>
      ))}
      {items.length === 0 && <p className="quiet sr-empty" data-testid="issue-empty">{list === 'open' ? (room.review.length ? 'No open issues. Decide on the updates above.' : 'No open issues. Updates that need a decision, a check or follow-up appear here.') : 'No closed issues yet. A closed issue stays here and can be reopened.'}</p>}
    </div>
  );
}

const ORIGIN_ICON: Record<Origin, string> = { monitoring: 'pulse', field: 'person', agent: 'spark', person: 'person' };
export function OriginTag({ o }: { o: Origin }) { return <span className={`sr-origin o-${o}`} data-origin={o}><Icon name={ORIGIN_ICON[o]} size={11} />{ORIGIN_LABEL[o]}</span>; }

/** The source beyond its origin tag, e.g. "Fire team leader"; nothing when it would only repeat the tag. */
export const srcOf = (u: Update) => { const x = u.source.replace(/^Monitoring( · )?/, '').replace(/^Field · /, '').replace(/^Reported in ECC · /, ''); return x === 'ECC agent' ? '' : x; };
const ORIGIN_FILTER = { all: null, monitoring: ['monitoring'], people: ['field', 'person'], agent: ['agent'] } as const;

function Feed({ room, issue, only }: { room: RoomData; issue: Issue | null; only?: Issue | null }) {
  const r = useStore((s) => s.room);
  const setRoom = useStore((s) => s.setRoom);
  const openUpdate = useOpenUpdate();
  const openIssue = useStore((s) => s.openIssue);
  // Narrowed to one issue from its drawer (Show only these in Incident Updates); the chip clears it.
  const scoped = only ?? (r.feedIssue ? room.byId.get(r.feedIssue) ?? null : null);
  const scope = scoped ? new Set(scoped.updates.map((u) => u.id)) : null;
  void issue;
  const of = ORIGIN_FILTER[r.origin] as readonly Origin[] | null;
  // Narrowed to one piece of equipment from its bell or count; the chip clears it.
  const eq = r.feedEquipment ?? null;
  const rows = room.updates.filter((u) => (!scope || scope.has(u.id)) && (!eq || u.equipmentId === eq) && (!of || of.includes(u.origin)));
  const inIssue = issue ? new Set(issue.updates.map((u) => u.id)) : null;
  // A filter must never quietly hide what is critical: say how many critical alerts it hides.
  const hiddenCrit = room.updates.filter((u) => u.severity === 'critical' && !rows.includes(u)).length;
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => { if (!r.focus) return; ref.current?.querySelector(`[data-update="${r.focus}"]`)?.scrollIntoView({ block: 'nearest' }); }, [r.focus]);
  useEffect(() => { if (eq && ref.current) ref.current.scrollTop = 0; }, [eq]);
  return (
    <div className="sr-feed" data-testid="feed">
      <div className="sr-feedbar">
        <span className="seg sm" role="group" aria-label="Show updates from">
          {(['all', 'monitoring', 'people', 'agent'] as const).map((k) => <button key={k} aria-pressed={r.origin === k} onClick={() => setRoom({ origin: k })} data-testid={`origin-${k}`}>{k === 'all' ? 'All' : k === 'monitoring' ? 'Monitoring' : k === 'people' ? 'Field and people' : 'ECC agent'}</button>)}
        </span>
        {hiddenCrit > 0 && <button className="hiddenind" onClick={() => setRoom({ origin: 'all', feedIssue: null, feedEquipment: null })} title="Critical alerts this filter hides. Select to show all updates." data-testid="feed-hidden-critical"><Icon name="warn" size={12} />{hiddenCrit} critical hidden</button>}
        {eq && <button className="sr-scope on" onClick={() => setRoom({ feedEquipment: null })} title="Show updates for all equipment" data-testid="feed-equipment"><Icon name="filter" size={12} />Only {eq} <span className="num">({rows.length})</span><Icon name="close" size={11} /></button>}
        {scoped && <button className="sr-scope on" onClick={() => setRoom({ feedIssue: null })} title="Show updates from every issue" data-testid="feed-scope"><Icon name="filter" size={12} />Only “{scoped.title}”<Icon name="close" size={11} /></button>}
      </div>
      <ol className="sr-rows" ref={ref} data-testid="feed-rows">
        {rows.map((u) => {
          const iss = u.place.issueId ? room.byId.get(u.place.issueId) : undefined;
          return (
            <li key={u.id} className={`sr-row ${inIssue?.has(u.id) ? 'in' : ''} ${r.focus === u.id ? 'focus' : ''}`} data-update={u.id} data-origin={u.origin} data-place={u.place.kind}>
              <button className="sr-row-main" onClick={() => openUpdate(u.id)} data-testid={u.origin === 'monitoring' ? `alert-${u.id}` : `update-${u.id}`} data-severity={u.severity} data-condition={u.condition} data-time={u.t} aria-label={`${clock(u.t)}, ${ORIGIN_LABEL[u.origin]}: ${u.plain}`}>
                <time className="num">{clock(u.t)}</time>
                <span className="sr-row-c">
                  <span className="sr-row-m"><OriginTag o={u.origin} />{u.severity && <SeverityChip s={u.severity} />}{u.condition && u.condition !== 'active' && <span data-testid="condition"><ConditionChip c={u.condition} /></span>}{u.condition === 'active' && <span className="sr-only" data-testid="condition">Active</span>}{u.equipmentId && <b>{u.equipmentId}</b>}{srcOf(u) && <span className="src">{srcOf(u)}</span>}</span>
                  {u.invId && <InvStatus id={u.invId} />}
                  <span className="sr-row-t">{u.plain}{u.late && <span className="late" title={`Occurred ${clock(u.t)}; the agent analysed it at ${clock(u.late)} because it was not running`} data-testid={`late-${u.id}`}>analysed {clock(u.late)}</span>}</span>
                </span>
              </button>
              <div className={`sr-place ${u.place.kind}`} data-testid="placement">
                {u.place.kind === 'review' ? <button className="sr-place-btn" onClick={() => openUpdate(u.id)}><Icon name="warn" size={12} />About a closed issue{u.place.closedIssue && room.byId.get(u.place.closedIssue) ? `: “${room.byId.get(u.place.closedIssue)!.title}”` : ''}</button>
                  : u.place.kind === 'info' ? <span>Information only{u.place.by === 'person' ? ` · placed by ${u.place.who}` : ''}</span>
                  : <button className="sr-place-btn" onClick={() => openIssue(u.place.issueId!, { focus: u.id })}><Icon name="arrowR" size={11} />{u.place.kind === 'opens' ? 'Opened issue' : 'Added to'} “{iss?.title ?? u.place.issueId}”{u.place.by === 'person' ? ` · by ${u.place.who}` : ''}{iss?.closed ? ' · closed' : ''}</button>}
                {u.place.kind !== 'review' && <button className="sr-move" onClick={() => { openUpdate(u.id); setRoom({ sub: 'place' }); }} title="Move this update to another issue, a new issue or information only" data-testid="placement-move">Move</button>}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="quiet sr-empty" data-testid="feed-empty">{room.updates.length ? 'No updates match. ' : 'No updates yet. Monitoring alerts, field reports and ECC findings appear here as they arrive.'}{room.updates.length > 0 && <button className="link" onClick={() => setRoom({ origin: 'all', feedIssue: null, feedEquipment: null })}>Show all updates</button>}</li>}
      </ol>
    </div>
  );
}

/** For a report made in ECC: where ECC's assessment of it stands, and what it concluded. */
function InvStatus({ id }: { id: string }) {
  const inv = useStore((s) => s.records[s.incidentId]?.investigations?.find((x) => x.id === id));
  if (!inv) return null;
  const o = outcomeOf(inv);
  return <span className="sr-row-a"><AnalysisChip inv={inv} />{o && <span className="sidenote" data-testid="observation-outcome">{o.label}</span>}</span>;
}

/** Open an update. An alert is selected and marked read, and a report made in ECC is selected, as they are everywhere else. */
export function useOpenUpdate() {
  const openUpdate = useStore((s) => s.openUpdate);
  const selectAlert = useStore((s) => s.selectAlert);
  const selectConcern = useStore((s) => s.selectConcern);
  return (id: string) => {
    if (/^a\d/.test(id)) selectAlert(id);
    else if (id.startsWith('inv-')) selectConcern(id.slice(4));
    else openUpdate(id);
  };
}
