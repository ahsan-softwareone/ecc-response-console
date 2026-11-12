// Incident Overview: a briefing built only from the incident record and current (simulated) readings, as of now.
// Nothing here writes to the record. Every statement keeps its source and a link to its evidence.
import { EQUIPMENT } from '../data/scenario';
import { DECISION_LABEL } from '../lib/derive';
import { analysisOf, outcomeOf } from '../investigate/followThrough';
import { activeRecommendations, gapStatus, supersessionOf } from '../record/timeline';
import type { AlertEvent, DecisionEvent, IncidentRecord, PinnedEvidence, RecordEvent, RecommendationEvent } from '../record/types';

export type Source = 'Field report' | 'Reading' | 'Agent assessment' | 'Decision' | 'Reported action' | 'Reported observation' | 'Notification' | 'Document control' | 'Record' | 'Manager assessment';
export type Flag = 'unverified' | 'unavailable' | 'stale' | 'conflict';
export type Target =
  | { kind: 'alert'; alertId: string; tab: 'response' | 'observations' | 'sources' }
  | { kind: 'concern'; invId: string }
  | { kind: 'reading'; equipmentId: string; watcherId: string }
  | { kind: 'doc'; ev: PinnedEvidence }
  | { kind: 'timeline'; eventId: string }
  | { kind: 'notification' };
export interface Statement { short?: string; id: string; text: string; source: Source; t?: number; flag?: Flag; target?: Target; equipmentId?: string }
export interface Reading { watcherId: string; equipmentId: string; variable: string; text: string; trend: string; source: 'live' | 'stale' | 'lost'; observedAt: number; limit?: string }

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const fmt = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const alertIdOf = (e: RecordEvent) => (e as { alertId?: string }).alertId ?? (e.meta?.alertId ? String(e.meta.alertId) : undefined);

export function sourceOf(r: IncidentRecord, e: RecordEvent): Source {
  if (e.kind === 'alert') { const s = (e as AlertEvent).evidenceStatus; return s === 'reported' ? 'Field report' : s === 'verified' ? 'Reading' : 'Agent assessment'; }
  if (e.kind === 'observation') return e.meta?.userSubmitted ? 'Reported observation' : e.meta?.obsKind === 'reading' ? 'Reading' : e.meta?.obsKind === 'field-report' || e.meta?.obsKind === 'security-report' ? 'Field report' : 'Agent assessment';
  if (e.kind === 'report') return 'Reported action';
  if (e.kind === 'decision') return 'Decision';
  if (e.kind === 'notification') return 'Notification';
  if (e.kind === 'knowledge') return 'Document control';
  if (e.kind === 'severity') return 'Manager assessment';
  if (e.kind === 'outcome') { const by = r.events.find((x) => x.kind === 'alert' && e.detail?.includes(x.title)) as AlertEvent | undefined; return by?.evidenceStatus === 'verified' ? 'Reading' : 'Agent assessment'; }
  if (e.kind === 'finding' || e.kind === 'gap' || e.kind === 'recommendation') return 'Agent assessment';
  return 'Record';
}
export function flagOf(e: RecordEvent): Flag | undefined {
  if (e.kind === 'alert' && (e as AlertEvent).evidenceStatus === 'reported') return 'unverified';
  if (e.kind === 'report' && (e as { status?: string }).status !== 'verified') return 'unverified';
  if (e.kind === 'observation' && (e.meta?.userSubmitted || e.meta?.evidence === 'reported')) return 'unverified';
  if ((e.kind === 'gap' && !e.meta?.prerequisite) || (e.kind === 'alert' && (e as AlertEvent).state === 'unconfirmed')) return 'unavailable';
  return undefined;
}
export function targetOf(r: IncidentRecord, e: RecordEvent): Target {
  if (e.kind === 'observation' && e.meta?.investigationId) return { kind: 'concern', invId: String(e.meta.investigationId) };
  if (e.kind === 'notification') return { kind: 'notification' };
  const a = alertIdOf(e);
  if (a && r.events.some((x) => x.id === `alert-${a}`)) return { kind: 'alert', alertId: a, tab: e.kind === 'alert' && (e as AlertEvent).evidenceStatus === 'reported' ? 'observations' : 'response' };
  return { kind: 'timeline', eventId: e.id };
}
const stmt = (r: IncidentRecord, e: RecordEvent, text = e.title): Statement => ({ id: e.id, text, source: sourceOf(r, e), t: e.t, flag: flagOf(e), target: targetOf(r, e), equipmentId: e.equipmentId });

const isCleared = (r: IncidentRecord, alertId: string, asOf: number) => r.events.some((x) => x.kind === 'outcome' && x.meta?.cleared && x.meta?.alertId === alertId && x.t <= asOf);
const decided = (r: IncidentRecord, alertId: string, asOf: number) => r.events.some((x) => x.kind === 'decision' && (x as DecisionEvent).alertId === alertId && x.t <= asOf);

/** Each equipment item's current story: its latest condition, any graver condition still open, and the reading behind it. */
function equipmentStories(r: IncidentRecord, asOf: number, readings: Reading[]): Statement[] {
  const out: Statement[] = [];
  const known = r.events.filter((e) => e.t <= asOf);
  const ids = [...new Set(known.filter((e) => e.kind === 'alert').map((e) => e.equipmentId!))];
  const stories = ids.map((id) => {
    const alerts = known.filter((e) => e.kind === 'alert' && e.equipmentId === id).map((e) => e as AlertEvent);
    const latest = alerts[alerts.length - 1];
    const stillOpen = alerts.filter((a) => a !== latest && (a.severity === 'critical' || a.severity === 'high') && a.state !== 'recovered' && a.state !== 'reported' && !isCleared(r, String(a.meta?.alertId), asOf));
    const worst = Math.min(SEV_RANK[latest.severity], ...stillOpen.map((a) => SEV_RANK[a.severity]));
    const graver = [...stillOpen].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.t - a.t)[0];
    return { id, latest, stillOpen: graver, worst };
  }).sort((a, b) => b.latest.t - a.latest.t || a.worst - b.worst);
  for (const s of stories.slice(0, 5)) {
    const name = EQUIPMENT.find((e) => e.id === s.id)?.name ?? s.id;
    const strip = (t: string) => t.replace(new RegExp(`^${s.id}\\s*·?\\s*`), '');
    const rd = s.latest.meta && readings.find((x) => x.equipmentId === s.id && sourceOf(r, s.latest) === 'Reading' && x.variable === 'Pressure');
    const now = rd ? ` Now ${rd.text}${rd.limit ? `; ${rd.limit}` : ''}.` : '';
    const open = s.stillOpen ? ` Still open since ${fmt(s.stillOpen.t)}: ${strip(s.stillOpen.title)}.` : '';
    const latestFlag = flagOf(s.latest);
    out.push({ ...stmt(r, s.latest, `${s.id} ${name}: ${strip(s.latest.title)}.${now}${open}`), equipmentId: s.id, flag: latestFlag ?? (s.stillOpen?.evidenceStatus === 'reported' ? 'unverified' : undefined), short: `${s.id} ${strip(s.latest.title).replace(/\s*·\s*not independently verified/i, '')}${latestFlag === 'unverified' ? ' (reported, not verified)' : ''}${s.stillOpen ? `; still open: ${strip(s.stillOpen.title)}` : ''}` });
  }
  return out;
}

export interface Summary { asOf: number; changed: Statement[]; impact: Statement[]; response: Statement[]; uncertain: Statement[] }
export function situationSummary(r: IncidentRecord, asOf: number, readings: Reading[]): Summary {
  const known = r.events.filter((e) => e.t <= asOf);
  const assessments = known.filter((e) => e.kind === 'finding' && e.meta?.assessment);
  const latest = assessments[assessments.length - 1];
  const since = assessments.length > 1 ? assessments[assessments.length - 2].t : 0;
  const turning = turningPoints(r, asOf).filter((x) => x.e.t > since && x.e.kind !== 'notification');
  const seenEq = new Set<string>();
  const recent = [...turning].reverse().filter((x) => { const k = x.e.equipmentId ?? x.e.id; if (seenEq.has(k)) return false; seenEq.add(k); return true; }).slice(0, 3).map((x) => stmt(r, x.e, x.text));
  const changed = [...(latest ? [{ ...stmt(r, latest), text: latest.title.replace(/^Assessment revised:\s*/i, 'Latest agent assessment: ') }] : []), ...recent];
  const impact = equipmentStories(r, asOf, readings);
  const response: Statement[] = [];
  for (const d of known.filter((e): e is DecisionEvent => e.kind === 'decision').slice(-2)) response.push(stmt(r, d, `${d.title} (${d.by}, ${fmt(d.t)})`));
  for (const rep of known.filter((e) => e.kind === 'report').slice(-3)) response.push({ ...stmt(r, rep), text: `${rep.title.replace(/\.$/, '')} (reported ${fmt(rep.t)}${(rep as { status?: string }).status === 'verified' ? ', verified' : ', not yet verified'})` });
  const recs = activeRecommendations(r, asOf).filter((x) => !decided(r, x.alertId, asOf));
  if (recs.length) response.push({ id: `recs-${recs[0].id}`, text: `${recs.length} current recommendation${recs.length > 1 ? 's have' : ' has'} no recorded decision. Latest: ${recs[0].summary}`, source: 'Agent assessment', t: recs[0].t, target: { kind: 'alert', alertId: recs[0].alertId, tab: 'response' } });
  if (!response.length) response.push({ id: 'none', text: 'No decision or field action is recorded yet.', source: 'Record' });
  return { asOf, changed, impact, response: response.slice(0, 5), uncertain: uncertainties(r, asOf, readings).slice(0, 5) };
}

export function uncertainties(r: IncidentRecord, asOf: number, readings: Reading[]): Statement[] {
  const out: Statement[] = [];
  const known = r.events.filter((e) => e.t <= asOf);
  for (const a of known.filter((e) => e.kind === 'alert').map((e) => e as AlertEvent).filter((e) => e.evidenceStatus === 'reported' && (e.state === 'reported' || /not independently verified/i.test(e.title))).reverse()) {
    if (!isCleared(r, String(a.meta?.alertId), asOf)) out.push({ ...stmt(r, a), text: `Unverified field report: ${a.title}`, flag: 'unverified' });
  }
  for (const rd of readings.filter((x) => x.source !== 'live')) out.push({ id: `u-${rd.watcherId}`, text: `${rd.equipmentId} ${rd.variable.toLowerCase()} signal ${rd.source}; last value ${rd.text}`, source: 'Reading', t: rd.observedAt, flag: rd.source === 'lost' ? 'unavailable' : 'stale', target: { kind: 'reading', equipmentId: rd.equipmentId, watcherId: rd.watcherId } });
  for (const a of known.filter((e): e is AlertEvent => e.kind === 'alert' && /fault remains open|conflict/i.test(`${e.title} ${e.detail ?? ''}`) && !isCleared(r, String(e.meta?.alertId), asOf))) out.push({ ...stmt(r, a), text: a.title, flag: 'conflict' });
  for (const inv of r.investigations ?? []) {
    const o = outcomeOf(inv); const ev = r.events.find((e) => e.id === inv.observationEventId);
    if (inv.kind !== 'observation' || inv.t > asOf) continue;
    if (o?.kind === 'conflict' || o?.kind === 'review' || analysisOf(inv) === 'clarification') out.push({ id: `inv-${inv.id}`, text: `Reported observation "${ev?.title ?? inv.text}": ${o?.label ?? 'needs clarification'}`, source: 'Reported observation', t: inv.t, flag: o?.kind === 'conflict' ? 'conflict' : 'unverified', target: { kind: 'concern', invId: inv.id } });
  }
  const gaps = gapStatus(r, asOf);
  for (const g of known.filter((e) => e.kind === 'gap' && gaps.get(e.id) === 'open' && e.meta?.prerequisite).slice(-3)) out.push({ ...stmt(r, g), text: g.title.replace(/^Prerequisite outstanding: /, 'Outstanding: ').replace(/ outstanding$/, '') });
  for (const d of known.filter((e): e is DecisionEvent => e.kind === 'decision')) { const s = supersessionOf(r, d.alertId, asOf); if (s && s.t > d.t) out.push({ ...stmt(r, d), text: `Decision "${d.recommendationSummary}" was based on a recommendation superseded at ${fmt(s.t)}`, flag: 'conflict' }); }
  return out;
}

export interface Attention { gravity?: number; id: string; kind: 'decision' | 'verification' | 'follow-up'; title: string; why: string; uncertain: string; owner: string; action: string; target: Target; severity?: AlertEvent['severity']; t: number }
export function requiresAttention(r: IncidentRecord, asOf: number, readings: Reading[]): Attention[] {
  const out: Attention[] = [];
  const known = r.events.filter((e) => e.t <= asOf);
  const alertOf = (id: string) => known.find((e) => e.id === `alert-${id}`) as AlertEvent | undefined;
  for (const rec of activeRecommendations(r, asOf).filter((x) => !decided(r, x.alertId, asOf))) {
    const a = alertOf(rec.alertId);
    out.push({ id: `dec-${rec.alertId}`, kind: 'decision', title: rec.summary, why: a ? `Recommended for: ${a.title}` : 'An agent recommendation is waiting for a decision.', uncertain: rec.prerequisites.length ? `Outstanding: ${rec.prerequisites.join('; ')}` : rec.calculation ?? 'No outstanding prerequisite is recorded.', owner: 'Owner not recorded', action: 'Review decision', target: { kind: 'alert', alertId: rec.alertId, tab: 'response' }, severity: a?.severity, t: rec.t });
  }
  for (const d of known.filter((e): e is DecisionEvent => e.kind === 'decision')) {
    const s = supersessionOf(r, d.alertId, asOf);
    if (s && s.t > d.t) out.push({ id: `rev-${d.id}`, kind: 'decision', title: `Recorded decision needs review: ${d.recommendationSummary}`, why: `Its recommendation was superseded at ${fmt(s.t)}, after the decision.`, uncertain: s.reason, owner: d.by ?? 'Owner not recorded', action: 'Review decision', target: { kind: 'alert', alertId: d.alertId, tab: 'response' }, t: s.t });
  }
  for (const a of known.filter((e) => e.kind === 'alert').map((e) => e as AlertEvent).filter((e) => e.evidenceStatus === 'reported' && e.state === 'reported')) {
    if (isCleared(r, String(a.meta?.alertId), asOf)) continue;
    out.push({ id: `ver-${a.id}`, kind: 'verification', title: `Verify: ${a.title.replace(/\s*·\s*not independently verified/i, '')}`, why: `Only a field report supports this. Anything that assumes it rests on that report.${a.detail ? ` Basis: ${a.detail}.` : ''}`, uncertain: 'Reported by the field team. Not independently verified.', owner: 'Owner not recorded', action: 'View field report', target: { kind: 'alert', alertId: String(a.meta?.alertId), tab: 'observations' }, severity: a.severity, t: a.t });
  }
  for (const rd of readings.filter((x) => x.source === 'lost')) out.push({ id: `sig-${rd.watcherId}`, kind: 'verification', title: `${rd.equipmentId} ${rd.variable.toLowerCase()} can no longer be read`, why: 'Its value is frozen at the last good reading, so ECC cannot see changes.', uncertain: `Last value ${rd.text}.`, owner: 'Owner not recorded', action: 'View reading', target: { kind: 'reading', equipmentId: rd.equipmentId, watcherId: rd.watcherId }, t: rd.observedAt });
  for (const inv of (r.investigations ?? []).filter((i) => i.kind === 'observation' && i.t <= asOf)) {
    const s = analysisOf(inv); const o = outcomeOf(inv); const ev = r.events.find((e) => e.id === inv.observationEventId);
    if (s === 'assessed' && (o?.kind === 'none' || o?.kind === 'recommendation')) continue;
    out.push({ id: `obs-${inv.id}`, kind: 'follow-up', title: `Reported: "${ev?.title ?? inv.text}"`, why: inv.urgentWording ? 'The report uses urgent wording and needs prompt human attention.' : `Reported by ${String(ev?.meta?.sourceLabel ?? 'the field')}, ${fmt(inv.t)}.`, uncertain: o ? `${o.label}.${o.reason ? ` ${o.reason}` : ''}` : s === 'clarification' ? 'ECC needs a clarification before it can assess this.' : s === 'failed' ? 'Analysis did not finish.' : 'Not analysed yet.', owner: `Submitted by ${inv.by}`, action: 'View observation', target: { kind: 'concern', invId: inv.id }, t: inv.t });
  }
  // A few of each kind first, so a pending verification is not pushed out of view by decisions. The rest follow.
  const dec = out.filter((x) => x.kind === 'decision').sort((a, b) => (a.severity ? SEV_RANK[a.severity] : 4) - (b.severity ? SEV_RANK[b.severity] : 4) || b.t - a.t);
  const ver = out.filter((x) => x.kind === 'verification').sort((a, b) => b.t - a.t);
  const fol = out.filter((x) => x.kind === 'follow-up').sort((a, b) => b.t - a.t);
  const first = [...dec.slice(0, 2), ...ver.slice(0, 2), ...fol.slice(0, 1)];
  return [...first, ...[...dec, ...ver, ...fol].filter((x) => !first.includes(x))];
}

export interface Turning { e: RecordEvent; text: string; source: Source; flag?: Flag; target: Target; group?: number; names?: string[] }
/** The entries that explain how the situation developed, oldest first. */
export function turningPoints(r: IncidentRecord, asOf: number): Turning[] {
  const known = r.events.filter((e) => e.t <= asOf).sort((a, b) => a.t - b.t || a.recordedAt - b.recordedAt);
  const firstAlert = new Set<string>();
  const out: Turning[] = [];
  for (const e of known) {
    let keep = false; let text = e.title;
    if (e.kind === 'notification' || e.kind === 'decision' || e.kind === 'report' || e.kind === 'knowledge' || e.kind === 'resolution' || e.kind === 'closure' || e.kind === 'severity') keep = true;
    if (e.kind === 'alert') { const a = e as AlertEvent; keep = a.severity === 'critical' || a.severity === 'high' || a.state === 'reported' || a.state === 'recovered' || a.evidenceStatus === 'reported'; if (a.meta?.alertId) firstAlert.add(String(a.meta.alertId)); }
    if (e.kind === 'observation' && e.meta?.userSubmitted) { keep = true; text = `Reported: "${e.title}"`; }
    if (e.kind === 'gap' && !e.meta?.prerequisite) keep = true;
    if (e.kind === 'agent-control' && /paused|stopped|error/i.test(e.title)) keep = true;
    if (e.kind === 'outcome') {
      const name = e.title.replace(/^Cleared: /, '');
      const prev = out[out.length - 1];
      if (prev && prev.e.kind === 'outcome' && prev.e.t === e.t) { prev.group = (prev.group ?? 1) + 1; prev.names = [...(prev.names ?? []), name]; prev.text = `Cleared: ${prev.names.join('; ')}`; continue; }
      keep = true; text = `Cleared: ${name}`;
      out.push({ e, text, source: sourceOf(r, e), flag: flagOf(e), target: targetOf(r, e), names: [name] });
      continue;
    }
    if (keep) out.push({ e, text, source: sourceOf(r, e), flag: flagOf(e), target: targetOf(r, e) });
  }
  return out;
}

/** Leadership briefing: same record, same time. Uncertainty survives the shortening. */
export function execSummary(r: IncidentRecord, s: Summary, attention: Attention[], elapsedMin: number): string {
  const tidy = (t: string) => t.replace(/\s*·\s*not independently verified/i, '').replace(/[.\s]+$/, '');
  const sev = r.severity ? `Incident severity ${r.severity.label} (assessed by ${r.severity.by.split(' · ')[0]}, ${fmt(r.severity.t)})` : 'Incident severity not yet assessed';
  const impact = s.impact.slice(0, 4).map((x) => tidy(x.short ?? x.text));
  const resp = s.response.filter((x) => x.source !== 'Record').slice(0, 2).map((x) => tidy(x.text.replace(/\. Latest: .*$/, '')));
  const concern = s.uncertain[0] ? tidy(s.uncertain[0].text) : attention[0] ? tidy(attention[0].title) : 'none recorded';
  const dec = attention.filter((a) => a.kind === 'decision').length, ver = attention.filter((a) => a.kind === 'verification').length;
  return [
    `${r.title}, ${r.site}${r.mode === 'training' ? ' (training exercise, illustrative data)' : ''}. Under way for ${elapsedMin} min, as of ${fmt(s.asOf)}. ${sev}.`,
    `Impact: ${impact.length ? impact.join('. ') : 'none recorded'}.`,
    `Response: ${resp.length ? resp.join('; ') : 'none recorded yet'}.`,
    `Main outstanding concern: ${concern}.`,
    `Outstanding: ${dec} decision${dec === 1 ? '' : 's'} and ${ver} verification${ver === 1 ? '' : 's'}. Fuller account in the Sit. Rep.`,
  ].join('\n');
}

export function affectedArea(r: IncidentRecord): string {
  if (r.location) return r.location;
  const areas = [...new Set(r.equipment.map((id) => EQUIPMENT.find((e) => e.id === id)?.area).filter(Boolean))];
  return areas.join(', ');
}
export type { RecommendationEvent };

// ---------------------------------------------------------------- briefing v2

export interface EqItem { id: string; name: string; text: string; certainty?: 'confirmed' | 'reported'; problem?: boolean; target?: Target }
export interface Picture { impact: EqItem[]; exposed: EqItem[]; protective: EqItem[] }
const PROTECTIVE_AREAS = new Set(['Fire protection', 'Relief and flare']);
/** Who is hit, who is exposed, and what protects or relieves them. Kept apart because they call for different decisions. */
export function equipmentPicture(r: IncidentRecord, asOf: number, roleOf: (id: string) => string): Picture {
  const out: Picture = { impact: [], exposed: [], protective: [] };
  const known = r.events.filter((e) => e.t <= asOf);
  for (const id of r.equipment) {
    const eq = EQUIPMENT.find((e) => e.id === id);
    const name = eq?.name ?? id;
    const alerts = known.filter((e) => e.kind === 'alert' && e.equipmentId === id).map((e) => e as AlertEvent);
    const open = alerts.filter((a) => a.state !== 'recovered' && a.state !== 'reported' && !isCleared(r, String(a.meta?.alertId), asOf));
    const grave = open.filter((a) => a.severity === 'critical' || a.severity === 'high');
    const role = roleOf(id);
    const latest = alerts[alerts.length - 1];
    const target: Target | undefined = latest ? { kind: 'alert', alertId: String(latest.meta?.alertId), tab: 'response' } : undefined;
    if (eq && (PROTECTIVE_AREAS.has(eq.area) || eq.kind === 'Fire protection')) out.protective.push({ id, name, text: role || eq.area, problem: grave.length > 0, target });
    else if (grave.length) out.impact.push({ id, name, text: role || latest.title, certainty: grave.some((a) => a.evidenceStatus === 'verified') ? 'confirmed' : 'reported', target });
    else out.exposed.push({ id, name, text: role || eq?.area || '', target });
  }
  return out;
}

export interface Briefing { asOf: number; assessment: Statement | null; reported: Statement[]; verified: Statement[]; underway: Statement[]; awaiting: number }
export function briefing(r: IncidentRecord, asOf: number, readings: Reading[]): Briefing {
  const known = r.events.filter((e) => e.t <= asOf);
  const lastAssessment = [...known].reverse().find((e) => e.kind === 'finding' && e.meta?.assessment);
  const firstSentences = (t: string) => { const s0 = t.replace(/^(Initial assessment|Assessment revised):\s*/i, ''); const s = s0.charAt(0).toUpperCase() + s0.slice(1); const parts = s.split(/(?<=\.)\s/); let out = ''; for (const p of parts) { if ((out + p).length > 170 && out) break; out += (out ? ' ' : '') + p; } return out; };
  const assessment = lastAssessment ? { ...stmt(r, lastAssessment), text: firstSentences(lastAssessment.title) } : null;
  // Reported: what people said, newest first, not yet verified.
  const reportedEv = known.filter((e) => (e.kind === 'observation' && (e.meta?.userSubmitted || e.meta?.obsKind === 'field-report' || e.meta?.obsKind === 'security-report')) || (e.kind === 'alert' && (e as AlertEvent).evidenceStatus === 'reported' && (e as AlertEvent).state === 'reported')).reverse();
  const seenR = new Set<string>();
  const reported = reportedEv.filter((e) => { const k = e.equipmentId ?? e.id; if (seenR.has(k)) return false; seenR.add(k); return true; }).slice(0, 2).map((e) => ({ ...stmt(r, e), flag: 'unverified' as Flag }));
  // Verified: instrument-backed conditions, newest per equipment, with the current value.
  const ver = known.filter((e) => e.kind === 'alert' && (e as AlertEvent).evidenceStatus === 'verified' && ((e as AlertEvent).severity !== 'low' || (e as AlertEvent).state === 'recovered')).map((e) => e as AlertEvent).reverse();
  const seenV = new Set<string>();
  const verified = ver.filter((a) => { if (seenV.has(a.equipmentId!)) return false; seenV.add(a.equipmentId!); return true; }).slice(0, 3).map((a) => {
    const rd = readings.find((x) => x.equipmentId === a.equipmentId && a.title.toLowerCase().includes(x.variable.toLowerCase().split(' ').pop()!));
    return { ...stmt(r, a, `${a.title}${rd ? `. Now ${rd.text}${rd.source !== 'live' ? ` (signal ${rd.source})` : ''}` : ''}`), flag: rd && rd.source !== 'live' ? (rd.source === 'lost' ? 'unavailable' : 'stale') as Flag : undefined };
  });
  const underway: Statement[] = [];
  for (const d of known.filter((e): e is DecisionEvent => e.kind === 'decision').slice(-2).reverse()) underway.push(stmt(r, d, `${d.title}, ${fmt(d.t)}`));
  for (const rep of known.filter((e) => e.kind === 'report').slice(-2).reverse()) underway.push({ ...stmt(r, rep, `${rep.title.replace(/\.$/, '')}`), flag: (rep as { status?: string }).status === 'verified' ? undefined : 'unverified' });
  const awaiting = activeRecommendations(r, asOf).filter((x) => !decided(r, x.alertId, asOf)).length;
  return { asOf, assessment, reported, verified, underway: underway.slice(0, 3), awaiting };
}

/** Most consequential first: the gravest related condition, then decisions before verifications before follow-ups, then newest. */
export function prioritised(r: IncidentRecord, asOf: number, readings: Reading[]): Attention[] {
  const items = requiresAttention(r, asOf, readings);
  const known = r.events.filter((e) => e.t <= asOf);
  const gravest = (target: Target, own?: AlertEvent['severity']) => {
    let best = own ? SEV_RANK[own] : 4;
    if (target.kind === 'alert') { const a = known.find((e) => e.id === `alert-${target.alertId}`) as AlertEvent | undefined; const eq = a?.equipmentId; for (const x of known) if (x.kind === 'alert' && x.equipmentId === eq && !isCleared(r, String(x.meta?.alertId), asOf) && (x as AlertEvent).state !== 'recovered') best = Math.min(best, SEV_RANK[(x as AlertEvent).severity]); }
    return best;
  };
  // A new decision on a live condition comes first; then pending verification; reviewing a decision already acted on is bookkeeping by comparison.
  const kindRank = (a: Attention) => (a.id.startsWith('dec-') ? 0 : a.kind === 'verification' && !a.id.startsWith('sig-') ? 1 : a.id.startsWith('rev-') ? 2 : a.id.startsWith('sig-') ? 3 : 4);
  return items.map((a) => ({ a, g: gravest(a.target, a.severity) })).sort((x, y) => x.g - y.g || kindRank(x.a) - kindRank(y.a) || y.a.t - x.a.t).map((x) => ({ ...x.a, gravity: x.g }));
}

export type Lane = 'report' | 'condition' | 'action';
export interface ChartEvent { id: string; t: number; lane: Lane; label: string; text: string; source: Source; flag?: Flag; weight: number; severity?: AlertEvent['severity']; target: Target; equipmentId?: string; kind: string; detail?: string; received?: number; observed?: number; evidence?: PinnedEvidence[] }
const short = (t: string, n = 42) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
/** Milestones for the chart, each tied to one record entry. */
export function chartEvents(r: IncidentRecord, asOf: number): ChartEvent[] {
  const out: ChartEvent[] = [];
  const known = r.events.filter((e) => e.t <= asOf).sort((a, b) => a.t - b.t);
  const base = (e: RecordEvent, lane: Lane, label: string, weight: number, extra: Partial<ChartEvent> = {}): ChartEvent => ({ id: e.id, t: e.t, lane, label: short(label), text: e.title, source: sourceOf(r, e), flag: flagOf(e), weight, target: targetOf(r, e), equipmentId: e.equipmentId, kind: e.kind, detail: e.detail, received: e.meta?.receivedAt != null ? Number(e.meta.receivedAt) : e.recordedAt, observed: e.meta?.observedAt != null ? Number(e.meta.observedAt) : undefined, evidence: e.evidence, ...extra });
  for (const e of known) {
    if (e.kind === 'notification') out.push(base(e, 'report', 'Notification', 3));
    else if (e.kind === 'observation' && (e.meta?.userSubmitted || e.meta?.obsKind === 'field-report' || e.meta?.obsKind === 'security-report')) out.push(base(e, 'report', e.meta?.userSubmitted ? `Reported: ${e.title}` : e.title, e.meta?.userSubmitted ? 2 : 2));
    else if (e.kind === 'alert') { const a = e as AlertEvent; if (a.severity === 'critical' || a.severity === 'high' || a.state === 'recovered' || a.state === 'reported') out.push(base(e, 'condition', a.title, a.severity === 'critical' ? 3 : a.state === 'recovered' ? 2 : a.severity === 'high' ? 2 : 1, { severity: a.severity })); }
    else if (e.kind === 'gap' && !e.meta?.prerequisite) out.push(base(e, 'condition', e.title.replace(/^Information gap: /, 'Gap: '), 1, { flag: 'unavailable' }));
    else if (e.kind === 'decision') out.push(base(e, 'action', e.title, 3));
    else if (e.kind === 'report') out.push(base(e, 'action', `Reported: ${e.title}`, 2));
    else if (e.kind === 'outcome') out.push(base(e, 'action', e.title, 2));
    else if (e.kind === 'severity') out.push(base(e, 'action', e.title, 2));
  }
  return out;
}

export function execBrief(r: IncidentRecord, b: Briefing, pic: Picture, lead: Attention | undefined, elapsedMin: number): string {
  const sev = r.severity ? `Incident severity ${r.severity.label}` : 'Incident severity not yet assessed';
  const impact = pic.impact.length ? pic.impact.map((x) => `${x.id} ${x.text.toLowerCase()}${/reported|not verified/i.test(x.text) ? '' : x.certainty === 'reported' ? ' (reported, not verified)' : ''}`).join('; ') : 'no equipment impact recorded';
  const exposed = pic.exposed.length ? ` ${pic.exposed.map((x) => x.id).join(', ')} exposed.` : '';
  const prot = pic.protective.filter((x) => x.problem).map((x) => `${x.id} ${x.text.toLowerCase()}`);
  const resp = b.underway.length ? b.underway.map((x) => `${x.text.replace(/,\s\d\d:\d\d$/, '')}${x.flag === 'unverified' ? ' (reported)' : ''}`).join('; ') : 'no decision or field action recorded yet';
  const concern = lead ? `${lead.title.replace(/\.$/, '')}${lead.uncertain && !/No outstanding/.test(lead.uncertain) ? ` (${lead.uncertain.replace(/\.$/, '').replace(/^Outstanding: /, 'outstanding: ')})` : ''}` : 'none recorded';
  return [
    `${r.title}, ${r.site}${r.mode === 'training' ? ' (training exercise)' : ''}: ${elapsedMin} min in, as of ${fmt(b.asOf)}. ${sev}.`,
    `Impact: ${impact}.${exposed}${prot.length ? ` Protection affected: ${prot.join('; ')}.` : ''}`,
    `Response: ${resp}.${b.awaiting ? ` ${b.awaiting} recommendation${b.awaiting > 1 ? 's await' : ' awaits'} a decision.` : ''}`,
    `Main unresolved concern: ${concern}.`,
  ].join(' ');
}

// ---------------------------------------------------------------- briefing v3: one fact model for Details and Exec

export interface Src { label: string; target: Target }
export interface Bullet { key: 'happened' | 'impact' | 'response' | 'verify'; label: string; text: string; sources: Src[] }
const firstClause = (t: string) => t.split(/[;.]\s/)[0].replace(/\.$/, '');
/** The informative part of a title: "Deluge DS-029 · no flow after activation command" keeps both halves, "Fire at D-0029 · shrapnel damage reported" keeps the first. */
const headline_ = (t: string) => headline(t);
const headline = (t: string) => { const [a, b] = t.split(' · '); return (b && a.split(' ').length <= 3 ? `${a}, ${b}` : a).replace(/\.$/, ''); };
const srcLabel = (s: Source, t: number) => `${s === 'Field report' ? 'Field' : s === 'Reported action' ? 'Field' : s === 'Agent assessment' ? 'Agent' : s === 'Notification' ? 'Notification' : s === 'Reading' ? 'Readings' : s} ${fmt(t)}`;

export function facts(r: IncidentRecord, asOf: number, readings: Reading[], pic: Picture): Bullet[] {
  const known = r.events.filter((e) => e.t <= asOf).sort((a, b) => a.t - b.t);
  const out: Bullet[] = [];
  // What happened: the initiating report, then each new critical development, oldest first.
  const note = known.find((e) => e.kind === 'notification');
  const initial = r.notification?.text ? firstClause(r.notification.text) : note ? firstClause(note.detail?.split(' · ').pop() ?? note.title) : r.title;
  const firstReport = known.find((e) => e.kind === 'observation' && (e.meta?.obsKind === 'security-report' || e.meta?.obsKind === 'field-report'));
  const crit: AlertEvent[] = []; const seen = new Set<string>();
  for (const e of known) if (e.kind === 'alert' && (e as AlertEvent).severity === 'critical' && !seen.has(e.equipmentId!)) { seen.add(e.equipmentId!); crit.push(e as AlertEvent); }
  const happened = crit.length
    ? `${initial} at ${fmt(note?.t ?? r.startedAt)}. Since then: ${crit.slice(0, 3).map((a) => `${headline(a.title)} (${fmt(a.t)})`).join('; ')}.`
    : (() => { const extra = firstReport && firstReport.t - (note?.t ?? 0) < 120_000 ? firstReport.title.split(';').slice(1).join(';').trim().replace(/\.$/, '') : ''; return `${initial} at ${fmt(note?.t ?? r.startedAt)}${extra ? `; ${extra}` : ''}.`; })();
  out.push({ key: 'happened', label: 'What happened', text: happened.replace(/\.\s*\.$/, '.').replace(/ \.$/, '.'), sources: [...(note ? [{ label: srcLabel('Notification', note.t), target: { kind: 'timeline' as const, eventId: note.id } }] : []), ...crit.slice(0, 2).map((a) => ({ label: srcLabel(sourceOf(r, a), a.t), target: targetOf(r, a) }))] });
  // Impact: confirmed or reported damage, kept apart from exposure. Absence of reports is not verified absence.
  const parts: string[] = []; const isrc: Src[] = [];
  for (const x of pic.impact) { parts.push(`${x.id}: ${x.certainty === 'confirmed' ? 'damage confirmed by readings' : 'damage reported, not verified'}; latest status ${x.text.toLowerCase()}`); if (x.target) isrc.push({ label: x.id, target: x.target }); }
  const recovered = known.filter((e) => e.kind === 'alert' && (e as AlertEvent).state === 'recovered').map((e) => e as AlertEvent);
  for (const a of recovered.slice(-1)) { const rd = readings.find((x) => x.equipmentId === a.equipmentId && x.variable === 'Pressure'); parts.push(`${headline(a.title)}${rd ? `, now ${rd.text}` : ''} (verified)`); isrc.push({ label: srcLabel('Reading', a.t), target: targetOf(r, a) }); }
  if (pic.exposed.length) { const ex = pic.exposed.filter((x) => !recovered.some((a) => a.equipmentId === x.id)); if (ex.length) parts.push(`${ex.map((x) => `${x.id} ${x.text.toLowerCase()}`).join('; ')}${pic.impact.length ? ' (exposed, no damage reported)' : ''}`); }
  if (!pic.impact.length) { const first = pic.exposed[0]; const rd = first && readings.filter((x) => x.equipmentId === first.id && x.variable !== 'Shell temperature'); if (rd?.length) parts.push(`${first.id} readings ${rd.map((x) => x.text.split(',')[0]).join(', ')}, within configured limits`); parts.push(`No equipment damage has been reported as of ${fmt(asOf)}`); }
  out.push({ key: 'impact', label: pic.impact.length ? 'Impact' : 'Exposure', text: `${parts.join('. ')}.`, sources: isrc.slice(0, 3) });
  // Response: what was decided or reported done, kept apart from what is only proposed.
  const rp: string[] = []; const rsrc: Src[] = [];
  const decisions = known.filter((e): e is DecisionEvent => e.kind === 'decision');
  for (const d of decisions.slice(-2)) { const sup = supersessionOf(r, d.alertId, asOf); rp.push(`${DECISION_LABEL[d.status]}: ${firstClause(d.status === 'alternative' && d.response ? d.response : d.recommendationSummary)} (${fmt(d.t)}, ${d.by?.split(' · ')[1] ?? 'recorded'}${sup && sup.t > d.t ? '; since superseded' : ''})`); rsrc.push({ label: `Decision ${fmt(d.t)}`, target: targetOf(r, d) }); }
  for (const rep of known.filter((e) => e.kind === 'report').slice(-2)) { rp.push(`Reported: ${firstClause(rep.title)} (${fmt(rep.t)}, ${(rep as { status?: string }).status === 'verified' ? 'verified' : 'not verified'})`); rsrc.push({ label: srcLabel('Reported action', rep.t), target: targetOf(r, rep) }); }
  const awaiting = activeRecommendations(r, asOf).filter((x) => !decided(r, x.alertId, asOf));
  if (!decisions.length && !known.some((e) => e.kind === 'report')) rp.push('No decision or field action has been recorded');
  if (awaiting.length) { rp.push(`${awaiting.length === 1 ? 'A recommendation awaits' : `${awaiting.length} recommendations await`} your decision`); rsrc.push({ label: 'Recommendation', target: { kind: 'alert', alertId: awaiting[0].alertId, tab: 'response' } }); }
  out.push({ key: 'response', label: decisions.length || known.some((e) => e.kind === 'report') ? 'Response underway' : 'Proposed response', text: `${rp.join('. ')}.`, sources: rsrc.slice(0, 3) });
  // Still to verify: unverified reports, conflicts, lost signals, and the checks a pending recommendation proposes.
  const vp: string[] = []; const vsrc: Src[] = [];
  for (const a of known.filter((e) => e.kind === 'alert' && (e as AlertEvent).evidenceStatus === 'reported' && (e as AlertEvent).state === 'reported').map((e) => e as AlertEvent).reverse().slice(0, 2)) { if (isCleared(r, String(a.meta?.alertId), asOf)) continue; vp.push(`${headline(a.title)} (${fmt(a.t)}, reported only)`); vsrc.push({ label: srcLabel('Field report', a.t), target: { kind: 'alert', alertId: String(a.meta?.alertId), tab: 'observations' } }); }
  for (const a of known.filter((e) => e.kind === 'alert' && /fault remains open|no flow after/i.test(e.title)).map((e) => e as AlertEvent).slice(-1)) { if (!isCleared(r, String(a.meta?.alertId), asOf)) { vp.push(`${headline(a.title)} (flow not confirmed at the protected equipment)`); vsrc.push({ label: a.equipmentId!, target: targetOf(r, a) }); } }
  for (const rd of readings.filter((x) => x.source === 'lost')) vp.push(`${rd.equipmentId} ${rd.variable.toLowerCase()} signal lost`);
  if (!vp.length) for (const rec of awaiting) for (const act of rec.actions.filter((x) => /^(confirm|verify|check|request a field check)/i.test(x)).slice(0, 2)) { const t = act.replace(/^(Confirm|Verify|Check)\s+/i, '').replace(/^Request a field check of/i, 'field check of'); vp.push(`${t.charAt(0).toUpperCase()}${t.slice(1)} (proposed, not yet done)`); }
  if (vp.length) out.push({ key: 'verify', label: 'Still to verify', text: `${vp.slice(0, 3).join('; ')}.`, sources: vsrc.slice(0, 2) });
  return out;
}

export interface Exec { asOf: number; lines: { label: string; text: string }[]; plain: string }
export function execBullets(r: IncidentRecord, f: Bullet[], lead: Attention | undefined, asOf: number, elapsedMin: number): Exec {
  const by = (k: Bullet['key']) => f.find((b) => b.key === k)?.text ?? '';
  const sev = r.severity ? `Incident severity ${r.severity.label} (illustrative scale).` : 'Incident severity not yet assessed.';
  const lines = [
    { label: 'Situation', text: by('happened') },
    { label: 'Impact and response', text: `${by('impact').split(/(?<=\.)\s/).slice(0, 2).join(' ')} ${by('response').split(/(?<=\.)\s/).slice(0, 2).join(' ')}`.trim() },
    { label: 'Open concern', text: `${lead ? `${lead.kind === 'decision' ? 'Decision needed' : lead.kind === 'verification' ? 'To verify' : 'Follow-up'}: ${lead.title.replace(/^Verify: /, '').replace(/\.$/, '')}.` : ''} ${by('verify') ? `Unconfirmed: ${by('verify').split('; ')[0].replace(/\.$/, '').replace(/ \(proposed, not yet done\)/, '').replace(/ \((\d\d:\d\d), reported only\)/, ' (reported $1)')}.` : ''} ${sev}`.replace(/\s+/g, ' ').trim() },
  ];
  const plain = [`${r.site} — ${r.title} — as of ${fmt(asOf)} (T+${elapsedMin} min)${r.mode === 'training' ? ' — training exercise' : ''}`, '', ...lines.map((l) => `${l.label}: ${l.text}`), '', 'Source: ECC Incident Overview. Reported items are not independently verified unless stated.'].join('\n');
  return { asOf, lines, plain };
}

export type RecStatus = 'Notification' | 'Reported' | 'Measured' | 'Inferred' | 'Unverified' | 'Alert' | 'Recommendation' | 'Outstanding' | 'Decision' | 'Cleared' | 'Record';
export interface MsRecord { id: string; t: number; text: string; source: string; status: RecStatus; target: Target; trend?: Target; received?: number; observed?: number; evidence?: PinnedEvidence[] }
export interface Milestone { id: string; t: number; headline: string; qualifier?: string; critical: boolean; why: string[]; key: MsRecord; records: MsRecord[]; equipmentId?: string }
export interface Sequence { ms: Milestone[]; earlier: number }

const HIDDEN = new Set(['measurement', 'agent', 'agent-control', 'lifecycle', 'equipment', 'knowledge', 'acknowledgement', 'investigation', 'severity']);
const statusOf = (e: RecordEvent): RecStatus => {
  if (e.kind === 'notification') return 'Notification';
  if (e.kind === 'alert') return 'Alert';
  if (e.kind === 'recommendation') return 'Recommendation';
  if (e.kind === 'gap') return 'Outstanding';
  if (e.kind === 'decision') return 'Decision';
  if (e.kind === 'outcome') return 'Cleared';
  if (e.kind === 'report') return (e as { status?: string }).status === 'verified' ? 'Measured' : 'Reported';
  const ev = e.meta?.evidence ?? (e.meta?.userSubmitted ? 'reported' : e.kind === 'finding' ? 'inferred' : undefined);
  return ev === 'verified' ? 'Measured' : ev === 'reported' ? 'Reported' : ev === 'inferred' ? 'Inferred' : ev === 'unverified' ? 'Unverified' : 'Record';
};
const sourceText = (e: RecordEvent) => {
  const d = e.detail?.split(' · ')[0];
  if (e.kind === 'observation' || (e.kind === 'finding' && e.meta?.evidence)) return `${d ?? 'Record'}${e.equipmentId && !d?.includes(e.equipmentId) ? ` · ${e.equipmentId}` : ''}`;
  if (e.kind === 'report') return (e as { by?: string }).by ?? 'Field';
  if (e.kind === 'decision') return (e as DecisionEvent).by ?? 'Recorded decision';
  if (e.kind === 'notification') return 'Initial notification';
  if (e.kind === 'recommendation' && e.meta?.superseded) return 'ECC agent · since superseded';
  return `ECC agent${e.equipmentId ? ` · ${e.equipmentId}` : ''}`;
};
const watcherFor = (e: RecordEvent) => (e.kind === 'observation' && e.meta?.obsKind === 'reading' && e.equipmentId ? e.equipmentId : undefined);

/**
 * The incident's turning points, by a fixed rule. A development starts with the initial notification, the first critical
 * condition on each item, a recorded decision, a report of a field action or outcome, a reported observation, or a recovery
 * nothing else explains. Every other record joins the development it belongs to: the same alert, else the same equipment
 * within three minutes, else the same minute. The key record is the one that establishes the development: the field report
 * for a reported condition, the reading for a measured one.
 */
export function milestones(r: IncidentRecord, asOf: number, cap = 8, watcherOf?: (equipmentId: string, text: string) => string | undefined): Sequence {
  const known = r.events.filter((e) => e.t <= asOf && !HIDDEN.has(e.kind) && !e.meta?.narrative && !e.meta?.assessment).sort((a, b) => a.t - b.t);
  type Dev = { id: string; t: number; anchor: RecordEvent; alertIds: Set<string>; eq?: string; recs: RecordEvent[]; recovery: boolean };
  const devs: Dev[] = []; const seenCrit = new Set<string>();
  const mk = (e: RecordEvent, recovery = false): Dev => { const d: Dev = { id: `ms-${e.id}`, t: e.t, anchor: e, alertIds: new Set(alertIdOf(e) ? [alertIdOf(e)!] : []), eq: e.equipmentId, recs: [e], recovery }; devs.push(d); return d; };
  const note = known.find((e) => e.kind === 'notification');
  if (note) mk(note);
  for (const e of known) {
    if (e === note) continue;
    if (e.kind === 'alert') {
      const a = e as AlertEvent; const def = String(e.meta?.alertId ?? '');
      if (a.severity === 'critical' && e.equipmentId && !seenCrit.has(e.equipmentId)) { seenCrit.add(e.equipmentId); mk(e); continue; }
      if (a.state === 'reported') { mk(e); continue; }
      if (a.state === 'recovered') { mk(e, true); continue; }
      if (devs.length === 1 && note && e.t - note.t < 120_000) { devs[0].alertIds.add(def); devs[0].recs.push(e); continue; }
    }
    if (e.kind === 'decision' || (e.kind === 'observation' && e.meta?.userSubmitted)) { mk(e); continue; }
  }
  // Reported field actions open a development only when no reported alert already carries them.
  for (const e of known.filter((x) => x.kind === 'report')) if (!devs.some((d) => d.anchor.kind === 'alert' && (d.anchor as AlertEvent).state === 'reported' && Math.abs(d.t - e.t) < 120_000)) mk(e);
  devs.sort((a, b) => a.t - b.t);
  // A recovery within two minutes of another development is part of that development's story.
  for (const d of [...devs]) if (d.recovery) { const host = devs.filter((x) => x !== d && !x.recovery && Math.abs(x.t - d.t) <= 120_000).sort((x, y) => Math.abs(x.t - d.t) - Math.abs(y.t - d.t))[0]; if (host) { host.recs.push(...d.recs); d.alertIds.forEach((x) => host.alertIds.add(x)); devs.splice(devs.indexOf(d), 1); } }
  const anchors = new Set(devs.flatMap((d) => d.recs));
  for (const e of known) {
    if (anchors.has(e)) continue;
    const aid = alertIdOf(e);
    const host = (aid && devs.find((d) => d.alertIds.has(aid)))
      || (e.equipmentId && [...devs].filter((d) => d.eq === e.equipmentId && Math.abs(d.t - e.t) <= 180_000).sort((a, b) => Math.abs(a.t - e.t) - Math.abs(b.t - e.t))[0])
      || (e.kind === 'finding' && [...devs].reverse().find((d) => d.eq && e.title.includes(d.eq) && Math.abs(d.t - e.t) <= 180_000))
      || [...devs].reverse().find((d) => Math.floor(d.t / 60_000) === Math.floor(e.t / 60_000) || (d.t <= e.t && e.t - d.t < 60_000));
    if (host) { host.recs.push(e); if (e.kind === 'alert' && aid) host.alertIds.add(aid); }
  }
  const toRec = (e: RecordEvent): MsRecord => {
    const w = watcherFor(e) && watcherOf?.(e.equipmentId!, e.title);
    return { id: e.id, t: e.t, text: e.title, source: sourceText(e), status: statusOf(e), target: targetOf(r, e), trend: w ? { kind: 'reading', equipmentId: e.equipmentId!, watcherId: w } : undefined, received: e.meta?.receivedAt != null ? Number(e.meta.receivedAt) : e.recordedAt, observed: e.meta?.observedAt != null ? Number(e.meta.observedAt) : undefined, evidence: e.evidence };
  };
  const ms: Milestone[] = devs.map((d) => {
    const recs = [...d.recs].sort((a, b) => a.t - b.t);
    const a = d.anchor; const alert = a.kind === 'alert' ? (a as AlertEvent) : (recs.find((x) => x.kind === 'alert' && x.meta?.headline) as AlertEvent | undefined);
    // The record that establishes it: the report for a reported condition, the latest reading before it for a measured one.
    const key = a.kind === 'decision' || a.kind === 'report' || (a.kind === 'observation') ? a
      : alert?.evidenceStatus === 'reported' || a.kind === 'notification' ? recs.find((x) => x.kind === 'report' || (x.kind === 'observation' && x.meta?.evidence === 'reported')) ?? a
      : alert?.evidenceStatus === 'verified' ? [...recs].filter((x) => x.kind === 'observation' && x.meta?.obsKind === 'reading' && x.equipmentId === alert.equipmentId && x.t <= alert.t).pop() ?? a
      : a;
    let headline = String(alert?.meta?.headline ?? ''), qualifier = alert?.meta?.qualifier ? String(alert.meta.qualifier) : undefined;
    // Short headlines; the full wording, sources and rationale open with the event.
    if (a.kind === 'decision') { const dd = a as DecisionEvent; headline = decisionHeadline(dd); qualifier = `By ${(dd.by ?? 'the Incident Manager').split(' · ')[0]}${dd.rationale || a.detail ? ' · reason recorded' : ''}`; }
    else if (a.kind === 'observation' && a.meta?.userSubmitted) { headline = `Reported: ${shortHead(a.title)}`; qualifier = `${a.meta?.sourceLabel ?? 'Report'}; not verified`; }
    else if (a.kind === 'report') { headline = `Reported: ${shortHead(a.title)}`; qualifier = (a as { status?: string }).status === 'verified' ? 'Verified' : 'Not verified'; }
    else if (!headline) headline = a.kind === 'notification' ? firstClause(r.notification?.text ?? a.title.replace(/^Initial notification: /, '')) : headline_(a.title);
    const why = alert?.meta?.why ? [String(alert.meta.why), ...(alert.meta.consequence ? [String(alert.meta.consequence)] : [])] : a.kind === 'decision' && a.detail ? [`Rationale recorded: ${a.detail}`] : [];
    return { id: d.id, t: d.t, headline, qualifier, critical: recs.some((x) => x.kind === 'alert' && (x as AlertEvent).severity === 'critical' && x === a), why, key: toRec(key), records: recs.filter((x) => x !== key).map(toRec), equipmentId: d.eq };
  });
  if (ms.length <= cap) return { ms, earlier: 0 };
  // Over the cap the first report stays, then the latest developments; the rest are in the full timeline.
  return { ms: [ms[0], ...ms.slice(ms.length - cap + 1)], earlier: ms.length - cap };
}

// ---------------------------------------------------------------- Round 12: command brief

export interface Card { eq: string; name: string; condition: string; note: string; wait: boolean; alertId: string; basisId: string; t: number; severity: AlertEvent['severity'] }
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
/** One card per item with a recorded condition: its latest alert's status, in monitoring order, the gravest open item first among equals. */
export function statusCards(r: IncidentRecord, asOf: number, order: string[], max = 4): Card[] {
  const latest = new Map<string, AlertEvent>();
  for (const e of r.events) if (e.kind === 'alert' && e.t <= asOf && e.equipmentId) { const p = latest.get(e.equipmentId); if (!p || e.t >= p.t) latest.set(e.equipmentId, e as AlertEvent); }
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? 99 : i; };
  return [...latest.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || SEV_ORDER[a[1].severity] - SEV_ORDER[b[1].severity]).slice(0, max).map(([eq, a]) => {
    const name = EQUIPMENT.find((x) => x.id === eq)?.name ?? eq;
    const condition = String(a.meta?.status ?? headline(a.title).replace(new RegExp(`^${eq}\\s*`), '').replace(/^./, (c) => c.toUpperCase()));
    const note = String(a.meta?.statusNote ?? (a.evidenceStatus === 'reported' ? 'Reported; verification pending' : a.evidenceStatus === 'verified' ? 'Instrument reading (simulated)' : 'Agent assessment'));
    // What explains the card: the gravest condition still open on the item, else its latest alert.
    const open = r.events.filter((e): e is AlertEvent => e.kind === 'alert' && e.t <= asOf && e.equipmentId === eq && (e as AlertEvent).state !== 'recovered' && !isCleared(r, String(e.meta?.alertId), asOf)).sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity] || y.t - x.t)[0];
    const basis = open && SEV_ORDER[open.severity] < SEV_ORDER[a.severity] ? open : a;
    return { eq, name, condition, note, wait: a.evidenceStatus === 'reported' || /pending|unconfirmed|lost|unavailable/i.test(note), alertId: String(a.meta?.alertId), basisId: String(basis.meta?.alertId), t: a.t, severity: basis.severity };
  });
}

/**
 * One plain headline: the latest development, then the main open concern on another item, each as recorded now.
 * A short paragraph says what is pending, not what happened (the milestone strip tells that).
 */
export function situationHead(r: IncidentRecord, asOf: number, cards: Card[], lead: Attention | undefined, seq: Sequence, pendingVerification: number): { headline: string; para: string; concern?: string } {
  const known = r.events.filter((e) => e.t <= asOf);
  // Before any alert, the briefing is what was reported at intake, with its uncertainty.
  if (r.intake && !known.some((e) => e.kind === 'alert')) return { headline: intakeHeadline(r), para: '' };
  const byId = (id: string) => known.find((e) => e.id === `alert-${id}`) as AlertEvent | undefined;
  const sentence = (c: Card) => { const a = byId(c.alertId); return String(a?.meta?.brief ?? `${c.name} (${c.eq}): ${c.condition.charAt(0).toLowerCase()}${c.condition.slice(1)}`); };
  // The latest condition: the newest milestone that is an alert. A report made in ECC enters through materialReport below.
  const evOf = (m: (typeof seq.ms)[number]) => known.find((e) => e.id === m.id.replace(/^ms-/, ''));
  const last = [...seq.ms].reverse().find((m) => evOf(m)?.kind === 'alert') ?? seq.ms[seq.ms.length - 1];
  const lastAlert = last ? (evOf(last) as AlertEvent | undefined) : undefined;
  const lastCard = last?.equipmentId ? cards.find((c) => c.eq === last.equipmentId && c.alertId === String(lastAlert?.meta?.alertId)) : undefined;
  const s1 = lastCard ? sentence(lastCard) : String(lastAlert?.meta?.brief ?? last?.headline ?? r.title);
  const leadEq = lead?.target.kind === 'alert' ? byId((lead.target as { alertId: string }).alertId)?.equipmentId : undefined;
  const concern = cards.find((c) => c.eq === leadEq && c.eq !== last?.equipmentId) ?? cards.find((c) => c.wait && c.eq !== last?.equipmentId && c.severity === 'critical');
  const s2 = concern ? sentence(concern) : '';
  void pendingVerification;
  // What is happening, not what to do: pending decisions and checks belong to Requires attention.
  const damage = known.some((e) => e.kind === 'alert' && (e as AlertEvent).severity === 'critical');
  const para = damage ? '' : 'No equipment damage has been reported.';
  // A report made in ECC enters the headline when it changes the picture: it conflicts with the readings, uses urgent
  // wording, or concerns something no alert covers. It is quoted, with its qualifier beside it.
  const report = materialReport(r, asOf, last?.t ?? 0);
  const lines = [report, `${s1}.`, s2 && s2 !== s1 ? `${s2}.` : ''].filter(Boolean).slice(0, 2).map((x) => x.replace(/\.\.$/, '.'));
  return { headline: lines.join(' '), para, concern: s2 && s2 !== s1 ? s2 : undefined };
}

/** Short title for an attention item: what to do, not the full recommendation text. */
export function shortTitle(r: IncidentRecord, a: Attention): string {
  if (a.id.startsWith('dec-')) return firstClause(a.title);
  if (a.id.startsWith('rev-')) return `Review recorded decision: ${firstClause(a.title.replace(/^Recorded decision needs review: /, ''))}`;
  if (a.id.startsWith('ver-')) { const al = r.events.find((e) => e.id === `alert-${(a.target as { alertId?: string }).alertId}`); return `Verify: ${al?.meta?.headline ?? a.title.replace(/^Verify: /, '')}`; }
  return a.title;
}
export const alertOf = (r: IncidentRecord, t: Target) => (t.kind === 'alert' ? (r.events.find((e) => e.id === `alert-${t.alertId}`) as AlertEvent | undefined) : undefined);
export const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();

// ---------------------------------------------------------------- Round 14: executive brief for a leader reading outside ECC

export interface LeaderBrief { asOf: number; context: string[]; sections: { key: 'situation' | 'impact' | 'concern'; label: string; text: string }[]; plain: string }
/** Lower-case the first letter of a sentence fragment, but never an equipment tag or acronym (D-0029, FH-01). */
const lc = (t: string) => (/^[A-Z][A-Z0-9-]/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
const uc = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/**
 * Three short sections from the record as of the briefing time. Qualifiers stay in the sentence they apply to:
 * what was reported, what the (simulated) readings show, and which decision is pending.
 */
export function leaderBrief(r: IncidentRecord, asOf: number, cards: Card[], lead: Attention | undefined, seq: Sequence, concernSentence: string | undefined): LeaderBrief {
  const known = r.events.filter((e) => e.t <= asOf).sort((a, b) => a.t - b.t);
  const firstAlert = known.find((e) => e.kind === 'alert' && e.equipmentId);
  const area = firstAlert ? EQUIPMENT.find((x) => x.id === firstAlert.equipmentId)?.area : undefined;
  const sevText = r.severity ? `Incident severity ${r.severity.label} (illustrative scale)` : 'Incident severity not yet assessed';
  const context = [r.site, ...(area ? [`${area} area`] : []), sevText, `As of ${fmt(asOf)}`, ...(r.mode === 'training' ? ['Training exercise'] : [])];
  // Situation: how it began, then the latest development with its qualifier.
  const note = known.find((e) => e.kind === 'notification');
  const begin = `${(r.notification?.text ?? note?.detail?.split(' · ').pop() ?? r.title).replace(/\.$/, '')} (reported ${fmt(note?.t ?? r.startedAt)}).`;
  const last = seq.ms[seq.ms.length - 1];
  const latest = last && last.key.id !== note?.id && seq.ms.length > 1 ? ` Latest: ${lc(last.headline)} at ${fmt(last.t)}${last.qualifier ? `; ${lc(last.qualifier)}` : ''}.` : '';
  // Impact and response: the other items' current state with their qualification, then the latest field action or decision.
  const lastEq = last?.equipmentId;
  const leadEq = lead?.target.kind === 'alert' ? (known.find((e) => e.id === `alert-${(lead.target as { alertId: string }).alertId}`)?.equipmentId) : undefined;
  const others = cards.filter((c) => c.eq !== lastEq && c.eq !== leadEq).slice(0, 2).map((c) => `${c.eq} ${lc(c.condition)} (${lc(c.note).replace(/\s*\(([^)]*)\)/g, ', $1')})`);
  const damage = known.some((e) => e.kind === 'alert' && (e as AlertEvent).severity === 'critical');
  const action = [...known].reverse().find((e) => e.kind === 'report' || e.kind === 'decision');
  const resp = action?.kind === 'report' ? `The field reported at ${fmt(action.t)}: ${lc(firstClause(action.title))}${(action as { status?: string }).status === 'verified' ? '' : ' (not independently verified)'}.`
    : action?.kind === 'decision' ? `Decision recorded at ${fmt(action.t)}: ${lc(firstClause(action.title))}.` : 'No decision or field action has been recorded yet.';
  const impact = `${others.length ? `${uc(others.join('; '))}.` : damage ? '' : 'No equipment damage has been reported.'} ${resp}`.trim();
  // Open concern: the main unresolved issue and the decision or check it waits on.
  const concernCard = cards.find((c) => c.eq === leadEq);
  const issue = concernSentence ?? (concernCard ? `${concernCard.name} (${concernCard.eq}): ${lc(concernCard.condition)}` : undefined);
  const qual = concernCard && concernCard.wait ? ` (${lc(concernCard.note).replace(/\s*\(([^)]*)\)/g, ', $1')})` : '';
  const kind = lead ? (lead.id.startsWith('ver-') ? 'verification' : lead.id.startsWith('rev-') ? 'review' : lead.kind) : undefined;
  const ask = !lead ? 'Nothing is awaiting a decision or verification.'
    : kind === 'decision' ? `A recommendation awaits a decision: ${lc(lead.title.replace(/\.$/, ''))}.`
    : kind === 'review' ? `A recorded decision needs review because its recommendation was superseded.`
    : kind === 'verification' ? `Awaiting independent verification: ${lc(lead.title.replace(/^Verify: /, '').replace(/\.$/, ''))}.`
    : `${lead.title.replace(/\.$/, '')}.`;
  const concern = `${issue ? `${uc(issue)}${qual}. ` : ''}${ask}`;
  const sections = [
    { key: 'situation' as const, label: 'Situation', text: `${begin}${latest}` },
    { key: 'impact' as const, label: 'Impact and response', text: impact },
    { key: 'concern' as const, label: 'Open concern', text: concern },
  ];
  const plain = [`Executive brief · ${context.join(' · ')}`, '', ...sections.flatMap((s) => [s.label, s.text, '']), `Source: ECC incident record ${r.id}, as of ${fmt(asOf)}. Reported items are not independently verified unless stated; readings are simulated in this training exercise.`.replace(/; readings are simulated in this training exercise/, r.mode === 'training' ? '; readings are simulated in this training exercise' : '')].join('\n');
  return { asOf, context, sections, plain };
}

/** The newest report made in ECC that materially changes the incident picture, as one sentence with its qualifier, or ''. */
function materialReport(r: IncidentRecord, asOf: number, since: number): string {
  const alertEq = new Set(r.events.filter((e) => e.kind === 'alert' && e.t <= asOf && e.equipmentId).map((e) => e.equipmentId!));
  const invs = (r.investigations ?? []).filter((i) => i.kind === 'observation' && i.t <= asOf && i.t >= since).sort((a, b) => b.t - a.t);
  for (const i of invs) {
    const conflict = outcomeOf(i)?.kind === 'conflict';
    const fresh = !i.context.equipmentId || !alertEq.has(i.context.equipmentId);
    if (!conflict && !i.urgentWording && !fresh) continue;
    const who = i.by.split(' · ')[0];
    const q = i.text.trim().replace(/[.!]+$/, '');
    return `Reported${conflict ? ', and conflicting with readings' : ', not verified'}: “${q}” (${who}${i.context.equipmentId ? `, ${i.context.equipmentId}` : ''}).`;
  }
  return '';
}

/** One sentence from the intake: what was reported, where, and which equipment, saying plainly what is not yet known. */
export function intakeHeadline(r: IncidentRecord): string {
  const it = r.intake ?? {};
  const type = r.incidentType && r.incidentType !== 'Not sure' ? r.incidentType : 'An incident of unknown type';
  const eq = r.equipment.filter((id) => !(it.suggested ?? []).some((s) => s.id === id && s.status === 'added'));
  const named = eq.map((id) => `${id} ${EQUIPMENT.find((x) => x.id === id)?.name ?? ''}`.trim());
  const where = it.place
    ? `${it.placeApprox ? 'near' : 'at'} ${placePhrase(it.place)}${it.placeApprox ? ' (approximate)' : ''}`
    : named.length ? `at ${named.join(' and ')}` : it.area ? `in the ${it.area} area` : 'location not yet confirmed';
  // A described place is more specific than the area, so the area is added only to an equipment location.
  const area = it.area && !it.place && named.length && !where.toLowerCase().includes(it.area.toLowerCase()) ? `, ${it.area} area` : '';
  const equipment = it.place && named.length ? `; ${named.join(' and ')} may be involved` : !named.length ? '; equipment not yet identified' : '';
  return `${type} reported ${where}${area}${equipment}.`;
}

/** A described place read naturally after “at” or “near”: “north side of the propane area” becomes “the north side of the propane area”. */
export function placePhrase(place: string): string {
  const p = place.trim().replace(/^(at|near)\s+/i, '');
  return /^(the|a|an)\s/i.test(p) || /^[A-Z]{1,3}-?\d/.test(p) || /^[A-Z]/.test(p) ? p : `the ${p}`;
}

/** A decision in a few words: which recommendation, and what was decided. “Fire-response recommendation declined.” */
const TOPICS: [RegExp, string][] = [[/fire response|fire at|the fire\b/i, 'Fire-response'], [/deluge/i, 'Deluge'], [/depressuri[sz]/i, 'Depressurization'], [/cooling/i, 'Cooling'], [/isolat/i, 'Isolation'], [/personnel|evacuat|muster/i, 'Personnel'], [/stabili[sz]/i, 'Stabilization']];
export function decisionHeadline(d: DecisionEvent): string {
  const text = d.recommendationSummary ?? d.title;
  const topic = TOPICS.find(([re]) => re.test(text))?.[1] ?? firstClause(text).split(' ').slice(0, 3).join(' ');
  const verb = d.status === 'approved' ? 'accepted' : d.status === 'declined' ? 'declined' : d.status === 'deferred' ? 'deferred' : '';
  return verb ? `${topic} recommendation ${verb}` : `Different response to the ${topic.toLowerCase()} recommendation`;
}
/** A headline that fits a milestone: the first clause, cut at a word near 52 characters. */
function shortHead(t: string): string {
  const c = firstClause(t).replace(/\.$/, '');
  if (c.length <= 52) return c;
  const cut = c.slice(0, 52); return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
