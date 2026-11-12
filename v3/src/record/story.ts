// The story of the response, and the brief built from it. Both read the same recorded facts:
// the Timeline shows the story, the Sit. Rep summarises it, so they cannot disagree.
// A decision is never an action; a reported action keeps its verification status everywhere.
import type { AlertEvent, DecisionEvent, IncidentRecord, RecommendationEvent, RecordEvent, ReportEvent } from './types';
import { DECISION_LABEL } from '../lib/derive';
import type { RoomData } from '../situation/issues';
import { ASK_LABEL, followUpDue } from '../situation/issues';
import { statusCards } from '../overview/brief';

export type StoryKind = 'development' | 'recommendation' | 'decision' | 'action' | 'result' | 'verified' | 'change';
export const KIND_LABEL: Record<StoryKind, string> = { development: 'Development', recommendation: 'ECC suggested', decision: 'Decision', action: 'Action', result: 'Result', verified: 'Verified', change: 'Open items changed' };
/** How we know: reported by people, measured by instruments, checked by a named person, or recorded as a decision. */
export type Basis = 'reported' | 'measured' | 'verified' | 'recorded' | 'inferred';
export const BASIS_LABEL: Record<Basis, string> = { reported: 'Reported, not verified', measured: 'Measured', verified: 'Verified', recorded: 'Recorded', inferred: 'Inferred by ECC' };

export interface StoryItem {
  id: string; t: number; kind: StoryKind;
  title: string; detail?: string;
  who?: string; basis?: Basis;
  severity?: AlertEvent['severity'];
  equipmentId?: string; issueId?: string | null;
  /** The record entries this item stands for; links resolve to the first. */
  events: string[];
  /** Other records of the same thing (an alert raised from the field report, say). */
  also?: string[];
  /** For a decision: no action has been reported since in the same issue. */
  decisionOnly?: boolean;
}

const MIN3 = 3 * 60_000;
const short = (by?: string) => (by ? by.split(' · ')[0] : undefined);

/** The record entries that changed the incident, classified, attributed and joined to their issue. */
export function buildStory(r: IncidentRecord, room: RoomData | null, asOf: number): StoryItem[] {
  const issueOfAlert = (id?: string | null) => (!id ? null : id.startsWith('issue:') ? id.slice(6) : room?.issueOfAlert(id) ?? null);
  const issueOfUpdate = (id: string) => { const u = room?.updateById.get(id); return u && (u.place.kind === 'opens' || u.place.kind === 'joins') ? u.place.issueId! : null; };
  const items: StoryItem[] = [];
  const firstPerEq = new Set<string>();
  const ev = r.events.filter((e) => e.t <= asOf).sort((a, b) => a.t - b.t);
  for (const e of ev) {
    const m = e.meta ?? {};
    const base = { id: e.id, t: e.t, events: [e.id], equipmentId: e.equipmentId };
    if (e.kind === 'notification') { items.push({ ...base, kind: 'development', title: e.title.replace(/^Initial notification: /, 'Incident reported: '), who: r.reportedBy, basis: 'reported', issueId: null }); continue; }
    if (e.kind === 'alert') {
      const a = e as AlertEvent; const alertId = String(m.alertId ?? '');
      const issueId = issueOfAlert(alertId);
      const head = String(m.headline ?? a.title);
      if (m.act === 'action') { items.push({ ...base, kind: 'action', title: head, detail: a.detail, who: String(m.actor ?? 'Field team'), basis: a.evidenceStatus === 'verified' ? 'measured' : 'reported', severity: a.severity, issueId }); continue; }
      if (m.act === 'result' || a.state === 'recovered') { items.push({ ...base, kind: 'result', title: head, detail: a.detail, who: m.actor ? String(m.actor) : 'Instrument readings', basis: a.evidenceStatus === 'reported' ? 'reported' : 'measured', severity: a.severity, issueId }); continue; }
      const first = !!e.equipmentId && !firstPerEq.has(e.equipmentId);
      if (e.equipmentId) firstPerEq.add(e.equipmentId);
      if (a.severity === 'critical' || a.severity === 'high' || first || m.headline) items.push({ ...base, kind: 'development', title: head, detail: a.detail, who: a.evidenceStatus === 'reported' ? 'Field report, raised by ECC' : 'Monitoring', basis: a.evidenceStatus === 'reported' ? 'reported' : a.evidenceStatus === 'verified' ? 'measured' : 'inferred', severity: a.severity, issueId });
      continue;
    }
    if (e.kind === 'observation') {
      const k = String(m.obsKind ?? '');
      const person = !!m.investigationId || m.userSubmitted;
      if (k !== 'field-report' && k !== 'security-report' && !person) continue;
      const updId = person ? `inv-${m.investigationId}` : e.id.replace(/^obs-/, '');
      const issueId = issueOfUpdate(updId);
      const kind: StoryKind = m.act === 'action' ? 'action' : m.act === 'result' ? 'result' : 'development';
      items.push({ ...base, kind, title: e.title, who: short(e.by) ?? (person ? 'Reported in ECC' : 'Field'), basis: 'reported', issueId });
      continue;
    }
    if (e.kind === 'recommendation') {
      const rec = e as RecommendationEvent; const alertId = rec.alertId ?? String(m.alertId ?? '');
      if (m.superseded) { items.push({ ...base, kind: 'change', title: 'ECC replaced its suggestion', detail: e.detail, who: 'ECC', basis: 'inferred', issueId: issueOfAlert(alertId) }); continue; }
      items.push({ ...base, kind: 'recommendation', title: rec.summary, who: 'ECC', basis: 'inferred', issueId: issueOfAlert(alertId) });
      continue;
    }
    if (e.kind === 'decision') {
      const d = e as DecisionEvent;
      items.push({ ...base, kind: 'decision', title: d.status === 'alternative' ? `Different response: ${d.response ?? d.recommendationSummary}` : `${DECISION_LABEL[d.status]}: ${d.recommendationSummary}`, detail: d.rationale || undefined, who: short(d.by), basis: 'recorded', issueId: issueOfAlert(d.alertId) });
      continue;
    }
    if (e.kind === 'report') {
      const rp = e as ReportEvent;
      items.push({ ...base, kind: rp.status === 'verified' ? 'verified' : 'action', title: rp.title, who: short(rp.by), basis: rp.status === 'verified' ? 'verified' : 'reported', issueId: issueOfAlert(rp.alertId) });
      continue;
    }
    if (e.kind === 'issue' && (m.closed || m.reopened || String(e.id).startsWith('issue-open-'))) { items.push({ ...base, kind: 'change', title: e.title, detail: e.detail, who: short(e.by), basis: 'recorded', issueId: String(m.issueId ?? '') || null }); continue; }
    if (e.kind === 'lifecycle' && !/resolv|clos|reopen|return|set aside|resum/i.test(e.title)) continue;
    if (e.kind === 'lifecycle' || e.kind === 'resolution' || e.kind === 'closure' || e.kind === 'stabilization' || e.kind === 'severity') { items.push({ ...base, kind: 'change', title: e.title, detail: e.detail, who: short(e.by), basis: 'recorded', issueId: null }); continue; }
  }
  // Issues ECC opened are changes in what remains open.
  for (const i of room?.issues ?? []) if (!i.user && i.openedAt <= asOf) items.push({ id: `opened-${i.id}`, t: i.openedAt, kind: 'change', title: `Issue opened: ${i.opener.retitle ?? i.title}`, who: 'ECC', basis: 'inferred', issueId: i.id, equipmentId: i.equipment[0], events: [i.opener.alertId ? `alert-${i.opener.alertId}` : `obs-${i.opener.id}`] });
  items.sort((a, b) => a.t - b.t || order(a.kind) - order(b.kind));

  // One thing reported once: a field report and the alert ECC raised from it, or the same action reported twice, read as one item.
  const out: StoryItem[] = [];
  for (const it of items) {
    const twin = out.find((o) => o.kind === it.kind && (o.kind === 'action' || o.kind === 'result' || o.kind === 'development') && it.t - o.t <= MIN3 && sameSubject(o, it) && sameThing(o, it));
    if (twin) { twin.also = [...(twin.also ?? []), ...it.events]; if (!twin.issueId) twin.issueId = it.issueId; if (twin.who === 'Field' && it.who) twin.who = it.who; continue; }
    out.push(it);
  }
  // A decision with no action reported after it, in the same issue, says so.
  for (const d of out) if (d.kind === 'decision' && d.title.startsWith('Accepted') || d.kind === 'decision' && d.title.startsWith('Different')) d.decisionOnly = !out.some((x) => x.kind === 'action' && x.t >= d.t && x.issueId === d.issueId);
  return out;
}
const order = (k: StoryKind) => ['development', 'change', 'recommendation', 'decision', 'action', 'result', 'verified'].indexOf(k);
/** Only one record of a thing and the record ECC derived from it merge (a field report and the alert raised from it,
 *  or the scenario's copy of a field report). Two reports, or anything a person recorded in ECC, never merge. */
const src = (i: StoryItem) => (i.id.startsWith('alert-') ? 'alert' : i.id.startsWith('report-s') ? 'scenario-report' : i.id.startsWith('obs-') || i.id === 'notification' ? 'observation' : 'other');
const sameThing = (a: StoryItem, b: StoryItem) => { const x = src(a), y = src(b); if (x === 'other' || y === 'other') return false; return x !== y; };
const sameSubject = (a: StoryItem, b: StoryItem) => (a.issueId && b.issueId ? a.issueId === b.issueId : true) && (!a.equipmentId || !b.equipmentId || a.equipmentId === b.equipmentId) && (a.kind !== 'development' || b.who?.startsWith('Field report') || a.who?.startsWith('Field report') || a.title === b.title);

export interface BriefLine { text: string; /** The whole line as one plain sentence, for the report. */ sentence?: string; basis?: Basis; events: string[]; sub?: { label: string; text: string; basis?: Basis; events: string[]; pending?: boolean }[] }
export interface Brief { asOf: number; assessment: string; impact: BriefLine[]; actions: BriefLine[]; attention: BriefLine[]; /** Every decision, action and result in order, for whoever needs more. */ detail: BriefLine[]; plain: string; title: string; context: string }

/** A brief someone can read in under a minute: assessment, impact, actions and their results, what still needs attention. */
export function buildBrief(r: IncidentRecord, room: RoomData | null, story: StoryItem[], asOf: number, phase: string | null, order: string[]): Brief {
  const cards = statusCards(r, asOf, order, 6);
  const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const top = [...cards].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 3);
  // A short assessment: the phase, the latest development and the main open concern, in the alerts' own plain sentences.
  const briefs = r.events.filter((e) => e.kind === 'alert' && e.t <= asOf && e.meta?.brief).sort((a, b) => b.t - a.t);
  const latest = briefs[0] ? String(briefs[0].meta!.brief) : null;
  const concernCard = [...cards].filter((c) => c.wait).sort((a, b) => rank[a.severity] - rank[b.severity])[0];
  const concernEv = concernCard ? briefs.find((e) => e.equipmentId === concernCard.eq && String(e.meta!.brief) !== latest) : undefined;
  const parts = [latest, concernEv ? String(concernEv.meta!.brief) : null].filter(Boolean) as string[];
  const assessment = parts.length ? `${phase ? `${phase}. ` : ''}${parts.map((x) => x.replace(/\.$/, '')).join('. ')}.` : top.length ? `${phase ? `${phase}. ` : ''}${top[0].condition}.` : 'No equipment condition has been recorded yet.';
  const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const impact: BriefLine[] = cards.map((c) => ({ text: `${c.eq} ${c.name}: ${lower(c.condition.replace(new RegExp(`\\b(at |on )?${c.eq}\\b ?`, 'g'), '').trim())}${c.note ? ` (${lower(c.note).replace(/\s*\(simulated\)/, ', simulated')})` : ''}`, basis: /reported|verification pending/i.test(c.note) ? 'reported' : /instrument|reading/i.test(c.note) ? 'measured' : undefined, events: [`alert-${c.basisId}`] }));

  // Actions and their results, per issue: what was decided, what the field reports doing, and what came of it.
  const actions: BriefLine[] = [];
  const issues = room ? [...room.issues].sort((a, b) => a.openedAt - b.openedAt) : [];
  for (const i of issues) {
    const own = story.filter((s) => s.issueId === i.id);
    const dec = [...own].reverse().find((s) => s.kind === 'decision');
    // Actions after the decision are its response; an action reported before it (the deluge switched on, say) is context, not the response.
    const acts = own.filter((s) => s.kind === 'action' && (!dec || s.t >= dec.t));
    const before = dec ? own.filter((s) => s.kind === 'action' && s.t < dec.t) : [];
    if (!dec && !acts.length) continue;
    const lastAct = acts[acts.length - 1];
    const res = [...own].reverse().find((s) => (s.kind === 'verified' || s.kind === 'result') && (!lastAct || s.t >= lastAct.t || s.kind === 'verified'));
    const sub: NonNullable<BriefLine['sub']> = [];
    if (dec) sub.push({ label: 'Decided', text: `${clk(dec.t)} ${dec.title}${dec.who ? ` · by ${dec.who}` : ''}${dec.decisionOnly ? ' · no action reported yet' : ''}`, basis: 'recorded', events: dec.events, pending: dec.decisionOnly });
    if (lastAct) sub.push({ label: 'Action', text: `${clk(lastAct.t)} ${lastAct.title}${lastAct.who ? ` · ${lastAct.basis === 'measured' ? '' : 'reported by '}${lastAct.who}` : ''}${acts.length > 1 ? ` · ${acts.length - 1} earlier ${acts.length === 2 ? 'action' : 'actions'}` : ''}`, basis: lastAct.basis, events: lastAct.events });
    else sub.push({ label: 'Action', text: 'No action reported yet', events: [], pending: true });
    if (res) sub.push({ label: 'Result', text: `${clk(res.t)} ${res.title}${res.kind === 'verified' && res.who ? ` · checked by ${res.who}` : ''}`, basis: res.basis, events: res.events, pending: res.basis === 'reported' });
    else {
      const st = latestStatus(r, i.alerts.map((a) => a.id), asOf);
      sub.push({ label: 'Result', text: `Not verified yet${st ? `. Current state: ${st}` : ''}`, events: st ? [`alert-${i.alerts[i.alerts.length - 1]?.id}`] : [], pending: true });
    }
    // Where it stands now, when a later recorded state qualifies the result (DS-029 reset to standby with the fault still open, say).
    const st = latestStatusAt(r, i.alerts.map((x) => x.id), asOf);
    void st;
    // One plain sentence per step, in order: the decision, what the field reported doing, what came of it.
    // Lower-case a sentence start, but never an equipment tag or an acronym (D-0001, DS-029, FH-01).
    const lc = (x: string) => (/^[A-Z]{1,3}-?\d|^[A-Z]{2}/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1));
    const steps: string[] = [];
    for (const a of before.slice(-1)) steps.push(`${clk(a.t)}, before the decision: ${lc(firstSentence(firstClause(a.title)))}${a.basis === 'reported' ? ' (reported, not verified)' : ''}.`);
    if (dec) steps.push(`${clk(dec.t)} decision by ${dec.who ?? 'the Incident Manager'}: ${lc(firstClause(dec.title.split(': ').slice(1).join(': ') || dec.title))}.`);
    for (const a of acts.slice(-2)) steps.push(`${clk(a.t)} ${a.basis === 'measured' ? 'action seen on instruments' : `action reported${a.who ? ` by ${a.who.replace(/ \(field\)$/, '').replace(/, shown by .*$/, '')}` : ''}`}: ${lc(firstSentence(firstClause(a.title)))}${a.basis === 'reported' ? ' (not yet verified)' : ''}.`);
    if (!acts.length && dec) steps.push('No action reported yet.');
    if (res) steps.push(`${clk(res.t)} result: ${lc(firstSentence(firstClause(res.title)))} (${res.kind === 'verified' ? `verified${res.who ? ` by ${res.who}` : ''}` : res.basis === 'reported' ? 'reported, verification pending' : 'measured'}).`);
    else if (acts.length) steps.push('No verified result yet.');
    const sentence = steps.join(' ');
    actions.push({ text: i.title, sentence: `${i.title} — ${sentence}`, events: (dec ?? lastAct)!.events, sub });
  }

  // What still needs attention: open issues by what they wait for, updates to place, the incident-level assessment.
  const attention: BriefLine[] = [];
  const NEED: Record<string, string> = { decision: 'needs a decision', deferred: 'decision deferred', respond: 'needs a response', field: 'waiting for the field team to report back', verify: 'needs a check that the response worked', close: 'ready to close', closed: 'closed' };
  void ASK_LABEL;
  // An issue whose expected field update is overdue says that instead, once.
  for (const i of room?.open ?? []) if (!followUpDue(i, asOf)) attention.push({ text: `${i.title} — ${NEED[i.ask]}`, events: i.lead.alertId ? [`alert-${i.lead.alertId}`] : [] });
  // Evidence that disagrees and has not been reconciled stays in view, worded as a disagreement, not a conclusion.
  const seen = new Set<string>();
  for (const inv of r.investigations ?? []) {
    const latest = [...inv.responses].reverse().find((x) => x.t <= asOf);
    for (const c of latest?.conflicts ?? []) { const k = `${c.a}|${c.b}`; if (seen.has(k)) continue; seen.add(k); attention.push({ text: `Conflicting evidence, not reconciled: ${c.a} vs ${c.b}`, events: [] }); }
  }
  // An expected field update that has not come in, after the Incident Manager told someone.
  for (const i of room?.open ?? []) { const due = followUpDue(i, asOf); if (due) attention.push({ text: `${i.title} — no field update from ${due.contact.to} since ${clk(due.since)} (expected by ${clk(due.contact.expectBy!)})`, events: [] }); }
  if (room?.review.length) attention.push({ text: `${room.review.length} new ${room.review.length === 1 ? 'update is' : 'updates are'} about an issue already closed: reopen or keep closed`, events: [] });
  if (!r.severity && r.status !== 'closed') attention.push({ text: 'Incident severity not yet assessed', events: [] });

  const title = r.title;
  const context = `${r.site} · ${r.mode === 'training' ? 'Training exercise' : 'Real incident'} · ${r.id}`;
  const plain = [
    `SITUATION REPORT · ${title}`, `${context} · as of ${clk(asOf)}`, '',
    assessment, '',
    'CURRENT IMPACT', ...impact.map((l) => `• ${l.text}`), '',
    'ACTIONS AND RESULTS', ...(actions.length ? actions.flatMap((l) => [`• ${l.text}`, ...(l.sub ?? []).map((s) => `  - ${s.label}: ${s.text}${s.basis && s.label !== 'Decided' ? ` [${BASIS_LABEL[s.basis]}]` : ''}`)]) : ['• No decision or action recorded yet']), '',
    'STILL NEEDS ATTENTION', ...(attention.length ? attention.map((l) => `• ${l.text}`) : ['• Nothing open']), '',
    'Reported items are not independently verified unless marked Verified. A recorded decision is not a completed action.',
  ].join('\n');
  const detail: BriefLine[] = story.filter((x) => x.kind === 'decision' || x.kind === 'action' || x.kind === 'result' || x.kind === 'verified').map((x) => ({ text: `${clk(x.t)} ${KIND_LABEL[x.kind]}: ${x.title}${x.who ? ` · ${x.who}` : ''}`, basis: x.kind === 'decision' ? undefined : x.basis, events: x.events }));
  return { asOf, assessment, impact, actions, attention, detail, plain, title, context };
}

function latestStatusAt(r: IncidentRecord, alertIds: string[], asOf: number): { t: number; text: string; id: string } | null {
  const a = [...r.events].filter((e) => e.kind === 'alert' && e.t <= asOf && alertIds.includes(String(e.meta?.alertId)) && e.meta?.status).sort((x, y) => y.t - x.t)[0] as RecordEvent | undefined;
  return a ? { t: a.t, id: a.id, text: `${a.meta!.status}${a.meta!.statusNote ? ` (${a.meta!.statusNote})` : ''}` } : null;
}
function latestStatus(r: IncidentRecord, alertIds: string[], asOf: number): string | null {
  const a = [...r.events].filter((e) => e.kind === 'alert' && e.t <= asOf && alertIds.includes(String(e.meta?.alertId)) && e.meta?.status).sort((x, y) => y.t - x.t)[0] as RecordEvent | undefined;
  return a ? `${a.meta!.status}${a.meta!.statusNote ? ` (${a.meta!.statusNote})` : ''}` : null;
}
const clk = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ---------------------------------------------------------------- one Timeline
/** A significant moment and, collapsed under it, the related history and supporting detail. */
export interface Moment extends StoryItem { headline: string; qualifier?: string; group: string[] }
const MAIN: StoryKind[] = ['development', 'decision', 'action', 'result', 'verified'];
const firstSentence = (s: string) => { const m = s.match(/^(.+?[.!?])(\s|$)/); return (m ? m[1] : s).replace(/[.!?]$/, ''); };
const firstClause = (s: string) => s.split(/;|\s·\s/)[0].trim();

/** The Timeline: significant moments in order, every other record entry grouped under the moment it belongs to. */
export function buildTimeline(r: IncidentRecord, room: RoomData | null, asOf: number): Moment[] {
  const story = buildStory(r, room, asOf);
  const main = story.filter((s) => MAIN.includes(s.kind));
  // Each group starts with the moment's own source records (the alert, the report, the decision entry), then what followed.
  const moments: Moment[] = main.map((s) => ({ ...s, headline: headlineOf(s), qualifier: qualifierOf(s), group: [...s.events, ...(s.also ?? [])] }));
  const covered = new Set(moments.flatMap((m) => [...m.events, ...(m.also ?? [])]));
  const issueOfEvent = (e: RecordEvent): string | null => {
    const m = e.meta ?? {};
    if (m.issueId) return String(m.issueId);
    const a = (e as { alertId?: string }).alertId ?? (m.alertId ? String(m.alertId) : null);
    if (a) return a.startsWith('issue:') ? a.slice(6) : room?.issueOfAlert(a) ?? null;
    if (e.id.startsWith('obs-')) { const u = room?.updateById.get(e.id.slice(4)); return u?.place.issueId ?? null; }
    return null;
  };
  for (const e of r.events.filter((x) => x.t <= asOf && !covered.has(x.id)).sort((a, b) => a.t - b.t)) {
    const iss = issueOfEvent(e);
    const before = moments.filter((m) => m.t <= e.t);
    const home = (iss ? [...before].reverse().find((m) => m.issueId === iss) : undefined) ?? before[before.length - 1] ?? moments[0];
    home?.group.push(e.id);
  }
  return moments;
}
function headlineOf(s: StoryItem): string {
  if (s.kind === 'decision') return firstClause(s.title);
  if (s.kind === 'development' && s.id === 'notification') return s.title.replace(/^Incident reported: /, 'Incident reported: ');
  return firstSentence(firstClause(s.title));
}
function qualifierOf(s: StoryItem): string | undefined {
  if (s.kind === 'decision') return s.decisionOnly ? 'decision only · no action reported yet' : undefined;
  if (s.basis === 'reported') return s.kind === 'development' ? 'reported' : 'reported · verification pending';
  if (s.basis === 'verified') return `verified${s.who ? ` by ${s.who}` : ''}`;
  if (s.basis === 'measured') return s.kind === 'action' ? 'seen on instruments' : 'measured';
  if (s.basis === 'inferred') return 'inferred by ECC';
  return undefined;
}

// ---------------------------------------------------------------- the Sit. Rep as editable text
/** The four report sections, as text the manager can edit. Bullets are lines starting with “• ”. Priorities is not used. */
export function sectionsFromBrief(b: Brief): { situation: string; response: string; decisions: string; outstanding: string; priorities: string } {
  return {
    situation: b.assessment,
    response: b.impact.map((l) => `• ${l.text}`).join('\n'),
    decisions: b.actions.length ? b.actions.map((l) => `• ${l.sentence ?? l.text}`).join('\n') : '• No decision or action recorded yet.',
    outstanding: b.attention.length ? b.attention.map((l) => `• ${l.text}`).join('\n') : '• Nothing open.',
    priorities: '',
  };
}
