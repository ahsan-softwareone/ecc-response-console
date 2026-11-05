import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useDerived } from '../lib/derive';
import { useStore, type ViewerTarget } from '../store';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/ui';
import { findQuote, loadDoc, type Rect } from './pdf';

const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 3];

export function DocViewer({ target, onClose, closeTitle = 'Close document', expandable = true }: { target: ViewerTarget; onClose?: () => void; closeTitle?: string; expandable?: boolean }) {
  const d = useDerived();
  const doc = d.docById.get(target.docId);
  const rev = doc?.revisions.find((r) => r.revision === target.revision) ?? doc?.current;
  const setViewerExpanded = useStore((s) => s.setViewerExpanded);
  const expanded = useStore((s) => s.viewerExpanded);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNo, setPageNo] = useState(target.page);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [pageSize, setPageSize] = useState({ w: 0, h: 0 });
  const [matches, setMatches] = useState<Rect[][]>([]);
  const [matchIdx, setMatchIdx] = useState(0);
  const [status, setStatus] = useState<string>('Loading document…');
  const [fitScale, setFitScale] = useState(1);
  const [renderedFor, setRenderedFor] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<RenderTask | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [panning, setPanning] = useState(false);

  // Reset when the target changes.
  useEffect(() => { setPageNo(target.page); setMatches([]); setMatchIdx(0); setZoom('fit'); }, [target]);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el); setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!rev) return;
    let cancelled = false;
    setStatus('Loading document…');
    setPdf(null);
    loadDoc(rev.file).then((p) => { if (!cancelled) { setPdf(p); setStatus(''); } }).catch((e) => { if (!cancelled) setStatus(`Could not load document: ${String(e)}`); });
    return () => { cancelled = true; };
  }, [rev]);

  useEffect(() => {
    if (!pdf || !containerW) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(Math.min(Math.max(1, pageNo), pdf.numPages)).catch(() => null);
      if (!page) return; // document was replaced while this effect was pending
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const fit = Math.min(1.5, Math.max(0.2, (containerW - 32) / base.width));
      setFitScale(fit);
      const scale = zoom === 'fit' ? fit : zoom;
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current; if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (renderRef.current) { renderRef.current.cancel(); try { await renderRef.current.promise; } catch { /* cancelled */ } }
      if (cancelled) return;
      canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
      const ctx = canvas.getContext('2d')!;
      const task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined } as Parameters<typeof page.render>[0]);
      renderRef.current = task;
      try { await task.promise; } catch { return; }
      if (cancelled) return;
      setPageSize({ w: vp.width, h: vp.height });
      setRenderedFor(`${rev?.file}#${pageNo}`);
      if (target.quote && pageNo === target.page) {
        const m = await findQuote(page, vp, target.quote);
        if (!cancelled) { setMatches(m); setMatchIdx((i) => Math.min(i, Math.max(0, m.length - 1))); }
      } else setMatches([]);
    })().catch(() => { /* document replaced mid-render */ });
    return () => { cancelled = true; };
  }, [pdf, pageNo, zoom, containerW, target, rev]);

  // Scroll the first highlight into view once rendered.
  useEffect(() => {
    const el = containerRef.current; if (!el || !pageSize.h) return;
    const r = matches[matchIdx]?.[0] ?? (target.region && pageNo === target.region.page ? { top: target.region.y * pageSize.h, left: target.region.x * pageSize.w } : null);
    if (r) el.scrollTo({ top: Math.max(0, r.top - el.clientHeight * 0.35), left: Math.max(0, r.left - el.clientWidth * 0.2), behavior: 'smooth' });
  }, [matches, matchIdx, pageSize, target, pageNo]);

  const zoomStep = useCallback((dir: 1 | -1) => {
    const cur = zoom === 'fit' ? fitScale : zoom;
    const next = dir === 1 ? ZOOMS.find((z) => z > cur + 0.01) ?? ZOOMS[ZOOMS.length - 1] : [...ZOOMS].reverse().find((z) => z < cur - 0.01) ?? ZOOMS[0];
    setZoom(next);
  }, [zoom, fitScale]);

  // Drag to pan.
  const onPointerDown = (e: React.PointerEvent) => {
    const el = containerRef.current; if (!el || e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
    setPanning(true);
    const move = (ev: PointerEvent) => { el.scrollLeft = sl - (ev.clientX - sx); el.scrollTop = st - (ev.clientY - sy); };
    const up = () => { setPanning(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  if (!doc || !rev) return <div className="viewer-status">Document not found</div>;
  const numPages = pdf?.numPages ?? rev.pages;
  const isCurrent = rev.revision === doc.current.revision;
  const rendered = renderedFor === `${rev.file}#${pageNo}`;
  const onCitedPage = pageNo === target.page;
  const hasCitation = target.label !== '';
  let locateNote: React.ReactNode = null;
  if (hasCitation && onCitedPage) {
    if (target.region) locateNote = <span>Region highlighted</span>;
    else if (target.locate === 'page-only') locateNote = <span className="lim">Page known · exact region not available in this document</span>;
    else if (target.quote && matches.length === 0 && rendered) locateNote = <span className="lim">Passage not found in the text layer · page opened</span>;
    else if (target.quote && rendered && matches.length > 1) locateNote = <span className="lim" data-testid="match-nav">{matches.length} matches · exact passage not resolved · showing {matchIdx + 1} of {matches.length}</span>;
    else if (target.quote && rendered && matches.length === 1) locateNote = <span data-testid="exact-match">Located in text · highlighted</span>;
  }

  return (
    <div className="viewer" data-testid="viewer" data-doc={doc.id} data-rev={rev.revision} data-page={pageNo} data-matches={matches.length} data-rendered={rendered}>
      <div className="viewer-h">
        <div className="t">
          <Icon name="doc" size={15} />
          <span>{doc.title}</span>
          <span className="chip soft">{doc.type}</span>
        </div>
        <div className="m">
          <span>{doc.number}</span><span className="sep">·</span>
          <span data-testid="viewer-rev">Rev {rev.revision}</span>
          <span className={`chip ${rev.status === 'effective' ? 'soft' : 'outline'}`}>{rev.status === 'effective' ? 'Effective' : rev.status === 'superseded' ? 'Superseded' : 'Draft'}</span>
          {!isCurrent && <span className="chip outline" title="This record used this revision; a newer revision is now current">Rev {doc.current.revision} now {doc.current.status}</span>}
          <span className="sep">·</span>
          <span className="num">Page {pageNo} of {numPages}</span>
        </div>
        {hasCitation && (
          <div className="cite">
            <span className="chip accent">Cited</span>
            <span>p.{target.page} {target.label}</span>
            {target.quote && <span className="q" title={target.quote}>“{target.quote}”</span>}
            {locateNote}
            {!onCitedPage && <button className="link" onClick={() => setPageNo(target.page)}>Go to cited page</button>}
          </div>
        )}
      </div>
      <div className="viewer-tb">
        <IconButton className="sm" name="chevL" title="Previous page" onClick={() => setPageNo((p) => Math.max(1, p - 1))} disabled={pageNo <= 1} />
        <span className="pg">{pageNo} / {numPages}</span>
        <IconButton className="sm" name="chevR" title="Next page" onClick={() => setPageNo((p) => Math.min(numPages, p + 1))} disabled={pageNo >= numPages} />
        <span style={{ width: 8 }} />
        <IconButton className="sm" name="zoomOut" title="Zoom out" onClick={() => zoomStep(-1)} />
        <IconButton className="sm" name="zoomIn" title="Zoom in" onClick={() => zoomStep(1)} />
        <IconButton className="sm" name="fit" title="Fit width" onClick={() => setZoom('fit')} pressed={zoom === 'fit'} />
        {matches.length > 1 && (
          <>
            <span style={{ width: 8 }} />
            <IconButton className="sm" name="chevU" title="Previous match" onClick={() => setMatchIdx((i) => (i - 1 + matches.length) % matches.length)} />
            <span className="pg" data-testid="match-pos">Match {matchIdx + 1} of {matches.length}</span>
            <IconButton className="sm" name="chevD" title="Next match" onClick={() => setMatchIdx((i) => (i + 1) % matches.length)} testId="match-next" />
          </>
        )}
        <span className="spacer" />
        {expandable && !expanded && <IconButton className="sm" name="expand" title="Expand viewer" onClick={() => setViewerExpanded(true)} />}
        {onClose && <IconButton className="sm" name="close" title={closeTitle} onClick={onClose} />}
      </div>
      <div ref={containerRef} className={`viewer-c ${panning ? 'panning' : ''}`} onPointerDown={onPointerDown}>
        {status && <div className="viewer-status">{status}</div>}
        <div className="pdfpage" style={{ width: pageSize.w || undefined, height: pageSize.h || undefined, visibility: rendered ? 'visible' : 'hidden' }}>
          <canvas ref={canvasRef} />
          {rendered && onCitedPage && matches.map((m, mi) => m.map((r, ri) => (
            <div key={`${mi}-${ri}`} className={`hl ${matches.length > 1 && mi !== matchIdx ? 'dim' : ''}`} data-testid={mi === matchIdx ? 'highlight' : undefined} style={{ left: r.left - 2, top: r.top, width: r.width + 4, height: r.height }} />
          )))}
          {rendered && target.region && pageNo === target.region.page && pageSize.w > 0 && (
            <div className="hl region" data-testid="highlight" style={{ left: target.region.x * pageSize.w, top: target.region.y * pageSize.h, width: target.region.w * pageSize.w, height: target.region.h * pageSize.h }} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Full-size viewer for the current target, over any page. */
export function ViewerOverlay() {
  const viewer = useStore((s) => s.viewer);
  const expanded = useStore((s) => s.viewerExpanded);
  const setViewerExpanded = useStore((s) => s.setViewerExpanded);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, setViewerExpanded]);
  if (!viewer || !expanded) return null;
  return (
    <div className="overlay" data-testid="viewer-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewerExpanded(false); }}>
      <div className="panel" role="dialog" aria-label="Document viewer">
        <DocViewer target={viewer} onClose={() => setViewerExpanded(false)} closeTitle="Close expanded view" expandable={false} />
      </div>
    </div>
  );
}
