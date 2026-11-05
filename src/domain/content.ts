// Deterministic mock agent output: the Assistant's answers and the SITREP text.
// Everything is composed from shared state, so it always matches what the views show.
import { feedEntries } from './brief';
import { fmt, hm, INCIDENT, PERSONNEL_REC } from './scenario';
import { ACTION_STATUS_LABEL, OUTCOME_LABEL, RELATION_LABEL, TRUST_LABEL } from './types';
import type { AnswerPart, AnyRecord, Asset, DraftSection, EccState, Minutes, Report } from './types';

export function resolveRecord(s: EccState, id: string): AnyRecord | undefined {
  return (
    s.reports.find((r) => r.id === id) ??
    s.docs.find((r) => r.id === id) ??
    s.issues.find((r) => r.id === id) ??
    s.assets.find((r) => r.id === id) ??
    s.rows.find((r) => r.id === id) ??
    s.recommendations.find((r) => r.id === id) ??
    s.decisions.find((r) => r.id === id) ??
    s.actions.find((r) => r.id === id) ??
    s.feed.find((r) => r.id === id) ??
    s.citations.find((r) => r.id === id) ??
    s.knowledge.find((r) => r.id === id) ??
    s.monitors.find((r) => r.id === id)
  );
}

export const CHANNEL_LABEL: Record<Report['channel'], string> = {
  'control-room': 'Control room report',
  field: 'Field operator report',
  'fire-team': 'Fire team report',
  security: 'Site Security report',
  'user-entry': 'Field update',
};

/** A meaningful name for a record, used on evidence links. Identifiers stay secondary: see recordId. */
export function recordLabel(s: EccState, id: string): string {
  const r = resolveRecord(s, id);
  if (!r) return id;
  switch (r.kind) {
    case 'report':
      return `${CHANNEL_LABEL[r.channel]}, ${fmt(r.observedAt ?? r.receivedAt)}`;
    case 'document':
      return r.title;
    case 'issue':
      return r.title;
    case 'asset':
      return r.tag;
    case 'assessment':
      return r.label;
    case 'recommendation':
      return `Recommendation: ${r.shortTitle.toLowerCase()}`;
    case 'decision': {
      const rec = s.recommendations.find((x) => x.id === r.recommendationId);
      return `Decision: ${rec ? rec.shortTitle.toLowerCase() : r.recommendationId}`;
    }
    case 'action':
      return r.title;
    case 'feed':
      return r.title;
    case 'citation':
      return r.revision && !r.title.includes(r.revision) ? `${r.title} (${r.revision})` : r.title;
    case 'kdoc':
      return `${r.docNumber}: ${r.title}`;
    case 'monitor':
      return r.name;
  }
}

/** The record's identifier, shown as secondary detail. Assets and assessment lines have none worth showing. */
export function recordId(s: EccState, id: string): string | undefined {
  const r = resolveRecord(s, id);
  return r && r.kind !== 'asset' && r.kind !== 'assessment' ? r.id : undefined;
}

const Q_CHANGED = 'What changed in the last five minutes?';
const Q_WHY = 'Why is this equipment included?';
const Q_SUPPORTS = 'What supports this assessment?';
const Q_OPEN = 'Which important questions remain unanswered?';
const Q_RESPONSE = 'What response has been reported so far?';

/** A few questions that fit what the user is looking at. */
export function suggestedQuestions(s: EccState, focus?: string): string[] {
  const r = focus ? resolveRecord(s, focus) : undefined;
  if (r?.kind === 'asset') return [Q_WHY, Q_CHANGED, Q_OPEN];
  if (r?.kind === 'assessment' || r?.kind === 'recommendation') return [Q_SUPPORTS, Q_OPEN, Q_CHANGED];
  if (r?.kind === 'decision' || r?.kind === 'action') return [Q_RESPONSE, Q_CHANGED, Q_OPEN];
  return [Q_CHANGED, Q_OPEN, Q_RESPONSE];
}

const fact = (text: string, refs: string[] = []): AnswerPart => ({ kind: 'fact', text, refs });
const assess = (text: string, refs: string[] = []): AnswerPart => ({ kind: 'assessment', text, refs });
const gap = (text: string, refs: string[] = []): AnswerPart => ({ kind: 'gap', text, refs });
const note = (text: string, refs: string[] = []): AnswerPart => ({ kind: 'note', text, refs });

function assetFromQuestion(s: EccState, q: string, focus?: string): Asset | undefined {
  const lower = q.toLowerCase();
  const named = s.assets.find((a) => a.identified && lower.includes(a.tag.toLowerCase()));
  if (named) return named;
  return s.assets.find((a) => a.id === focus);
}

export function answerQuestion(s: EccState, question: string, focus?: string): AnswerPart[] {
  const q = question.toLowerCase();
  const focused = focus ? resolveRecord(s, focus) : undefined;

  if (/chang|new|latest|last (five|5)|update/.test(q)) {
    const since = s.now - 5;
    const recent = feedEntries(s).filter((d) => d.publishedAt >= since);
    if (recent.length === 0) {
      return [
        note(`Nothing material has entered the record since ${fmt(since)}. The clock is at ${fmt(s.now)}.`),
        gap('A quiet record means nothing new has been reported. It does not mean conditions are unchanged.'),
      ];
    }
    return recent.map((d) => {
      const line = `${fmt(d.publishedAt)}: ${d.title}. ${d.body}`;
      return d.trust === 'assessment' || d.feedKind === 'assessment' ? assess(line, d.citations) : d.trust === 'unknown' || d.trust === 'unavailable' ? gap(line, d.citations) : fact(line, d.citations);
    });
  }

  if (/why.*(equipment|included|asset|listed|here)|why is/.test(q)) {
    const asset = assetFromQuestion(s, question, focus);
    if (!asset) {
      return [note('Which item do you mean? Select equipment in Assets & Areas, or name its tag, and ask again.')];
    }
    const relation = RELATION_LABEL[asset.relation].toLowerCase();
    return [
      assess(`${asset.tag} is ${relation}. ${asset.whyIncluded}`, asset.refs),
      fact(`Current condition: ${asset.condition.statement} (${TRUST_LABEL[asset.condition.trust]}, ${fmt(asset.condition.at)})`, asset.condition.refs),
      ...(asset.possibleConsequence ? [assess(`Possible, not current: ${asset.possibleConsequence}`, [asset.id])] : []),
    ];
  }

  if (/support|evidence|basis|based on|how do you know/.test(q)) {
    const row = focused?.kind === 'assessment' ? focused : undefined;
    if (row) {
      return [
        assess(`Current statement: ${row.statement}`, [row.id]),
        fact(`It rests on ${row.refs.length} linked ${row.refs.length === 1 ? 'item' : 'items'}, last revised at ${fmt(row.at)}.`, row.refs),
        ...(row.history.length ? [note(`It has been revised ${row.history.length} ${row.history.length === 1 ? 'time' : 'times'}. Earlier wording is kept with the item.`)] : []),
      ];
    }
    if (focused?.kind === 'recommendation') {
      return [assess(`Surfaced because: ${focused.why}`, focused.evidence), gap(`Uncertain: ${focused.uncertainty}`)];
    }
    if (focused?.kind === 'asset') {
      return [assess(`${focused.tag} is included because: ${focused.whyIncluded}`, focused.refs)];
    }
    return s.rows
      .filter((r) => r.refs.length > 0)
      .map((r) => (r.trust === 'unknown' || r.trust === 'not-reported' ? gap(`${r.label}: ${r.statement}`, r.refs) : r.trust === 'assessment' ? assess(`${r.label}: ${r.statement}`, r.refs) : fact(`${r.label}: ${r.statement}`, r.refs)));
  }

  if (/unanswered|question|unknown|missing|gap|don.t know|uncertain/.test(q)) {
    const open = s.issues.filter((i) => i.status !== 'answered');
    if (open.length === 0) {
      return [note('Every question the agent has raised has an answer on the record. Other things may still be unknown.')];
    }
    return open.map((i) => gap(`${i.title} ${i.status === 'partly-answered' ? '(partly answered) ' : ''}${i.whyItMatters}`, [i.id]));
  }

  if (/response|done|action|decision|decided|progress/.test(q)) {
    const dec = s.decisions.map((d) => fact(`${fmt(d.at)}: ${d.recordedByRole} recorded "${OUTCOME_LABEL[d.outcome]}" on ${s.recommendations.find((r) => r.id === d.recommendationId)?.shortTitle.toLowerCase()}.`, [d.id]));
    const acts = s.actions.map((a) => fact(`${a.title}: ${ACTION_STATUS_LABEL[a.status]}.`, [a.id]));
    return [...dec, ...acts, note('These are what people have reported. The system has not performed any of these actions or contacted anyone.')];
  }

  return [
    gap('The incident record does not hold information to answer that, so I will not estimate it.'),
    note('I can answer from the reports, equipment records and decisions in this incident. Try one of the questions below, or record what you know as a field update.'),
  ];
}

/** Compose SITREP sections from current state. Pure, so a refresh can diff against the last one. */
export function composeSitrep(s: EccState): Pick<DraftSection, 'id' | 'title' | 'text'>[] {
  const rowText = (id: string) => {
    const r = s.rows.find((x) => x.id === id)!;
    return `${r.statement} [${TRUST_LABEL[r.trust]}, ${fmt(r.at)}]`;
  };
  const confirmed = s.assets.filter((a) => a.identified && (a.relation === 'reported-involved' || a.relation === 'verified-involved'));
  const potential = s.assets.filter((a) => a.identified && a.relation === 'potentially-relevant');
  const open = s.issues.filter((i) => i.status !== 'answered');
  return [
    {
      id: 'situation',
      title: 'Current situation',
      text: `${s.headline.statement} [${TRUST_LABEL[s.headline.trust]}, ${fmt(s.headline.at)}]\n\nRelease: ${rowText('ROW-release')}\nFire: ${rowText('ROW-fire')}\nEquipment state: ${rowText('ROW-equipment')}`,
    },
    { id: 'people', title: 'People', text: rowText('ROW-personnel') },
    {
      id: 'assets',
      title: 'Equipment and areas',
      text: `Reported involved: ${confirmed.map((a) => a.tag).join(', ') || 'none reported yet'}.\nPotentially relevant, not reported involved: ${potential.map((a) => a.tag).join(', ') || 'none identified yet'}.\n\nPossible wider consequence (not a current condition): ${rowText('ROW-wider')}`,
    },
    {
      id: 'decisions',
      title: 'Decisions recorded',
      text: s.decisions.length
        ? s.decisions.map((d) => `${fmt(d.at)} ${d.id}: ${d.recordedBy} (${d.recordedByRole}) recorded "${OUTCOME_LABEL[d.outcome]}" on ${d.recommendationId}.${d.rationale ? ` Rationale: ${d.rationale}` : ''}`).join('\n')
        : 'No decisions recorded.',
    },
    {
      id: 'response',
      title: 'Response reported',
      text: s.actions.length
        ? s.actions.map((a) => {
            const last = a.updates[a.updates.length - 1];
            return `${a.title}: ${ACTION_STATUS_LABEL[a.status]}${last ? ` (${last.reportedBy}, ${fmt(last.at)})` : ''}.`;
          }).join('\n')
        : 'No response reported.',
    },
    {
      id: 'open',
      title: 'Open questions',
      text: open.length ? open.map((i) => `${i.title}${i.status === 'partly-answered' ? ' (partly answered)' : ''}`).join('\n') : 'No open questions recorded by the agent.',
    },
  ];
}

export function sitrepPlainText(s: EccState): string {
  if (!s.draft) return '';
  const lines = [
    `SITUATION REPORT, DRAFT ${s.draft.version} — FICTIONAL TRAINING DATA`,
    `${INCIDENT.id}: ${INCIDENT.title}`,
    `${INCIDENT.facility}, ${INCIDENT.area}`,
    `Information as of ${fmt(s.draft.asOf)}`,
    '',
  ];
  s.draft.sections.forEach((sec) => lines.push(sec.title.toUpperCase(), sec.text, ''));
  return lines.join('\n');
}

export interface AgentStatus {
  preparing: boolean;
  summary: string;
  waitingFor: string[];
  cannotEstablish: string[];
  sourceProblems: string[];
}

export function agentStatus(s: EccState): AgentStatus {
  const pending = s.recommendations.filter((r) => r.status === 'awaiting-review' || r.status === 'deferred');
  const waitingFor = [
    ...pending.map((r) => `Review of ${r.id}`),
    ...s.actions.filter((a) => a.status === 'completion-reported').map((a) => `Confirmation of ${a.id}`),
  ];
  const cannotEstablish = s.issues.filter((i) => i.status !== 'answered' && (i.type === 'missing' || i.type === 'conflict')).map((i) => i.title);
  const sourceProblems = s.docs.filter((d) => d.availability !== 'available').map((d) => (d.availability === 'unavailable' ? `${d.title}: retrieval failed` : `${d.title}: out of date`));
  const active = s.prepSteps.find((p) => p.status === 'active');
  return {
    preparing: s.preparing,
    summary: s.preparing ? (active ? `${active.label}...` : 'Preparing the brief...') : `Brief updated ${fmt(Math.max(...s.rows.map((r) => r.at)))}`,
    waitingFor,
    cannotEstablish,
    sourceProblems,
  };
}

/** How the agent reached each line of the assessment, shown beside it rather than on a separate page. */
export const ROW_REASONING: Record<string, string> = {
  'ROW-release': 'Takes the latest direct observation at the pump over an instrument reading from the control room, and keeps the earlier disagreement linked. Does not resolve a conflict on its own: it reports what a later source said.',
  'ROW-fire': 'Repeats the most recent direct report. Remains "reported" until someone records verification.',
  'ROW-personnel': 'Compares what the reports say about people with records of who could be in the area. Treats no report as unknown, never as safe.',
  'ROW-equipment': 'Marked verified only where an instrument reading and a direct observation agree. This rule is a prototype assumption for customer validation.',
  'ROW-wider': 'Follows records of what is connected or adjacent to the affected equipment. Describes what could happen, not what has happened. No engineering threshold is applied.',
  'ROW-response': 'Summarises response items using what people have reported. The system performs none of these.',
};

export type ExpectedStatus = 'received' | 'received-incomplete' | 'late' | 'missing' | 'due-soon' | 'not-yet-due';

export const EXPECTED_LABEL: Record<ExpectedStatus, string> = {
  received: 'Received',
  'received-incomplete': 'Received, incomplete',
  late: 'Late',
  missing: 'Missing',
  'due-soon': 'Due soon',
  'not-yet-due': 'Not yet due',
};

export interface ExpectedReport {
  id: string;
  label: string;
  from: string;
  expectedBy: Minutes;
  status: ExpectedStatus;
  ref?: string;
}

/** Reports the record expects. Expected-by times are training placeholders, not real reporting intervals. */
export function expectedReports(s: EccState): ExpectedReport[] {
  const timed = (expectedBy: Minutes): ExpectedStatus => (s.now > expectedBy ? 'late' : expectedBy - s.now <= 3 ? 'due-soon' : 'not-yet-due');
  const has = (id: string) => s.reports.some((r) => r.id === id);
  const rec = s.recommendations.find((r) => r.id === PERSONNEL_REC);
  const dec = rec?.decisionId ? s.decisions.find((d) => d.id === rec.decisionId) : undefined;
  const act = dec?.actionId ? s.actions.find((a) => a.id === dec.actionId) : undefined;
  const lastPersonnel = act?.updates[act.updates.length - 1];
  const personnelStatus: ExpectedStatus = !act
    ? 'missing'
    : act.status === 'completion-reported' || act.status === 'completion-verified'
      ? 'received'
      : lastPersonnel
        ? 'received-incomplete'
        : timed(hm(14, 30));
  return [
    { id: 'EXP-1', label: 'Fire team report from the scene', from: 'Fire Team Lead', expectedBy: hm(14, 20), status: has('RPT-006') ? 'received' : timed(hm(14, 20)), ref: has('RPT-006') ? 'RPT-006' : undefined },
    { id: 'EXP-2', label: 'Personnel accountability result', from: act ? 'Not assigned in the record' : 'No check decided yet', expectedBy: hm(14, 30), status: personnelStatus, ref: lastPersonnel?.reportId ?? 'ISS-01' },
    { id: 'EXP-3', label: 'Access restriction complete', from: 'Site Security', expectedBy: hm(14, 30), status: has('RPT-008') ? 'received' : has('RPT-005') ? 'received-incomplete' : timed(hm(14, 30)), ref: has('RPT-008') ? 'RPT-008' : has('RPT-005') ? 'RPT-005' : undefined },
  ];
}
