// Fictional reference material for the training scenario. Document text is placeholder wording
// invented for this prototype. It is not an emergency procedure and must not be used as one.
import { hm } from './time';
import type { AdminUser, AgentConfig, AgentTask, Citation, Connection, ExecRecord, KDoc, Monitor, Source } from './types';

const FACILITY = 'Wadi Sarab Processing Facility';
const PLACEHOLDER = 'Training placeholder. A customer procedure would appear here.';

export function initialKnowledge(): KDoc[] {
  return [
    {
      id: 'KD-ERP07',
      kind: 'kdoc',
      title: 'Emergency response procedure',
      docNumber: 'ERP-T-07',
      docType: 'Emergency procedure',
      facility: FACILITY,
      area: 'All areas',
      equipment: [],
      accessScope: 'All incident users',
      revisions: [
        {
          rev: 'Rev C',
          file: '/docs/erp-t-07-rev-c.pdf',
          approval: 'effective',
          effectiveFrom: '12 Jan (fictional)',
          uploadedAt: '10 Jan (fictional)',
          processing: 'searchable',
          sections: [
            { id: 's2', page: 3, title: 'Section 2. Access to the affected area', text: `The person responsible decides how access to an affected area is managed while its status is unclear. ${PLACEHOLDER}` },
            { id: 's4', page: 5, title: 'Section 4. Personnel accountability', text: `Establish who was in the affected area and where they are now. ${PLACEHOLDER}` },
          ],
        },
      ],
    },
    {
      id: 'KD-POL12',
      kind: 'kdoc',
      title: 'Contractor presence on site',
      docNumber: 'POL-T-12',
      docType: 'Policy',
      facility: FACILITY,
      area: 'All areas',
      equipment: [],
      accessScope: 'All incident users',
      revisions: [
        {
          rev: 'Rev A',
          file: '/docs/pol-t-12-rev-a.docx',
          approval: 'effective',
          effectiveFrom: '3 Feb (fictional)',
          uploadedAt: '1 Feb (fictional)',
          processing: 'searchable',
          sections: [{ id: 's1', page: 1, title: 'Section 1. Open permits', text: `An open permit records where work was authorised, not where people are now. ${PLACEHOLDER}` }],
        },
      ],
    },
    {
      id: 'KD-PID31',
      kind: 'kdoc',
      title: 'P&ID: condensate transfer',
      docNumber: 'PID-31-02',
      docType: 'P&ID',
      facility: FACILITY,
      area: 'Area 31, Area 32',
      equipment: ['P-3104A', 'P-3104B', 'T-3201'],
      accessScope: 'All incident users',
      revisions: [
        {
          rev: 'Rev B',
          file: '/docs/pid-31-02-rev-b.pdf',
          approval: 'effective',
          effectiveFrom: '20 Nov (fictional)',
          uploadedAt: '18 Nov (fictional)',
          processing: 'partial',
          processingNote: 'Equipment tags recognised. Line connections have not been checked by an engineer.',
          sheet: 'pid',
          sections: [{ id: 'sheet', page: 1, title: 'Sheet 2 of 4', text: 'Illustrative drawing for training. Not a validated engineering P&ID.' }],
        },
      ],
    },
    {
      id: 'KD-LAY31',
      kind: 'kdoc',
      title: 'Plot plan: Area 31 layout',
      docNumber: 'PLT-31-02',
      docType: 'Area layout',
      facility: FACILITY,
      area: 'Area 31',
      equipment: ['P-3104A', 'P-3104B', 'PR-31'],
      accessScope: 'All incident users',
      revisions: [
        {
          rev: 'Rev A',
          file: '/docs/plt-31-02-rev-a.pdf',
          approval: 'effective',
          effectiveFrom: '5 Mar (fictional)',
          uploadedAt: '4 Mar (fictional)',
          processing: 'searchable',
          sheet: 'layout',
          sections: [{ id: 'sheet', page: 1, title: 'Sheet 1 of 1', text: 'Illustrative layout for training. Distances are not to scale.' }],
        },
      ],
    },
    {
      id: 'KD-MAN3104',
      kind: 'kdoc',
      title: 'Condensate transfer pump manual',
      docNumber: 'MAN-3104',
      docType: 'Equipment manual',
      facility: FACILITY,
      area: 'Area 31',
      equipment: ['P-3104A', 'P-3104B'],
      accessScope: 'All incident users',
      revisions: [
        {
          rev: 'Edition 2',
          file: '/docs/man-3104.pdf',
          approval: 'effective',
          effectiveFrom: '9 Sep (fictional)',
          uploadedAt: '8 Sep (fictional)',
          processing: 'partial',
          processingNote: 'Section 6 is a scanned table and could not be extracted. Its content is not searchable and the agent has not read it.',
          sections: [
            { id: 's1', page: 2, title: 'Section 1. General description', text: 'Duty and standby pumps share a skid. Placeholder description for training.' },
            { id: 's6', page: 4, title: 'Section 6. Seal arrangement', text: '', extractionFailed: 'Scanned table. Text could not be extracted.' },
          ],
        },
      ],
    },
    {
      id: 'KD-EQ3104B',
      kind: 'kdoc',
      title: 'Equipment record: P-3104B',
      docNumber: 'EQ-P-3104B',
      docType: 'Equipment record',
      facility: FACILITY,
      area: 'Area 31',
      equipment: ['P-3104B'],
      accessScope: 'All incident users',
      revisions: [
        {
          rev: 'Record of 12 Mar',
          file: '/docs/eq-p-3104b.pdf',
          approval: 'effective',
          effectiveFrom: '12 Mar (fictional)',
          uploadedAt: '12 Mar (fictional)',
          processing: 'searchable',
          sections: [{ id: 's1', page: 1, title: 'Register entry', text: 'Service: condensate transfer. Position: duty, with standby P-3104A. Location: Area 31 pump skid.' }],
        },
      ],
    },
    {
      id: 'KD-MNT3104',
      kind: 'kdoc',
      title: 'Maintenance history export: P-3104A and B',
      docNumber: 'MNT-EXP-3104',
      docType: 'Maintenance history',
      facility: FACILITY,
      area: 'Area 31',
      equipment: ['P-3104A', 'P-3104B'],
      accessScope: 'Maintenance and incident users',
      revisions: [
        {
          rev: 'Export of 2 May',
          approval: 'draft',
          uploadedAt: '2 May (fictional)',
          processing: 'searchable',
          processingNote: 'A past export, not the maintenance system itself. Not approved as a reference.',
          sections: [{ id: 's1', page: 1, title: 'Export summary', text: 'Placeholder export for training. Not used by the agent in this incident.' }],
        },
      ],
    },
    {
      id: 'KD-PID33',
      kind: 'kdoc',
      title: 'P&ID: Area 33 (scanned)',
      docNumber: 'PID-33-01',
      docType: 'P&ID',
      facility: FACILITY,
      area: 'Area 33',
      equipment: [],
      accessScope: 'All incident users',
      revisions: [
        {
          rev: 'Rev A',
          file: '/docs/pid-33-01-rev-a.pdf', // deliberately absent: demonstrates an inaccessible file
          approval: 'draft',
          uploadedAt: '14 Oct (fictional)',
          processing: 'failed',
          processingNote: 'Unsupported scan quality. No text or tags were extracted, and the agent cannot use this document.',
          sections: [],
        },
      ],
    },
  ];
}

/** The revision that replaces Rev C during the scenario. */
export const ERP_REV_D = {
  rev: 'Rev D',
  file: '/docs/erp-t-07-rev-d.pdf',
  approval: 'effective' as const,
  effectiveFrom: 'Today, 14:24 (fictional)',
  uploadedAt: 'Today (fictional)',
  processing: 'searchable' as const,
  sections: [
    { id: 's2', page: 3, title: 'Section 2. Access to the affected area', text: `The person responsible decides how access to an affected area is managed while its status is unclear. ${PLACEHOLDER}` },
    { id: 's4', page: 5, title: 'Section 4. Personnel accountability', text: `Establish who was in the affected area and where they are now, including contractors on open permits. ${PLACEHOLDER}` },
  ],
};

/** Equipment positions on the fixture sheets, as x, y, w, h normalised to the 900x560 sheet. */
const box = (x: number, y: number, w: number, h: number): [number, number, number, number] => [x / 900, y / 560, w / 900, h / 560];

export const SHEET_REGIONS: Record<'pid' | 'layout', { tag: string; assetId: string; box: [number, number, number, number] }[]> = {
  pid: [
    { tag: 'T-3201', assetId: 'AST-T-3201', box: box(84, 96, 132, 276) },
    { tag: 'P-3104A', assetId: 'AST-P-3104A', box: box(444, 194, 102, 100) },
    { tag: 'P-3104B', assetId: 'AST-P-3104B', box: box(444, 314, 102, 102) },
    { tag: 'PR-31', assetId: 'AST-PR-31', box: box(752, 278, 118, 66) },
  ],
  layout: [
    { tag: 'T-3201', assetId: 'AST-T-3201', box: box(97, 222, 116, 116) },
    { tag: 'P-3104A', assetId: 'AST-P-3104A', box: box(374, 234, 70, 64) },
    { tag: 'P-3104B', assetId: 'AST-P-3104B', box: box(464, 234, 70, 64) },
    { tag: 'PR-31', assetId: 'AST-PR-31', box: box(246, 366, 438, 52) },
    { tag: 'Area 31', assetId: 'AST-AREA-31', box: box(290, 120, 320, 240) },
    { tag: 'Area 33', assetId: 'AST-AREA-33', box: box(700, 200, 150, 220) },
  ],
};

const regions = (sheet: 'pid' | 'layout', ...tags: string[]) => ({ type: 'region' as const, page: 1, regions: SHEET_REGIONS[sheet].filter((r) => tags.includes(r.tag)).map(({ tag, box: b }) => ({ tag, box: b })) });

export function initialCitations(): Citation[] {
  const t = hm(14, 9);
  return [
    { id: 'CIT-01', kind: 'citation', sourceType: 'record', title: 'Equipment record: P-3104B', supports: 'P-3104B is the duty pump in Area 31 and shares a skid with P-3104A.', docId: 'KD-EQ3104B', revision: 'Record of 12 Mar', sectionId: 's1', page: 1, recordId: 'DOC-01', excerpt: 'Position: duty, with standby P-3104A.', location: { type: 'text', page: 1, quote: 'Position: duty, with standby P-3104A.' }, retrievedAt: hm(14, 8) },
    // "person responsible" appears twice on the page, so the viewer must report this as approximate.
    { id: 'CIT-02', kind: 'citation', sourceType: 'document', title: 'ERP-T-07, Section 2', supports: 'Access to an affected area is a matter for the person responsible while status is unclear.', docId: 'KD-ERP07', revision: 'Rev C', sectionId: 's2', page: 3, excerpt: 'The person responsible decides how access to an affected area is managed while its status is unclear.', location: { type: 'text', page: 3, quote: 'person responsible' }, retrievedAt: t, illustrative: true },
    { id: 'CIT-03', kind: 'citation', sourceType: 'document', title: 'ERP-T-07, Section 4', supports: 'Accountability means establishing who was in the area and where they are now.', docId: 'KD-ERP07', revision: 'Rev C', sectionId: 's4', page: 5, excerpt: 'Establish who was in the affected area and where they are now.', location: { type: 'text', page: 5, quote: 'Establish who was in the affected area and where they are now.' }, retrievedAt: t, illustrative: true },
    { id: 'CIT-04', kind: 'citation', sourceType: 'diagram', title: 'P&ID PID-31-02, sheet 2', supports: 'T-3201 is shown as the suction source for P-3104A and P-3104B.', docId: 'KD-PID31', revision: 'Rev B', page: 1, sheet: 'pid', sheetName: 'Sheet 2 of 4', tags: ['T-3201', 'P-3104A', 'P-3104B'], location: regions('pid', 'T-3201', 'P-3104A', 'P-3104B'), retrievedAt: t, illustrative: true },
    { id: 'CIT-05', kind: 'citation', sourceType: 'diagram', title: 'Plot plan PLT-31-02', supports: 'The south side of PR-31 runs alongside the Area 31 pump skid.', docId: 'KD-LAY31', revision: 'Rev A', page: 1, sheet: 'layout', sheetName: 'Sheet 1 of 1', tags: ['PR-31', 'P-3104B'], recordId: 'DOC-03', location: regions('layout', 'PR-31', 'P-3104B'), retrievedAt: t, illustrative: true },
    { id: 'CIT-06', kind: 'citation', sourceType: 'record', title: 'Work permit WP-58821', supports: 'A crew of 4 contractors was authorised on PR-31 south side, with no close-out recorded. It does not show where they are now.', recordId: 'DOC-04', file: '/docs/wp-58821.pdf', page: 1, location: { type: 'text', page: 1, quote: 'Crew: 4 contractors.' }, retrievedAt: hm(14, 10), excerpt: 'Crew: 4 contractors. Close-out: none recorded.' },
    { id: 'CIT-07', kind: 'citation', sourceType: 'reading', title: 'Control system reading, 14:11', supports: 'The control system showed P-3104B stopped and discharge flow at zero.', monitorId: 'MON-PUMP', reading: [{ label: 'P-3104B state', value: 'Stopped' }, { label: 'Discharge flow', value: '0 m³/h' }], observedAt: hm(14, 11), retrievedAt: hm(14, 11) },
    { id: 'CIT-08', kind: 'citation', sourceType: 'document', title: 'Pump manual MAN-3104, Section 6', supports: 'Would describe the seal arrangement. The agent could not read it, so it supports nothing yet.', docId: 'KD-MAN3104', revision: 'Edition 2', sectionId: 's6', page: 4, location: { type: 'page', page: 4, reason: 'Scanned page with no text layer, so the agent could not read or locate anything on it. You can still read the original.' }, retrievedAt: hm(14, 21) },
    { id: 'CIT-09', kind: 'citation', sourceType: 'reading', title: 'Control system reading, 14:26', supports: 'After the feed resumed, the control system still showed P-3104B stopped and discharge flow at zero.', monitorId: 'MON-PUMP', reading: [{ label: 'P-3104B state', value: 'Stopped' }, { label: 'Discharge flow', value: '0 m³/h' }], observedAt: hm(14, 26), retrievedAt: hm(14, 26) },
    { id: 'CIT-10', kind: 'citation', sourceType: 'document', title: 'ERP-T-07, Section 4 (Rev D)', supports: 'The newer revision names contractors on open permits within the accountability check.', docId: 'KD-ERP07', revision: 'Rev D', sectionId: 's4', page: 5, excerpt: 'including contractors on open permits', location: { type: 'text', page: 5, quote: 'including contractors on open permits' }, retrievedAt: hm(14, 24), illustrative: true },
    { id: 'CIT-11', kind: 'citation', sourceType: 'document', title: 'Pump manual MAN-3104, Section 1', supports: 'Duty and standby pumps share a skid.', docId: 'KD-MAN3104', revision: 'Edition 2', sectionId: 's1', page: 2, location: { type: 'page', page: 2, reason: 'This reference records the page only, so no exact passage can be highlighted.' }, retrievedAt: hm(14, 8), illustrative: true },
    { id: 'CIT-12', kind: 'citation', sourceType: 'diagram', title: 'P&ID PID-33-01 (scanned)', supports: 'Would show what PR-31 services connect to in Area 33. It could not be opened, so it supports nothing.', docId: 'KD-PID33', revision: 'Rev A', page: 1, retrievedAt: hm(14, 9) },
  ];
}

export function initialSources(): Source[] {
  return [
    { id: 'SRC-REPORTS', name: 'Field and control room reports', description: 'Reports entered by people', state: 'connected', lastSuccess: hm(14, 7) },
    { id: 'SRC-FG', name: 'Fire and gas panel', description: 'Simulated detector status', state: 'connected', lastSuccess: hm(14, 7) },
    { id: 'SRC-CONTROL', name: 'Control system readings', description: 'Simulated readings for training', state: 'connected', lastSuccess: hm(14, 7) },
    { id: 'SRC-REGISTER', name: 'Equipment register', description: 'Simulated equipment records', state: 'connected', lastSuccess: hm(14, 7) },
    { id: 'SRC-ENG', name: 'Engineering data store', description: 'Simulated drawings and connectivity', state: 'connected', lastSuccess: hm(14, 7) },
    { id: 'SRC-PERMIT', name: 'Permit system', description: 'Simulated work permits', state: 'connected', lastSuccess: hm(14, 7) },
    { id: 'SRC-MAINT', name: 'Maintenance system', description: 'Simulated maintenance history', state: 'connected', lastSuccess: hm(14, 7) },
    { id: 'SRC-WEATHER', name: 'Site weather feed', description: 'Simulated readings from station WS-2', state: 'stale', lastSuccess: hm(13, 20), effect: 'Wind direction is not current, so where smoke or vapour could reach is less certain.' },
  ];
}

export const CONNECTIONS: Connection[] = [
  { id: 'CON-1', from: 'AST-T-3201', to: 'AST-P-3104B', connectionKind: 'process', label: 'Suction source', provenance: ['CIT-04'] },
  { id: 'CON-2', from: 'AST-T-3201', to: 'AST-P-3104A', connectionKind: 'process', label: 'Suction source', provenance: ['CIT-04'] },
  { id: 'CON-3', from: 'AST-P-3104A', to: 'AST-P-3104B', connectionKind: 'proximity', label: 'Shared skid', provenance: ['CIT-01'] },
  { id: 'CON-4', from: 'AST-P-3104B', to: 'AST-PR-31', connectionKind: 'proximity', label: 'Runs alongside the skid', provenance: ['CIT-05'] },
  { id: 'CON-5', from: 'AST-PR-31', to: 'AST-AREA-33', connectionKind: 'process', label: 'Services continue to Area 33', provenance: ['DOC-02'] },
  { id: 'CON-6', from: 'AST-P-3104B', to: 'AST-AREA-31', connectionKind: 'proximity', label: 'Located in Area 31', provenance: ['CIT-01'] },
  { id: 'CON-7', from: 'AST-P-3104B', to: 'AST-PR-31', connectionKind: 'assessment', label: 'Could be exposed to heat if the flame persists. Not observed.', provenance: ['ROW-wider'] },
];

export function initialUsers(): AdminUser[] {
  return [
    { id: 'U-1', name: 'Nasser Al-Qahtani', jobTitle: 'Shift Manager', platformRole: 'Incident user', scope: 'Wadi Sarab, all areas' },
    { id: 'U-2', name: 'Huda Al-Mutairi', jobTitle: 'Incident Manager', platformRole: 'Incident user', scope: 'Wadi Sarab, all areas' },
    { id: 'U-3', name: 'Rana Al-Zahrani', jobTitle: 'Engineering Records Lead', platformRole: 'Knowledge steward', scope: 'Wadi Sarab, knowledge library' },
    { id: 'U-4', name: 'Tariq Al-Anazi', jobTitle: 'Platform Administrator', platformRole: 'Administrator', scope: 'All facilities' },
    { id: 'U-5', name: 'Lina Al-Subaie', jobTitle: 'HSE Advisor', platformRole: 'Observer', scope: 'Wadi Sarab, read only' },
  ];
}

export function initialConfigs(): AgentConfig[] {
  return [
    { version: 'agent-config 1.4', status: 'draft', notes: 'Adds the site weather feed to the sources reviewed on every update.' },
    { version: 'agent-config 1.3', status: 'active', notes: 'Current configuration.', activatedAt: '2 Oct (fictional)' },
    { version: 'agent-config 1.2', status: 'retired', notes: 'Previous configuration.', activatedAt: '11 Jun (fictional)' },
  ];
}

export function initialMonitors(): Monitor[] {
  const at = hm(14, 7);
  const sample = (value: string, t = at) => ({ observedAt: t, receivedAt: t, value });
  return [
    {
      id: 'MON-FD3107', kind: 'monitor', name: 'Fire detector FD-3107', sourceId: 'SRC-FG', assetId: 'AST-AREA-31',
      samples: [sample('In alarm', hm(14, 5)), sample('In alarm')],
      alert: { id: 'ALT-FD3107', monitorId: 'MON-FD3107', message: 'Fire detector FD-3107 in alarm', sourceSeverity: 'PRI-1', display: 'urgent', raisedAt: hm(14, 5), receivedAt: hm(14, 7), notifications: [hm(14, 5)] },
    },
    { id: 'MON-GD3112', kind: 'monitor', name: 'Gas detector GD-3112', sourceId: 'SRC-FG', assetId: 'AST-AREA-31', samples: [sample('No alarm')], limits: 'No alarm from one detector does not establish that the area is safe.' },
    { id: 'MON-PUMP', kind: 'monitor', name: 'P-3104B run state', sourceId: 'SRC-CONTROL', assetId: 'AST-P-3104B', samples: [sample('Running')], limits: 'A stopped pump does not establish that the release has stopped.' },
    { id: 'MON-FLOW', kind: 'monitor', name: 'P-3104B discharge flow', sourceId: 'SRC-CONTROL', assetId: 'AST-P-3104B', unit: 'm³/h', samples: [sample('38')], limits: 'Zero flow does not establish that the release has stopped.' },
    { id: 'MON-T3201', kind: 'monitor', name: 'T-3201 level', sourceId: 'SRC-CONTROL', assetId: 'AST-T-3201', unit: '%', samples: [sample('62.6')] },
    { id: 'MON-WIND', kind: 'monitor', name: 'Wind at station WS-2', sourceId: 'SRC-WEATHER', assetId: 'AST-AREA-31', samples: [sample('From north-west, moderate', hm(13, 20))] },
  ];
}

/** Simulated reading at a given minute. Fictional values; no thresholds apply. */
export function monitorValue(id: string, t: number): string | undefined {
  const stopped = t >= hm(14, 11);
  switch (id) {
    case 'MON-FD3107': return 'In alarm';
    case 'MON-GD3112': return 'No alarm';
    case 'MON-PUMP': return stopped ? 'Stopped' : 'Running';
    case 'MON-FLOW': return stopped ? '0' : '38';
    case 'MON-T3201': return stopped ? '62.4' : '62.6';
    case 'MON-WIND': return 'From north-west, moderate';
  }
  return undefined;
}

export function initialTasks(): AgentTask[] {
  const t = hm(14, 7);
  return [
    { id: 'T-EQUIP', title: 'Inspecting equipment context', purpose: 'Establish which equipment and areas are involved and what they connect to.', status: 'running', startedAt: t, updatedAt: t, sources: ['Equipment register', 'Engineering data store'] },
    { id: 'T-PROC', title: 'Reviewing relevant procedures', purpose: 'Find reference material that may bear on this incident.', status: 'not-started', sources: ['Knowledge library'] },
    { id: 'T-BRIEF', title: 'Preparing the brief', purpose: 'Assemble and update the current understanding of the incident.', status: 'running', startedAt: t, updatedAt: t, sources: [] },
    { id: 'T-RECON', title: 'Reconciling conflicting reports', purpose: 'Compare incoming reports and readings, and surface where they disagree.', status: 'not-started', sources: ['Field and control room reports', 'Control system readings'] },
    { id: 'T-MON', title: 'Monitoring incoming information', purpose: 'Watch reports, readings and alerts, and publish what materially changes the picture.', status: 'running', startedAt: t, updatedAt: t, sources: ['Field and control room reports', 'Fire and gas panel', 'Control system readings', 'Site weather feed'] },
    { id: 'T-MAINT', title: 'Retrieving maintenance history', purpose: 'Check for recent work on P-3104B that could help explain the release.', status: 'not-started', sources: ['Maintenance system'] },
  ];
}

/** Sanitised technical detail per execution record, matched on its label. No credentials or payloads. */
export const EXEC_META: { match: RegExp; meta: Partial<Pick<ExecRecord, 'taskId' | 'operation' | 'attempt' | 'errorCode' | 'errorMessage' | 'input' | 'output'>> }[] = [
  { match: /^Emergency notification/, meta: { taskId: 'T-BRIEF', operation: 'event.received', input: 'event_type=fire_alarm, area=Area 31', output: 'run started' } },
  { match: /^Identify equipment/, meta: { taskId: 'T-EQUIP', operation: 'task.lifecycle' } },
  { match: /^Queried equipment register/, meta: { taskId: 'T-EQUIP', operation: 'register.lookup', input: 'tag=P-3104B', output: '1 record' } },
  { match: /^Retrieved equipment record/, meta: { taskId: 'T-EQUIP', operation: 'document.fetch', input: 'doc=EQ-P-3104B', output: '1 page' } },
  { match: /^Review procedures/, meta: { taskId: 'T-PROC', operation: 'task.lifecycle' } },
  { match: /^Retrieved ERP-T-07/, meta: { taskId: 'T-PROC', operation: 'document.fetch', input: 'doc=ERP-T-07', output: '5 pages' } },
  { match: /^PID-31-02 retrieval timed out/, meta: { taskId: 'T-EQUIP', operation: 'document.fetch', attempt: 1, errorCode: 'SRC_TIMEOUT', errorMessage: 'Engineering data store did not respond in time.', input: 'doc=PID-31-02 rev=B' } },
  { match: /^Retrieved PID-31-02/, meta: { taskId: 'T-EQUIP', operation: 'document.fetch', attempt: 2, input: 'doc=PID-31-02 rev=B', output: '1 sheet' } },
  { match: /^Retrieved PLT-31-02/, meta: { taskId: 'T-EQUIP', operation: 'document.fetch', input: 'doc=PLT-31-02 rev=A', output: '1 sheet' } },
  { match: /^Extracted equipment tags/, meta: { taskId: 'T-EQUIP', operation: 'extract.tags', input: 'doc=PID-31-02', output: '4 tags, connections unchecked' } },
  { match: /^Published possible wider/, meta: { taskId: 'T-BRIEF', operation: 'assessment.publish', output: 'assessment line: wider impact' } },
  { match: /^Queried permit system/, meta: { taskId: 'T-EQUIP', operation: 'permit.search', input: 'area=Area 31, PR-31', output: '1 open permit' } },
  { match: /^Published information gap/, meta: { taskId: 'T-BRIEF', operation: 'assessment.publish', output: 'information gap: personnel' } },
  { match: /^Recorded /, meta: { taskId: 'T-MON', operation: 'record.write' } },
  { match: /^Revised release assessment/, meta: { taskId: 'T-RECON', operation: 'assessment.revise', input: '2 reports, 1 reading', output: 'status: disputed' } },
  { match: /^Queried maintenance/, meta: { taskId: 'T-MAINT', operation: 'source.query', attempt: 1, errorCode: 'SRC_NO_RESPONSE', errorMessage: 'Maintenance system did not respond.', input: 'tag=P-3104B' } },
  { match: /^Retried maintenance/, meta: { taskId: 'T-MAINT', operation: 'source.query', errorCode: 'SRC_NO_RESPONSE', errorMessage: 'Maintenance system did not respond.', input: 'tag=P-3104B' } },
  { match: /^Maintenance history unavailable/, meta: { taskId: 'T-MAINT', operation: 'source.giveup', errorCode: 'SRC_UNAVAILABLE', errorMessage: 'No response after repeated attempts.' } },
  { match: /weather/i, meta: { taskId: 'T-MON', operation: 'source.read', input: 'station=WS-2' } },
  { match: /^Published recommendation/, meta: { taskId: 'T-BRIEF', operation: 'assessment.publish', output: 'recommendation for review' } },
  { match: /^Prepare initial brief/, meta: { taskId: 'T-BRIEF', operation: 'task.lifecycle' } },
  { match: /^Control system readings/, meta: { taskId: 'T-MON', operation: 'source.read', input: 'system=control' } },
  { match: /^Marked pump state/, meta: { taskId: 'T-BRIEF', operation: 'assessment.revise', output: 'pump state as of 14:11' } },
  { match: /^Revised /, meta: { taskId: 'T-BRIEF', operation: 'assessment.revise' } },
  { match: /^Could not read pump manual/, meta: { taskId: 'T-PROC', operation: 'extract.text', errorCode: 'EXTRACT_NO_TEXT', errorMessage: 'Page has no text layer.', input: 'doc=MAN-3104 page=4' } },
];
