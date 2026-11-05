import { useMemo, useState } from 'react';
import { EMERGENCY_META, HISTORY } from '../data/scenario';
import { useDerived } from '../lib/derive';
import { clock, dateTime, elapsedParts, pad2 } from '../lib/time';
import { useStore } from '../store';
import { Icon } from '../ui/Icon';
import { SeverityChip } from '../ui/ui';

type Cat = 'Notification' | 'Equipment' | 'Report / reading' | 'Finding' | 'Recommendation' | 'Decision' | 'Field action' | 'Outcome' | 'SITREP' | 'Stabilization';
interface Row { t: number; cat: Cat; text: string; meta?: string; sev?: 'critical' | 'high' | 'medium' | 'low' }

export function Records() {
  const view = useStore((s) => s.recordsView);
  const setRecordsView = useStore((s) => s.setRecordsView);
  return (
    <div className="page" data-testid="page-records" style={{ flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="seg">
          <button aria-pressed={view === 'current'} onClick={() => setRecordsView('current')} data-testid="records-current">Current emergency</button>
          <button aria-pressed={view === 'history'} onClick={() => setRecordsView('history')} data-testid="records-history">Historical emergencies</button>
        </span>
      </div>
      {view === 'current' ? <CurrentRecord /> : <History />}
    </div>
  );
}

function CurrentRecord() {
  const d = useDerived();
  const startedAt = useStore((s) => s.startedAt);
  const alertUser = useStore((s) => s.alertUser);
  const versions = useStore((s) => s.sitrepVersions);
  const dashboard = useStore((s) => s.dashboard);
  const [cat, setCat] = useState<Cat | 'All'>('All');

  const rows = useMemo(() => {
    const out: Row[] = [];
    out.push({ t: startedAt, cat: 'Notification', text: `Initial notification: ${EMERGENCY_META.title}`, meta: `${EMERGENCY_META.facility} · reported by ${EMERGENCY_META.reportedBy}` });
    out.push({ t: startedAt + 25_000, cat: 'Equipment', text: `Relevant equipment: ${dashboard.join(', ')}`, meta: 'Propane recovery · Inlet separation · Relief and flare' });
    for (const o of d.observations) out.push({ t: o.time, cat: 'Report / reading', text: o.text, meta: `${o.source} · ${o.evidence}` });
    for (const f of d.findings) out.push({ t: f.time, cat: 'Finding', text: f.text, meta: `Assessment revision${f.supersedes ? ` · supersedes earlier` : ''}` });
    for (const a of d.alerts) {
      if (a.def.recommendation) out.push({ t: a.time, cat: 'Recommendation', text: a.def.recommendation.summary, meta: `${a.def.equipmentId} · ${a.def.title} · evidence: ${a.def.recommendation.evidence.map((e) => `${d.docById.get(e.docId)?.number} Rev ${e.revision}`).join(', ')}${a.supersededBy ? ` · superseded ${clock(a.supersededBy.time)} by: ${d.alertById.get(a.supersededBy.alertId)?.def.title}` : ''}`, sev: a.def.severity });
      const u = alertUser[a.id];
      if (u?.decision) out.push({ t: u.decision.at, cat: 'Decision', text: `${u.decision.status === 'approved' ? 'Approved' : u.decision.status === 'deferred' ? 'Deferred' : 'Declined'}: ${u.decision.recommendationSummary}`, meta: `${u.decision.by}${u.decision.rationale ? ` · ${u.decision.rationale}` : ''} · evidence at decision: ${u.decision.evidenceUsed.map((e) => `${d.docById.get(e.docId)?.number} Rev ${e.revision}`).join(', ') || 'none'}${a.supersededBy && a.supersededBy.time > u.decision.at ? ` · recommendation superseded ${clock(a.supersededBy.time)}, after this decision — review` : ''}` });
      for (const r of u?.reports ?? []) out.push({ t: r.at, cat: 'Field action', text: r.text, meta: `${r.by} · ${r.status}` });
      if (a.condition === 'cleared' && a.clearedAt) out.push({ t: a.clearedAt, cat: 'Outcome', text: `Cleared: ${a.def.title}`, meta: a.clearedBy ? `By: ${d.alertById.get(a.clearedBy)?.def.title}` : undefined });
    }
    for (const r of d.fieldReports) out.push({ t: r.time, cat: 'Field action', text: r.text, meta: `${r.by} · ${r.status}` });
    for (const s of d.steps) if (s.sitrep) out.push({ t: d.stepEnd(s.index), cat: 'SITREP', text: `Agent draft (step ${s.index})`, meta: s.sitrep.situation });
    for (const v of versions) out.push({ t: v.status === 'approved' ? v.approvedAt! : v.createdAt, cat: 'SITREP', text: `SITREP ${v.number} ${v.status === 'approved' ? 'approved' : 'in review'}`, meta: v.approvedBy ? `by ${v.approvedBy}` : v.author });
    if (d.phase === 'Stabilizing') out.push({ t: d.stepEnd(d.stepIndex), cat: 'Stabilization', text: 'Stabilizing: criteria to be agreed with the Incident Manager. Closure and post-incident review pending.', meta: 'Not SME-validated' });
    const now = Date.now();
    return out.filter((r) => r.t <= now).sort((a, b) => b.t - a.t);
  }, [d, startedAt, alertUser, versions, dashboard]);

  const cats: (Cat | 'All')[] = ['All', 'Notification', 'Equipment', 'Report / reading', 'Finding', 'Recommendation', 'Decision', 'Field action', 'Outcome', 'SITREP', 'Stabilization'];
  const shown = cat === 'All' ? rows : rows.filter((r) => r.cat === cat);
  const decisions = rows.filter((r) => r.cat === 'Decision').length;
  const { h, m } = elapsedParts(Date.now() - startedAt);

  return (
    <div className="pane grow" data-testid="record-current" style={{ flex: 1 }}>
      <div className="pane-h"><span className="title">{EMERGENCY_META.facility} · {EMERGENCY_META.title}</span><span className="chip mode-training">Training scenario</span><span className="spacer" /><span className="sidenote">Started {dateTime(startedAt)} · {pad2(h)} h {pad2(m)} m · {d.phase}</span></div>
      <div className="stats">
        <div className="stat"><span className="v num">{d.alerts.length}</span><span className="l">Alerts</span></div>
        <div className="stat"><span className="v num">{d.findings.length}</span><span className="l">Assessment revisions</span></div>
        <div className="stat"><span className="v num">{decisions}</span><span className="l">Decisions recorded</span></div>
        <div className="stat"><span className="v num">{rows.filter((r) => r.cat === 'Field action').length}</span><span className="l">Field actions</span></div>
        <div className="stat"><span className="v num">{versions.filter((v) => v.status === 'approved').length}</span><span className="l">SITREPs approved</span></div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 20px', borderBottom: '1px solid var(--line)' }}>
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'accent' : 'soft'}`} onClick={() => setCat(c)} style={{ cursor: 'pointer' }}>{c}</button>)}
      </div>
      <div className="pane-b">
        <div className="timeline" style={{ padding: '4px 20px' }}>
          {shown.map((r, i) => (
            <div key={i} className="tl">
              <div className="t">{clock(r.t)}</div>
              <div className="c">{r.cat}{r.sev && <> <SeverityChip s={r.sev} /></>}</div>
              <div><div>{r.text}</div>{r.meta && <div className="m">{r.meta}</div>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function History() {
  const [q, setQ] = useState('');
  const historyId = useStore((s) => s.historyId);
  const setRecordsView = useStore((s) => s.setRecordsView);
  const items = HISTORY.filter((h) => !q.trim() || `${h.title} ${h.location} ${h.equipment.join(' ')} ${h.summary} ${h.mode}`.toLowerCase().includes(q.trim().toLowerCase()));
  const cur = HISTORY.find((h) => h.id === historyId) ?? items[0];
  return (
    <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
      <div className="pane w-side">
        <div className="pane-h"><span className="title">Historical emergencies</span><span className="meta sidenote">{HISTORY.length}</span></div>
        <div className="search"><Icon name="search" size={15} /><input className="input" placeholder="Search title, location, equipment" value={q} onChange={(e) => setQ(e.target.value)} data-testid="history-search" /></div>
        <div className="pane-b">
          <div className="list">
            {items.map((h) => (
              <div key={h.id} className="li" role="button" tabIndex={0} aria-selected={cur?.id === h.id} onClick={() => setRecordsView('history', h.id)} onKeyDown={(e) => { if (e.key === 'Enter') setRecordsView('history', h.id); }} data-testid={`hist-${h.id}`}>
                <div className="t"><span className={`chip ${h.mode === 'real' ? 'mode-real' : 'mode-training'}`}>{h.mode === 'real' ? 'Real incident' : 'Training'}</span><span className="grow">{h.title}</span></div>
                <div className="m"><span className="num">{h.started.slice(0, 10)}</span><span>{h.location}</span></div>
              </div>
            ))}
            {items.length === 0 && <div className="empty">No matches</div>}
          </div>
        </div>
      </div>
      <div className="pane grow">
        {cur && (
          <>
            <div className="pane-h"><span className="title">{cur.title}</span><span className={`chip ${cur.mode === 'real' ? 'mode-real' : 'mode-training'}`}>{cur.mode === 'real' ? 'Real incident' : 'Training'}</span><span className="spacer" /><span className="sidenote">Illustrative record</span></div>
            <div className="pane-b">
              <div className="detail">
                <dl className="kv">
                  <dt>Location</dt><dd>{cur.location}</dd>
                  <dt>Started</dt><dd className="num">{cur.started}</dd>
                  <dt>Ended</dt><dd className="num">{cur.ended}</dd>
                  <dt>Equipment</dt><dd>{cur.equipment.join(', ')}</dd>
                  <dt>Outcome</dt><dd>{cur.outcome}</dd>
                </dl>
                <div><h3>Summary</h3><p>{cur.summary}</p></div>
                <div><h3>Lessons learned</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{cur.lessons.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
                <p className="sidenote">Past-incident actions inform retrieval and learning; they do not become the protocol for a new emergency.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
