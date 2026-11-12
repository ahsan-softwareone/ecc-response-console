import type { Equipment, WatcherDef, ScenarioStep, KnowledgeDoc, HistoricalEmergency, EvidenceRef, TaskDef } from './types';
import quotes from './quotes.json';
import drawings from './drawings.json';

// All values, limits and procedure wording are illustrative fixtures for the
// SG GSP drone-interception demonstration. Nothing is SME-validated.

export const EMERGENCY_META = {
  title: 'Drone interception · propane recovery area',
  shortTitle: 'Drone interception',
  facility: 'SG GSP',
  mode: 'training' as const,
  reportedBy: 'Security control',
};

export const USER = { name: 'N. Al-Harbi', role: 'Shift Manager', note: 'Acting until the Incident Manager reaches ECC' };

export const EQUIPMENT: Equipment[] = [
  { id: 'D-0029', name: 'Propane accumulator', area: 'Propane recovery', kind: 'Pressure vessel',
    relevance: [{ step: 1, role: 'In reported debris zone' }, { step: 2, role: 'On fire · damaged' }, { step: 7, role: 'Fire reported contained' }],
    drawings: [{ docId: 'pid', region: { page: 1, ...drawings.pid.d0029 } }, { docId: 'layout', region: { page: 1, ...drawings.layout.d0029 } }] },
  { id: 'D-0001', name: 'HP Separator', area: 'Inlet separation', kind: 'Pressure vessel',
    relevance: [{ step: 1, role: 'Adjacent to debris zone' }, { step: 3, role: 'Exposed to heat' }, { step: 6, role: 'Depressurizing' }, { step: 7, role: 'Stabilizing' }],
    drawings: [{ docId: 'pid', region: { page: 1, ...drawings.pid.d0001 } }, { docId: 'layout', region: { page: 1, ...drawings.layout.d0001 } }, { docId: 'dependency', region: { page: 1, ...drawings.dependency.normal_route } }] },
  { id: 'DS-029', name: 'Area deluge', area: 'Propane recovery', kind: 'Fire protection',
    relevance: [{ step: 1, role: 'Protects propane area' }, { step: 4, role: 'Failed to confirm' }, { step: 7, role: 'Standby · fault open' }],
    drawings: [{ docId: 'layout', region: { page: 1, ...drawings.layout.ds029 } }, { docId: 'dependency', region: { page: 1, ...drawings.dependency.deluge } }] },
  { id: 'FH-01', name: 'Flare header', area: 'Relief and flare', kind: 'Piping system',
    relevance: [{ step: 1, role: 'Relief route' }, { step: 5, role: 'Damaged · route unavailable' }],
    drawings: [{ docId: 'layout', region: { page: 1, ...drawings.layout.fh01_damaged } }, { docId: 'dependency', region: { page: 1, ...drawings.dependency.normal_route } }] },
  // Catalogue items the user can add
  { id: 'FW-01', name: 'Firewater pumps', area: 'Fire protection', kind: 'Pump system', relevance: [{ step: 4, role: 'Supplies deluge' }],
    drawings: [{ docId: 'dependency', region: { page: 1, ...drawings.dependency.deluge } }] },
  { id: 'V-0007', name: 'Flare KO drum', area: 'Relief and flare', kind: 'Pressure vessel', relevance: [{ step: 5, role: 'On both relief routes' }],
    drawings: [{ docId: 'dependency', region: { page: 1, ...drawings.dependency.upstream_route } }] },
  { id: 'P-0012A', name: 'Propane pump A', area: 'Propane recovery', kind: 'Centrifugal pump', relevance: [], drawings: [{ docId: 'pid', region: { page: 1, ...drawings.pid.d0029 } }] },
  { id: 'C-0001', name: 'Inlet compressor', area: 'Inlet separation', kind: 'Compressor', relevance: [], drawings: [] },
];

export const DEFAULT_DASHBOARD = ['D-0029', 'D-0001', 'DS-029', 'FH-01'];

export const WATCHERS: WatcherDef[] = [
  { id: 'D-0029:pressure', equipmentId: 'D-0029', variable: 'Pressure', unit: 'bar', decimals: 1, baseline: 14.8, defaultOnCard: true,
    limits: [{ label: 'High', value: 17.5, kind: 'high', basis: 'placeholder' }, { label: 'High-High', value: 19.0, kind: 'high', basis: 'placeholder' }], defaultLimit: 'High' },
  { id: 'D-0029:level', equipmentId: 'D-0029', variable: 'Level', unit: '%', decimals: 0, baseline: 62, defaultOnCard: true,
    limits: [{ label: 'High', value: 80, kind: 'high', basis: 'placeholder' }], defaultLimit: 'High' },
  { id: 'D-0029:temperature', equipmentId: 'D-0029', variable: 'Shell temperature', unit: '°C', decimals: 0, baseline: 38, defaultOnCard: false, limits: [] },
  { id: 'D-0001:pressure', equipmentId: 'D-0001', variable: 'Pressure', unit: 'bar', decimals: 1, baseline: 12.4, defaultOnCard: true,
    limits: [{ label: 'High', value: 18.0, kind: 'high', basis: 'placeholder' }, { label: 'High-High', value: 20.5, kind: 'high', basis: 'placeholder' }], defaultLimit: 'High' },
  { id: 'D-0001:temperature', equipmentId: 'D-0001', variable: 'Shell temperature', unit: '°C', decimals: 0, baseline: 46, defaultOnCard: true,
    limits: [{ label: 'High', value: 120, kind: 'high', basis: 'placeholder' }, { label: 'High-High', value: 150, kind: 'high', basis: 'placeholder' }], defaultLimit: 'High' },
  { id: 'D-0001:level', equipmentId: 'D-0001', variable: 'Level', unit: '%', decimals: 0, baseline: 48, defaultOnCard: false,
    limits: [{ label: 'High', value: 85, kind: 'high', basis: 'placeholder' }], defaultLimit: 'High' },
  { id: 'DS-029:flow', equipmentId: 'DS-029', variable: 'Deluge flow', unit: 'm³/h', decimals: 1, baseline: 0, defaultOnCard: true, limits: [] },
  { id: 'DS-029:status', equipmentId: 'DS-029', variable: 'System status', unit: 'status', decimals: 0, baseline: 0, defaultOnCard: true, limits: [], statusLabels: ['Standby', 'Commanded'] },
  { id: 'FH-01:pressure', equipmentId: 'FH-01', variable: 'Header pressure', unit: 'bar', decimals: 2, baseline: 0.62, defaultOnCard: true,
    limits: [{ label: 'High', value: 2.5, kind: 'high', basis: 'placeholder' }], defaultLimit: 'High' },
  { id: 'FH-01:flow', equipmentId: 'FH-01', variable: 'Flare flow', unit: 'm³/h', decimals: 0, baseline: 120, defaultOnCard: true, limits: [] },
  { id: 'FW-01:pressure', equipmentId: 'FW-01', variable: 'Firewater pressure', unit: 'bar', decimals: 1, baseline: 9.4, defaultOnCard: true,
    limits: [{ label: 'Low', value: 7.0, kind: 'low', basis: 'placeholder' }], defaultLimit: 'Low' },
  { id: 'FW-01:running', equipmentId: 'FW-01', variable: 'Running status', unit: 'status', decimals: 0, baseline: 1, defaultOnCard: true, limits: [], statusLabels: ['Stopped', 'Running'] },
  { id: 'V-0007:level', equipmentId: 'V-0007', variable: 'Level', unit: '%', decimals: 0, baseline: 18, defaultOnCard: true,
    limits: [{ label: 'High', value: 60, kind: 'high', basis: 'placeholder' }], defaultLimit: 'High' },
  { id: 'V-0007:pressure', equipmentId: 'V-0007', variable: 'Pressure', unit: 'bar', decimals: 2, baseline: 0.55, defaultOnCard: true, limits: [] },
  { id: 'P-0012A:running', equipmentId: 'P-0012A', variable: 'Running status', unit: 'status', decimals: 0, baseline: 1, defaultOnCard: true, limits: [], statusLabels: ['Stopped', 'Running'] },
  { id: 'P-0012A:discharge', equipmentId: 'P-0012A', variable: 'Discharge pressure', unit: 'bar', decimals: 1, baseline: 21.3, defaultOnCard: true, limits: [] },
  { id: 'C-0001:running', equipmentId: 'C-0001', variable: 'Running status', unit: 'status', decimals: 0, baseline: 1, defaultOnCard: true, limits: [], statusLabels: ['Stopped', 'Running'] },
];

// ---------- Evidence references (revision pinned at time of use) ----------
const EV = {
  fireInitial: (): EvidenceRef => ({ docId: 'proc-fire', revision: '1', page: 1, label: '§2 Initial response', quote: quotes.fire_initial, locate: 'exact' }),
  fireConfirmFlow: (): EvidenceRef => ({ docId: 'proc-fire', revision: '1', page: 2, label: '§4–6 Water flow confirmation', quote: quotes.fire_confirm_flow, locate: 'ambiguous' }),
  depressPrepare: (): EvidenceRef => ({ docId: 'proc-depress', revision: '2', page: 2, label: '§4.2 Relief route', quote: quotes.depress_prepare, locate: 'exact' }),
  depressInitiate: (): EvidenceRef => ({ docId: 'proc-depress', revision: '2', page: 3, label: '§5.1 Decision', quote: quotes.depress_initiate, locate: 'exact' }),
  depressAlternative: (): EvidenceRef => ({ docId: 'proc-depress', revision: '2', page: 4, label: '§6.1 Availability', quote: quotes.depress_alternative, locate: 'exact' }),
  depressMonitor: (): EvidenceRef => ({ docId: 'proc-depress', revision: '2', page: 4, label: '§6.3 Monitoring', quote: quotes.depress_monitor, locate: 'exact' }),
  limitsVessels: (): EvidenceRef => ({ docId: 'limits', revision: 'A', page: 2, label: '§2 Vessels', locate: 'page-only' }),
  layoutPropane: (): EvidenceRef => ({ docId: 'layout', revision: '0', page: 1, label: 'Propane recovery area', region: { page: 1, ...drawings.layout.propane_area }, locate: 'exact' }),
  layoutDebris: (): EvidenceRef => ({ docId: 'layout', revision: '0', page: 1, label: 'Reported debris fall zone', region: { page: 1, ...drawings.layout.debris_zone }, locate: 'exact' }),
  layoutDeluge: (): EvidenceRef => ({ docId: 'layout', revision: '0', page: 1, label: 'Deluge skid DS-029', region: { page: 1, ...drawings.layout.ds029 }, locate: 'exact' }),
  layoutHeader: (): EvidenceRef => ({ docId: 'layout', revision: '0', page: 1, label: 'Header section near propane area', region: { page: 1, ...drawings.layout.fh01_damaged }, locate: 'exact' }),
  pidRelief: (): EvidenceRef => ({ docId: 'pid', revision: '0', page: 1, label: 'D-0001 relief path to FH-01', region: { page: 1, ...drawings.pid.d0001_relief }, locate: 'exact' }),
  pidD0029: (): EvidenceRef => ({ docId: 'pid', revision: '0', page: 1, label: 'D-0029 and instrumentation', region: { page: 1, ...drawings.pid.d0029 }, locate: 'exact' }),
  depNormal: (): EvidenceRef => ({ docId: 'dependency', revision: '0', page: 1, label: 'Normal route', region: { page: 1, ...drawings.dependency.normal_route }, locate: 'exact' }),
  depUpstream: (): EvidenceRef => ({ docId: 'dependency', revision: '0', page: 1, label: 'Upstream route', region: { page: 1, ...drawings.dependency.upstream_route }, locate: 'exact' }),
  depDeluge: (): EvidenceRef => ({ docId: 'dependency', revision: '0', page: 1, label: 'Fire protection dependency', region: { page: 1, ...drawings.dependency.deluge }, locate: 'exact' }),
};

const CFG = 'ecc-agent 0.9.3 / sg-gsp-drone-2026.04';

function task(id: string, title: string, kind: TaskDef['kind'], startSec: number, durationSec: number, rationale: string, steps: TaskDef['steps'], status: TaskDef['status'] = 'done'): TaskDef {
  return { id, title, kind, startSec, durationSec, status, rationale, steps };
}
function op(id: string, name: string, source: string, startSec: number, durationMs: number, result: 'ok' | 'error' | 'retry' | 'empty', detail: string, logs: string[], extra: Partial<TaskDef['steps'][number]['operations'][number]> = {}) {
  return { id, name, source, startSec, durationMs, result, detail, configVersion: CFG, logs: logs.map((text, i) => ({ t: startSec + i * 0.4, level: (/retry|timeout/i.test(text) ? 'warn' : /fail|error/i.test(text) ? 'error' : 'info') as 'info' | 'warn' | 'error', text })), ...extra };
}

export const STEPS: ScenarioStep[] = [
  // ---------------------------------------------------------------- 1
  {
    index: 1, title: 'Drone intercepted', nominalOffsetMin: 0, phase: 'Developing',
    readings: {},
    alerts: [
      { id: 'a1-1', issue: 'fire', plain: "A drone was shot down over the north perimeter. Debris may have fallen on the propane recovery area.", equipmentId: 'D-0029', severity: 'medium', offsetSec: 10, evidence: 'reported',
        title: 'Drone intercepted at north perimeter · debris zone includes propane recovery area', brief: 'Drone intercepted; debris reported toward propane recovery', status: 'In debris fall zone', statusNote: 'Reported exposure; no damage reported', headline: 'Drone intercepted at north perimeter', qualifier: 'Debris reported falling toward the propane recovery area',
        why: 'Security reports an intercepted drone over the north perimeter. The reported debris fall zone overlaps the propane recovery area, where D-0029 holds pressurized inventory.',
        consequence: 'Debris impact on pressurized equipment could cause a release. No damage has been reported.',
        recommendation: {
          summary: 'Confirm personnel are clear of the propane recovery area and stand fire response by.', verify: "Headcount confirms nobody is left in the propane recovery area.",
          actions: ['Confirm personnel accounted for in the propane recovery area', 'Stand by fire response at the area boundary', 'Request a field check of D-0029 and the deluge skid once it is safe to approach'],
          evidence: [EV.layoutDebris(), EV.layoutPropane()],
        } },
    ],
    observations: [
      { id: 'o1-1', issue: 'fire', issueTitle: 'Debris reported near the propane recovery area', plain: 'Security control saw debris falling toward the propane recovery area after the drone was intercepted.', offsetSec: 2, kind: 'security-report', evidence: 'reported', source: 'Security control', text: 'Drone intercepted over north perimeter; debris observed falling toward the propane recovery area.' },
      { id: 'o1-2', issue: 'info', offsetSec: 5, kind: 'agent-finding', evidence: 'inferred', source: 'ECC agent', text: 'Four items placed under monitoring by relevance: D-0029, D-0001, DS-029, FH-01.' },
      { id: 'o1-3', equipmentId: 'D-0029', offsetSec: 6, kind: 'reading', evidence: 'verified', source: 'PT-0029 (simulated)', text: 'Pressure 14.8 bar, level 62 %. Within configured limits.' },
    ],
    findings: [{ id: 'f1', offsetSec: 6, text: 'Initial assessment: drone interception with debris reported near the propane recovery area. No equipment damage reported. Monitoring D-0029, D-0001, DS-029 and FH-01.' }],
    tasks: [
      task('t1-1', 'Checking equipment context', 'equipment', 1, 4, 'Identify equipment inside the reported debris zone and adjacent units.', [
        { id: 's', name: 'Resolve area from security report', status: 'done', operations: [
          op('o', 'Geocode "north perimeter" against area layout', 'Knowledge · drawings index', 1, 640, 'ok', 'Matched ECC-FX-201 Rev 0 (area layout).', ['query: north perimeter propane recovery', 'hit ECC-FX-201 rev 0 score 0.91'], { linked: [{ kind: 'doc', id: 'layout', label: 'Area layout' }] }) ] },
        { id: 's2', name: 'List equipment in and adjacent to zone', status: 'done', operations: [
          op('o', 'Asset register lookup', 'Asset register (simulated)', 2, 410, 'ok', '4 items: D-0029, D-0001, DS-029, FH-01.', ['filter area in (propane recovery, inlet separation)', '4 rows returned']) ] },
      ]),
      task('t1-2', 'Reviewing relevant procedures', 'procedures', 2, 4, 'Retrieve guidance applicable to a possible fire or release in a propane area.', [
        { id: 's', name: 'Search Knowledge', status: 'done', operations: [
          op('o', 'Search: fire response propane area', 'Knowledge index', 2, 820, 'ok', 'ECC-FX-001 Rev 1 (fire response), ECC-FX-002 Rev 2 (depressurization).', ['2 documents ranked', 'revision check: ECC-FX-002 rev 2 effective'], { linked: [{ kind: 'doc', id: 'proc-fire', label: 'Fire response Rev 1' }, { kind: 'doc', id: 'proc-depress', label: 'Depressurization Rev 2' }] }) ] },
      ]),
      task('t1-3', 'Monitoring process values', 'monitoring', 4, 0, 'Subscribe to the configured tags for the four monitored items.', [
        { id: 's', name: 'Subscribe to tags', status: 'done', operations: [
          op('o', 'PI subscription (simulated)', 'PI historian (simulated)', 4, 300, 'ok', '10 tags subscribed at 10 s cadence.', ['subscribe PT-0029 LT-0029 TT-0029 PT-0001 TT-0001 LT-0001 FT-029 ZS-029 PT-FH01 FT-FH01']) ] },
      ], 'waiting'),
    ],
    sitrep: { situation: 'Drone intercepted at the north perimeter at T+0. Debris reported toward the propane recovery area. No damage reported.', actions: 'Monitoring established for D-0029, D-0001, DS-029 and FH-01. Fire response on standby.', decisions: 'None recorded.', resources: 'Shift Manager in ECC. Incident Manager en route.', next: 'Field check of propane recovery area when safe.' },
  },
  // ---------------------------------------------------------------- 2
  {
    index: 2, title: 'Shrapnel damages D-0029 · fire', nominalOffsetMin: 3, phase: 'Escalating',
    readings: {
      'D-0029:pressure': { value: 11.9, trend: 'falling' },
      'D-0029:level': { value: 44, trend: 'falling' },
      'D-0029:temperature': { value: 55, trend: 'rising' },
    },
    alerts: [
      { id: 'a2-1', issue: 'fire', plain: "Fire at the propane accumulator D-0029 after shrapnel damage.", equipmentId: 'D-0029', severity: 'critical', offsetSec: 24, evidence: 'reported', watcherId: 'D-0029:pressure', supersedes: [{ alertId: 'a1-1', reason: 'Fire reported at D-0029; the stand-by posture no longer applies.' }],
        title: 'Fire at D-0029 · shrapnel damage reported', brief: 'Fire reported at D-0029', status: 'Fire reported; shrapnel damage', statusNote: 'Field report; readings show pressure and level falling', headline: 'Fire reported at D-0029', qualifier: 'Shrapnel damage reported; pressure and level measured falling',
        measurement: 'Pressure 11.9 bar falling from 14.8 · level 44 % falling',
        why: 'Field reports fire at D-0029 after debris impact. Pressure and level are both falling, consistent with loss of containment feeding the fire.',
        consequence: 'Continued release feeds the fire. Radiant heat will affect adjacent equipment, in particular D-0001, if cooling is not established.',
        recommendation: {
          summary: 'Initiate fire response for D-0029 and stop the inventory feeding the fire where it can be done safely.', verify: "The fire team confirms the fire is out and the feed to D-0029 is isolated.",
          actions: ['Confirm muster and exclusion zone around D-0029', 'Isolate inventory to D-0029 where it can be done safely (isolation points not identified in this fixture)', 'Activate area deluge DS-029 and cool D-0001', 'Brief the Incident Commander on D-0029 condition'],
          prerequisites: ['Isolation point positions not yet confirmed from the field'],
          evidence: [EV.fireInitial(), EV.layoutPropane(), EV.pidD0029()],
        } },
      { id: 'a2-2', issue: 'fire', plain: "D-0029 is losing its contents: the liquid level is falling.", equipmentId: 'D-0029', severity: 'high', offsetSec: 30, evidence: 'verified', watcherId: 'D-0029:level',
        title: 'D-0029 level falling · inventory loss', status: 'Fire reported; level falling', statusNote: 'Field report; level reading falling',
        measurement: 'Level 44 % falling from 62 % over 3 min',
        why: 'Level transmitter LT-0029 shows a sustained fall with no outlet flow change recorded.',
        consequence: 'Inventory continues to feed the fire until the vessel empties or is isolated.' },
    ],
    observations: [
      { id: 'o2-1', issue: 'fire', issueTitle: 'Fire at the propane accumulator D-0029', plain: 'The fire team leader reports a fire at D-0029, with shrapnel damage on the shell. Personnel have been withdrawn.', equipmentId: 'D-0029', offsetSec: 2, kind: 'field-report', evidence: 'reported', source: 'Field · Fire team leader', text: 'Fire at D-0029. Shrapnel damage visible on the shell. Personnel withdrawn.' },
      { id: 'o2-2', equipmentId: 'D-0029', offsetSec: 3, kind: 'reading', evidence: 'verified', source: 'PT-0029 / LT-0029 (simulated)', text: 'Pressure 11.9 bar falling; level 44 % falling.' },
      { id: 'o2-3', issue: 'fire', plain: 'Pressure and level are falling together, so D-0029 is probably leaking. The fire report is not yet independently checked.', offsetSec: 12, kind: 'agent-finding', evidence: 'inferred', source: 'ECC agent', text: 'Pressure and level fall together: loss of containment at D-0029 inferred. Fire report not yet independently verified.' },
    ],
    findings: [{ id: 'f2', offsetSec: 12, supersedes: 'f1', text: 'Assessment revised: fire at D-0029 reported after shrapnel damage; readings consistent with loss of containment. D-0001 is the adjacent exposed item.' }],
    tasks: [
      task('t2-1', 'Updating assessment', 'assessment', 2, 10, 'Combine the field fire report with D-0029 trends.', [
        { id: 's', name: 'Correlate report with readings', status: 'done', operations: [
          op('o', 'Trend check PT-0029, LT-0029 (3 min window)', 'PI historian (simulated)', 2, 220, 'ok', 'Both falling; rate consistent with release.', ['PT-0029 -2.9 bar / 3 min', 'LT-0029 -18 % / 3 min']) ,
          op('o2', 'Generate alert', 'ECC agent', 4, 90, 'ok', 'Critical: Fire at D-0029.', ['severity critical (provisional mapping)'], { linked: [{ kind: 'alert', id: 'a2-1', label: 'Fire at D-0029' }] }) ] },
      ]),
      task('t2-2', 'Reviewing relevant procedures', 'procedures', 5, 6, 'Locate initial-response guidance for a pressurized hydrocarbon fire.', [
        { id: 's', name: 'Locate passage', status: 'done', operations: [
          op('o', 'Passage search in ECC-FX-001 Rev 1', 'Knowledge · text layer', 5, 540, 'ok', 'Exact match §2 p.1.', ['query: fire pressurized hydrocarbon priority', 'match p.1 §2 (exact)'], { linked: [{ kind: 'doc', id: 'proc-fire', label: 'Fire response Rev 1 p.1' }] }) ] },
      ]),
    ],
    sitrep: { situation: 'Fire at propane accumulator D-0029 following shrapnel damage from drone debris (T+3). Loss of containment inferred from falling pressure and level.', actions: 'Fire response initiated. Personnel withdrawn from the area. Deluge activation and isolation recommended.', decisions: 'Awaiting recorded decision on isolation and deluge.', resources: 'Fire team at area boundary. Shift Manager in ECC.', next: 'Confirm deluge coverage and D-0001 condition.' },
  },
  // ---------------------------------------------------------------- 3
  {
    index: 3, title: 'Heat affects D-0001', nominalOffsetMin: 9, phase: 'Escalating',
    readings: {
      'D-0001:pressure': { value: 15.2, trend: 'rising' },
      'D-0001:temperature': { value: 71, trend: 'rising' },
      'D-0029:pressure': { value: 9.1, trend: 'falling' },
      'D-0029:level': { value: 27, trend: 'falling' },
      'D-0029:temperature': { value: 92, trend: 'rising' },
    },
    reiterations: [{ alertId: 'a2-1', offsetSec: 18 }, { alertId: 'a2-1', offsetSec: 48 }],
    alerts: [
      { id: 'a3-1', issue: 'pressure', plain: "Pressure in the HP separator D-0001 is rising from the heat of the nearby fire.", equipmentId: 'D-0001', severity: 'high', offsetSec: 24, evidence: 'verified', watcherId: 'D-0001:pressure',
        title: 'D-0001 pressure rising · heat input from adjacent fire', status: 'Pressure rising from adjacent fire', statusNote: 'Instrument reading (simulated)',
        measurement: '15.2 bar rising · High limit 18.0 bar (illustrative)',
        why: 'Pressure has risen 2.8 bar in 6 min while shell temperature rises. Rising pressure and temperature together indicate external heat input from the D-0029 fire.',
        consequence: 'If heat input continues the High limit may be reached and relief or emergency depressurization may be required.',
        recommendation: {
          summary: 'Prepare emergency depressurization of D-0001 via the normal relief route; do not initiate until the route is confirmed available.', verify: "The relief route is confirmed available and the depressurization line-up is ready.",
          actions: ['Confirm D-0001 isolation readiness', 'Verify relief route FH-01 availability before any initiation', 'Keep cooling on D-0001 shell', 'Stage personnel clear of the relief discharge path'],
          prerequisites: ['Relief route availability not yet verified', 'No validated time-to-limit estimate available'],
          evidence: [EV.depressPrepare(), EV.pidRelief(), EV.limitsVessels()],
          calculation: { label: 'Time to High limit at current rate', status: 'unavailable', reason: 'No SME-validated method configured for D-0001; heat-flux and inventory inputs not available.' },
        } },
      { id: 'a3-2', issue: 'pressure', plain: "The shell of D-0001 is heating up.", equipmentId: 'D-0001', severity: 'medium', offsetSec: 30, evidence: 'verified', watcherId: 'D-0001:temperature',
        title: 'D-0001 shell temperature rising', status: 'Pressure and temperature rising', statusNote: 'Instrument reading (simulated)',
        measurement: '71 °C rising · High limit 120 °C (illustrative)',
        why: 'TT-0001 rising 25 °C in 6 min, consistent with radiant heat from D-0029.',
        consequence: 'Shell temperature rise reduces margin; monitor with pressure.' },
    ],
    observations: [
      { id: 'o3-1', equipmentId: 'D-0001', offsetSec: 2, kind: 'reading', evidence: 'verified', source: 'PT-0001 / TT-0001 (simulated)', text: 'Pressure 15.2 bar rising; shell temperature 71 °C rising.' },
      { id: 'o3-2', issue: 'pressure', issueTitle: 'Heat from the fire is raising pressure in D-0001', plain: 'Pressure and temperature in D-0001 are rising together: heat from the nearby fire is the likely cause.', equipmentId: 'D-0001', offsetSec: 8, kind: 'agent-finding', evidence: 'inferred', source: 'ECC agent', text: 'External heat input to D-0001 inferred from concurrent pressure and temperature rise.' },
      { id: 'o3-3', issue: 'pressure', plain: 'ECC cannot estimate how long until D-0001 reaches its limit: there is no validated method for it.', equipmentId: 'D-0001', offsetSec: 10, kind: 'agent-finding', evidence: 'unverified', source: 'ECC agent', text: 'Time-to-limit not computed: no validated method or inputs.' },
    ],
    findings: [{ id: 'f3', offsetSec: 10, supersedes: 'f2', text: 'Assessment revised: D-0001 exposed to heat; pressure and temperature rising. Depressurization preparation recommended, pending relief route verification.' }],
    tasks: [
      task('t3-1', 'Monitoring process values', 'monitoring', 1, 5, 'Trend analysis of D-0001 pressure and temperature.', [
        { id: 's', name: 'Trend analysis', status: 'done', operations: [
          op('o', 'Rate-of-change PT-0001, TT-0001', 'PI historian (simulated)', 1, 180, 'ok', '+2.8 bar / 6 min; +25 °C / 6 min.', ['window 6 min', 'PT-0001 slope +0.47 bar/min', 'TT-0001 slope +4.2 °C/min'], { linked: [{ kind: 'alert', id: 'a3-1', label: 'D-0001 pressure rising' }] }) ] },
      ]),
      task('t3-2', 'Updating assessment', 'assessment', 6, 4, 'Attempt a time-to-limit estimate; none available.', [
        { id: 's', name: 'Time-to-limit calculation', status: 'error', operations: [
          op('o', 'Lookup validated method for D-0001', 'Calculation registry', 6, 120, 'empty', 'No SME-validated method registered for D-0001.', ['registry query vessel=D-0001 method=time-to-limit', 'no rows — calculation withheld']) ] },
      ], 'error'),
      task('t3-3', 'Reviewing relevant procedures', 'procedures', 8, 6, 'Locate depressurization preparation guidance.', [
        { id: 's', name: 'Locate passage', status: 'done', operations: [
          op('o', 'Passage search in ECC-FX-002 Rev 2', 'Knowledge · text layer', 8, 610, 'ok', 'Exact match §4.2 p.2.', ['query: relief route available before depressurization', 'match p.2 §4.2 (exact)', 'revision pinned: 2'], { linked: [{ kind: 'doc', id: 'proc-depress', label: 'Depressurization Rev 2 p.2' }] }) ] },
      ]),
    ],
  },
  // ---------------------------------------------------------------- 4
  {
    index: 4, title: 'Deluge fails', nominalOffsetMin: 14, phase: 'Escalating',
    readings: {
      'DS-029:status': { value: 1, trend: 'steady' },
      'DS-029:flow': { value: 0, trend: 'steady' },
      'D-0001:pressure': { value: 18.3, trend: 'rising' },
      'D-0001:temperature': { value: 88, trend: 'rising' },
      'D-0029:pressure': { value: 6.4, trend: 'falling' },
      'D-0029:level': { value: 12, trend: 'falling' },
      'D-0029:temperature': { value: 92, trend: 'steady', source: 'lost' },
      'FW-01:pressure': { value: 9.1, trend: 'steady' },
    },
    reiterations: [{ alertId: 'a2-1', offsetSec: 24 }],
    addEquipment: [],
    alerts: [
      { id: 'a4-1', issue: 'deluge', plain: "The deluge was switched on, but no water flow is measured.", equipmentId: 'DS-029', severity: 'critical', offsetSec: 24, evidence: 'verified', watcherId: 'DS-029:flow', supersedes: [{ alertId: 'a2-1', reason: 'Deluge coverage unconfirmed; the cooling guidance is replaced.' }],
        title: 'Deluge DS-029 · no flow after activation command', brief: 'Deluge coverage remains unconfirmed', status: 'Coverage unconfirmed', statusNote: 'No flow measured; field confirmation pending', headline: 'Deluge DS-029 shows no flow', qualifier: 'Activation reported; flow measured at 0.0 m³/h',
        measurement: 'Deluge flow 0.0 m³/h · status Commanded for 90 s',
        why: 'Activation was commanded and the field reports the deluge as activated, but the flow transmitter reads 0.0 m³/h. The two reports conflict; the instrument reading is treated as the current evidence of coverage.',
        consequence: 'Without confirmed deluge coverage, cooling of D-0001 depends on mobile monitors. Heat input to D-0001 continues.',
        recommendation: {
          summary: 'Treat deluge coverage as unconfirmed; provide mobile cooling to D-0001 and check the deluge supply.', verify: "Someone sees cooling water on the D-0001 shell, or the deluge flow meter reads above zero.",
          actions: ['Direct monitors or hose streams to the D-0001 shell', 'Check DS-029 supply and firewater pressure (FW-01 can be added to the dashboard)', 'Do not rely on deluge coverage until flow is confirmed at the equipment'],
          prerequisites: ['Field confirmation of flow at the protected equipment outstanding'],
          evidence: [EV.fireConfirmFlow(), EV.layoutDeluge(), EV.depDeluge()],
        } },
      { id: 'a4-2', issue: 'pressure', plain: "D-0001 pressure has gone above its High limit.", issueTitle: "HP separator D-0001 above its pressure limit", equipmentId: 'D-0001', severity: 'critical', offsetSec: 30, evidence: 'verified', watcherId: 'D-0001:pressure',
        title: 'D-0001 pressure above High limit', brief: 'D-0001 pressure above High limit', status: 'Pressure above High limit', statusNote: 'Instrument reading (simulated)', headline: 'D-0001 pressure exceeds High limit', qualifier: '18.3 bar measured; heat from the adjacent fire inferred',
        measurement: '18.3 bar rising · High limit 18.0 bar (illustrative) · High-High 20.5 bar',
        why: 'PT-0001 exceeded the configured High limit at this time and continues to rise with shell temperature.',
        consequence: 'Approaching the High-High limit. Relief valve lift and loss of containment are possible if heat input continues.',
        recommendation: {
          summary: 'Initiate emergency depressurization of D-0001 via the normal relief route, once FH-01 availability is confirmed and the decision is recorded.', verify: "D-0001 pressure starts to fall once depressurization begins.",
          actions: ['Confirm relief route FH-01 available', 'Record the decision to depressurize', 'Initiate depressurization per guidance §5', 'Monitor D-0001 pressure and FH-01 header pressure'],
          prerequisites: ['FH-01 availability: reported available, not yet verified'],
          evidence: [EV.depressInitiate(), EV.pidRelief(), EV.limitsVessels()],
          calculation: { label: 'Time to High-High limit', status: 'unavailable', reason: 'No SME-validated method configured for D-0001.' },
        } },
      { id: 'a4-3', issue: 'fire', plain: "ECC has lost the temperature reading on D-0029. The last value was 92 \u00b0C.", equipmentId: 'D-0029', severity: 'low', offsetSec: 36, evidence: 'inferred', watcherId: 'D-0029:temperature',
        title: 'D-0029 shell temperature signal lost', status: 'Fire reported; temperature signal lost', statusNote: 'Verification pending',
        measurement: 'TT-0029 last value 92 °C · no update for 2 min',
        why: 'The transmitter stopped updating; likely fire damage to instrumentation.',
        consequence: 'D-0029 temperature can no longer be monitored from ECC.' },
    ],
    observations: [
      { id: 'o4-1', act: 'action', issue: 'deluge', issueTitle: 'Deluge on the propane area', plain: 'The fire team leader reports the deluge was switched on from the local panel.', equipmentId: 'DS-029', offsetSec: 2, kind: 'field-report', evidence: 'reported', source: 'Field · Fire team leader', text: 'Deluge DS-029 activated from the local panel.' },
      { id: 'o4-2', equipmentId: 'DS-029', offsetSec: 5, kind: 'reading', evidence: 'verified', source: 'FT-029 (simulated)', text: 'Deluge flow 0.0 m³/h, 90 s after command.' },
      { id: 'o4-3', issue: 'deluge', issueTitle: 'Deluge on the propane area: no water flow', plain: 'The field says the deluge is on, but the flow meter reads zero. ECC treats the area as not covered until someone confirms water is flowing.', equipmentId: 'DS-029', offsetSec: 7, kind: 'agent-finding', evidence: 'inferred', source: 'ECC agent', text: 'Conflict: field reports activation, flow transmitter reads zero. Coverage treated as unconfirmed.' },
      { id: 'o4-4', equipmentId: 'D-0001', offsetSec: 13, kind: 'reading', evidence: 'verified', source: 'PT-0001 (simulated)', text: 'Pressure 18.3 bar, above High limit 18.0 bar (illustrative).' },
      { id: 'o4-5', equipmentId: 'D-0029', offsetSec: 20, kind: 'reading', evidence: 'unverified', source: 'TT-0029 (simulated)', sourceHealth: 'lost', text: 'Temperature signal lost; last value 92 °C.' },
    ],
    findings: [{ id: 'f4', offsetSec: 16, supersedes: 'f3', text: 'Assessment revised: deluge coverage unconfirmed (flow 0 despite activation report). D-0001 above High limit; depressurization recommended once the relief route is confirmed.' }],
    tasks: [
      task('t4-1', 'Investigating conflicting reports', 'conflict', 1, 8, 'Field activation report conflicts with the flow reading for DS-029.', [
        { id: 's', name: 'Compare sources', status: 'done', operations: [
          op('o', 'Read FT-029, ZS-029', 'PI historian (simulated)', 1, 140, 'ok', 'FT-029 0.0 m³/h; ZS-029 commanded.', ['FT-029 0.0', 'ZS-029 1 (commanded)']),
          op('o2', 'Record field report', 'ECC operator log', 2, 60, 'ok', 'Field: activated from local panel.', ['report o4-1 recorded as reported']),
          op('o3', 'Resolve conflict', 'ECC agent', 2, 80, 'ok', 'Coverage unconfirmed; instrument evidence preferred for coverage.', ['rule: coverage requires flow at equipment'], { linked: [{ kind: 'alert', id: 'a4-1', label: 'Deluge no flow' }] }) ] },
      ]),
      task('t4-2', 'Waiting for or retrying a source', 'source', 10, 26, 'TT-0029 stopped updating; retrying the tag.', [
        { id: 's', name: 'Retry TT-0029', status: 'error', operations: [
          op('o', 'Read TT-0029', 'PI historian (simulated)', 10, 5000, 'retry', 'Timeout ×3; tag marked lost.', ['read TT-0029 timeout 5000 ms', 'retry 1/3 timeout', 'retry 2/3 timeout', 'retry 3/3 timeout — source lost'], { retries: 3, linked: [{ kind: 'alert', id: 'a4-3', label: 'Signal lost' }] }) ] },
      ], 'error'),
      task('t4-3', 'Reviewing relevant procedures', 'procedures', 3, 6, 'Locate water-flow confirmation guidance; the phrase occurs in three sections.', [
        { id: 's', name: 'Locate passage', status: 'done', operations: [
          op('o', 'Passage search in ECC-FX-001 Rev 1', 'Knowledge · text layer', 3, 700, 'ok', '3 matches on p.2 (§4, §5, §6). Not resolved to one.', ['query: confirm water flow protected equipment', '3 matches p.2 — ambiguous, left for the user'], { linked: [{ kind: 'doc', id: 'proc-fire', label: 'Fire response Rev 1 p.2' }] }) ] },
      ]),
    ],
    sitrep: { situation: 'D-0029 fire continues. Deluge DS-029 commanded but flow reads zero; coverage unconfirmed. D-0001 pressure 18.3 bar, above the High limit (illustrative), rising with shell temperature.', actions: 'Mobile cooling directed to D-0001. Deluge supply check requested. Depressurization of D-0001 prepared.', decisions: 'Depressurization decision pending route confirmation.', resources: 'Fire team, two monitors. Incident Manager en route.', next: 'Confirm FH-01 availability; record depressurization decision.' },
  },
  // ---------------------------------------------------------------- 5
  {
    index: 5, title: 'Normal flare route damaged', nominalOffsetMin: 20, phase: 'Escalating',
    readings: {
      'FH-01:pressure': { value: 2.9, trend: 'rising' },
      'FH-01:flow': { value: 35, trend: 'falling' },
      'D-0001:pressure': { value: 19.1, trend: 'rising' },
      'D-0001:temperature': { value: 97, trend: 'rising' },
      'D-0029:pressure': { value: 4.2, trend: 'falling' },
      'D-0029:level': { value: 6, trend: 'falling' },
      'V-0007:pressure': { value: 0.9, trend: 'rising' },
    },
    reiterations: [{ alertId: 'a4-2', offsetSec: 20 }, { alertId: 'a2-1', offsetSec: 32 }],
    alerts: [
      { id: 'a5-1', issue: 'pressure', plain: "The flare header FH-01 is damaged, so the normal route for releasing pressure from D-0001 cannot be used.", issueTitle: "D-0001 depressurization: normal relief route damaged", equipmentId: 'FH-01', severity: 'critical', offsetSec: 24, evidence: 'reported', watcherId: 'FH-01:pressure', supersedes: [{ alertId: 'a4-2', reason: 'Normal relief route FH-01 reported damaged; depressurization via FH-01 is no longer recommended.' }, { alertId: 'a3-1', reason: 'Normal relief route FH-01 reported damaged.' }],
        title: 'FH-01 flare header damaged · normal relief route unavailable', brief: 'Normal relief route lost: FH-01 reported damaged', status: 'Damaged; normal relief route unavailable', statusNote: 'Field report, consistent with readings', headline: 'Flare header FH-01 damaged', qualifier: 'Damage reported; normal relief route unavailable',
        measurement: 'Header pressure 2.9 bar rising · flare flow 35 m³/h falling',
        why: 'Field reports debris damage to the header section near the propane area. Header pressure rising while flare flow falls indicates a restriction on the normal route.',
        consequence: 'Depressurizing D-0001 into the damaged header may be ineffective and may increase the release at the damage point.',
        recommendation: {
          summary: 'Hold depressurization via FH-01; assess the upstream depressurization route before any initiation.', verify: "The field team confirms the upstream route is available before anything is opened.",
          actions: ['Hold any depressurization into FH-01', 'Assess the upstream route shown on the dependency view', 'Confirm isolation status of the upstream route from the field', 'Keep cooling on D-0001'],
          prerequisites: ['Upstream route availability and isolation status unknown'],
          evidence: [EV.depressAlternative(), EV.depUpstream(), EV.layoutHeader()],
        } },
      { id: 'a5-2', issue: 'pressure', plain: "Pressure in the flare header is above its High limit.", equipmentId: 'FH-01', severity: 'high', offsetSec: 30, evidence: 'verified', watcherId: 'FH-01:pressure',
        title: 'FH-01 header pressure above High limit', status: 'Header pressure above High limit', statusNote: 'Instrument reading (simulated)',
        measurement: '2.9 bar rising · High limit 2.5 bar (illustrative)',
        why: 'PT-FH01 exceeded the configured High limit as flare flow fell.',
        consequence: 'Back-pressure on relief devices connected to the header.' },
    ],
    observations: [
      { id: 'o5-1', issue: 'pressure', plain: 'The Incident Commander reports the flare header is damaged near the propane area, with a visible release.', equipmentId: 'FH-01', offsetSec: 2, kind: 'field-report', evidence: 'reported', source: 'Field · Incident Commander', text: 'Flare header damaged by debris near the propane area; visible release at the damage point.' },
      { id: 'o5-2', equipmentId: 'FH-01', offsetSec: 4, kind: 'reading', evidence: 'verified', source: 'PT-FH01 / FT-FH01 (simulated)', text: 'Header pressure 2.9 bar rising; flare flow 35 m³/h falling.' },
      { id: 'o5-3', issue: 'pressure', plain: 'The normal relief route is unavailable. Whether the upstream route can be used is not yet known.', offsetSec: 9, kind: 'route-assessment', evidence: 'inferred', source: 'ECC agent', text: 'Normal route (FH-01): unavailable — reported damage, consistent with readings. Upstream route: availability unknown, assessment requested.' },
    ],
    findings: [{ id: 'f5', offsetSec: 10, supersedes: 'f4', text: 'Assessment revised: normal relief route unavailable. D-0001 at 19.1 bar. Upstream depressurization route under assessment; no depressurization initiated.' }],
    tasks: [
      task('t5-1', 'Updating assessment', 'assessment', 1, 9, 'Route availability assessment after the header damage report.', [
        { id: 's', name: 'Assess normal route', status: 'done', operations: [
          op('o', 'Correlate PT-FH01, FT-FH01 with field report', 'PI historian (simulated)', 1, 160, 'ok', 'Restriction consistent with reported damage.', ['PT-FH01 +2.3 bar / 4 min', 'FT-FH01 -85 m³/h / 4 min']) ] },
        { id: 's2', name: 'Identify alternative routes', status: 'done', operations: [
          op('o', 'Read dependency view ECC-FX-301', 'Knowledge · drawings index', 4, 300, 'ok', 'Upstream route via inlet manifold identified (not normally in service).', ['region upstream_route'], { linked: [{ kind: 'doc', id: 'dependency', label: 'Dependency view' }, { kind: 'alert', id: 'a5-1', label: 'FH-01 damaged' }] }) ] },
      ]),
      task('t5-2', 'Reviewing relevant procedures', 'procedures', 6, 5, 'Locate alternative-route guidance.', [
        { id: 's', name: 'Locate passage', status: 'done', operations: [
          op('o', 'Passage search in ECC-FX-002 Rev 2', 'Knowledge · text layer', 6, 560, 'ok', 'Exact match §6.1 p.4.', ['query: alternative route availability confirmed', 'match p.4 §6.1 (exact)', 'revision pinned: 2'], { linked: [{ kind: 'doc', id: 'proc-depress', label: 'Depressurization Rev 2 p.4' }] }) ] },
      ]),
    ],
  },
  // ---------------------------------------------------------------- 6
  {
    index: 6, title: 'Upstream route used', nominalOffsetMin: 27, phase: 'Responding',
    readings: {
      'D-0001:pressure': { value: 18.9, trend: 'falling' },
      'D-0001:temperature': { value: 99, trend: 'steady' },
      'FH-01:pressure': { value: 2.4, trend: 'falling' },
      'FH-01:flow': { value: 60, trend: 'rising' },
      'D-0029:pressure': { value: 2.6, trend: 'falling' },
      'D-0029:level': { value: 3, trend: 'falling' },
      'V-0007:level': { value: 31, trend: 'rising' },
      'V-0007:pressure': { value: 1.3, trend: 'rising' },
    },
    fieldReports: [{ alertId: 'a5-1', offsetSec: 2, by: 'Incident Commander (field)', status: 'reported', text: 'Upstream route aligned via inlet manifold; depressurization of D-0001 started.' }],
    alerts: [
      { id: 'a6-1', act: 'action', actor: 'Incident Commander (field)', issue: 'pressure', issueTitle: "D-0001 depressurizing through the upstream route", plain: "The field team reports D-0001 is being depressurized through the upstream route.", equipmentId: 'D-0001', severity: 'high', offsetSec: 36, evidence: 'reported', watcherId: 'D-0001:pressure', kind: 'report', supersedes: [{ alertId: 'a5-1', reason: 'Upstream route reported aligned and in use; the open question is now effectiveness.' }],
        title: 'D-0001 depressurization via upstream route · reported started', brief: 'D-0001 depressurization reported started', status: 'Depressurizing via upstream route', statusNote: 'Reported; pressure falling (simulated reading)', headline: 'D-0001 depressurization started', qualifier: 'Via upstream route; reported, not verified',
        measurement: '18.9 bar falling from peak 19.4 · FH-01 2.4 bar falling',
        why: 'The field reports the upstream route aligned and depressurization started. D-0001 pressure trend reversed about two minutes later.',
        consequence: 'If the falling trend is not sustained, the route may be restricted; reassess within ten minutes.',
        recommendation: {
          summary: 'Monitor effectiveness: D-0001 pressure and temperature, and relief route pressure, until the trend is sustained.', verify: "D-0001 pressure stays below its High limit with a falling trend.",
          actions: ['Keep cooling on D-0001', 'Watch V-0007 flare KO drum level (can be added to the dashboard)', 'Reassess if D-0001 pressure stops falling'],
          evidence: [EV.depressMonitor(), EV.depUpstream()],
        } },
      { id: 'a6-2', act: 'result', issue: 'pressure', plain: "Flare header pressure is back below its High limit.", equipmentId: 'FH-01', severity: 'low', offsetSec: 44, evidence: 'verified', watcherId: 'FH-01:pressure', clears: ['a5-2'], kind: 'recovery',
        title: 'FH-01 header pressure back below High limit', status: 'Damaged; header pressure back below High limit', statusNote: 'Normal route still unavailable', headline: 'FH-01 header pressure back below High limit', qualifier: 'Measured; 2.4 bar falling',
        measurement: '2.4 bar falling · High limit 2.5 bar (illustrative)',
        why: 'Header pressure fell below the configured limit after the upstream route took the flow.',
        consequence: 'Header damage remains; the route is still unavailable.' },
    ],
    observations: [
      { id: 'o6-1', act: 'action', issue: 'pressure', plain: 'The Incident Commander reports the upstream route is lined up and depressurization of D-0001 has started.', equipmentId: 'D-0001', offsetSec: 2, kind: 'field-report', evidence: 'reported', source: 'Field · Incident Commander', text: 'Upstream route aligned via inlet manifold; depressurization of D-0001 started.' },
      { id: 'o6-2', equipmentId: 'D-0001', offsetSec: 28, kind: 'reading', evidence: 'verified', source: 'PT-0001 (simulated)', text: 'Pressure 18.9 bar falling from peak 19.4 bar.' },
      { id: 'o6-3', issue: 'pressure', plain: 'The upstream route is in use and D-0001 pressure is responding.', offsetSec: 32, kind: 'route-assessment', evidence: 'inferred', source: 'ECC agent', text: 'Upstream route: in use (reported); effect observed on D-0001 pressure. Normal route: unavailable.' },
    ],
    findings: [{ id: 'f6', offsetSec: 32, supersedes: 'f5', text: 'Assessment revised: depressurization via the upstream route reported started; D-0001 pressure falling. Effectiveness being monitored.' }],
    tasks: [
      task('t6-1', 'Updating assessment', 'assessment', 24, 10, 'Check whether the reported depressurization has an observable effect.', [
        { id: 's', name: 'Effect check', status: 'done', operations: [
          op('o', 'Trend PT-0001 since field report', 'PI historian (simulated)', 24, 150, 'ok', 'Peak 19.4 bar at +1 min; falling since.', ['PT-0001 peak 19.4', 'slope -0.25 bar/min'], { linked: [{ kind: 'alert', id: 'a6-1', label: 'Depressurization reported started' }] }) ] },
      ]),
      task('t6-2', 'Monitoring process values', 'monitoring', 2, 0, 'Added V-0007 KO drum tags to monitoring (both relief routes pass through it).', [
        { id: 's', name: 'Subscribe to tags', status: 'done', operations: [
          op('o', 'PI subscription (simulated)', 'PI historian (simulated)', 2, 200, 'ok', 'LT-0007, PT-0007 subscribed.', ['subscribe LT-0007 PT-0007']) ] },
      ], 'waiting'),
    ],
    sitrep: { situation: 'Normal relief route FH-01 damaged by debris. D-0001 depressurization reported started via the upstream route at T+27; pressure falling from a peak of 19.4 bar (illustrative).', actions: 'Upstream route aligned (reported). Cooling maintained on D-0001. Deluge supply fault under investigation.', decisions: 'See recorded decisions in the emergency record.', resources: 'Fire team, two monitors. Incident Commander at location.', next: 'Confirm sustained falling trend; verify fire condition at D-0029.' },
  },
  // ---------------------------------------------------------------- 7
  {
    index: 7, title: 'Monitoring effectiveness · stabilizing', nominalOffsetMin: 36, phase: 'Stabilizing',
    readings: {
      'D-0001:pressure': { value: 14.2, trend: 'falling' },
      'D-0001:temperature': { value: 84, trend: 'falling' },
      'FH-01:pressure': { value: 1.4, trend: 'falling' },
      'FH-01:flow': { value: 95, trend: 'steady' },
      'D-0029:pressure': { value: 1.1, trend: 'steady' },
      'D-0029:level': { value: 2, trend: 'steady' },
      'DS-029:status': { value: 0, trend: 'steady' },
      'V-0007:level': { value: 44, trend: 'rising' },
      'V-0007:pressure': { value: 1.1, trend: 'falling' },
    },
    alerts: [
      { id: 'a7-1', act: 'result', issue: 'pressure', plain: "D-0001 pressure is back below its High limit and still falling.", equipmentId: 'D-0001', severity: 'medium', offsetSec: 24, evidence: 'verified', watcherId: 'D-0001:pressure', clears: ['a4-2', 'a3-1', 'a3-2'], kind: 'recovery',
        title: 'D-0001 pressure below High limit · falling trend sustained', brief: 'D-0001 pressure back below High limit', status: 'Pressure below High limit', statusNote: 'Instrument reading (simulated)', headline: 'D-0001 pressure back below High limit', qualifier: 'Measured; falling trend sustained',
        measurement: '14.2 bar falling · below High limit 18.0 bar for 8 min',
        why: 'PT-0001 has fallen steadily since the upstream route was reported in use and is now below the configured limit.',
        consequence: 'Continue until the agreed stabilization criteria are met; the criteria are not SME-validated in this fixture.',
        recommendation: {
          summary: 'Continue depressurization and cooling; agree stabilization criteria with the Incident Manager.', verify: "Stabilization criteria are agreed and D-0001 stays below its High limit.",
          actions: ['Continue monitoring D-0001 pressure and temperature', 'Maintain cooling until shell temperature falls further', 'Prepare stabilization criteria for the Incident Manager'],
          evidence: [EV.depressMonitor(), EV.limitsVessels()],
        } },
      { id: 'a7-2', act: 'result', actor: 'Fire team leader (field)', issue: 'fire', plain: "The field team reports the fire at D-0029 is contained. Nobody has checked this independently yet.", equipmentId: 'D-0029', severity: 'low', offsetSec: 30, evidence: 'reported', watcherId: 'D-0029:pressure', kind: 'report',
        title: 'Fire at D-0029 reported contained · not independently verified', brief: 'Fire at D-0029 reported contained', status: 'Fire reported contained', statusNote: 'Verification pending', headline: 'D-0029 fire reported contained', qualifier: 'Independent verification pending',
        measurement: 'Pressure 1.1 bar steady · level 2 %',
        why: 'The field reports the fire contained with the vessel inventory largely released. No independent verification yet.',
        consequence: 'Residual inventory and hot surfaces remain; re-ignition is possible.' },
      { id: 'a7-3', act: 'action', actor: 'Field team, shown by the DS-029 status signal', issue: 'deluge', plain: "The deluge was reset to standby. The no-flow fault is still open.", equipmentId: 'DS-029', severity: 'low', offsetSec: 36, evidence: 'verified', watcherId: 'DS-029:status',
        title: 'DS-029 reset to standby · no-flow fault remains open', brief: 'Deluge coverage remains unconfirmed', status: 'Coverage unconfirmed', statusNote: 'Reset to standby; no-flow fault open; field confirmation pending', headline: 'DS-029 reset to standby', qualifier: 'No-flow fault remains open',
        measurement: 'Status Standby · flow 0.0 m³/h',
        why: 'The deluge command was reset from the local panel. The no-flow fault remains open for investigation.',
        consequence: 'Fixed protection for the propane area is unavailable until the fault is resolved.' },
    ],
    observations: [
      { id: 'o7-1', equipmentId: 'D-0001', offsetSec: 2, kind: 'reading', evidence: 'verified', source: 'PT-0001 / TT-0001 (simulated)', text: 'Pressure 14.2 bar falling; shell temperature 84 °C falling.' },
      { id: 'o7-2', act: 'result', issue: 'fire', plain: 'The fire team leader reports the fire at D-0029 is contained. Cooling continues on the shell.', equipmentId: 'D-0029', offsetSec: 10, kind: 'field-report', evidence: 'reported', source: 'Field · Fire team leader', text: 'Fire at D-0029 contained. Cooling continues on the shell.' },
      { id: 'o7-3', issue: 'info', offsetSec: 19, kind: 'agent-finding', evidence: 'inferred', source: 'ECC agent', text: 'Response effective so far: D-0001 trend sustained below the High limit. Fire containment reported, not verified.' },
    ],
    findings: [{ id: 'f7', offsetSec: 19, supersedes: 'f6', text: 'Assessment revised: stabilizing. D-0001 below the High limit with a sustained falling trend. Fire at D-0029 reported contained, awaiting verification. Deluge fault remains open.' }],
    tasks: [
      task('t7-1', 'Updating assessment', 'assessment', 1, 8, 'Evaluate response effectiveness against the monitored trends.', [
        { id: 's', name: 'Sustained-trend check', status: 'done', operations: [
          op('o', 'Trend PT-0001 (8 min window)', 'PI historian (simulated)', 1, 140, 'ok', 'Monotonic fall; below High for 8 min.', ['PT-0001 -4.7 bar / 8 min'], { linked: [{ kind: 'alert', id: 'a7-1', label: 'D-0001 below High limit' }] }) ] },
      ]),
      task('t7-2', 'Waiting for or retrying a source', 'source', 10, 4, 'Knowledge sync reported a revision change on the depressurization guidance.', [
        { id: 's', name: 'Knowledge revision sync', status: 'done', operations: [
          op('o', 'Revision check ECC-FX-002', 'Knowledge · document control (simulated)', 10, 260, 'ok', 'Rev 3 now effective; Rev 2 superseded. Earlier citations keep Rev 2.', ['ECC-FX-002 rev 3 effective', 'rev 2 marked superseded', 'existing evidence references unchanged (pinned)'], { linked: [{ kind: 'doc', id: 'proc-depress', label: 'Depressurization Rev 3' }] }) ] },
      ]),
    ],
    knowledge: [{ docId: 'proc-depress', revision: '3', status: 'effective', note: 'Rev 3 effective; Rev 2 superseded. Recommendations and decisions keep the revision they used.' }],
    sitrep: { situation: 'Stabilizing. D-0001 pressure 14.2 bar and falling (below the High limit for 8 min, illustrative). Fire at D-0029 reported contained, not yet independently verified.', actions: 'Depressurization via the upstream route continues. Cooling maintained. Deluge DS-029 returned to standby with the no-flow fault open.', decisions: 'See recorded decisions in the emergency record.', resources: 'Fire team remains at the area. Incident Commander at location.', next: 'Agree stabilization criteria; independent verification of extinguishment.' },
  },
];

export const SITES = ['SG GSP', 'WR NGL Plant', 'East Terminal'] as const;

export const DOCS: KnowledgeDoc[] = [
  { id: 'proc-fire', title: 'Process area fire response — generic guidance', type: 'Procedure', number: 'ECC-FX-001', site: 'SG GSP', equipment: ['D-0029', 'D-0001', 'DS-029'],
    summary: 'Initial response, isolation, fixed and mobile cooling, reporting.',
    revisions: [{ revision: '1', status: 'effective', effectiveFrom: '2026-01', file: '/docs/ECC-FX-001_rev1.pdf', pages: 3 }] },
  { id: 'proc-depress', title: 'Emergency depressurization — generic guidance', type: 'Procedure', number: 'ECC-FX-002', site: 'SG GSP', equipment: ['D-0001', 'FH-01', 'V-0007'],
    summary: 'Preparation, relief route confirmation, initiation, alternative routes, monitoring.',
    revisions: [
      { revision: '2', status: 'effective', effectiveFrom: '2025-11', file: '/docs/ECC-FX-002_rev2.pdf', pages: 4 },
      { revision: '3', status: 'draft', effectiveFrom: '—', file: '/docs/ECC-FX-002_rev3.pdf', pages: 4 },
    ] },
  { id: 'limits', title: 'Operating limits register — illustrative values', type: 'Operating limits', number: 'ECC-FX-003', site: 'SG GSP', equipment: ['D-0001', 'D-0029', 'V-0007', 'FH-01', 'FW-01'],
    summary: 'Placeholder High / High-High values per variable. Page-level citations only.',
    revisions: [{ revision: 'A', status: 'effective', effectiveFrom: '2026-02', file: '/docs/ECC-FX-003_revA.pdf', pages: 3 }] },
  { id: 'pid', title: 'P&ID — Propane recovery D-0029 / HP Separator D-0001', type: 'P&ID', number: 'ECC-FX-101', site: 'SG GSP', equipment: ['D-0029', 'D-0001', 'P-0012A'],
    summary: 'Engineering connectivity: vessels, instrumentation, relief path to FH-01.',
    revisions: [{ revision: '0', status: 'effective', effectiveFrom: '2025-09', file: '/docs/ECC-FX-101_rev0.pdf', pages: 1 }] },
  { id: 'layout', title: 'Area layout — SG GSP propane recovery (plan)', type: 'Area layout', number: 'ECC-FX-201', site: 'SG GSP', equipment: ['D-0029', 'D-0001', 'DS-029', 'FH-01'],
    summary: 'Location: perimeter, areas, equipment positions, header run.',
    revisions: [{ revision: '0', status: 'effective', effectiveFrom: '2025-09', file: '/docs/ECC-FX-201_rev0.pdf', pages: 1 }] },
  { id: 'dependency', title: 'Depressurization dependency view — D-0001', type: 'Dependency view', number: 'ECC-FX-301', site: 'SG GSP', equipment: ['D-0001', 'FH-01', 'V-0007', 'DS-029', 'FW-01'],
    summary: 'System behaviour: what D-0001 depressurization and cooling depend on.',
    revisions: [{ revision: '0', status: 'effective', effectiveFrom: '2025-12', file: '/docs/ECC-FX-301_rev0.pdf', pages: 1 }] },
  { id: 'past-2023', title: 'Past-incident report — propane area fire (training record)', type: 'Past-incident report', number: 'ECC-FX-901', site: 'SG GSP', equipment: ['DS-029', 'P-0012A'],
    summary: 'Training exercise: deluge confirmation by flow, separate recording of reports and readings.',
    revisions: [{ revision: '1', status: 'effective', effectiveFrom: '2023-06', file: '/docs/ECC-FX-901_rev1.pdf', pages: 2 }] },
  // ---- other sites (illustrative fixtures)
  { id: 'wr-pump-manual', title: 'Centrifugal propane pump P-2100 series — operating manual (extract)', type: 'Equipment manual', number: 'ECC-FX-402', site: 'WR NGL Plant', equipment: ['P-2101A', 'P-2101B'],
    summary: 'Seal system, start-up checks, shutdown on seal failure.',
    revisions: [{ revision: '2', status: 'effective', effectiveFrom: '2025-05', file: '/docs/ECC-FX-402_rev2.pdf', pages: 3 }] },
  { id: 'wr-firewater-policy', title: 'Firewater system availability policy', type: 'Policy', number: 'ECC-FX-410', site: 'WR NGL Plant', equipment: ['FW-2001', 'DS-2101'],
    summary: 'Minimum firewater availability, impairment reporting, deluge testing.',
    revisions: [{ revision: '1', status: 'effective', effectiveFrom: '2024-10', file: '/docs/ECC-FX-410_rev1.pdf', pages: 2 }] },
  { id: 'et-layout', title: 'Area layout — East Terminal loading area (plan)', type: 'Area layout', number: 'ECC-FX-520', site: 'East Terminal', equipment: ['T-3001', 'LB-3', 'FW-3001'],
    summary: 'Location: tank farm, loading bays, firewater ring main, muster points.',
    revisions: [{ revision: '1', status: 'effective', effectiveFrom: '2025-02', file: '/docs/ECC-FX-520_rev1.pdf', pages: 1 }] },
  { id: 'et-spill-procedure', title: 'Loading area spill response — generic guidance', type: 'Procedure', number: 'ECC-FX-501', site: 'East Terminal', equipment: ['LB-3', 'T-3001'],
    summary: 'Stop transfer, isolate, contain, ignition control, reporting.',
    revisions: [{ revision: '3', status: 'effective', effectiveFrom: '2025-08', file: '/docs/ECC-FX-501_rev3.pdf', pages: 3 }] },
];

export const HISTORY: HistoricalEmergency[] = [
  { id: 'h-2025-11', title: 'Propane pump seal fire · P-0012B', mode: 'real', location: 'SG GSP · Propane recovery', started: '2025-11-14 02:10', ended: '2025-11-14 04:35', outcome: 'Extinguished; pump isolated; no injuries.',
    summary: 'Seal failure on P-0012B led to a small fire. Pump isolated and deluge activated with confirmed flow. Depressurization not required.', lessons: ['Confirm deluge flow at the equipment, not from the command signal.', 'Record field reports separately from instrument readings.'], equipment: ['P-0012B', 'DS-029'] },
  { id: 'h-2024-06', title: 'Flare header high pressure · FH-01', mode: 'real', location: 'SG GSP · Relief and flare', started: '2024-06-02 15:40', ended: '2024-06-02 17:05', outcome: 'Restriction cleared; no release.',
    summary: 'Liquid carry-over to V-0007 raised header pressure. Relief route restored after KO drum level was reduced.', lessons: ['Watch V-0007 level whenever header pressure rises.'], equipment: ['FH-01', 'V-0007'] },
  { id: 'h-2026-03', title: 'Training · D-0001 overpressure exercise', mode: 'training', location: 'SG GSP · Inlet separation', started: '2026-03-18 09:00', ended: '2026-03-18 11:20', outcome: 'Exercise complete.',
    summary: 'Table-top exercise on emergency depressurization of D-0001 via the normal route, using Rev 2 of the depressurization guidance.', lessons: ['Route availability should be recorded as verified, reported or unknown.'], equipment: ['D-0001', 'FH-01'] },
  { id: 'h-2023-06', title: 'Training · propane area fire drill', mode: 'training', location: 'SG GSP · Propane recovery', started: '2023-06-21 08:30', ended: '2023-06-21 10:00', outcome: 'Exercise complete.',
    summary: 'Drill simulating a propane pump seal fire; tested deluge activation and ECC–field communication.', lessons: ['Confirm water flow at the protected equipment.'], equipment: ['P-0012A', 'DS-029'] },
];

export const STEP_COUNT = STEPS.length;
