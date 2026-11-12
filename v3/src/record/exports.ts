// Incident Timeline Report (PDF), SITREP (PDF) and structured JSON export.
// All three read only from the incident record. Display filters never apply.
import { PdfDoc, download } from '../lib/pdfwrite';
import { dateTime, elapsedParts, pad2 } from '../lib/time';
import { CATEGORY, decisionNote, timeline } from './timeline';
import { followThroughLine, followThroughOf } from '../investigate/followThrough';
import type { DecisionEvent, MeasurementEvent } from './types';
import type { IncidentRecord, PinnedEvidence, ReportVersion } from './types';
import { BASIS_LABEL, type Brief } from './story';

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

/** The Sit. Rep as a one-page briefing: title and as-of time, the assessment, then three sections of short bullets.
 *  It prints the report exactly as the manager left it; lines starting with “•” or “-” are bullets. */
export function sitrepPdf(r: IncidentRecord, v: ReportVersion): Blob {
  // Reports approved under the earlier workflow keep saying so; everything else is simply the report as of its time.
  const state = v.status === 'approved' && v.approvedBy ? ` · approved by ${String(v.approvedBy).split(' · ')[0]}` : '';
  const pdf = new PdfDoc({ title: `Sit. Rep · ${r.id}`, subtitle: r.title, footer: `${r.id} · ${r.site} · Sit. Rep as of ${dateTime(v.asOf)}${state}`, marker: marker(r) });
  pdf.text('SITUATION REPORT', { size: 8.5, bold: true, color: [0.36, 0.39, 0.45], gap: 2 });
  pdf.text(r.title, { size: 18, bold: true, gap: 2 });
  pdf.text(`As of ${dateTime(v.asOf)} · ${r.site} · ${r.mode === 'training' ? 'Training exercise' : 'Real incident'} · ${r.id}${state}`, { size: 9.5, color: [0.3, 0.33, 0.4], gap: 10 });
  if (v.sections.situation.trim()) pdf.callout(v.sections.situation.trim());
  const S: [keyof typeof v.sections, string][] = [['response', 'Current situation'], ['decisions', 'Actions and results'], ['outstanding', 'What needs attention']];
  if (v.sections.priorities?.trim()) S.push(['priorities', 'Notes']);
  for (const [k, label] of S) {
    pdf.section(label);
    const lines = (v.sections[k] || '—').split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of lines) { if (/^[•\-*] /.test(l)) pdf.bullet(l.replace(/^[•\-*] /, ''), { size: 10 }); else pdf.text(l, { size: 10, gap: 4 }); }
  }
  pdf.space(10);
  pdf.text('Reported items are not independently verified unless the text says verified. A recorded decision is not a completed action.', { size: 8, color: [0.42, 0.45, 0.5] });
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

/** The Sit. Rep brief as a dated snapshot: the same text the preview and Copy show. */
export function briefPdf(r: IncidentRecord, b: Brief): Blob {
  const pdf = new PdfDoc({ title: `Situation report · ${r.id}`, subtitle: r.title, footer: `${r.id} · ${r.site} · situation report as of ${dateTime(b.asOf)} · ${r.mode === 'training' ? 'TRAINING' : 'REAL'}`, marker: marker(r) });
  pdf.text('Situation report', { size: 20, bold: true, gap: 2 });
  pdf.text(`${r.title}`, { size: 12, bold: true });
  pdf.text(`${b.context} · as of ${dateTime(b.asOf)}`, { size: 9.5, color: [0.3, 0.33, 0.4], gap: 6 });
  pdf.text(b.assessment, { size: 12, bold: true, gap: 6 });
  pdf.heading('Current impact', 2); for (const l of b.impact) pdf.text(`• ${l.text}`, { gap: 1 });
  pdf.heading('Actions and results', 2);
  if (!b.actions.length) pdf.text('• No decision or action recorded yet');
  for (const l of b.actions) { pdf.text(`• ${l.text}`, { bold: true, gap: 1 }); for (const s of l.sub ?? []) pdf.text(`${s.label}: ${s.text}${s.basis && s.label !== 'Decided' ? ` [${BASIS_LABEL[s.basis]}]` : ''}`, { indent: 12, size: 9.5, gap: 1 }); }
  pdf.heading('Still needs attention', 2); for (const l of b.attention.length ? b.attention : [{ text: 'Nothing open' }]) pdf.text(`• ${l.text}`, { gap: 1 });
  pdf.space(6);
  pdf.text('Reported items are not independently verified unless marked Verified. A recorded decision is not a completed action. Built from the incident record; nothing after the as-of time is included.', { size: 8.5, color: [0.36, 0.39, 0.45] });
  return pdf.build();
}
