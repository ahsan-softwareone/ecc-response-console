// Fictional training scenario. All names, tags, records and procedure references
// are invented for this prototype and describe no real facility or procedure.
import { ERP_REV_D, EXEC_META, initialCitations, initialConfigs, initialKnowledge, initialMonitors, initialSources, initialTasks, initialUsers, monitorValue } from './catalog';
import { fmt, hm } from './time';
import type { AgentTask, Asset, AssessmentRow, Doc, EccState, ExecType, FeedEntry, FeedKind, Issue, LogKind, KRevision, Minutes, Person, Report, SourceState, Trust } from './types';

export { hm, fmt };

export const INCIDENT = {
  id: 'TRN-0417',
  title: 'Fire and liquid release at pump P-3104B',
  shortTitle: 'Fire and release · P-3104B',
  facility: 'Wadi Sarab Processing Facility',
  area: 'Area 31, Condensate Transfer',
  scenarioName: 'Wadi Sarab pump fire',
  firstAlarmAt: hm(14, 5),
};

export const PEOPLE: Record<'sm' | 'im' | 'cro' | 'fieldOp' | 'fireLead' | 'security', Person> = {
  sm: { id: 'sm', name: 'Nasser Al-Qahtani', role: 'Shift Manager' },
  im: { id: 'im', name: 'Huda Al-Mutairi', role: 'Incident Manager' },
  cro: { id: 'cro', name: 'Faisal Al-Otaibi', role: 'Control Room Operator' },
  fieldOp: { id: 'fieldOp', name: 'Salem Al-Dossary', role: 'Field Operator' },
  fireLead: { id: 'fireLead', name: 'Omar Al-Shehri', role: 'Fire Team Lead' },
  security: { id: 'security', name: 'Majed Al-Ghamdi', role: 'Site Security Supervisor' },
};

/** Who can record decisions in this prototype. A person attribution, not a role assignment. */
export const RECORDERS: Person[] = [PEOPLE.sm, PEOPLE.im];

export const PERSONNEL_REC = 'REC-02';

// --- helpers used by scripted events -----------------------------------------

export function addLog(
  s: EccState,
  e: { at: Minutes; kind: LogKind; title: string; ref?: string; material?: boolean; eventAt?: Minutes },
) {
  s.seq += 1;
  s.log.push({ seq: s.seq, at: e.at, eventAt: e.eventAt, kind: e.kind, title: e.title, ref: e.ref, material: e.material ?? true });
  return s.seq;
}

export function reviseRow(s: EccState, id: string, at: Minutes, statement: string, trust: Trust, refs: string[]) {
  const row = s.rows.find((r) => r.id === id)!;
  if (row.statement === statement && row.trust === trust) return row;
  row.history.push({ at: row.at, statement: row.statement, trust: row.trust, refs: row.refs });
  row.statement = statement;
  row.trust = trust;
  row.at = at;
  row.refs = refs;
  return row;
}

export function setCondition(s: EccState, id: string, at: Minutes, statement: string, trust: Trust, refs: string[]) {
  const a = s.assets.find((x) => x.id === id)!;
  a.conditionHistory.push(a.condition);
  a.condition = { at, statement, trust, refs };
  a.refs = Array.from(new Set([...a.refs, ...refs]));
}

export function addChange(s: EccState, c: { at: Minutes; title: string; before?: string; after: string; refs: string[] }) {
  s.counters.change += 1;
  s.changes.push({ id: `CHG-${String(s.counters.change).padStart(2, '0')}`, seq: s.seq, ...c });
}

export function exec(s: EccState, execType: ExecType, label: string, o: { status?: 'ok' | 'failed'; source?: string; ms?: number; at?: Minutes; attempt?: number } = {}): string {
  s.counters.exec += 1;
  const id = `EXE-${String(s.counters.exec).padStart(4, '0')}`;
  const version = s.configs.find((c) => c.status === 'active')!.version;
  const at = o.at ?? s.now;
  // Deterministic start times: each record starts after the last within the same minute.
  const inMinute = s.activity.filter((r) => r.at === at).reduce((end, r) => Math.max(end, r.startMs + (r.durationMs ?? 0)), at * 60000);
  const meta = EXEC_META.find((m) => m.match.test(label))?.meta ?? {};
  s.activity.push({ id, runId: `RUN-${INCIDENT.id}`, at, execType, label, status: o.status ?? 'ok', source: o.source, durationMs: o.ms, configVersion: version, outputs: [], startMs: inMinute + 50, taskId: 'T-BRIEF', operation: 'agent.step', ...meta, ...(o.attempt ? { attempt: o.attempt } : {}) });
  return id;
}

function setTask(s: EccState, id: string, patch: Partial<AgentTask>) {
  const task = s.tasks.find((x) => x.id === id)!;
  Object.assign(task, { startedAt: task.startedAt ?? s.now, updatedAt: s.now }, patch);
}

/** Routine samples go to monitoring history and never to the feed. */
function advanceMonitors(s: EccState) {
  s.monitors.forEach((m) => {
    const src = s.sources.find((x) => x.id === m.sourceId)!;
    if (src.state === 'delayed' || src.state === 'stale' || src.state === 'unavailable') return;
    const last = m.samples[m.samples.length - 1].observedAt;
    // A recovering source has a gap: only the newest reading arrives, and the gap stays visible.
    const from = src.state === 'recovering' ? Math.max(last + 1, s.now) : last + 1;
    for (let t = from; t <= s.now; t++) {
      const value = monitorValue(m.id, t);
      if (value !== undefined) m.samples.push({ observedAt: t, receivedAt: t, value });
    }
    if (m.alert) m.alert.notifications.push(s.now); // repeats of a continuing condition, grouped on the alert
    if (src.state === 'connected') src.lastSuccess = s.now;
  });
}

type NewFeed = Partial<FeedEntry> & { feedKind: FeedKind; title: string; body: string; attribution: string };

/** Publishes one entry, linking it to the execution records that produced it and to whatever it replaces. */
export function addFeed(s: EccState, e: NewFeed): string {
  s.counters.feed += 1;
  s.seq += 1;
  const id = `FD-${String(s.counters.feed).padStart(3, '0')}`;
  const entry: FeedEntry = { citations: [], assets: [], activity: [], consequential: false, publishedAt: s.now, ...e, id, kind: 'feed', seq: s.seq };
  if (e.supersedes) {
    const old = s.feed.find((f) => f.key === e.supersedes && !f.supersededBy);
    if (old) {
      old.supersededBy = id;
      entry.supersedes = old.id;
    } else delete entry.supersedes;
  }
  s.feed.push(entry);
  entry.activity.forEach((x) => s.activity.find((r) => r.id === x)?.outputs.push(id));
  return id;
}

function setSource(s: EccState, id: string, state: SourceState, o: { lastSuccess?: Minutes; effect?: string } = {}) {
  const src = s.sources.find((x) => x.id === id)!;
  src.state = state;
  if (o.lastSuccess !== undefined) src.lastSuccess = o.lastSuccess;
  src.effect = o.effect;
}

function touchSources(s: EccState, ...ids: string[]) {
  ids.forEach((id) => {
    const src = s.sources.find((x) => x.id === id)!;
    if (src.state === 'connected') src.lastSuccess = s.now;
  });
}

function addReport(s: EccState, r: Report) {
  s.reports.push(r);
  addLog(s, {
    at: r.receivedAt,
    eventAt: r.observedAt ?? undefined,
    kind: 'report',
    title: `${r.sourceRole}: ${r.text.length > 84 ? `${r.text.slice(0, 81)}...` : r.text}`,
    ref: r.id,
  });
}

function addDoc(s: EccState, d: Doc, title: string) {
  s.docs.push(d);
  addLog(s, { at: d.retrievedAt, kind: 'record', title, ref: d.id, material: false });
}

function identify(s: EccState, ...ids: string[]) {
  s.assets.forEach((a) => {
    if (ids.includes(a.id)) a.identified = true;
  });
}

function setStep(s: EccState, i: number, status: EccState['prepSteps'][number]['status'], outcome?: string) {
  s.prepSteps[i] = { ...s.prepSteps[i], status, outcome: outcome ?? s.prepSteps[i].outcome };
}

// --- static records ---------------------------------------------------------

const RPT_001: Report = {
  id: 'RPT-001',
  kind: 'report',
  channel: 'control-room',
  sourceName: PEOPLE.cro.name,
  sourceRole: PEOPLE.cro.role,
  observation: 'direct',
  observedAt: hm(14, 5),
  receivedAt: hm(14, 7),
  text: 'Area 31 fire detector alarm at 14:05. Field operator reports a liquid release and flame at condensate transfer pump P-3104B. No injuries reported so far.',
  trust: 'reported',
  assetIds: ['AST-P-3104B', 'AST-AREA-31'],
};

const RPT_002: Report = {
  id: 'RPT-002',
  kind: 'report',
  channel: 'field',
  sourceName: PEOPLE.fieldOp.name,
  sourceRole: PEOPLE.fieldOp.role,
  observation: 'direct',
  observedAt: hm(14, 9),
  receivedAt: hm(14, 10),
  text: 'Liquid still coming from the seal area of P-3104B and flame on the pump skid. Release was still running when I moved back from the area.',
  trust: 'reported',
  assetIds: ['AST-P-3104B'],
};

const RPT_003: Report = {
  id: 'RPT-003',
  kind: 'report',
  channel: 'control-room',
  sourceName: PEOPLE.cro.name,
  sourceRole: PEOPLE.cro.role,
  observation: 'instrument',
  observedAt: hm(14, 11),
  receivedAt: hm(14, 11),
  text: 'Control system shows P-3104B stopped and discharge flow reading zero. From here the line looks isolated.',
  trust: 'reported',
  assetIds: ['AST-P-3104B'],
};

const RPT_004: Report = {
  id: 'RPT-004',
  kind: 'report',
  channel: 'fire-team',
  sourceName: PEOPLE.fireLead.name,
  sourceRole: PEOPLE.fireLead.role,
  observation: 'direct',
  observedAt: hm(14, 9),
  receivedAt: hm(14, 11),
  text: 'Fire team mobilised and on the way to Area 31. No arrival time given.',
  trust: 'reported',
  assetIds: ['AST-AREA-31'],
};

const RPT_005: Report = {
  id: 'RPT-005',
  kind: 'report',
  channel: 'security',
  sourceName: PEOPLE.security.name,
  sourceRole: PEOPLE.security.role,
  observation: 'direct',
  observedAt: hm(14, 12),
  receivedAt: hm(14, 12),
  text: 'Starting to restrict access to Area 31 and the south side of pipe rack PR-31. Not finished yet.',
  trust: 'reported',
  assetIds: ['AST-AREA-31', 'AST-PR-31'],
  actionId: 'ACT-02',
};

const RPT_006: Report = {
  id: 'RPT-006',
  kind: 'report',
  channel: 'fire-team',
  sourceName: PEOPLE.fireLead.name,
  sourceRole: PEOPLE.fireLead.role,
  observation: 'direct',
  observedAt: hm(14, 19),
  receivedAt: hm(14, 21),
  text: 'On scene at Area 31. Pump is not running. Liquid still coming from the seal, less than the operator described. Could be the line draining. Flame is confined to the pump skid and not reaching pipe rack PR-31 from where we are. We have not seen the contractor crew.',
  trust: 'reported',
  assetIds: ['AST-P-3104B', 'AST-PR-31', 'AST-AREA-31'],
};

const RPT_007: Report = {
  id: 'RPT-007',
  kind: 'report',
  channel: 'fire-team',
  sourceName: PEOPLE.fireLead.name,
  sourceRole: PEOPLE.fireLead.role,
  observation: 'direct',
  observedAt: hm(14, 27),
  receivedAt: hm(14, 29),
  text: 'Flame out at 14:27. Some residual liquid on the skid and we are keeping watch on it. Checked P-3104A next to it: no release and no flame there.',
  trust: 'reported',
  assetIds: ['AST-P-3104B', 'AST-P-3104A'],
};

const RPT_008: Report = {
  id: 'RPT-008',
  kind: 'report',
  channel: 'security',
  sourceName: PEOPLE.security.name,
  sourceRole: PEOPLE.security.role,
  observation: 'direct',
  observedAt: hm(14, 28),
  receivedAt: hm(14, 29),
  text: 'Access restriction around Area 31 and the south side of PR-31 is in place.',
  trust: 'reported',
  assetIds: ['AST-AREA-31', 'AST-PR-31'],
  actionId: 'ACT-02',
};

const DOC_EQUIP: Doc = {
  id: 'DOC-01',
  kind: 'document',
  docType: 'Equipment record',
  title: 'Equipment record: P-3104B',
  sourceSystem: 'Equipment register',
  availability: 'available',
  retrievedAt: hm(14, 8),
  summary: 'Condensate transfer pump, duty position, on a shared skid with standby pump P-3104A.',
  fields: [
    { label: 'Tag', value: 'P-3104B' },
    { label: 'Service', value: 'Condensate transfer' },
    { label: 'Position', value: 'Duty (standby: P-3104A)' },
    { label: 'Location', value: 'Area 31, pump skid' },
    { label: 'Record last updated', value: '12 Mar (fictional)' },
  ],
  assetIds: ['AST-P-3104B', 'AST-P-3104A'],
};

const DOC_CONNECT: Doc = {
  id: 'DOC-02',
  kind: 'document',
  docType: 'Connectivity record',
  title: 'Connectivity record: condensate transfer',
  sourceSystem: 'Engineering data store',
  availability: 'available',
  retrievedAt: hm(14, 9),
  summary: 'Lists T-3201 as the suction source for P-3104A and B. Lists services on PR-31 running on to Area 33.',
  fields: [
    { label: 'Suction source', value: 'Rundown tank T-3201, Area 32' },
    { label: 'Pumps on shared skid', value: 'P-3104A, P-3104B' },
    { label: 'Services on PR-31', value: 'Continue to Area 33' },
  ],
  note: 'A record of how items are connected. It says nothing about their condition now.',
  assetIds: ['AST-T-3201', 'AST-P-3104A', 'AST-P-3104B', 'AST-AREA-33', 'AST-PR-31'],
};

const DOC_PLOT: Doc = {
  id: 'DOC-03',
  kind: 'document',
  docType: 'Plot plan',
  title: 'Plot plan: Area 31 layout',
  sourceSystem: 'Engineering data store',
  availability: 'available',
  retrievedAt: hm(14, 9),
  summary: 'Shows the south side of pipe rack PR-31 running alongside the Area 31 pump skid.',
  fields: [
    { label: 'Sheet', value: 'PLT-31-02 (fictional)' },
    { label: 'Adjacent to skid', value: 'PR-31, south side' },
  ],
  assetIds: ['AST-PR-31', 'AST-AREA-31'],
};

const DOC_PERMIT: Doc = {
  id: 'DOC-04',
  kind: 'document',
  docType: 'Work permit',
  title: 'Work permit WP-58821',
  sourceSystem: 'Permit system',
  availability: 'available',
  retrievedAt: hm(14, 9),
  summary: 'Open permit for a contractor crew of 4 on scaffolding work at the south side of PR-31. No close-out recorded.',
  fields: [
    { label: 'Work', value: 'Scaffolding, PR-31 south side' },
    { label: 'Crew', value: '4 contractors' },
    { label: 'Opened', value: '07:30' },
    { label: 'Valid until', value: '16:00' },
    { label: 'Close-out', value: 'None recorded' },
  ],
  note: 'A permit shows where work was authorised. It does not show where the crew is now.',
  assetIds: ['AST-PR-31', 'AST-AREA-31'],
};

const DOC_MAINT: Doc = {
  id: 'DOC-05',
  kind: 'document',
  docType: 'Maintenance history',
  title: 'Maintenance history: P-3104B',
  sourceSystem: 'Maintenance system',
  availability: 'unavailable',
  retrievedAt: hm(14, 11),
  attempts: 2,
  summary: 'Could not be retrieved. The maintenance system did not respond.',
  fields: [],
  note: 'Nothing is known from this source. This does not mean there is no relevant history.',
  assetIds: ['AST-P-3104B'],
};

const DOC_WEATHER: Doc = {
  id: 'DOC-06',
  kind: 'document',
  docType: 'Weather station',
  title: 'Weather station WS-2',
  sourceSystem: 'Site weather feed',
  availability: 'stale',
  retrievedAt: hm(14, 11),
  summary: 'Latest reading is from 13:20, before the incident began.',
  fields: [
    { label: 'Wind', value: 'From north-west, moderate' },
    { label: 'Reading taken', value: '13:20' },
  ],
  note: 'Out of date. Treat as a historical reading, not current wind.',
  assetIds: ['AST-AREA-31'],
};

const DOC_PROC: Doc = {
  id: 'DOC-07',
  kind: 'document',
  docType: 'Procedure (placeholder)',
  title: 'ERP-T-07: training procedure placeholder',
  sourceSystem: 'Training content',
  availability: 'available',
  retrievedAt: hm(14, 9),
  summary: 'Placeholder for the customer emergency response plan. Marks where a real procedure reference would appear.',
  fields: [
    { label: 'Section 2', value: 'Access to the affected area (placeholder)' },
    { label: 'Section 4', value: 'Personnel accountability (placeholder)' },
  ],
  note: 'Invented for this training scenario. It is not an emergency procedure and must not be used as one.',
  assetIds: [],
};

function initialAssets(): Asset[] {
  const c = (at: Minutes, statement: string, trust: Trust, refs: string[]) => ({ at, statement, trust, refs });
  return [
    {
      id: 'AST-P-3104B',
      kind: 'asset',
      tag: 'P-3104B',
      name: 'Condensate transfer pump (duty)',
      assetType: 'equipment',
      area: 'Area 31',
      relation: 'reported-involved',
      whyIncluded: 'Named as the location of the release and flame in the initial report and by the field operator.',
      condition: c(hm(14, 7), 'Liquid release and flame reported at the pump.', 'reported', ['RPT-001']),
      conditionHistory: [],
      refs: ['RPT-001'],
      identified: false,
    },
    {
      id: 'AST-AREA-31',
      kind: 'asset',
      tag: 'Area 31',
      name: 'Condensate Transfer area',
      assetType: 'area',
      area: 'Area 31',
      relation: 'reported-involved',
      whyIncluded: 'The fire detector alarm is in this area and it contains the affected pump.',
      condition: c(hm(14, 7), 'Fire detector alarm at 14:05. Extent of the area affected not reported.', 'reported', ['RPT-001']),
      conditionHistory: [],
      refs: ['RPT-001'],
      identified: false,
    },
    {
      id: 'AST-P-3104A',
      kind: 'asset',
      tag: 'P-3104A',
      name: 'Condensate transfer pump (standby)',
      assetType: 'equipment',
      area: 'Area 31',
      relation: 'potentially-relevant',
      whyIncluded: 'Shares a skid with P-3104B according to the equipment record. No report has mentioned it.',
      condition: c(hm(14, 9), 'No report has mentioned this pump.', 'not-reported', []),
      conditionHistory: [],
      possibleConsequence: 'Could be exposed if the flame on the shared skid spreads. Not observed.',
      refs: ['DOC-01', 'DOC-02'],
      identified: false,
    },
    {
      id: 'AST-PR-31',
      kind: 'asset',
      tag: 'PR-31',
      name: 'Pipe rack, south side',
      assetType: 'equipment',
      area: 'Between Area 31 and Area 33',
      relation: 'potentially-relevant',
      whyIncluded: 'Runs alongside the pump skid on the plot plan. Open permit WP-58821 places a contractor crew here.',
      condition: c(hm(14, 9), 'No report has described the condition of the pipe rack.', 'not-reported', []),
      conditionHistory: [],
      possibleConsequence: 'Could be exposed to heat if the flame persists. Not observed.',
      refs: ['DOC-03', 'DOC-04'],
      identified: false,
    },
    {
      id: 'AST-T-3201',
      kind: 'asset',
      tag: 'T-3201',
      name: 'Condensate rundown tank',
      assetType: 'equipment',
      area: 'Area 32',
      relation: 'potentially-relevant',
      whyIncluded: 'Listed as the suction source for the pumps. Included because of that connection, not because of any report.',
      condition: c(hm(14, 9), 'No report has described the condition of this tank.', 'not-reported', []),
      conditionHistory: [],
      possibleConsequence: 'May be the source of liquid feeding the release until the line is confirmed isolated. Not established.',
      refs: ['DOC-02'],
      identified: false,
    },
    {
      id: 'AST-AREA-33',
      kind: 'asset',
      tag: 'Area 33',
      name: 'Downstream area on PR-31',
      assetType: 'area',
      area: 'Area 33',
      relation: 'context',
      whyIncluded: 'Services on PR-31 continue here. Shown for context only, one step removed from any report.',
      condition: c(hm(14, 9), 'No report has mentioned this area.', 'not-reported', []),
      conditionHistory: [],
      possibleConsequence: 'Would only be affected if PR-31 were affected. Not observed.',
      refs: ['DOC-02'],
      identified: false,
    },
  ];
}

function initialRows(): AssessmentRow[] {
  const r = (key: string, label: string, statement: string, trust: Trust, at: Minutes, refs: string[]): AssessmentRow => ({
    id: `ROW-${key}`,
    kind: 'assessment',
    label,
    statement,
    trust,
    at,
    refs,
    history: [],
  });
  const t = hm(14, 7);
  return [
    r('release', 'Is the release continuing?', 'Liquid release reported in the initial notification. Current status not yet established.', 'reported', t, ['RPT-001']),
    r('fire', 'Fire', 'Flame reported at the pump. Current extent not yet established.', 'reported', t, ['RPT-001']),
    r('personnel', 'People', 'No injuries reported so far. This does not establish that anyone has been checked.', 'unknown', t, ['RPT-001']),
    r('equipment', 'Equipment state', 'P-3104B named in the initial report. Being looked up.', 'reported', t, ['RPT-001']),
    r('wider', 'What else could be affected', 'Not yet assessed.', 'unknown', t, []),
    r('response', 'Response reported', 'No response reported yet.', 'not-reported', t, []),
  ];
}

export { advanceMonitors };

export function initialState(): EccState {
  const s: EccState = {
    scriptIndex: 0,
    now: hm(14, 7),
    preparing: true,
    prepSteps: [
      { label: 'Identifying equipment and area', status: 'active' },
      { label: 'Retrieving equipment, permit and layout records', status: 'pending' },
      { label: 'Checking incoming reports against each other', status: 'pending' },
      { label: 'Drafting the brief and items for review', status: 'pending' },
    ],
    headline: {
      statement: 'Fire and liquid release reported at condensate transfer pump P-3104B in Area 31.',
      trust: 'reported',
      at: hm(14, 7),
      refs: ['RPT-001'],
    },
    reports: [],
    docs: [],
    issues: [],
    assets: initialAssets(),
    rows: initialRows(),
    recommendations: [],
    decisions: [],
    actions: [],
    log: [],
    changes: [],
    seq: 0,
    draft: null,
    view: 'situation',
    rail: { tab: 'details', open: false, stack: [] },
    chat: [],
    changesSeenSeq: 0,
    feedShownSeq: 0,
    toast: null,
    trainingLog: [],
    feed: [],
    activity: [],
    monitors: initialMonitors(),
    tasks: initialTasks(),
    sources: initialSources(),
    agentWork: 'Identifying equipment and area',
    sim: { running: true },
    reviewedAt: null,
    knowledge: initialKnowledge(),
    citations: initialCitations(),
    users: initialUsers(),
    configs: initialConfigs(),
    audit: [],
    prototypeRole: 'Incident user',
    counters: { report: 8, decision: 1, action: 2, change: 0, msg: 0, toast: 0, feed: 0, exec: 0, upload: 0 },
  };
  addReport(s, RPT_001);
  addLog(s, { at: hm(14, 7), kind: 'agent', title: 'Agent started preparing the incident brief', material: false });
  const trig = exec(s, 'trigger', 'Emergency notification received from the control room', { source: 'Field and control room reports' });
  const start = exec(s, 'task-started', 'Identify equipment and area', { ms: 40 });
  addFeed(s, {
    feedKind: 'notification',
    title: 'Emergency notification received',
    summary: 'Fire detector alarm in Area 31. Liquid release and flame reported at P-3104B.',
    severity: 'urgent',
    sourceSeverity: 'PRI-1',
    body: 'Fire detector alarm in Area 31. Liquid release and flame reported at pump P-3104B. No injuries reported so far.',
    uncertainty: 'No injuries reported does not establish that anyone has been checked.',
    trust: 'reported',
    attribution: PEOPLE.cro.role,
    observedAt: hm(14, 5),
    receivedAt: hm(14, 7),
    citations: ['RPT-001'],
    assets: ['AST-P-3104B', 'AST-AREA-31'],
    action: { label: 'Open control room report', ref: 'RPT-001' },
    activity: [trig, start],
    consequential: true,
  });
  s.feedShownSeq = s.seq;
  s.changesSeenSeq = s.seq;
  return s;
}

const ISS_PERSONNEL: Issue = {
  id: 'ISS-01',
  kind: 'issue',
  type: 'missing',
  status: 'open',
  title: 'Has everyone in Area 31 and on PR-31 been accounted for?',
  detail: 'The initial report says no injuries reported. No report says anyone has been checked. Permit WP-58821 places 4 contractors on PR-31 south side with no close-out recorded.',
  whyItMatters: 'Absence of an injury report is not evidence that people are safe.',
  whatWouldHelp: 'A report from someone who has checked who was in the area and where they are now.',
  refs: ['RPT-001', 'DOC-04'],
  raisedAt: hm(14, 10),
};

const ISS_CONFLICT: Issue = {
  id: 'ISS-02',
  kind: 'issue',
  type: 'conflict',
  status: 'open',
  title: 'Has the release stopped?',
  detail: 'The field operator saw liquid still coming from the pump. The control system shows zero flow and the control room believes the line is isolated.',
  whyItMatters: 'The answer affects whether the fire is still being fed and how the isolation of the incident is understood.',
  whatWouldHelp: 'A direct observation at the pump from someone on scene, after the control system reading.',
  refs: ['RPT-002', 'RPT-003'],
  raisedAt: hm(14, 11),
  reportIds: ['RPT-002', 'RPT-003'],
  pointOfConflict: 'Whether liquid is still being released at P-3104B. The reports are 2 minutes apart, so the release may have changed between them, or the reading may not reflect conditions at the seal.',
};

const ISS_MAINT: Issue = {
  id: 'ISS-03',
  kind: 'issue',
  type: 'unavailable',
  status: 'open',
  title: 'Is there relevant maintenance history for P-3104B?',
  detail: 'The maintenance system did not respond to 2 attempts.',
  whyItMatters: 'Recent work on the pump could help explain the release. Unknown, not absent.',
  whatWouldHelp: 'The maintenance system becoming available, or someone who knows the recent work on this pump.',
  refs: ['DOC-05'],
  raisedAt: hm(14, 11),
};

const ISS_WEATHER: Issue = {
  id: 'ISS-04',
  kind: 'issue',
  type: 'stale',
  status: 'open',
  title: 'What is the current wind at Area 31?',
  detail: 'The latest reading from station WS-2 is from 13:20, before the incident began.',
  whyItMatters: 'Wind direction affects which neighbouring areas smoke or vapour could reach.',
  whatWouldHelp: 'A current reading from WS-2 or an observation from someone on scene.',
  refs: ['DOC-06'],
  raisedAt: hm(14, 11),
};

export interface ScriptEvent {
  id: string;
  at: Minutes;
  /** Shown in training controls so a facilitator knows what will happen next. */
  label: string;
  isPrep: boolean;
  /** How long the simulation waits before this event when running. */
  delayMs: number;
  apply: (s: EccState) => void;
}

const FAST = 3500;
const STEADY = 14000;

export const SCRIPT: ScriptEvent[] = [
  {
    id: 'prep-1',
    at: hm(14, 8),
    label: 'Equipment record becomes available',
    isPrep: true,
    delayMs: FAST,
    apply(s) {
      identify(s, 'AST-P-3104B', 'AST-AREA-31');
      addDoc(s, DOC_EQUIP, 'Equipment record retrieved for P-3104B');
      reviseRow(s, 'ROW-equipment', s.now, 'P-3104B is the duty condensate transfer pump in Area 31. Its current state is not yet reported.', 'reported', ['RPT-001', 'DOC-01']);
      setStep(s, 0, 'done', 'P-3104B and Area 31 identified.');
      setStep(s, 1, 'active');
      touchSources(s, 'SRC-REGISTER');
      const q = exec(s, 'source-query', 'Queried equipment register for P-3104B', { source: 'Equipment register', ms: 420 });
      const d = exec(s, 'document-retrieved', 'Retrieved equipment record EQ-P-3104B', { source: 'Equipment register', ms: 180 });
      const c = exec(s, 'task-completed', 'Identify equipment and area', { ms: 610 });
      addFeed(s, {
        feedKind: 'equipment',
        title: 'P-3104B identified',
        summary: 'Duty transfer pump in Area 31, on a skid shared with P-3104A.',
        body: 'Duty condensate transfer pump in Area 31. It shares a skid with standby pump P-3104A.',
        why: 'Sets which drawings, procedures and neighbouring equipment to review next.',
        uncertainty: 'The record describes the pump, not its condition now.',
        attribution: 'ECC agent',
        trust: 'reported',
        citations: ['CIT-01', 'CIT-11'],
        assets: ['AST-P-3104B', 'AST-P-3104A'],
        action: { label: 'Open equipment', ref: 'AST-P-3104B' },
        activity: [q, d, c],
      });
      s.agentWork = 'Reviewing relevant emergency procedures';
      setTask(s, 'T-EQUIP', { outcome: 'P-3104B and Area 31 identified.' });
      setTask(s, 'T-PROC', { status: 'running' });
    },
  },
  {
    id: 'procedures-retrieved',
    at: hm(14, 9),
    label: 'Procedure and illustrative drawings retrieved',
    isPrep: true,
    delayMs: FAST,
    apply(s) {
      identify(s, 'AST-P-3104A', 'AST-PR-31', 'AST-T-3201', 'AST-AREA-33');
      addDoc(s, DOC_CONNECT, 'Connectivity record retrieved');
      addDoc(s, DOC_PLOT, 'Area 31 plot plan retrieved');
      addDoc(s, DOC_PROC, 'Training procedure placeholder ERP-T-07 retrieved');
      reviseRow(s, 'ROW-wider', s.now, 'Possible: pipe rack PR-31 runs alongside the skid and could be exposed to heat if the flame persists. Not observed.', 'assessment', ['CIT-05', 'AST-PR-31']);
      touchSources(s, 'SRC-ENG');
      const st = exec(s, 'task-started', 'Review procedures and drawings', { ms: 30 });
      const q1 = exec(s, 'document-retrieved', 'Retrieved ERP-T-07 Rev C', { source: 'Knowledge library', ms: 260 });
      const q2a = exec(s, 'retry', 'PID-31-02 retrieval timed out; retrying', { source: 'Engineering data store', status: 'failed', ms: 3000 });
      const q2 = exec(s, 'document-retrieved', 'Retrieved PID-31-02 Rev B, sheet 2', { source: 'Engineering data store', ms: 640 });
      const q3 = exec(s, 'document-retrieved', 'Retrieved PLT-31-02 Rev A', { source: 'Engineering data store', ms: 310 });
      const x1 = exec(s, 'extraction-completed', 'Extracted equipment tags from PID-31-02. Line connections not engineer-checked', { source: 'Engineering data store', ms: 1280 });
      const pub = exec(s, 'assessment-published', 'Published possible wider impact', { ms: 90 });
      addFeed(s, {
        feedKind: 'equipment',
        title: 'Other equipment may be relevant',
        summary: 'T-3201 and PR-31 appear on the drawings. Neither has been reported involved.',
        body: 'Drawings show tank T-3201 as the suction source and pipe rack PR-31 alongside the skid. No report has mentioned either.',
        why: 'These are what could be affected next if the fire or release continues.',
        uncertainty: 'A connection on a drawing does not establish current impact. Applicability of the procedure has not been established by retrieving it.',
        attribution: 'ECC agent',
        trust: 'assessment',
        citations: ['CIT-04', 'CIT-05', 'CIT-02', 'CIT-12'],
        assets: ['AST-T-3201', 'AST-PR-31', 'AST-P-3104A'],
        action: { label: 'Open equipment', ref: 'AST-PR-31' },
        group: ['Retrieved procedure ERP-T-07 Rev C', 'Retrieved P&ID PID-31-02 Rev B, sheet 2', 'Retrieved plot plan PLT-31-02 Rev A'],
        activity: [st, q1, q2a, q2, q3, x1, pub],
      });
      setStep(s, 1, 'active', 'Procedure and drawings retrieved.');
      setTask(s, 'T-PROC', { status: 'completed', outcome: 'ERP-T-07 Rev C retrieved. Its applicability has not been established by retrieving it.' });
      setTask(s, 'T-EQUIP', { outcome: 'P-3104A, T-3201 and PR-31 may be relevant. One drawing took a retry and then succeeded.' });
      s.agentWork = 'Checking who could be in the area';
    },
  },
  {
    id: 'prep-2',
    at: hm(14, 10),
    label: 'Field report and open work permit',
    isPrep: true,
    delayMs: FAST,
    apply(s) {
      addDoc(s, DOC_PERMIT, 'Open work permit WP-58821 found');
      addReport(s, RPT_002);
      touchSources(s, 'SRC-REPORTS', 'SRC-PERMIT');
      s.issues.push(structuredClone(ISS_PERSONNEL));
      addLog(s, { at: s.now, kind: 'assessment', title: 'Information gap raised: people in Area 31 not accounted for', ref: 'ISS-01' });
      reviseRow(s, 'ROW-personnel', s.now, 'Not established. No injuries reported, but no report says anyone has been checked. An open permit places 4 contractors on PR-31 south side.', 'unknown', ['RPT-001', 'CIT-06', 'ISS-01']);
      reviseRow(s, 'ROW-release', s.now, 'Field operator reports liquid still coming from the seal area at 14:09.', 'reported', ['RPT-002']);
      reviseRow(s, 'ROW-fire', s.now, 'Field operator reports flame on the pump skid at 14:09.', 'reported', ['RPT-002']);
      const q = exec(s, 'source-query', 'Queried permit system for Area 31 and PR-31', { source: 'Permit system', ms: 530 });
      const pub = exec(s, 'assessment-published', 'Published information gap on personnel', { ms: 70 });
      const f1 = exec(s, 'output-recorded', 'Recorded field operator report', { ms: 20 });
      addFeed(s, {
        feedKind: 'finding',
        title: 'Field operator reports the release continuing',
        summary: 'Liquid still coming from the seal area, flame on the skid, at 14:09.',
        body: 'Liquid still coming from the seal area of P-3104B, with flame on the skid, when the operator moved back.',
        why: 'First direct observation at the pump since the alarm.',
        trust: 'reported',
        attribution: PEOPLE.fieldOp.role,
        observedAt: hm(14, 9),
        receivedAt: hm(14, 10),
        citations: ['RPT-002'],
        assets: ['AST-P-3104B'],
        action: { label: 'Open field report', ref: 'RPT-002' },
        activity: [f1],
      });
      addFeed(s, {
        feedKind: 'gap',
        key: 'gap-people',
        title: 'Personnel accountability not established',
        summary: 'A permit places 4 contractors near the skid. Nobody reported as checked.',
        body: 'An open permit places 4 contractors on the south side of PR-31, next to the skid. No report says anyone has been checked.',
        why: 'No injuries reported is not evidence that people are safe.',
        uncertainty: 'The crew may have left. The permit shows authorisation, not where they are.',
        trust: 'unknown',
        attribution: 'ECC agent',
        citations: ['CIT-06', 'RPT-001', 'CIT-03'],
        assets: ['AST-PR-31', 'AST-AREA-31'],
        action: { label: 'Open information gap', ref: 'ISS-01' },
        activity: [q, pub],
        consequential: true,
      });
      s.recommendations.push({
        id: 'REC-01',
        kind: 'recommendation',
        shortTitle: 'Access restriction',
        title: 'Consider restricting access to Area 31 and the south side of PR-31 until the release status is clear.',
        why: 'A release and flame are reported at P-3104B, and the plot plan shows PR-31 running alongside the skid.',
        uncertainty: 'The extent of the release was not established when this was surfaced.',
        evidence: ['RPT-001', 'RPT-002', 'CIT-05'],
        procedureRef: 'CIT-02',
        surfacedAt: s.now,
        status: 'decided',
        decisionId: 'DEC-01',
        responseTitle: 'Restrict access to Area 31 and PR-31 south side',
        updates: [],
      });
      s.decisions.push({
        id: 'DEC-01',
        kind: 'decision',
        recommendationId: 'REC-01',
        outcome: 'proceed',
        recordedBy: PEOPLE.sm.name,
        recordedByRole: PEOPLE.sm.role,
        at: s.now,
        rationale: 'Release and flame reported. Keep people out until the fire team has reported from the scene.',
        basis: {
          asOf: s.now,
          lines: [
            { label: 'Is the release continuing?', statement: 'Field operator reports liquid still coming from the seal area at 14:09.', trust: 'reported' },
            { label: 'What else could be affected', statement: 'Possible: pipe rack PR-31 could be exposed to heat if the flame persists. Not observed.', trust: 'assessment' },
          ],
        },
        actionId: 'ACT-02',
      });
      s.actions.push({ id: 'ACT-02', kind: 'action', title: 'Restrict access to Area 31 and PR-31 south side', decisionId: 'DEC-01', status: 'no-report', updates: [] });
      addLog(s, { at: s.now, kind: 'recommendation', title: 'Surfaced REC-01: consider restricting access', ref: 'REC-01' });
      addLog(s, { at: s.now, kind: 'decision', title: `${PEOPLE.sm.role} recorded DEC-01: proceed with restricting access`, ref: 'DEC-01' });
      addFeed(s, {
        feedKind: 'decision',
        title: 'Decision recorded: restrict access',
        summary: 'Shift Manager recorded "Proceed". No progress reported yet.',
        body: `${PEOPLE.sm.role} recorded "Proceed" on restricting access to Area 31 and PR-31 south side. No progress reported yet.`,
        attribution: PEOPLE.sm.name,
        citations: ['DEC-01', 'REC-01'],
        assets: ['AST-AREA-31', 'AST-PR-31'],
        action: { label: 'Open decision', ref: 'DEC-01' },
      });
      setStep(s, 1, 'done', '5 records retrieved, including an open work permit near the pump.');
      setStep(s, 2, 'active');
      s.agentWork = 'Checking incoming reports against each other';
      setTask(s, 'T-EQUIP', { status: 'completed', outcome: 'Equipment and connections identified. An open permit places a contractor crew near the skid.' });
      setTask(s, 'T-RECON', { status: 'running' });
    },
  },
  {
    id: 'prep-3',
    at: hm(14, 11),
    label: 'Conflicting report, independent fire team response, failed source',
    isPrep: true,
    delayMs: FAST,
    apply(s) {
      addReport(s, RPT_003);
      addReport(s, RPT_004);
      touchSources(s, 'SRC-REPORTS', 'SRC-CONTROL');
      s.actions.unshift({
        id: 'ACT-01',
        kind: 'action',
        title: 'Fire team response to Area 31',
        status: 'in-progress',
        updates: [{ at: hm(14, 11), reportedBy: PEOPLE.fireLead.name, status: 'in-progress', text: RPT_004.text, reportId: 'RPT-004' }],
      });
      s.docs.push({ ...DOC_MAINT }, { ...DOC_WEATHER });
      s.issues.push(structuredClone(ISS_CONFLICT), structuredClone(ISS_MAINT), structuredClone(ISS_WEATHER));
      setSource(s, 'SRC-MAINT', 'unavailable', { effect: 'Recent work on P-3104B cannot be checked. Unknown, not absent.' });
      setSource(s, 'SRC-WEATHER', 'stale', { lastSuccess: hm(13, 20), effect: 'Wind direction is not current, so where smoke or vapour could reach is less certain.' });
      addLog(s, { at: s.now, kind: 'assessment', title: 'Conflict found: field report and control system disagree on the release', ref: 'ISS-02' });
      addLog(s, { at: s.now, kind: 'agent', title: 'Maintenance history for P-3104B could not be retrieved after 2 attempts', ref: 'DOC-05', material: false });
      addLog(s, { at: s.now, kind: 'agent', title: 'Weather reading from WS-2 is out of date (13:20)', ref: 'DOC-06', material: false });
      reviseRow(s, 'ROW-release', s.now, 'Reports conflict. Field operator saw liquid still coming at 14:09. Control system showed zero flow at 14:11.', 'conflict', ['ISS-02', 'RPT-002', 'RPT-003']);
      reviseRow(s, 'ROW-equipment', s.now, 'Control system shows P-3104B stopped. Not yet confirmed on scene.', 'reported', ['RPT-003', 'CIT-07']);
      reviseRow(s, 'ROW-response', s.now, 'Fire team reported on the way, no arrival time given.', 'reported', ['RPT-004', 'ACT-01']);
      setCondition(s, 'AST-P-3104B', s.now, 'Field operator reports release and flame at 14:09. Control system shows the pump stopped at 14:11.', 'conflict', ['RPT-002', 'RPT-003', 'ISS-02']);
      const rev = exec(s, 'assessment-revised', 'Revised release assessment after comparing reports', { ms: 140 });
      const m1 = exec(s, 'source-query', 'Queried maintenance system for P-3104B', { source: 'Maintenance system', status: 'failed', ms: 5000 });
      const m2 = exec(s, 'retry', 'Retried maintenance system for P-3104B', { source: 'Maintenance system', status: 'failed', ms: 5000, attempt: 2 });
      const m3 = exec(s, 'retrieval-failed', 'Maintenance history unavailable after 2 attempts', { source: 'Maintenance system', status: 'failed' });
      const w = exec(s, 'source-query', 'Latest reading from weather station WS-2 is from 13:20', { source: 'Site weather feed', ms: 210 });
      addFeed(s, {
        feedKind: 'conflict',
        key: 'conflict-release',
        title: 'Reports disagree on whether the release has stopped',
        summary: 'Field operator saw liquid at 14:09. Control system showed zero flow at 14:11.',
        body: 'Control system shows zero flow at 14:11. The field operator saw liquid still coming at 14:09.',
        why: 'Decides whether the fire may still be fed and how isolation of the incident is understood.',
        uncertainty: 'Two minutes apart: the release may have changed, or the reading may not reflect conditions at the seal.',
        trust: 'conflict',
        attribution: 'ECC agent',
        citations: ['RPT-002', 'RPT-003', 'CIT-07'],
        assets: ['AST-P-3104B'],
        action: { label: 'Compare reports', ref: 'ISS-02' },
        activity: [rev],
        consequential: true,
      });
      addFeed(s, {
        feedKind: 'response',
        title: 'Fire team reported on the way',
        summary: 'No arrival time given. No decision for this was recorded in ECC.',
        body: 'Fire team mobilised to Area 31. No arrival time given. No decision for this was recorded in ECC.',
        trust: 'reported',
        attribution: PEOPLE.fireLead.role,
        observedAt: hm(14, 9),
        receivedAt: hm(14, 11),
        citations: ['RPT-004'],
        assets: ['AST-AREA-31'],
        action: { label: 'Open response', ref: 'ACT-01' },
      });
      addFeed(s, {
        feedKind: 'source',
        key: 'source-maint',
        title: 'Maintenance history unavailable',
        summary: 'Maintenance context is excluded from the current assessment.',
        body: 'The maintenance system did not respond to 2 attempts.',
        why: 'Recent work on the pump could help explain the release. This limits the brief.',
        uncertainty: 'Nothing is known from this source. That does not mean there is no history.',
        trust: 'unavailable',
        attribution: 'ECC agent',
        citations: ['DOC-05'],
        noSupportNote: 'No record could be retrieved.',
        assets: ['AST-P-3104B'],
        action: { label: 'Open source status', ref: 'DOC-05' },
        activity: [m1, m2, m3],
        repeatCount: 2,
        lastRepeatAt: s.now,
      });
      addFeed(s, {
        feedKind: 'source',
        key: 'source-weather',
        title: 'Wind reading is out of date',
        summary: 'Latest reading is from 13:20, before the incident began.',
        body: 'The latest reading from station WS-2 is from 13:20, before the incident began.',
        why: 'Wind affects which neighbouring areas smoke or vapour could reach.',
        trust: 'stale',
        attribution: 'ECC agent',
        citations: ['DOC-06'],
        assets: ['AST-AREA-31'],
        action: { label: 'Open wind reading', ref: 'MON-WIND' },
        activity: [w],
      });
      setStep(s, 2, 'attention', 'Two reports disagree on whether the release has stopped. Maintenance history could not be retrieved.');
      setStep(s, 3, 'active');
      s.agentWork = 'Drafting the brief and items for review';
      setTask(s, 'T-RECON', { status: 'waiting', outcome: 'Field report and control system disagree on the release.', blocker: 'Needs a direct observation at the pump from someone on scene.' });
      setTask(s, 'T-MAINT', { status: 'blocked', blocker: 'Maintenance system did not respond to 2 attempts.', consequence: 'Maintenance source unavailable; maintenance context excluded from the current assessment.' });
      const fd = s.monitors.find((m) => m.id === 'MON-PUMP')!;
      fd.alert = { id: 'ALT-PUMP', monitorId: 'MON-PUMP', message: 'P-3104B stopped', sourceSeverity: 'PRI-2', display: 'warning', raisedAt: hm(14, 11), receivedAt: hm(14, 11), notifications: [hm(14, 11)] };
    },
  },
  {
    id: 'prep-4',
    at: hm(14, 12),
    label: 'Recommendation ready for review',
    isPrep: true,
    delayMs: FAST,
    apply(s) {
      addReport(s, RPT_005);
      touchSources(s, 'SRC-REPORTS');
      const act = s.actions.find((a) => a.id === 'ACT-02')!;
      act.status = 'in-progress';
      act.updates.push({ at: hm(14, 12), reportedBy: PEOPLE.security.name, status: 'in-progress', text: RPT_005.text, reportId: 'RPT-005' });
      s.recommendations.push({
        id: 'REC-02',
        kind: 'recommendation',
        shortTitle: 'Personnel accountability check',
        title: 'Consider directing a personnel accountability check for Area 31 and PR-31 south side, including the contractor crew on permit WP-58821.',
        why: 'An open permit places 4 contractors next to the pump skid, and no report says anyone has been checked.',
        uncertainty: 'The permit has no close-out, but the crew may already have left. Their location is not known.',
        evidence: ['CIT-06', 'RPT-001', 'ISS-01'],
        procedureRef: 'CIT-03',
        surfacedAt: s.now,
        status: 'awaiting-review',
        responseTitle: 'Personnel accountability check, Area 31 and PR-31 south side',
        updates: [],
      });
      addLog(s, { at: s.now, kind: 'recommendation', title: 'Surfaced REC-02: consider a personnel accountability check', ref: 'REC-02' });
      reviseRow(s, 'ROW-response', s.now, 'Fire team reported on the way. Access restriction reported started, not finished.', 'reported', ['ACT-01', 'ACT-02', 'RPT-005']);
      s.preparing = false;
      setStep(s, 3, 'done', 'Brief ready. 1 recommendation is waiting for review.');
      addLog(s, { at: s.now, kind: 'agent', title: 'Incident brief ready', material: false });
      const r = exec(s, 'assessment-published', 'Published recommendation for review', { ms: 110 });
      const c = exec(s, 'task-completed', 'Prepare initial brief', { ms: 300000 });
      addFeed(s, {
        feedKind: 'response',
        title: 'Site Security reports starting the restriction',
        summary: 'Not finished.',
        body: 'Starting to restrict access to Area 31 and PR-31 south side. Not finished.',
        trust: 'reported',
        attribution: PEOPLE.security.role,
        observedAt: hm(14, 12),
        receivedAt: hm(14, 12),
        citations: ['RPT-005'],
        assets: ['AST-AREA-31', 'AST-PR-31'],
        action: { label: 'Open response', ref: 'ACT-02' },
      });
      addFeed(s, {
        feedKind: 'recommendation',
        key: 'rec-people',
        title: 'For review: personnel accountability check',
        summary: 'A check for Area 31 and PR-31 south side, including the contractor crew.',
        body: 'Consider directing a check for Area 31 and PR-31 south side, including the contractor crew on permit WP-58821.',
        why: 'Closes the most important unknown on the brief.',
        uncertainty: 'The crew may already have left.',
        trust: 'assessment',
        attribution: 'ECC agent',
        citations: ['CIT-06', 'CIT-03', 'RPT-001'],
        assets: ['AST-PR-31', 'AST-AREA-31'],
        action: { label: 'Review recommendation', ref: 'REC-02' },
        activity: [r, c],
        consequential: true,
      });
      s.agentWork = 'Watching incoming reports and sources';
      setTask(s, 'T-BRIEF', { title: 'Updating the brief', outcome: 'Initial brief ready at 14:12. Updated as evidence arrives.' });
    },
  },
  {
    id: 'control-feed-delayed',
    at: hm(14, 17),
    label: 'Control system feed delayed',
    isPrep: false,
    delayMs: STEADY,
    apply(s) {
      setSource(s, 'SRC-CONTROL', 'delayed', { lastSuccess: hm(14, 11), effect: 'Pump state and flow cannot be refreshed. The latest reading is from 14:11.' });
      reviseRow(s, 'ROW-equipment', s.now, 'Control system showed P-3104B stopped at 14:11. Readings delayed since then. Not yet confirmed on scene.', 'reported', ['RPT-003', 'CIT-07']);
      const q = exec(s, 'source-query', 'Control system readings not received since 14:11', { source: 'Control system readings', status: 'failed', ms: 8000 });
      const rev = exec(s, 'assessment-revised', 'Marked pump state as of 14:11', { ms: 60 });
      addFeed(s, {
        feedKind: 'source',
        key: 'source-control',
        title: 'Control system readings delayed',
        summary: 'No reading since 14:11. Pump state on the brief is now as of 14:11.',
        body: 'No reading received since 14:11. Pump state on the brief is now marked as of 14:11.',
        why: 'The conflict on the release cannot be rechecked from readings until they resume.',
        trust: 'stale',
        attribution: 'ECC agent',
        citations: ['CIT-07'],
        assets: ['AST-P-3104B'],
        action: { label: 'Open pump reading', ref: 'MON-PUMP' },
        activity: [q, rev],
        consequential: true,
      });
      addLog(s, { at: s.now, kind: 'agent', title: 'Control system readings delayed since 14:11', material: false });
      setTask(s, 'T-MON', { status: 'waiting', blocker: 'Control system readings delayed since 14:11.', consequence: 'Pump state and flow on the brief are as of 14:11.' });
    },
  },
  {
    id: 'fire-team-on-scene',
    at: hm(14, 21),
    label: 'Fire team reports from the scene and revises the assessment',
    isPrep: false,
    delayMs: STEADY,
    apply(s) {
      addReport(s, RPT_006);
      touchSources(s, 'SRC-REPORTS');
      const before = s.rows.find((r) => r.id === 'ROW-release')!.statement;
      reviseRow(s, 'ROW-release', s.now, 'Fire team on scene reports liquid still coming from the seal at a lower rate at 14:19. It could be the line draining; not established.', 'reported', ['RPT-006', 'ISS-02']);
      reviseRow(s, 'ROW-fire', s.now, 'Fire team reports flame confined to the pump skid at 14:19. Not out.', 'reported', ['RPT-006']);
      reviseRow(s, 'ROW-equipment', s.now, 'P-3104B stopped: the control system reading of 14:11 and the fire team on scene at 14:19 agree.', 'verified', ['RPT-003', 'RPT-006', 'CIT-07']);
      const beforeWider = s.rows.find((r) => r.id === 'ROW-wider')!.statement;
      reviseRow(s, 'ROW-wider', s.now, 'Still possible, less immediate: fire team reports flame not reaching PR-31 from their position. PR-31 itself not inspected. T-3201 condition not reported.', 'assessment', ['RPT-006', 'AST-PR-31', 'AST-T-3201']);
      s.headline = {
        statement: 'Fire on the P-3104B pump skid, reported confined to the skid. Pump stopped; liquid still reported coming from the seal.',
        trust: 'reported',
        at: s.now,
        refs: ['RPT-006', 'RPT-003'],
      };
      const con = s.issues.find((i) => i.id === 'ISS-02')!;
      con.status = 'partly-answered';
      con.resolution = {
        at: s.now,
        text: 'The fire team report suggests both earlier reports were partly right: the pump has stopped, so flow reads zero, but liquid was still coming from the seal at 14:19. Why it is still coming is not established.',
        trust: 'assessment',
        refs: ['RPT-006'],
      };
      con.refs = [...con.refs, 'RPT-006'];
      setCondition(s, 'AST-P-3104B', s.now, 'Stopped: control system and fire team agree. Liquid still reported coming from the seal, flame on the skid.', 'reported', ['RPT-006', 'RPT-003']);
      s.assets.find((a) => a.id === 'AST-P-3104B')!.relation = 'verified-involved';
      setCondition(s, 'AST-PR-31', s.now, 'Fire team reports flame not reaching the rack from their position at 14:19. Not inspected.', 'reported', ['RPT-006']);
      const fireAct = s.actions.find((a) => a.id === 'ACT-01')!;
      fireAct.updates.push({ at: s.now, reportedBy: PEOPLE.fireLead.name, status: 'in-progress', text: 'On scene at Area 31.', reportId: 'RPT-006' });
      const wind = s.docs.find((d) => d.id === 'DOC-06')!;
      wind.availability = 'available';
      wind.retrievedAt = hm(14, 20);
      wind.summary = 'Current reading: wind from the north-west, moderate.';
      wind.fields = [
        { label: 'Wind', value: 'From north-west, moderate' },
        { label: 'Reading taken', value: '14:20' },
      ];
      wind.note = 'Feed resumed at 14:20. Readings between 13:20 and 14:20 are missing.';
      setSource(s, 'SRC-WEATHER', 'recovering', { lastSuccess: hm(14, 20), effect: 'Readings between 13:20 and 14:20 are missing.' });
      s.monitors.find((m) => m.id === 'MON-WIND')!.samples.push({ observedAt: hm(14, 20), receivedAt: hm(14, 20), value: 'From north-west, moderate' });
      const windIssue = s.issues.find((i) => i.id === 'ISS-04')!;
      windIssue.status = 'answered';
      windIssue.resolution = { at: hm(14, 20), text: 'Feed resumed with a reading at 14:20.', trust: 'reported', refs: ['DOC-06'] };
      addLog(s, { at: hm(14, 20), kind: 'record', title: 'Weather feed resumed: current reading from WS-2', ref: 'DOC-06', material: false });
      const rec = s.recommendations.find((r) => r.id === PERSONNEL_REC)!;
      rec.updates.push({ at: s.now, text: 'Fire team reports they have not seen the contractor crew. This does not establish where the crew is.', refs: ['RPT-006'] });
      if (rec.status !== 'decided') {
        reviseRow(s, 'ROW-personnel', s.now, 'Not established. Still no report that anyone has been checked. Fire team has not seen the contractor crew, which does not establish where they are.', 'unknown', ['RPT-006', 'CIT-06', 'ISS-01']);
      }
      addLog(s, { at: s.now, kind: 'assessment', title: 'Assessment revised: release, equipment state and wider consequences', ref: 'ROW-release' });
      addChange(s, { at: s.now, title: 'Release status revised after fire team report', before, after: s.rows.find((r) => r.id === 'ROW-release')!.statement, refs: ['RPT-006', 'ISS-02', 'ROW-release'] });
      addChange(s, { at: s.now, title: 'Possible wider consequence revised', before: beforeWider, after: s.rows.find((r) => r.id === 'ROW-wider')!.statement, refs: ['RPT-006', 'AST-PR-31', 'ROW-wider'] });
      setTask(s, 'T-RECON', { status: 'completed', blocker: undefined, outcome: 'A later on-scene report suggests both were partly right. Why liquid is still coming is not established.' });
      setTask(s, 'T-PROC', { outcome: 'ERP-T-07 Rev C retrieved. Pump manual Section 6 could not be read because the page is scanned.' });
      const r1 = exec(s, 'output-recorded', 'Recorded fire team report', { ms: 20 });
      const r2 = exec(s, 'assessment-revised', 'Revised release, fire, pump and wider impact', { ms: 180 });
      const m = exec(s, 'extraction-failed', 'Could not read pump manual Section 6: scanned table', { source: 'Knowledge library', status: 'failed', ms: 2200 });
      const w = exec(s, 'source-query', 'Weather feed resumed with a reading at 14:20', { source: 'Site weather feed', ms: 190, at: hm(14, 20) });
      addFeed(s, {
        feedKind: 'assessment',
        supersedes: 'conflict-release',
        title: 'Release assessment revised: pump stopped, release not stopped',
        summary: 'Fire team on scene: liquid still coming at a lower rate. Flame reported confined to the skid.',
        body: 'Fire team on scene reports the pump not running and liquid still coming from the seal, less than first described. Flame reported confined to the skid.',
        why: 'Both earlier reports may have been partly right: a stopped pump reads zero flow, but liquid can still be coming.',
        uncertainty: 'Why liquid is still coming is not established. It could be the line draining.',
        before,
        trust: 'reported',
        attribution: PEOPLE.fireLead.role,
        observedAt: hm(14, 19),
        receivedAt: s.now,
        citations: ['RPT-006', 'RPT-003', 'RPT-002'],
        assets: ['AST-P-3104B', 'AST-PR-31'],
        action: { label: 'Compare reports', ref: 'ISS-02' },
        activity: [r1, r2],
        consequential: true,
      });
      addFeed(s, {
        feedKind: 'source',
        title: 'Seal details could not be read from the manual',
        summary: 'Section 6 is a scanned page. ECC cannot use it to explain the release.',
        body: 'The agent looked for the seal arrangement after the release report. Section 6 of the pump manual is a scanned table and could not be extracted.',
        why: 'ECC cannot use the manual to help explain why liquid is still coming.',
        trust: 'unavailable',
        attribution: 'ECC agent',
        citations: ['CIT-08'],
        noSupportNote: 'The reference exists but cannot be read.',
        assets: ['AST-P-3104B'],
        action: { label: 'Open manual page', ref: 'CIT-08' },
        activity: [m],
      });
      addFeed(s, {
        feedKind: 'source',
        supersedes: 'source-weather',
        title: 'Wind readings resumed',
        summary: 'Wind from the north-west at 14:20. Readings from 13:20 to 14:20 are missing.',
        body: 'Station WS-2 reports wind from the north-west, moderate, at 14:20. Readings from 13:20 to 14:20 are missing.',
        trust: 'reported',
        attribution: 'ECC agent',
        observedAt: hm(14, 20),
        receivedAt: hm(14, 20),
        citations: ['DOC-06'],
        assets: ['AST-AREA-31'],
        action: { label: 'Open wind reading', ref: 'MON-WIND' },
        activity: [w],
      });
    },
  },
  {
    id: 'procedure-rev-d',
    at: hm(14, 24),
    label: 'Newer procedure revision becomes effective',
    isPrep: false,
    delayMs: STEADY,
    apply(s) {
      publishRevision(s, 'KD-ERP07', ERP_REV_D, PEOPLE_STEWARD);
      setTask(s, 'T-PROC', { outcome: 'ERP-T-07 Rev D now effective. Findings before 14:24 keep citing Rev C.' });
      const d = exec(s, 'document-retrieved', 'Retrieved ERP-T-07 Rev D', { source: 'Knowledge library', ms: 250 });
      addFeed(s, {
        feedKind: 'finding',
        title: 'Newer procedure revision is effective',
        summary: 'ERP-T-07 Rev D replaced Rev C at 14:24. Earlier findings keep citing Rev C.',
        body: 'ERP-T-07 Rev D replaced Rev C at 14:24. Section 4 now names contractors on open permits.',
        why: 'Findings before 14:24 keep citing Rev C as written. Nothing has been silently replaced.',
        uncertainty: 'Rev D has not changed any recorded decision.',
        trust: 'reported',
        attribution: 'ECC agent',
        citations: ['CIT-10', 'CIT-03'],
        action: { label: 'Open procedure Rev D', ref: 'CIT-10' },
        activity: [d],
      });
    },
  },
  {
    id: 'control-feed-resumed',
    at: hm(14, 26),
    label: 'Control system feed resumes',
    isPrep: false,
    delayMs: STEADY,
    apply(s) {
      setSource(s, 'SRC-CONTROL', 'recovering', { lastSuccess: hm(14, 26), effect: 'Readings between 14:11 and 14:26 are missing. Recovery does not change the incident.' });
      setTask(s, 'T-MON', { outcome: 'Control system readings resumed at 14:26.', blocker: undefined, consequence: undefined, status: 'running' });
      const row = s.rows.find((r) => r.id === 'ROW-equipment')!;
      row.refs = [...row.refs, 'CIT-09'];
      const q = exec(s, 'source-query', 'Control system readings resumed', { source: 'Control system readings', ms: 340 });
      addFeed(s, {
        feedKind: 'source',
        supersedes: 'source-control',
        title: 'Control system readings resumed',
        summary: 'P-3104B still shown stopped, flow zero, at 14:26. This does not establish the release has stopped.',
        body: 'P-3104B still shown stopped and discharge flow at zero at 14:26.',
        uncertainty: 'Zero flow still does not establish that the release has stopped.',
        trust: 'reported',
        attribution: 'Control system readings',
        observedAt: hm(14, 26),
        receivedAt: hm(14, 26),
        citations: ['CIT-09'],
        assets: ['AST-P-3104B'],
        action: { label: 'Open pump reading', ref: 'MON-PUMP' },
        activity: [q],
      });
    },
  },
  {
    id: 'flame-out-reported',
    at: hm(14, 29),
    label: 'Flame out reported; access restriction reported complete',
    isPrep: false,
    delayMs: STEADY,
    apply(s) {
      addReport(s, RPT_007);
      addReport(s, RPT_008);
      touchSources(s, 'SRC-REPORTS');
      const beforeFire = s.rows.find((r) => r.id === 'ROW-fire')!.statement;
      reviseRow(s, 'ROW-fire', s.now, 'Fire team reports flame out at 14:27 and is keeping watch. Not independently verified.', 'reported', ['RPT-007']);
      reviseRow(s, 'ROW-release', s.now, 'Fire team reports residual liquid on the skid and does not describe an active release. Whether the line is isolated is not established.', 'reported', ['RPT-007', 'ISS-02']);
      reviseRow(s, 'ROW-wider', s.now, 'Flame is reported out. PR-31 itself not inspected. T-3201 condition not reported.', 'assessment', ['RPT-007', 'AST-PR-31', 'AST-T-3201']);
      s.headline = {
        statement: 'Flame on the P-3104B skid reported out at 14:27. Residual liquid on the skid; fire team keeping watch.',
        trust: 'reported',
        at: s.now,
        refs: ['RPT-007'],
      };
      setCondition(s, 'AST-P-3104B', s.now, 'Stopped. Flame reported out at 14:27, residual liquid on the skid. Fire team keeping watch.', 'reported', ['RPT-007']);
      setCondition(s, 'AST-P-3104A', s.now, 'Fire team checked at about 14:27: no release and no flame.', 'confirmed-absent', ['RPT-007']);
      const act = s.actions.find((a) => a.id === 'ACT-02')!;
      act.status = 'completion-reported';
      act.updates.push({ at: s.now, reportedBy: PEOPLE.security.name, status: 'completion-reported', text: RPT_008.text, reportId: 'RPT-008' });
      const fireAct = s.actions.find((a) => a.id === 'ACT-01')!;
      fireAct.updates.push({ at: s.now, reportedBy: PEOPLE.fireLead.name, status: 'in-progress', text: 'Flame out reported, keeping watch on residual liquid.', reportId: 'RPT-007' });
      reviseRow(s, 'ROW-response', s.now, 'Fire team on scene, keeping watch. Access restriction reported complete, awaiting confirmation.', 'reported', ['ACT-01', 'ACT-02', 'RPT-008']);
      addLog(s, { at: s.now, kind: 'response', title: 'Access restriction reported complete by Site Security, awaiting confirmation', ref: 'ACT-02' });
      addLog(s, { at: s.now, kind: 'assessment', title: 'Assessment revised: fire and release', ref: 'ROW-fire' });
      addChange(s, { at: s.now, title: 'Flame reported out', before: beforeFire, after: s.rows.find((r) => r.id === 'ROW-fire')!.statement, refs: ['RPT-007', 'ROW-fire', 'ROW-wider'] });
      addChange(s, { at: s.now, title: 'Access restriction reported complete, awaiting confirmation', after: 'Site Security reports the restriction is in place. Nobody has confirmed it yet.', refs: ['RPT-008', 'ACT-02'] });
      const r1 = exec(s, 'output-recorded', 'Recorded fire team and Site Security reports', { ms: 30 });
      const r2 = exec(s, 'assessment-revised', 'Revised fire, release and wider impact', { ms: 160 });
      addFeed(s, {
        feedKind: 'assessment',
        title: 'Flame reported out; residual liquid on the skid',
        summary: 'Fire team reports flame out at 14:27. Not independently verified.',
        body: 'Fire team reports flame out at 14:27 and is keeping watch. They checked P-3104A next to it: no release and no flame.',
        uncertainty: 'Not independently verified. Whether the line is isolated is not established.',
        before: beforeFire,
        trust: 'reported',
        attribution: PEOPLE.fireLead.role,
        observedAt: hm(14, 27),
        receivedAt: s.now,
        citations: ['RPT-007'],
        assets: ['AST-P-3104B', 'AST-P-3104A'],
        action: { label: 'Open fire team report', ref: 'RPT-007' },
        activity: [r1, r2],
        consequential: true,
      });
      addFeed(s, {
        feedKind: 'response',
        title: 'Access restriction reported complete',
        summary: 'Site Security reports it in place. Not confirmed.',
        body: 'Site Security reports the restriction is in place. Nobody has confirmed it.',
        uncertainty: 'Completion reported, not verified.',
        trust: 'reported',
        attribution: PEOPLE.security.role,
        observedAt: hm(14, 28),
        receivedAt: s.now,
        citations: ['RPT-008'],
        assets: ['AST-AREA-31', 'AST-PR-31'],
        action: { label: 'Open response', ref: 'ACT-02' },
      });
      const fd = s.monitors.find((m) => m.id === 'MON-FD3107')!;
      addFeed(s, {
        feedKind: 'alert',
        title: 'Fire detector FD-3107 still in alarm',
        summary: 'Flame is reported out, but the detector has not reset. Flame out is not verified.',
        body: `Fire detector FD-3107 has stayed in alarm since 14:05, across ${fd.alert!.notifications.length} notifications grouped here. Flame out is a report from the fire team.`,
        why: 'A report that the flame is out and an active detector alarm are not the same thing.',
        trust: 'reported',
        attribution: 'Fire and gas panel',
        observedAt: s.now,
        receivedAt: s.now,
        severity: fd.alert!.display,
        sourceSeverity: fd.alert!.sourceSeverity,
        citations: ['MON-FD3107', 'RPT-007'],
        assets: ['AST-AREA-31'],
        action: { label: 'Open detector status', ref: 'MON-FD3107' },
        consequential: true,
      });
      s.agentWork = 'Watching incoming reports and sources';
      // Readings have run since 14:26 without a gap, so recovery is complete. The incident is not.
      setSource(s, 'SRC-CONTROL', 'connected', { lastSuccess: s.now });
      setSource(s, 'SRC-WEATHER', 'connected', { lastSuccess: s.now });
    },
  },
];

const PEOPLE_STEWARD = 'Rana Al-Zahrani';

/** Makes a revision effective. Citations keep the revision they used, so past assessments do not change. */
export function publishRevision(s: EccState, docId: string, revision: KRevision, actor: string) {
  const doc = s.knowledge.find((d) => d.id === docId)!;
  doc.revisions.forEach((r) => {
    if (r.approval === 'effective') r.approval = 'superseded';
  });
  const existing = doc.revisions.find((r) => r.rev === revision.rev);
  if (existing) Object.assign(existing, revision);
  else doc.revisions.unshift(structuredClone(revision));
  s.audit.push({ at: s.now, actor, action: 'Published revision', target: `${doc.docNumber} ${revision.rev}` });
}

/** People and context for the current personnel row, derived whenever the response changes. */
export function syncPersonnel(s: EccState) {
  const rec = s.recommendations.find((r) => r.id === PERSONNEL_REC);
  const dec = rec?.decisionId ? s.decisions.find((d) => d.id === rec.decisionId) : undefined;
  if (!dec) return;
  const issue = s.issues.find((i) => i.id === 'ISS-01');
  const act = dec.actionId ? s.actions.find((a) => a.id === dec.actionId) : undefined;
  const last = act?.updates[act.updates.length - 1];
  const before = s.rows.find((r) => r.id === 'ROW-personnel')!;
  const prev = before.statement;
  let statement: string;
  let trust: Trust = 'unknown';
  let refs = [dec.id, 'ISS-01'];
  if (dec.outcome === 'do-not-proceed' || dec.outcome === 'defer') {
    statement = `Not established. ${dec.outcome === 'defer' ? 'Review deferred' : 'Decision not to proceed'} at ${fmt(dec.at)}. Nobody has reported checking.`;
  } else if (!act || act.status === 'no-report') {
    statement = `Not established. Check decided at ${fmt(dec.at)}. No result reported yet.`;
  } else if (act.status === 'completion-verified' && act.verification) {
    statement = `Check verified by ${act.verification.by} at ${fmt(act.verification.at)}. Latest report: ${last?.text ?? ''}`;
    trust = 'verified';
    refs = [act.id, last?.reportId ?? '', 'ISS-01'].filter(Boolean);
  } else if (act.status === 'completion-reported') {
    statement = `${last?.reportedBy} reports the check complete at ${fmt(last?.at ?? s.now)}: ${last?.text} Not yet verified.`;
    trust = 'reported';
    refs = [act.id, last?.reportId ?? '', 'ISS-01'].filter(Boolean);
  } else {
    statement = `Not established. ${last?.reportedBy} reports at ${fmt(last?.at ?? s.now)}: ${last?.text}`;
    trust = 'reported';
    refs = [act.id, last?.reportId ?? '', 'ISS-01'].filter(Boolean);
  }
  reviseRow(s, 'ROW-personnel', s.now, statement, trust, refs);
  if (act?.status === 'completion-verified') {
    const gap = s.feed.find((f) => f.key === 'gap-people' && !f.supersededBy);
    const entry = s.feed.filter((f) => f.feedKind === 'response').pop();
    if (gap && entry) gap.supersededBy = entry.id;
  }
  if (issue) {
    issue.status = act?.status === 'completion-verified' ? 'answered' : act?.status === 'completion-reported' ? 'partly-answered' : 'open';
    if (act?.status === 'completion-verified' || act?.status === 'completion-reported') {
      issue.resolution = { at: s.now, text: statement, trust, refs };
    } else {
      delete issue.resolution;
    }
  }
  if (prev !== statement) {
    addLog(s, { at: s.now, kind: 'assessment', title: 'Assessment revised: people', ref: 'ROW-personnel' });
    addChange(s, { at: s.now, title: 'People: assessment revised', before: prev, after: statement, refs: [...refs, 'ROW-personnel'] });
  }
}

/** Response row reflects every response item, using the words each status carries. */
export function syncResponse(s: EccState) {
  const parts = s.actions.map((a) => {
    const name = a.id === 'ACT-01' ? 'Fire team' : a.id === 'ACT-02' ? 'Access restriction' : 'Accountability check';
    const label: Record<string, string> = {
      'no-report': 'no progress reported',
      'in-progress': 'reported in progress',
      'could-not-complete': 'reported could not complete',
      'completion-reported': 'reported complete, awaiting confirmation',
      'completion-verified': 'completion verified',
    };
    return `${name}: ${label[a.status]}.`;
  });
  reviseRow(s, 'ROW-response', s.now, parts.join(' '), 'reported', s.actions.map((a) => a.id));
}
