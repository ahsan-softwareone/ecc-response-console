import { useAllDocs } from '../lib/docs';
import { useStore, type ViewerTarget } from '../store';
import { Icon } from './Icon';

export interface CitationRef {
  docId: string; revision: string; page?: number; label?: string; quote?: string;
  region?: { page: number; x: number; y: number; w: number; h: number };
  locate?: 'exact' | 'ambiguous' | 'page-only';
  /** Display title override (business views use the document title). */
  title?: string; number?: string;
}

/**
 * One citation control for every place a document backs an insight.
 * Primary click = View evidence (cited page, highlight by the honesty rules).
 * Secondary = Open original (whole document at the same pinned revision).
 * A reference without a location offers Open original only and says so.
 */
export function Citation({ cite, origin, dock = false, plain = false, actions = false, testId }: { cite: CitationRef; origin: string; dock?: boolean; plain?: boolean; /** The row already names the document: show only the two actions. */ actions?: boolean; testId?: string }) {
  const docs = useAllDocs();
  const openViewer = useStore((s) => s.openViewer);
  const viewer = useStore((s) => s.viewer);
  const entry = docs.find((e) => e.id === cite.docId) ?? docs.find((e) => e.revisions.some((r) => r.upload?.id === cite.docId));
  const hasLocation = !!(cite.page || cite.quote || cite.region);
  const short = entry ? (plain ? entry.title.replace(/ — generic guidance| — illustrative values/g, '') : entry.type === 'Procedure' ? entry.title.replace(' — generic guidance', '') : entry.type) : (cite.title ?? cite.docId);
  const revLabel = `Rev ${cite.revision}${cite.page ? ` · p.${cite.page}` : ''}${cite.label ? ` ${cite.label}` : ''}`;
  if (!entry) {
    return <span className="ev dead" title="This source is not available in the prototype (no stored original)" data-testid={testId ?? `cite-${cite.docId}`} data-dead="true"><Icon name="doc" size={13} /><span>{short}</span><span className="rev">{revLabel} · source not available</span></span>;
  }
  const newer = entry.current.revision !== cite.revision;
  const base: ViewerTarget = { docId: cite.docId, revision: cite.revision, page: cite.page ?? cite.region?.page ?? 1, label: cite.label ?? (hasLocation ? `p.${cite.page ?? 1}` : ''), quote: cite.quote, region: cite.region, locate: cite.locate ?? (cite.region || cite.quote ? 'exact' : 'page-only'), origin, dock };
  const original: ViewerTarget = { ...base, label: '', quote: undefined, region: undefined, locate: 'page-only', page: cite.page ?? 1 };
  const active = !!viewer && viewer.docId === cite.docId && viewer.revision === cite.revision && viewer.page === base.page;
  const tip = `${entry.title} · Rev ${cite.revision}${newer ? ` (Rev ${entry.current.revision} now current)` : ''}${hasLocation ? ` · view evidence at p.${base.page}` : ' · location not recorded'}`;
  if (actions) return (
    <span className="cite-actions" data-testid={testId ?? `cite-${cite.docId}`} data-rev={cite.revision} data-newer={newer} data-location={hasLocation}>
      {hasLocation ? <button className="btn sm" aria-pressed={active} title={tip} onClick={() => openViewer(base)} data-testid="cite-view">View evidence</button> : <span className="sidenote">Location not recorded</span>}
      <button className="btn sm" title="Open the original document at this revision" onClick={() => openViewer(original)} data-testid="cite-original">Open original</button>
    </span>
  );
  return (
    <span className={`cite ${hasLocation ? '' : 'no-loc'}`} data-testid={testId ?? `cite-${cite.docId}`} data-rev={cite.revision} data-newer={newer} data-location={hasLocation}>
      <button className="ev" aria-pressed={active} title={tip} onClick={() => openViewer(hasLocation ? base : original)} data-testid="cite-view">
        <Icon name="doc" size={13} /><span>{short}</span><span className="rev">{revLabel}{newer ? ` · Rev ${entry.current.revision} now current` : ''}{!hasLocation ? ' · location not recorded' : ''}</span>
      </button>
      {hasLocation && <button className="ev-orig" title="Open the original document at this revision" onClick={() => openViewer(original)} data-testid="cite-original" aria-label="Open original"><Icon name="expand" size={12} /></button>}
    </span>
  );
}
