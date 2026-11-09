// Incident Timeline Report (PDF), SITREP (PDF) and structured JSON export.
// All three read only from the incident record. Display filters never apply.
import { PdfDoc, download } from '../lib/pdfwrite';
import { dateTime, elapsedParts, pad2 } from '../lib/time';
import { CATEGORY, decisionNote, timeline } from './timeline';
import { followThroughLine, followThroughOf } from '../investigate/followThrough';
import type { DecisionEvent, MeasurementEvent } from './types';
import type { IncidentRecord, PinnedEvidence, ReportVersion } from './types';

const marker = (r: IncidentRecord) => `${r.mode === 'training' ? 'Training scenario' : 'Real incident'} · ${r.provenance === 'seed' ? 'illustrative fixture record, not an actual event' : 'illustrative data'} · browser-local prototype record`;
const evidenceLine = (ev?: PinnedEvidence[]) => ev && ev.length ? `Evidence: ${ev.map((e) => `${e.number || e.title} Rev ${e.revision} p.${e.page} ${e.label}`).join('; ')}` : '';
const clk = (t: number) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

export function timelineReportPdf(r: IncidentRecord, asOf: number): Blob {
  const pdf = new PdfDoc({ title: `Incident Timeline Report · ${r.id}`, subtitle: r.title, footer: `${r.id} · ${r.site} · generated ${dateTime(asOf)} · ${r.mode === 'training' ? 'TRAINING' : 'REAL'}`, marker: marker(r) });
  pdf.text('Incident Timeline Report', { size: 20, bold: true, gap: 2 });
  pdf.text(`${r.id} · ${r.title}`, { size: 12, bold: true });
  pdf.text(`${r.site} · ${r.mode === 'training' ? 'Training scenario' : 'Real incident'} · started ${dateTime(r.startedAt)} · status ${r.status} · as of ${dateTime(asOf)}`, { size: 9.5, color: [0.3, 0.33, 0.4] });
  pdf.text('Full chronological record. Display filters do not apply to this report. Document references cite the revision pinned at the time of use.', { size: 9, color: [0.36, 0.39, 0.45], gap: 6 });
  const { h, m } = elapsedParts(asOf - r.startedAt);
  pdf.label(`Elapsed ${pad2(h)} h ${pad2(m)} m · ${r.events.length} events`);
  if (r.closure) { pdf.heading('Closure', 2); pdf.text(`Closed ${dateTime(r.closure.t)} by ${r.closure.by}: ${r.closure.rationale}`); if (r.closure.outstanding.length) pdf.text(`Outstanding at closure: ${r.closure.outstanding.join('; ')}`, { color: [0.6, 0.35, 0.02] }); }
  if (r.stabilization) { pdf.heading('Stabilization', 2); pdf.text(`Recorded ${dateTime(r.stabilization.t)} by ${r.stabilization.by}: ${r.stabilization.rationale}`); }
  pdf.heading('Timeline');
  for (const row of timeline(r, {}, false)) {
    const e = row.ev;
    const note = e.kind === 'decision' ? decisionNote(r, e as DecisionEvent, asOf) : null;
    const changes = e.kind === 'measurement' ? ((e as MeasurementEvent).changes ?? []).join('; ') : '';
    const full = e.kind === 'measurement' ? `All values: ${(e as MeasurementEvent).values.map((v) => `${v.watcherId.replace(':', ' ')} ${v.value}${v.unit === 'status' ? '' : ` ${v.unit}`}`).join(', ')}` : '';
    const inv = e.kind === 'observation' && e.meta?.investigationId ? r.investigations?.find((i) => i.id === e.meta!.investigationId) : undefined;
    const sub = [e.detail, inv ? followThroughLine(inv) : '', changes, full, e.by ? `By ${e.by}` : '', evidenceLine(e.evidence), note ? `[${note}]` : '', row.correctedBy ? `Corrected ${clk(row.correctedBy.t)}: ${row.correctedBy.title}` : '', e.corrects ? `Correction of an earlier entry (original retained)` : ''].filter(Boolean).join(' · ');
    pdf.row(clk(e.t), CATEGORY[e.kind], e.title, sub || undefined);
  }
  if (r.lessons.length) { pdf.heading('Lessons learned'); for (const l of r.lessons) pdf.text(`• ${l.text}`, { gap: 1 }); }
  if (r.reportVersions.length) { pdf.heading('SITREP versions', 2); for (const v of r.reportVersions) pdf.text(`SITREP ${v.number} · ${v.status} · as of ${dateTime(v.asOf)} · ${v.author}${v.approvedBy ? ` · approved by ${v.approvedBy} ${dateTime(v.approvedAt!)}` : ''}`, { size: 9 }); }
  return pdf.build();
}

export function sitrepPdf(r: IncidentRecord, v: ReportVersion): Blob {
  const pdf = new PdfDoc({ title: `SITREP ${v.number} · ${r.id}`, subtitle: r.title, footer: `${r.id} · ${r.site} · SITREP ${v.number} · as of ${dateTime(v.asOf)} · ${v.status.toUpperCase()} · ${r.mode === 'training' ? 'TRAINING' : 'REAL'}`, marker: marker(r) });
  pdf.text(`SITREP ${v.number}`, { size: 20, bold: true, gap: 2 });
  pdf.text(`${r.id} · ${r.title}`, { size: 12, bold: true });
  pdf.text(`${r.site} · ${r.mode === 'training' ? 'Training scenario' : 'Real incident'} · as of ${dateTime(v.asOf)} · version ${v.number} · ${v.status === 'approved' ? `Approved by ${v.approvedBy} at ${dateTime(v.approvedAt!)}` : v.status === 'review' ? 'In review — not approved' : 'Draft — not approved'}`, { size: 9.5, color: [0.3, 0.33, 0.4] });
  pdf.text(`Point-in-time account: nothing after ${dateTime(v.asOf)} is included. Prepared by ${v.author}.`, { size: 9, color: [0.36, 0.39, 0.45], gap: 6 });
  const S: [keyof typeof v.sections, string][] = [['situation', 'Situation'], ['response', 'Response'], ['decisions', 'Decisions'], ['outstanding', 'Outstanding concerns'], ['priorities', 'Priorities']];
  for (const [k, label] of S) { pdf.heading(label, 2); pdf.text(v.sections[k] || '—'); }
  const refs = r.events.filter((e) => e.t <= v.asOf && e.evidence?.length).flatMap((e) => e.evidence!);
  const uniq = new Map<string, PinnedEvidence>(); for (const e of refs) uniq.set(`${e.docId}:${e.revision}:${e.page}`, e);
  if (uniq.size) { pdf.heading('Document references (revision pinned at time of use)', 2); for (const e of uniq.values()) pdf.text(`${e.number || e.title} Rev ${e.revision} · p.${e.page} ${e.label} · ${e.title}`, { size: 9, gap: 1 }); }
  return pdf.build();
}

export function incidentJson(r: IncidentRecord, exportedAt: number): Blob {
  const data = {
    schema: r.schema, exportedAt, persistence: 'browser-local (IndexedDB) prototype record',
    provenance: r.provenance === 'seed' ? 'seeded illustrative fixture record, not an actual event' : 'live prototype record (scenario-driven, illustrative data)',
    identity: { id: r.id, title: r.title, site: r.site, mode: r.mode, startedAt: r.startedAt, reportedBy: r.reportedBy, status: r.status },
    equipment: r.equipment,
    measurements: r.events.filter((e) => e.kind === 'measurement'),
    reportsAndObservations: r.events.filter((e) => e.kind === 'observation' || e.kind === 'report' || e.kind === 'notification'),
    findings: r.events.filter((e) => e.kind === 'finding'),
    recommendations: r.events.filter((e) => e.kind === 'recommendation'),
    decisions: r.events.filter((e) => e.kind === 'decision'),
    actionsAndOutcomes: r.events.filter((e) => e.kind === 'report' || e.kind === 'outcome'),
    referencedRevisions: [...r.references, ...r.events.flatMap((e) => (e.evidence ?? []).map((x) => ({ docId: x.docId, revision: x.revision, page: x.page, label: x.label, eventId: e.id })))],
    agentActivity: r.events.filter((e) => e.kind === 'agent'),
    reportVersions: r.reportVersions,
    stabilization: r.stabilization ?? null,
    closure: r.closure ?? null,
    lessons: r.lessons,
    corrections: r.events.filter((e) => e.kind === 'correction'),
    incidentSeverity: r.severity ?? null,
    severityHistory: r.severityHistory ?? [],
    investigations: r.investigations ?? [],
    observationFollowThrough: (r.investigations ?? []).map(followThroughOf),
    events: r.events,
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export function downloadBlob(blob: Blob, name: string) { download(blob, name); }
