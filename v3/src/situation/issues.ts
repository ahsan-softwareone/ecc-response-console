// Situation Room model: one feed of incident updates, grouped into issues that share one response.
// Pure derivation from what is visible now plus what people recorded. Nothing here records anything.
import { useMemo } from 'react';
import type { EvidenceStatus, Severity } from '../data/types';
import { SEVERITY_ORDER, useDerived, type AlertView, type Derived } from '../lib/derive';
import { latestOf } from '../investigate/followThrough';
import type { Investigation } from '../record/types';
import { useStore, type AlertUserState, type Contact, type Decision, type IssueUserState, type Placement, type UserIssue } from '../store';

export type Origin = 'monitoring' | 'field' | 'agent' | 'person';
export const ORIGIN_LABEL: Record<Origin, string> = { monitoring: 'Monitoring', field: 'Field report', agent: 'ECC agent', person: 'Reported in ECC' };

export type PlaceKind = 'opens' | 'joins' | 'review' | 'info';
export interface Place {
  kind: PlaceKind;
  issueId?: string;
  /** For review: the issue ECC suggests, and why. */
  suggest?: string;
  reason?: string;
  /** Who placed it: ECC, or a person (with their name and time). */
  by: 'ecc' | 'person';
  who?: string;
  at?: number;
  /** ECC would add it to this issue, but the issue is closed. */
  closedIssue?: string;
}
export interface Update {
  id: string; t: number; origin: Origin;
  /** Who or what it came from, e.g. "Field · Fire team leader". */
  source: string;
  /** The update as the source said it. */
  text: string;
  /** The same, in plain words for a non-technical reader. */
  plain: string;
  severity?: Severity; evidence?: EvidenceStatus;
  /** When the agent analysed it, if later than it occurred (paused, stopped or not started). */
  late?: number;
  /** For a monitoring alert: its condition now (Active, Recovered, Cleared, Reported, Unconfirmed). */
  condition?: AlertView['condition'];
  equipmentId?: string; alertId?: string; obsId?: string; invId?: string;
  /** A new title for its issue, when this update changes what the issue is about. */
  retitle?: string;
  place: Place;
}

export interface Rep { id: string; at: number; by: string; text: string; status: 'reported' | 'verified' | 'not-started'; scenario?: boolean; key: string }
/** What the issue is waiting for, in order: a decision, the field team's report, a check that it worked, someone closing it. */
export type Ask = 'decision' | 'deferred' | 'respond' | 'field' | 'verify' | 'close' | 'closed';
export const ASK_LABEL: Record<Ask, string> = { decision: 'Awaiting decision', deferred: 'Decision deferred', respond: 'Response needed', field: 'Awaiting field update', verify: 'Verification pending', close: 'Ready to close', closed: 'Closed' };

export interface Issue {
  id: string; title: string; user: boolean;
  openedAt: number; opener: Update; latest: Update;
  /** The development that best says what the issue is now: the latest update that changed it (new suggestion, new title, critical alert), else the latest. */
  lead: Update;
  updates: Update[];
  equipment: string[];
  /** Highest severity among its alerts that still need attention. */
  severity: Severity | null;
  alerts: AlertView[];
  /** ECC's current suggested response: the latest alert in the issue with a recommendation. */
  suggestion: AlertView | null;
  /** Another issue's response replaced part of this suggestion. */
  replacedBy?: { issueId: string; t: number; reason: string };
  /** Where this issue's decision and reports are kept. */
  key: string;
  decision?: Decision;
  /** Decisions on ECC's earlier suggestions in this issue. */
  earlier: { alert: AlertView; decision: Decision }[];
  reports: Rep[];
  verifications: Rep[];
  /** Who the Incident Manager told, and follow-ups, oldest first. */
  contacts: Contact[];
  ask: Ask;
  /** Each step on its own: a decision to act, the field team's report since, and a check since (or since reopening). */
  decided: boolean; reported: boolean; verified: boolean;
  /** Checked once, but a newer development has come in since, so it needs checking again. */
  recheck: boolean;
  reopenedAt: number | null;
  closed?: { t: number; by: string; note: string } | null;
  history: IssueUserState['history'];
  /** Never opened, or the number of updates since it was last opened. */
  fresh: boolean; unseen: number;
}
export interface RoomData { updates: Update[]; issues: Issue[]; open: Issue[]; closed: Issue[]; review: Update[]; byId: Map<string, Issue>; updateById: Map<string, Update>; issueOfAlert: (alertId: string) => string | null }

const ASK_ORDER: Record<Ask, number> = { decision: 0, respond: 1, verify: 2, field: 3, deferred: 4, close: 5, closed: 6 };
const short = (who: string) => who.split(' · ')[0];

function personUpdate(inv: Investigation): Update {
  const r = latestOf(inv);
  const by = short(inv.by);
  return { id: `inv-${inv.id}`, t: inv.t, origin: 'person', source: `Reported in ECC · ${by}`, text: inv.text, plain: inv.text, equipmentId: inv.context.equipmentId, alertId: inv.context.alertId ?? r?.suggestion?.alertId, invId: inv.id, evidence: 'reported', place: { kind: 'review', by: 'ecc' } };
}

export function buildRoom(d: Derived, investigations: Investigation[], alertUser: Record<string, AlertUserState>, issueUser: Record<string, IssueUserState>, placements: Record<string, Placement>, userIssues: UserIssue[]): RoomData {
  const ups: Update[] = [];
  for (const a of d.alerts) ups.push({ id: a.id, t: a.time, origin: 'monitoring', source: a.def.evidence === 'reported' ? 'Monitoring · from a field report' : 'Monitoring', text: a.def.title, plain: a.def.plain ?? a.def.title, severity: a.def.severity, evidence: a.def.evidence, equipmentId: a.def.equipmentId, alertId: a.id, retitle: a.def.issueTitle, late: a.processedLate, condition: a.condition, place: a.def.issue ? { kind: 'joins', issueId: a.def.issue, by: 'ecc' } : { kind: 'review', by: 'ecc', reason: 'ECC could not tell which issue this belongs to.' } });
  for (const o of d.observations) {
    if (o.kind === 'reading') continue;
    const origin: Origin = o.kind === 'agent-finding' || o.kind === 'route-assessment' ? 'agent' : 'field';
    // Every report lands in Open issues: the issue it belongs to, or an issue of its own. There is no holding state.
    const place: Place = o.issue === 'info' ? { kind: 'info', by: 'ecc' } : o.issue ? { kind: 'joins', issueId: o.issue, by: 'ecc' } : o.review?.suggest ? { kind: 'joins', issueId: o.review.suggest, by: 'ecc' } : origin === 'agent' ? { kind: 'info', by: 'ecc' } : { kind: 'joins', issueId: `obs-${o.id}`, by: 'ecc' };
    ups.push({ id: o.id, t: o.time, origin, source: o.source.replace(/^Field · /, 'Field · '), text: o.text, plain: o.plain ?? o.text, evidence: o.evidence, equipmentId: o.equipmentId, obsId: o.id, retitle: o.issueTitle, place });
  }
  for (const inv of investigations) if (inv.kind === 'observation') ups.push(personUpdate(inv));
  ups.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));

  // Scenario issues are named by key; people's issues by id. Both start with the first update placed in them.
  const issues = new Map<string, { id: string; user: boolean; title: string; updates: Update[] }>();
  const userById = new Map(userIssues.map((u) => [u.id, u]));
  const closedAt = (id: string) => issueUser[id]?.closed?.t ?? null;
  const alertIssue = new Map<string, string>();
  const eqIssues = (eq: string | undefined) => (eq ? [...issues.values()].filter((i) => i.updates.some((u) => u.equipmentId === eq)) : []);
  for (const u of ups) {
    const p = placements[u.id];
    if (p) {
      u.place = p.to === 'info' ? { kind: 'info', by: 'person', who: short(p.by), at: p.at } : { kind: 'joins', issueId: p.to, by: 'person', who: short(p.by), at: p.at };
    } else if (u.origin === 'person') {
      // A report made in ECC joins the issue ECC links it to; otherwise a person decides where it goes.
      const viaAlert = u.alertId ? alertIssue.get(u.alertId) : undefined;
      const cands = eqIssues(u.equipmentId).filter((i) => !closedAt(i.id));
      // A report made in ECC goes straight into Open issues: the issue its alert is in; else the issue its equipment is in
      // (the most recently active, if several); else an issue of its own, titled with the report's own words.
      const latestT = (i: { updates: Update[] }) => i.updates[i.updates.length - 1]?.t ?? 0;
      const best = cands.sort((x, y) => latestT(y) - latestT(x))[0];
      if (viaAlert) u.place = { kind: 'joins', issueId: viaAlert, by: 'ecc' };
      else if (best) u.place = { kind: 'joins', issueId: best.id, by: 'ecc' };
      else { u.place = { kind: 'joins', issueId: u.id, by: 'ecc' }; u.retitle = u.plain.length > 80 ? `${u.plain.slice(0, 77)}…` : u.plain; }
    }
    const target = u.place.kind === 'joins' ? u.place.issueId! : null;
    if (!target) continue;
    // ECC never adds an update to a closed issue on its own: a person decides whether it reopens the issue.
    const c = closedAt(target);
    // The one case that waits for a person: ECC never reopens a closed issue on its own.
    if (u.place.by === 'ecc' && c != null && u.t > c) { u.place = { kind: 'review', by: 'ecc', suggest: target, closedIssue: target, reason: 'This update is about an issue that has been closed.' }; continue; }
    let iss = issues.get(target);
    if (!iss) {
      const ui = userById.get(target);
      iss = { id: target, user: !!ui, title: ui?.title ?? u.retitle ?? u.plain, updates: [] };
      issues.set(target, iss);
      if (u.place.by === 'ecc') u.place = { ...u.place, kind: 'opens' };
      else if (ui && ui.from === u.id) u.place = { ...u.place, kind: 'opens' };
    }
    if (u.retitle && !iss.user) iss.title = u.retitle;
    iss.updates.push(u);
    if (u.alertId && u.origin === 'monitoring') alertIssue.set(u.alertId, target);
  }

  const all: Issue[] = [];
  for (const raw of issues.values()) {
    const alerts = raw.updates.filter((u) => u.origin === 'monitoring').map((u) => d.alertById.get(u.alertId!)!).filter(Boolean);
    const withRec = alerts.filter((a) => a.def.recommendation).sort((a, b) => a.time - b.time);
    const suggestion = withRec[withRec.length - 1] ?? null;
    const sup = suggestion?.supersededBy;
    const replacedBy = sup && alertIssue.get(sup.alertId) && alertIssue.get(sup.alertId) !== raw.id ? { issueId: alertIssue.get(sup.alertId)!, t: sup.time, reason: sup.reason } : undefined;
    const key = suggestion ? suggestion.id : `issue:${raw.id}`;
    const decision = alertUser[key]?.decision;
    const earlier = withRec.filter((a) => a.id !== key && alertUser[a.id]?.decision).map((a) => ({ alert: a, decision: alertUser[a.id]!.decision! }));
    const keys = [...alerts.map((a) => a.id), `issue:${raw.id}`];
    const reps: Rep[] = [
      ...d.fieldReports.filter((r) => keys.includes(r.alertId)).map((r, i) => ({ id: `s-${r.alertId}-${i}`, at: r.time, by: r.by, text: r.text, status: r.status, scenario: true, key: r.alertId })),
      ...keys.flatMap((k) => (alertUser[k]?.reports ?? []).map((r) => ({ ...r, key: k }))),
    ].sort((a, b) => a.at - b.at);
    const contacts = keys.flatMap((k) => alertUser[k]?.contacts ?? []).sort((a, b) => a.at - b.at);
    const reports = reps.filter((r) => r.status !== 'verified');
    const verifications = reps.filter((r) => r.status === 'verified');
    const u = issueUser[raw.id];
    const closed = u?.closed ?? null;
    // A reopened issue needs a fresh check: a verification from before the reopening no longer counts.
    const reopenedAt = [...(u?.history ?? [])].reverse().find((h) => h.kind === 'reopened')?.t ?? null;
    const decided = !!decision && (decision.status === 'approved' || decision.status === 'alternative');
    const reported = decided && (reports.some((r) => r.at >= decision!.at) || reports.some((r) => r.key === key));
    // A check settles the issue only if nothing new has come in since: a later development needs checking again.
    const lastCheck = Math.max(0, ...verifications.map((r) => r.at));
    const newer = raw.updates.some((x) => x.t > lastCheck && x.place.by === 'ecc' && x.origin !== 'agent');
    const verified = decided && verifications.some((r) => r.at >= Math.max(decision!.at, reopenedAt ?? 0)) && !newer;
    const recheck = decided && verifications.length > 0 && newer;
    let ask: Ask;
    if (closed) ask = 'closed';
    else if (!decision) ask = suggestion ? 'decision' : 'respond';
    else if (decision.status === 'deferred') ask = 'deferred';
    else if (decision.status === 'declined') ask = 'respond';
    else if (verified) ask = 'close';
    else if (reported) ask = 'verify';
    else ask = 'field';
    const live = alerts.filter((a) => a.condition === 'active' || a.condition === 'unconfirmed');
    const severity = live.length ? live.map((a) => a.def.severity).sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])[0] : null;
    const seen = u?.lastSeen;
    const keyUpdates = raw.updates.filter((x) => x.retitle || x.alertId === suggestion?.id || x.severity === 'critical' || x.place.by === 'person');
    const lead = keyUpdates[keyUpdates.length - 1] ?? raw.updates[raw.updates.length - 1];
    all.push({ id: raw.id, title: raw.title, user: raw.user, openedAt: raw.updates[0].t, opener: raw.updates[0], latest: raw.updates[raw.updates.length - 1], lead, updates: raw.updates, equipment: [...new Set(raw.updates.map((x) => x.equipmentId).filter(Boolean) as string[])], severity, alerts, suggestion, replacedBy, key, decision, earlier, reports, verifications, contacts, ask, decided, reported, verified, recheck, reopenedAt, closed, history: u?.history ?? [], fresh: seen == null, unseen: seen == null ? 0 : raw.updates.filter((x) => x.t > seen).length });
  }
  const sev = (i: Issue) => (i.severity ? SEVERITY_ORDER[i.severity] : 9);
  const open = all.filter((i) => !i.closed).sort((a, b) => ASK_ORDER[a.ask] - ASK_ORDER[b.ask] || sev(a) - sev(b) || b.latest.t - a.latest.t);
  const closed = all.filter((i) => i.closed).sort((a, b) => b.closed!.t - a.closed!.t);
  const review = ups.filter((u) => u.place.kind === 'review').sort((a, b) => b.t - a.t);
  return { updates: ups.slice().reverse(), issues: all, open, closed, review, byId: new Map(all.map((i) => [i.id, i])), updateById: new Map(ups.map((u) => [u.id, u])), issueOfAlert: (id) => alertIssue.get(id) ?? null };
}

export function useRoom(): RoomData {
  const d = useDerived();
  const investigations = useStore((s) => s.records[s.incidentId]?.investigations);
  const alertUser = useStore((s) => s.alertUser);
  const issueUser = useStore((s) => s.issueUser);
  const placements = useStore((s) => s.placements);
  const userIssues = useStore((s) => s.userIssues);
  return useMemo(() => buildRoom(d, investigations ?? [], alertUser, issueUser, placements, userIssues), [d, investigations, alertUser, issueUser, placements, userIssues]);
}

/** A follow-up is due when the latest contact expected a field update by now and none has come in since. Open issues only. */
export function followUpDue(i: Issue, now: number): { contact: Contact; since: number } | null {
  if (i.closed) return null;
  const last = [...i.contacts].reverse().find((c) => c.expectBy);
  if (!last || now < last.expectBy!) return null;
  const heard = [...i.reports, ...i.verifications].some((r) => r.at >= last.at);
  return heard ? null : { contact: last, since: last.at };
}
