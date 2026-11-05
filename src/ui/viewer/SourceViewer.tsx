// One viewer for every original: driven by sourceTarget, so a citation on the brief, a chip in the
// feed, a sheet in Assets & Areas and a document in Knowledge all open the same way.
import { ArrowUpRight, Download, Maximize2, RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { sourceTarget, type SourceTarget } from '../../domain/brief';
import { SHEET_REGIONS } from '../../domain/catalog';
import { useEcc } from '../../domain/store';
import { APPROVAL_LABEL, type Doc, type Report } from '../../domain/types';
import { useUi } from '../App';
import { Field, Quote } from '../components/bits';
import { RefChips } from '../components/Chips';
import { RefLink } from '../components/RefLink';
import { TrustTag } from '../components/TrustTag';
import { CHANNEL_LABEL, fmt, OBSERVATION_LABEL, plural } from '../util';
import type { SheetRegion } from './PdfViewer';
import { ReadingDetail } from './ReadingDetail';

const PdfViewer = lazy(() => import('./PdfViewer'));

export interface SourceViewerProps {
  id: string;
  rev?: string;
  mode: 'panel' | 'expanded';
  /** Called before leaving for another destination, so a full-area viewer can close first. */
  onLeave?: () => void;
}

/** Where in the original the reference points, in words. */
function whereLabel(t: SourceTarget, s: ReturnType<typeof useEcc>['state']): string | undefined {
  if (t.mode !== 'file') return undefined;
  const cit = t.citationId ? s.citations.find((c) => c.id === t.citationId) : undefined;
  const rev = t.docId ? s.knowledge.find((d) => d.id === t.docId)?.revisions.find((r) => r.rev === t.revision) : undefined;
  const section = rev?.sections.find((x) => x.id === cit?.sectionId);
  const parts = [t.sheetName, section?.title, t.location && !t.sheetName ? `Page ${t.location.page}` : undefined].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

export function SourceViewer({ id, rev, mode, onLeave }: SourceViewerProps) {
  const { state } = useEcc();
  const ui = useUi();
  const leave = (fn: () => void) => {
    onLeave?.();
    fn();
  };
  // A newer revision can be opened for comparison; the cited one is never replaced.
  const [altRev, setAltRev] = useState<string | undefined>();
  useEffect(() => setAltRev(undefined), [id, rev]);

  const cited = sourceTarget(state, id, rev);
  if (!cited) return <p className="empty">This reference is not on the record.</p>;
  const viewingNewer = altRev !== undefined && cited.mode === 'file' && cited.docId;
  // The newer revision opens at the same cited location, so the same passage can be looked for in it.
  const newerTarget = viewingNewer ? sourceTarget(state, cited.docId!, altRev) : undefined;
  const target: SourceTarget = newerTarget && newerTarget.mode === 'file' && cited.mode === 'file' ? { ...newerTarget, title: cited.title, location: cited.location, supports: cited.supports } : cited;
  const supports = 'supports' in cited ? cited.supports : undefined;

  return (
    <div className={`sv sv-${mode} sv-mode-${target.mode}`}>
      <header className="sv-head">
        <div className="sv-kicker">
          <span>{target.typeLabel}</span>
          {target.mode === 'file' && target.revision && <span className="tag">{target.revision}</span>}
          {target.mode === 'file' && target.approval && <span className={`tag tag-${target.approval}`}>{APPROVAL_LABEL[target.approval]}</span>}
          {target.mode === 'file' && target.illustrative && <span className="tag tag-illustrative">Illustrative, not validated</span>}
        </div>
        <div className="sv-title-row">
          <h3 className="sv-title">{target.title}</h3>
          {mode === 'panel' && (target.mode === 'file' || target.mode === 'reading') && (
            <button type="button" className="btn btn-sm" onClick={() => ui.openSource(id, rev)}>
              <Maximize2 size={13} aria-hidden="true" />
              Expand viewer
            </button>
          )}
        </div>
        {supports && (
          <p className="sv-supports">
            <span className="fe-k">Cited for</span> {supports}
          </p>
        )}
        {cited.mode === 'file' && whereLabel(cited, state) && (
          <p className="sv-where">
            <span className="fe-k">Where</span> {whereLabel(cited, state)}
            {cited.effectiveFrom && cited.approval === 'effective' && <span className="muted"> · effective from {cited.effectiveFrom}</span>}
          </p>
        )}
      </header>

      {cited.mode === 'file' && cited.newer && !viewingNewer && (
        <div className="notice notice-newer sv-newer">
          <p>
            <strong>{cited.newer.rev} is now effective</strong> ({cited.newer.effectiveFrom ?? 'date not given'}). You are viewing {cited.revision}, the revision this reference used. Findings that cite it are unchanged.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => setAltRev(cited.newer!.rev)}>
            Open {cited.newer.rev} <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
      )}
      {viewingNewer && cited.mode === 'file' && (
        <div className="notice notice-newer sv-newer">
          <p>
            <strong>Viewing {altRev}</strong>, not the cited revision. The reference used {cited.revision}; opening {altRev} changes no finding or decision.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => setAltRev(undefined)}>
            Back to cited {cited.revision}
          </button>
        </div>
      )}

      <Body target={target} mode={mode} excerpt={cited.mode === 'file' ? cited.excerpt : undefined} leave={leave} />

      <footer className="sv-foot">
        {cited.mode === 'file' && cited.docId && state.knowledge.find((d) => d.id === cited.docId)?.revisions.find((r) => r.rev === cited.revision)?.sheet && (
          <button type="button" className="link-btn" onClick={() => leave(() => ui.openSheet(state.knowledge.find((d) => d.id === cited.docId)!.revisions.find((r) => r.rev === cited.revision)!.sheet!, cited.citationId ? (state.citations.find((c) => c.id === cited.citationId)?.tags ?? []) : []))}>
            Open in Assets &amp; Areas <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        )}
        {cited.mode === 'file' && cited.docId && (
          <button type="button" className="link-btn" onClick={() => leave(() => ui.openKnowledge(cited.docId, cited.revision))}>
            Open in Knowledge <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        )}
        {(cited.mode === 'record' || (cited.mode === 'unavailable' && cited.recordId)) && cited.recordId && cited.recordId !== id && <RefLink id={cited.recordId} label="Open the retrieved record" />}
        {cited.mode === 'file' && cited.citationId && state.citations.find((c) => c.id === cited.citationId)?.recordId && <RefLink id={state.citations.find((c) => c.id === cited.citationId)!.recordId!} label="Open the retrieved record" />}
      </footer>
    </div>
  );
}

function Body({ target, mode, excerpt, leave }: { target: SourceTarget; mode: 'panel' | 'expanded'; excerpt?: string; leave: (fn: () => void) => void }) {
  const { state, dispatch } = useEcc();
  const ui = useUi();

  if (target.mode === 'unavailable') {
    const d = target.recordId ? state.docs.find((x) => x.id === target.recordId) : undefined;
    return (
      <div className="notice notice-failed" role="alert">
        <p className="notice-title">Cannot be opened</p>
        <p>{target.reason}</p>
        {d && d.availability === 'unavailable' && (
          <>
            <p className="muted">
              {plural(d.attempts ?? 1, 'attempt')}, last at {fmt(d.retrievedAt)}. {d.note}
            </p>
            <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'RETRY_RETRIEVAL', docId: d.id })}>
              <RefreshCw size={13} aria-hidden="true" />
              Retry retrieval
            </button>
          </>
        )}
        {target.supports && <p className="muted">Consequence: this reference supports nothing in the brief until it can be opened.</p>}
      </div>
    );
  }
  if (target.mode === 'report') {
    const r = state.reports.find((x) => x.id === target.reportId);
    return r ? <ReportOriginal r={r} /> : null;
  }
  if (target.mode === 'reading') {
    const m = state.monitors.find((x) => x.id === target.monitorId);
    return m ? <ReadingDetail m={m} citationId={target.citationId} /> : null;
  }
  if (target.mode === 'record') {
    const d = state.docs.find((x) => x.id === target.recordId);
    return d ? <RecordOriginal d={d} /> : null;
  }

  // Files.
  const doc = target.docId ? state.knowledge.find((d) => d.id === target.docId) : undefined;
  const revision = doc?.revisions.find((r) => r.rev === target.revision);
  if (target.format !== 'pdf') {
    const ext = target.file.split('.').pop()?.toUpperCase() ?? 'file';
    return (
      <div className="sv-other">
        <div className="notice">
          <p className="notice-title">No faithful preview for a {ext} file</p>
          <p>ECC does not render this format, so the original is offered as a download instead of being rebuilt on screen.</p>
          <a className="btn btn-sm" href={target.file} download>
            <Download size={13} aria-hidden="true" />
            Download original ({ext})
          </a>
        </div>
        {revision && revision.sections.length > 0 && (
          <Field label="Extracted text, not the original">
            {revision.sections.map((s) => (
              <div key={s.id} className="sv-extract">
                <div className="sv-extract-title">
                  {s.title} <span className="muted small t-num">Page {s.page}</span>
                </div>
                <p>{s.text}</p>
              </div>
            ))}
          </Field>
        )}
      </div>
    );
  }

  const sheet = revision?.sheet;
  const regions: SheetRegion[] | undefined =
    sheet && sheet !== 'dependency'
      ? SHEET_REGIONS[sheet].map((r) => {
          const a = state.assets.find((x) => x.id === r.assetId);
          return { tag: r.tag, assetId: r.assetId, box: r.box, identified: !!a?.identified, label: a ? `${a.tag}, ${a.name}. Open in Assets & Areas` : r.tag };
        })
      : undefined;
  const page = target.location?.page ?? 1;
  return (
    <div className="sv-file">
      {excerpt && mode === 'panel' && (
        <div className="sv-excerpt">
          <span className="fe-k">Excerpt as cited</span>
          <Quote>{excerpt}</Quote>
        </div>
      )}
      <Suspense fallback={<p className="pv-msg">Loading the document viewer…</p>}>
        <PdfViewer key={`${target.file}:${page}`} file={target.file} page={page} location={target.location} mode={mode} regions={regions} pageNoun={sheet ? 'sheet' : 'page'} onSelectRegion={(r) => r.assetId && leave(() => ui.openAsset(r.assetId!))} />
      </Suspense>
      {excerpt && mode === 'expanded' && (
        <div className="sv-excerpt">
          <span className="fe-k">Excerpt as cited</span>
          <Quote>{excerpt}</Quote>
        </div>
      )}
      {revision && revision.processing !== 'searchable' && revision.processingNote && <p className="muted small">{revision.processingNote}</p>}
    </div>
  );
}

/** An incoming report, as received. The quote is verbatim and never a summary. */
export function ReportOriginal({ r }: { r: Report }) {
  const { state } = useEcc();
  const linked = r.assetIds.filter((a) => state.assets.find((x) => x.id === a)?.identified);
  return (
    <div className="detail">
      <div className="detail-tags">
        <TrustTag trust={r.trust} />
      </div>
      <Field label="What was said, verbatim">
        <Quote>{r.text}</Quote>
      </Field>
      <div className="field-grid">
        <Field label="From">
          <div>
            {r.sourceName}
            <div className="muted">{r.sourceRole}</div>
          </div>
        </Field>
        <Field label="Channel">{CHANNEL_LABEL[r.channel]}</Field>
        <Field label="Observed">{r.observedAt === null ? 'Time not given by the source' : fmt(r.observedAt)}</Field>
        <Field label="Received">{fmt(r.receivedAt)}</Field>
        <Field label="Observation type">{OBSERVATION_LABEL[r.observation]}</Field>
        {r.enteredBy && <Field label="Entered by">{r.enteredBy}</Field>}
      </div>
      {r.actionId && (
        <Field label="Response item">
          <RefLink id={r.actionId} />
        </Field>
      )}
      {linked.length > 0 && (
        <Field label="Linked equipment and areas">
          <RefChips ids={linked} />
        </Field>
      )}
    </div>
  );
}

/** A record retrieved from a system, with no file behind it. Labelled as such. */
export function RecordOriginal({ d }: { d: Doc }) {
  return (
    <div className="detail">
      <p className="sv-record-note">System record from {d.sourceSystem}, retrieved {fmt(d.retrievedAt)}. No original file is held; these are the fields as retrieved.</p>
      {d.availability === 'stale' && (
        <div className="notice notice-stale">
          <p className="notice-title">Out of date</p>
          <p>{d.summary}</p>
        </div>
      )}
      {d.fields.length > 0 && (
        <dl className="kv">
          {d.fields.map((f) => (
            <div key={f.label} className="kv-row">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {d.note && <p className="muted small">{d.note}</p>}
      {d.attempts && d.attempts > 1 && <p className="muted small">{plural(d.attempts, 'retrieval attempt')}.</p>}
    </div>
  );
}
