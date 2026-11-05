// Seeded historical incidents (illustrative). Each is a complete, self-contained
// record across several sites, clearly marked real vs training.
import type { IncidentRecord, RecordEvent } from './types';

function ts(iso: string) { return new Date(iso).getTime(); }
let n = 0;
const ev = (base: { t: number; kind: RecordEvent['kind']; title: string } & Record<string, unknown>): RecordEvent => ({ id: `seed-${++n}`, recordedAt: base.t, source: 'field', ...base } as unknown as RecordEvent);

function incident(r: Omit<IncidentRecord, 'schema' | 'reportVersions' | 'lessons' | 'references' | 'updatedAt'> & { lessons: string[] }): IncidentRecord {
  const last = r.events[r.events.length - 1]?.t ?? r.startedAt;
  return { schema: 'ecc-incident/1', ...r, reportVersions: [], references: [], updatedAt: last, lessons: r.lessons.map((text, i) => ({ id: `${r.id}-l${i}`, t: r.closure?.t ?? last, by: 'Incident Manager', text })) };
}

const S = (s: string) => s;

export const SEED_INCIDENTS: IncidentRecord[] = [
  incident({
    id: 'INC-2025-11-014', title: 'Propane pump seal fire · P-0012B', site: 'SG GSP', mode: 'real', startedAt: ts('2025-11-14T02:10:00'), status: 'closed', reportedBy: 'Field operator',
    equipment: ['P-0012B', 'DS-029', 'D-0029'],
    events: [
      ev({ t: ts('2025-11-14T02:10:00'), kind: 'notification', title: 'Initial notification: seal fire at propane pump P-0012B', detail: 'SG GSP · reported by field operator by radio' }),
      ev({ t: ts('2025-11-14T02:11:00'), kind: 'equipment', title: 'Equipment under monitoring: P-0012B, DS-029, D-0029', source: 'agent' }),
      ev({ t: ts('2025-11-14T02:12:00'), kind: 'measurement', title: 'Measurement snapshot · 4 variables', detail: 'P-0012B discharge 20.8 bar · D-0029 pressure 14.6 bar · D-0029 level 61 %', source: 'system', values: [{ watcherId: 'P-0012B:discharge', variable: 'Discharge pressure', value: 20.8, unit: 'bar', source: 'live' }, { watcherId: 'D-0029:pressure', variable: 'Pressure', value: 14.6, unit: 'bar', source: 'live' }, { watcherId: 'D-0029:level', variable: 'Level', value: 61, unit: '%', source: 'live' }, { watcherId: 'DS-029:flow', variable: 'Deluge flow', value: 0, unit: 'm³/h', source: 'live' }] }),
      ev({ t: ts('2025-11-14T02:13:00'), kind: 'observation', title: 'Small fire at the outboard seal of P-0012B; pump still running.', detail: 'Field · Operator · reported', equipmentId: 'P-0012B' }),
      ev({ t: ts('2025-11-14T02:14:00'), kind: 'alert', title: 'Fire at P-0012B seal · reported', equipmentId: 'P-0012B', source: 'agent', severity: 'critical', evidenceStatus: 'reported', state: 'active' }),
      ev({ t: ts('2025-11-14T02:14:30'), kind: 'finding', title: 'Assessment: seal fire on a running propane pump; inventory feed from D-0029 continues while the pump runs.', source: 'agent', meta: { assessment: true } }),
      ev({ t: ts('2025-11-14T02:15:00'), kind: 'recommendation', title: 'Stop P-0012B and isolate suction and discharge; activate area deluge DS-029.', detail: 'Stop pump · Isolate · Activate deluge · Keep personnel clear', source: 'agent', alertId: 'seed', summary: 'Stop P-0012B and isolate suction and discharge; activate area deluge DS-029.', actions: ['Stop pump P-0012B', 'Isolate suction and discharge where safe', 'Activate area deluge DS-029', 'Keep personnel clear'], prerequisites: [], evidence: [{ docId: 'proc-fire', title: 'Process area fire response — generic guidance', number: 'ECC-FX-001', revision: '1', page: 1, label: '§3 Isolation', locate: 'page-only' }] }),
      ev({ t: ts('2025-11-14T02:17:00'), kind: 'decision', title: 'Approved: Stop P-0012B and isolate; activate deluge DS-029.', detail: 'Fire small and localized; pump stop removes the feed.', source: 'user', by: 'A. Al-Zahrani · Shift Manager', alertId: 'seed', status: 'approved', rationale: 'Fire small and localized; pump stop removes the feed.', recommendationSummary: 'Stop P-0012B and isolate suction and discharge; activate area deluge DS-029.', knownEventCount: 7, evidence: [{ docId: 'proc-fire', title: 'Process area fire response — generic guidance', number: 'ECC-FX-001', revision: '1', page: 1, label: '§3 Isolation', locate: 'page-only' }] }),
      ev({ t: ts('2025-11-14T02:21:00'), kind: 'report', title: 'P-0012B stopped; suction and discharge valves closed.', detail: 'Incident Commander (field) · reported', equipmentId: 'P-0012B', by: 'Incident Commander (field)', alertId: 'seed', status: 'reported' }),
      ev({ t: ts('2025-11-14T02:24:00'), kind: 'observation', title: 'Deluge DS-029 flow 118 m³/h at the equipment; coverage confirmed by flow, not by the command signal.', detail: 'FT-029 · verified', equipmentId: 'DS-029' }),
      ev({ t: ts('2025-11-14T02:40:00'), kind: 'report', title: 'Fire extinguished; cooling continues.', detail: 'Fire team leader · reported', by: 'Fire team leader', alertId: 'seed', status: 'reported' }),
      ev({ t: ts('2025-11-14T03:05:00'), kind: 'outcome', title: 'Extinguishment independently verified by a second observer; no re-ignition for 25 min.', source: 'field' }),
      ev({ t: ts('2025-11-14T03:30:00'), kind: 'agent', title: 'Updating assessment', detail: 'Correlated field reports with deluge flow and D-0029 trends.', source: 'agent', taskId: 'seed-t1', taskKind: 'assessment', status: 'done', sources: ['PI historian (simulated)', 'ECC operator log'], documents: ['Fire response Rev 1'], docRefs: [{ docId: 'proc-fire', revision: '1', page: 1, label: 'Fire response Rev 1 p.1' }], findings: ['Fire at P-0012B seal'], failures: [], runId: 'run-seed-2025-11-014-1', configVersion: 'ecc-agent 0.9.1 / sg-gsp-2025.10', technical: { steps: [{ name: 'Correlate report with readings', status: 'done', operations: [{ name: 'Trend FT-029, PT-0029', source: 'PI historian (simulated)', startedAt: ts('2025-11-14T03:30:00'), durationMs: 210, result: 'ok', detail: 'Deluge flow confirmed; D-0029 steady.', retries: 0, logs: [{ t: ts('2025-11-14T03:30:00'), level: 'info', text: 'FT-029 118 m³/h' }] }] }] } }),
      ev({ t: ts('2025-11-14T03:40:00'), kind: 'stabilization', title: 'Stabilization recorded', detail: 'Fire out and verified; pump isolated; no release ongoing.', source: 'user', by: 'A. Al-Zahrani · Shift Manager', rationale: 'Fire out and verified; pump isolated; no release ongoing.' }),
      ev({ t: ts('2025-11-14T04:35:00'), kind: 'closure', title: 'Incident closed', detail: 'Area returned to normal operation except P-0012B, which remains isolated pending seal inspection.', source: 'user', by: 'M. Al-Dossari · Incident Manager', rationale: 'Area returned to normal operation except P-0012B, which remains isolated pending seal inspection.', outstanding: ['P-0012B seal inspection and root cause', 'DS-029 post-activation inspection'] }),
    ],
    stabilization: { t: ts('2025-11-14T03:40:00'), by: 'A. Al-Zahrani · Shift Manager', rationale: 'Fire out and verified; pump isolated; no release ongoing.' },
    closure: { t: ts('2025-11-14T04:35:00'), by: 'M. Al-Dossari · Incident Manager', rationale: 'Area returned to normal operation except P-0012B, which remains isolated pending seal inspection.', outstanding: ['P-0012B seal inspection and root cause', 'DS-029 post-activation inspection'] },
    lessons: ['Confirm deluge flow at the equipment, not from the command signal.', 'Record field reports separately from instrument readings and from independent verification.'],
  }),
  incident({
    id: 'INC-2024-06-002', title: 'Flare header high pressure · FH-01', site: 'SG GSP', mode: 'real', startedAt: ts('2024-06-02T15:40:00'), status: 'closed', reportedBy: 'Board operator',
    equipment: ['FH-01', 'V-0007'],
    events: [
      ev({ t: ts('2024-06-02T15:40:00'), kind: 'notification', title: 'Initial notification: flare header FH-01 pressure high', detail: 'SG GSP · board operator' }),
      ev({ t: ts('2024-06-02T15:41:00'), kind: 'equipment', title: 'Equipment under monitoring: FH-01, V-0007', source: 'agent' }),
      ev({ t: ts('2024-06-02T15:42:00'), kind: 'alert', title: 'FH-01 header pressure above High limit', detail: '2.7 bar rising · High 2.5 bar (placeholder)', equipmentId: 'FH-01', source: 'agent', severity: 'high', evidenceStatus: 'verified', state: 'active' }),
      ev({ t: ts('2024-06-02T15:44:00'), kind: 'finding', title: 'Assessment: V-0007 level rising with header pressure; liquid carry-over restricting the flare route is the likely cause.', source: 'agent', meta: { assessment: true } }),
      ev({ t: ts('2024-06-02T15:45:00'), kind: 'recommendation', title: 'Reduce V-0007 level by starting the KO drum pump-out; hold additional relief into FH-01 until header pressure falls.', detail: 'Start pump-out · Hold relief · Monitor', source: 'agent', alertId: 'seed', summary: 'Reduce V-0007 level by starting the KO drum pump-out; hold additional relief into FH-01 until header pressure falls.', actions: ['Start V-0007 pump-out', 'Hold planned relief into FH-01', 'Monitor FH-01 pressure and V-0007 level'], prerequisites: [], evidence: [{ docId: 'dependency', title: 'Depressurization dependency view — D-0001', number: 'ECC-FX-301', revision: '0', page: 1, label: 'Normal route', locate: 'page-only' }] }),
      ev({ t: ts('2024-06-02T15:50:00'), kind: 'decision', title: 'Approved: Reduce V-0007 level; hold relief into FH-01.', source: 'user', by: 'S. Al-Ghamdi · Shift Manager', alertId: 'seed', status: 'approved', rationale: 'Level trend supports carry-over; pump-out is the least disruptive action.', detail: 'Level trend supports carry-over; pump-out is the least disruptive action.', recommendationSummary: 'Reduce V-0007 level by starting the KO drum pump-out; hold additional relief into FH-01 until header pressure falls.', knownEventCount: 5 }),
      ev({ t: ts('2024-06-02T15:58:00'), kind: 'report', title: 'V-0007 pump-out started.', detail: 'Field operator · reported', by: 'Field operator', alertId: 'seed', status: 'reported' }),
      ev({ t: ts('2024-06-02T16:20:00'), kind: 'outcome', title: 'FH-01 pressure back below High limit; V-0007 level 35 % and falling.', source: 'agent' }),
      ev({ t: ts('2024-06-02T16:30:00'), kind: 'stabilization', title: 'Stabilization recorded', detail: 'Header pressure normal for 10 min; no release.', source: 'user', by: 'S. Al-Ghamdi · Shift Manager', rationale: 'Header pressure normal for 10 min; no release.' }),
      ev({ t: ts('2024-06-02T17:05:00'), kind: 'closure', title: 'Incident closed', detail: 'Relief route restored; no release.', source: 'user', by: 'M. Al-Dossari · Incident Manager', rationale: 'Relief route restored; no release.', outstanding: ['Review V-0007 level alarm setting'] }),
    ],
    stabilization: { t: ts('2024-06-02T16:30:00'), by: 'S. Al-Ghamdi · Shift Manager', rationale: 'Header pressure normal for 10 min; no release.' },
    closure: { t: ts('2024-06-02T17:05:00'), by: 'M. Al-Dossari · Incident Manager', rationale: 'Relief route restored; no release.', outstanding: ['Review V-0007 level alarm setting'] },
    lessons: ['Watch V-0007 level whenever header pressure rises.'],
  }),
  incident({
    id: 'INC-2025-03-021', title: 'Propane pump seal leak · P-2101A', site: 'WR NGL Plant', mode: 'real', startedAt: ts('2025-03-21T11:05:00'), status: 'closed', reportedBy: 'Field operator',
    equipment: ['P-2101A', 'DS-2101', 'FW-2001'],
    events: [
      ev({ t: ts('2025-03-21T11:05:00'), kind: 'notification', title: 'Initial notification: barrier fluid loss and vapour at P-2101A seal', detail: 'WR NGL Plant · field operator' }),
      ev({ t: ts('2025-03-21T11:06:00'), kind: 'equipment', title: 'Equipment under monitoring: P-2101A, DS-2101, FW-2001', source: 'agent' }),
      ev({ t: ts('2025-03-21T11:07:00'), kind: 'alert', title: 'P-2101A seal pot pressure above alarm · barrier fluid level low', detail: 'Seal pot 6.4 bar · level 22 % (placeholder alarms)', equipmentId: 'P-2101A', source: 'agent', severity: 'high', evidenceStatus: 'verified', state: 'active' }),
      ev({ t: ts('2025-03-21T11:08:00'), kind: 'gap', title: 'Information gap: only one firewater pump available (FW-2001B under maintenance)', source: 'agent' }),
      ev({ t: ts('2025-03-21T11:09:00'), kind: 'recommendation', title: 'Stop P-2101A and isolate; do not restart until the seal is inspected.', detail: 'Stop · Isolate · Report', source: 'agent', alertId: 'seed', summary: 'Stop P-2101A and isolate; do not restart until the seal is inspected.', actions: ['Stop P-2101A', 'Close suction and discharge valves', 'Report to control room'], prerequisites: [], evidence: [{ docId: 'wr-pump-manual', title: 'Centrifugal propane pump P-2100 series — operating manual (extract)', number: 'ECC-FX-402', revision: '2', page: 2, label: '§4 Shutdown on seal failure', locate: 'page-only' }] }),
      ev({ t: ts('2025-03-21T11:12:00'), kind: 'decision', title: 'Approved: Stop P-2101A and isolate.', source: 'user', by: 'R. Al-Mutairi · Shift Manager', alertId: 'seed', status: 'approved', rationale: 'Seal failure indicated by two independent signals.', detail: 'Seal failure indicated by two independent signals.', recommendationSummary: 'Stop P-2101A and isolate; do not restart until the seal is inspected.', knownEventCount: 5 }),
      ev({ t: ts('2025-03-21T11:20:00'), kind: 'report', title: 'P-2101A stopped and isolated; vapour cloud dispersed.', detail: 'Field operator · reported', by: 'Field operator', alertId: 'seed', status: 'reported' }),
      ev({ t: ts('2025-03-21T11:35:00'), kind: 'outcome', title: 'Gas detectors in the pump bay back to zero for 10 min.', source: 'agent' }),
      ev({ t: ts('2025-03-21T12:10:00'), kind: 'closure', title: 'Incident closed', detail: 'No ignition; pump isolated; standby pump P-2101B in service.', source: 'user', by: 'K. Al-Harthi · Incident Manager', rationale: 'No ignition; pump isolated; standby pump P-2101B in service.', outstanding: ['Seal replacement on P-2101A', 'Firewater pump FW-2001B impairment still open'] }),
    ],
    closure: { t: ts('2025-03-21T12:10:00'), by: 'K. Al-Harthi · Incident Manager', rationale: 'No ignition; pump isolated; standby pump P-2101B in service.', outstanding: ['Seal replacement on P-2101A', 'Firewater pump FW-2001B impairment still open'] },
    lessons: ['Treat a firewater impairment as an open outstanding issue in every incident record while it lasts.'],
  }),
  incident({
    id: 'INC-2025-09-008', title: 'Loading bay spill · LB-3', site: 'East Terminal', mode: 'real', startedAt: ts('2025-09-08T19:22:00'), status: 'closed', reportedBy: 'Loading supervisor',
    equipment: ['LB-3', 'T-3001', 'FW-3001'],
    events: [
      ev({ t: ts('2025-09-08T19:22:00'), kind: 'notification', title: 'Initial notification: hose failure during loading at bay LB-3', detail: 'East Terminal · loading supervisor' }),
      ev({ t: ts('2025-09-08T19:23:00'), kind: 'equipment', title: 'Equipment under monitoring: LB-3, T-3001, FW-3001', source: 'agent' }),
      ev({ t: ts('2025-09-08T19:24:00'), kind: 'observation', title: 'Transfer stopped; pooled product inside the bay containment, estimated 2 m³.', detail: 'Loading supervisor · reported', equipmentId: 'LB-3' }),
      ev({ t: ts('2025-09-08T19:25:00'), kind: 'recommendation', title: 'Isolate the loading line, keep ignition sources clear, and apply foam cover to the pooled product.', detail: 'Isolate · Ignition control · Foam', source: 'agent', alertId: 'seed', summary: 'Isolate the loading line, keep ignition sources clear, and apply foam cover to the pooled product.', actions: ['Isolate loading line at T-3001 outlet', 'Clear vehicles and non-essential personnel', 'Apply foam cover'], prerequisites: ['Quantity released not yet confirmed'], evidence: [{ docId: 'et-spill-procedure', title: 'Loading area spill response — generic guidance', number: 'ECC-FX-501', revision: '3', page: 1, label: '§2 Immediate actions', locate: 'page-only' }, { docId: 'et-layout', title: 'Area layout — East Terminal loading area (plan)', number: 'ECC-FX-520', revision: '1', page: 1, label: 'Loading bays', locate: 'page-only' }] }),
      ev({ t: ts('2025-09-08T19:28:00'), kind: 'decision', title: 'Approved: Isolate, ignition control, foam cover.', source: 'user', by: 'F. Al-Qahtani · Shift Manager', alertId: 'seed', status: 'approved', rationale: 'Spill contained within the bay; foam cover reduces ignition risk.', detail: 'Spill contained within the bay; foam cover reduces ignition risk.', recommendationSummary: 'Isolate the loading line, keep ignition sources clear, and apply foam cover to the pooled product.', knownEventCount: 4 }),
      ev({ t: ts('2025-09-08T19:41:00'), kind: 'report', title: 'Foam cover applied; line isolated at T-3001 outlet.', detail: 'Incident Commander (field) · reported', by: 'Incident Commander (field)', alertId: 'seed', status: 'reported' }),
      ev({ t: ts('2025-09-08T20:30:00'), kind: 'outcome', title: 'Product recovered to slop; 1.8 m³ recovered of 2.1 m³ estimated released.', source: 'field' }),
      ev({ t: ts('2025-09-08T20:45:00'), kind: 'stabilization', title: 'Stabilization recorded', detail: 'No vapour readings; recovery complete.', source: 'user', by: 'F. Al-Qahtani · Shift Manager', rationale: 'No vapour readings; recovery complete.' }),
      ev({ t: ts('2025-09-08T21:10:00'), kind: 'closure', title: 'Incident closed', detail: 'Bay LB-3 out of service pending hose replacement and drain inspection.', source: 'user', by: 'H. Al-Shehri · Incident Manager', rationale: 'Bay LB-3 out of service pending hose replacement and drain inspection.', outstanding: ['Hose certification review for all bays', 'Drain inspection LB-3'] }),
    ],
    stabilization: { t: ts('2025-09-08T20:45:00'), by: 'F. Al-Qahtani · Shift Manager', rationale: 'No vapour readings; recovery complete.' },
    closure: { t: ts('2025-09-08T21:10:00'), by: 'H. Al-Shehri · Incident Manager', rationale: 'Bay LB-3 out of service pending hose replacement and drain inspection.', outstanding: ['Hose certification review for all bays', 'Drain inspection LB-3'] },
    lessons: ['Record quantity released and quantity recovered separately.'],
  }),
  incident({
    id: 'TRN-2026-03-018', title: 'Training · D-0001 overpressure exercise', site: 'SG GSP', mode: 'training', startedAt: ts('2026-03-18T09:00:00'), status: 'closed', reportedBy: 'Exercise controller',
    equipment: ['D-0001', 'FH-01'],
    events: [
      ev({ t: ts('2026-03-18T09:00:00'), kind: 'notification', title: 'Exercise start: simulated external fire exposure of D-0001', detail: 'SG GSP · exercise controller · training' }),
      ev({ t: ts('2026-03-18T09:01:00'), kind: 'equipment', title: 'Equipment under monitoring: D-0001, FH-01', source: 'agent' }),
      ev({ t: ts('2026-03-18T09:10:00'), kind: 'alert', title: 'D-0001 pressure rising (injected)', detail: '16.0 bar rising · High 18.0 bar (placeholder)', equipmentId: 'D-0001', source: 'agent', severity: 'high', evidenceStatus: 'verified', state: 'active' }),
      ev({ t: ts('2026-03-18T09:12:00'), kind: 'recommendation', title: 'Prepare emergency depressurization of D-0001 via the normal relief route; confirm route availability first.', detail: 'Confirm route · Stage personnel', source: 'agent', alertId: 'seed', summary: 'Prepare emergency depressurization of D-0001 via the normal relief route; confirm route availability first.', actions: ['Confirm FH-01 available', 'Stage personnel clear of the discharge path'], prerequisites: ['Route availability to be recorded as verified, reported or unknown'], evidence: [{ docId: 'proc-depress', title: 'Emergency depressurization — generic guidance', number: 'ECC-FX-002', revision: '2', page: 2, label: '§4.2 Relief route', locate: 'page-only' }] }),
      ev({ t: ts('2026-03-18T09:20:00'), kind: 'decision', title: 'Approved: Prepare depressurization via the normal route.', source: 'user', by: 'Exercise participant · Shift Manager', alertId: 'seed', status: 'approved', rationale: 'Route reported available by the exercise controller.', detail: 'Route reported available by the exercise controller.', recommendationSummary: 'Prepare emergency depressurization of D-0001 via the normal relief route; confirm route availability first.', knownEventCount: 4 }),
      ev({ t: ts('2026-03-18T10:30:00'), kind: 'outcome', title: 'Exercise objective met: route availability recorded as reported, not verified, before the decision.', source: 'user' }),
      ev({ t: ts('2026-03-18T11:20:00'), kind: 'closure', title: 'Exercise closed', detail: 'Table-top exercise complete.', source: 'user', by: 'Exercise controller', rationale: 'Table-top exercise complete.', outstanding: [] }),
    ],
    closure: { t: ts('2026-03-18T11:20:00'), by: 'Exercise controller', rationale: 'Table-top exercise complete.', outstanding: [] },
    lessons: ['Route availability should be recorded as verified, reported or unknown.'],
  }),
  incident({
    id: 'TRN-2023-06-021', title: 'Training · propane area fire drill', site: 'SG GSP', mode: 'training', startedAt: ts('2023-06-21T08:30:00'), status: 'closed', reportedBy: 'Exercise controller',
    equipment: ['P-0012A', 'DS-029'],
    events: [
      ev({ t: ts('2023-06-21T08:30:00'), kind: 'notification', title: 'Drill start: simulated seal fire at P-0012A', detail: 'SG GSP · drill · training' }),
      ev({ t: ts('2023-06-21T08:45:00'), kind: 'report', title: 'Deluge DS-029 activated from the local panel (drill).', detail: 'Fire team · reported', by: 'Fire team', alertId: 'seed', status: 'reported' }),
      ev({ t: ts('2023-06-21T08:47:00'), kind: 'observation', title: 'Deluge flow confirmed by FT-029 (drill injection).', detail: 'FT-029 · verified', equipmentId: 'DS-029' }),
      ev({ t: ts('2023-06-21T10:00:00'), kind: 'closure', title: 'Drill closed', detail: 'Drill complete.', source: 'user', by: 'Exercise controller', rationale: 'Drill complete.', outstanding: [] }),
    ],
    closure: { t: ts('2023-06-21T10:00:00'), by: 'Exercise controller', rationale: 'Drill complete.', outstanding: [] },
    lessons: [S('Confirm water flow at the protected equipment.')],
  }),
];
