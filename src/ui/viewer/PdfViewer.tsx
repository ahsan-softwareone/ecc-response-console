// Renders the real PDF page with PDF.js and places highlights in normalised coordinates, so they
// stay aligned at any zoom or size. What the highlight can and cannot claim is always said in words.
import { ChevronLeft, ChevronRight, Maximize2, Minus, MoveHorizontal, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { locateQuote, type LocateResult, type NormRect, type PageTextItem } from '../../domain/sourceLocate';
import type { SourceLocation } from '../../domain/types';
import { openPdf, pageText, PdfOpenError } from './pdf';
import { plural } from '../util';

export interface SheetRegion {
  tag: string;
  assetId?: string;
  box: [number, number, number, number];
  /** Spoken label for the region. */
  label?: string;
  /** Whether the item is on the brief; regions off the brief are still selectable but drawn quieter. */
  identified?: boolean;
}

export interface PdfViewerProps {
  file: string;
  /** Page to open first. */
  page: number;
  location?: SourceLocation;
  /** Selectable equipment regions, for drawings. */
  regions?: SheetRegion[];
  selectedTag?: string;
  onSelectRegion?: (r: SheetRegion) => void;
  mode: 'panel' | 'expanded';
  /** Told when the file cannot be opened, so the parent can state the consequence. */
  onError?: (reason: PdfOpenError['reason']) => void;
  /** For a drawing, what the viewer calls a page. */
  pageNoun?: 'page' | 'sheet';
  /** Say nothing when there is no location to find, as in a sheet opened for browsing. */
  quietWithoutLocation?: boolean;
}

type Load = { state: 'loading' } | { state: 'error'; reason: PdfOpenError['reason']; message: string } | { state: 'ready'; doc: PDFDocumentProxy; pages: number };

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 5;

const pct = (r: NormRect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });

/** Highlight padding so a thin text box reads as a marker rather than an underline. */
const pad = (r: NormRect, px = 0.004, py = 0.0025): NormRect => ({ x: r.x - px, y: r.y - py, w: r.w + px * 2, h: r.h + py * 2 });

export default function PdfViewer({ file, page, location, regions = [], selectedTag, onSelectRegion, mode, onError, pageNoun = 'page', quietWithoutLocation = false }: PdfViewerProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [pageNo, setPageNo] = useState(page);
  // 'auto': drawings fit the page; portrait documents open at a readable size, centred on the citation.
  const [fit, setFit] = useState<'width' | 'page' | 'auto' | 'none'>(mode === 'expanded' ? 'auto' : 'width');
  const [scale, setScale] = useState(1);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [items, setItems] = useState<PageTextItem[] | null>(null);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState<{ query: string; hits: { page: number; occ: number }[]; at: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const scrolledToHighlight = useRef(false);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);

  // Open the document.
  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    setPageNo(page);
    scrolledToHighlight.current = false;
    openPdf(file)
      .then((doc) => live && setLoad({ state: 'ready', doc, pages: doc.numPages }))
      .catch((e: unknown) => {
        if (!live) return;
        const err = e instanceof PdfOpenError ? e : new PdfOpenError('The file could not be opened.', 'unreadable');
        setLoad({ state: 'error', reason: err.reason, message: err.message });
        onError?.(err.reason);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Load the current page and its text.
  useEffect(() => {
    if (load.state !== 'ready') return;
    let live = true;
    const n = Math.min(Math.max(1, pageNo), load.pages);
    setItems(null);
    load.doc.getPage(n).then(async (p) => {
      if (!live) return;
      pageRef.current = p;
      const vp = p.getViewport({ scale: 1 });
      setPageSize({ w: vp.width, h: vp.height });
      const t = await pageText(file, p);
      if (live) setItems(t);
    });
    return () => {
      live = false;
    };
  }, [load, pageNo, file]);

  // Fit to width follows the stage size.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || !pageSize) return;
    const apply = () => {
      if (fit === 'none') return;
      const availW = el.clientWidth - 2 * STAGE_PAD;
      const availH = el.clientHeight - 2 * STAGE_PAD;
      if (availW <= 0) return;
      const byWidth = availW / pageSize.w;
      const byPage = Math.min(byWidth, availH > 0 ? availH / pageSize.h : byWidth);
      const auto = pageSize.h > pageSize.w ? Math.min(byWidth, 1.3) : byPage;
      setScale(Math.max(ZOOM_MIN, fit === 'page' ? byPage : fit === 'auto' ? auto : byWidth));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, pageSize]);

  // Render crisply at the device pixel ratio.
  useEffect(() => {
    const p = pageRef.current;
    const canvas = canvasRef.current;
    if (!p || !canvas || !pageSize) return;
    renderTask.current?.cancel();
    const dpr = window.devicePixelRatio || 1;
    const vp = p.getViewport({ scale });
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${Math.floor(vp.width)}px`;
    canvas.style.height = `${Math.floor(vp.height)}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const task = p.render({ canvasContext: ctx, viewport: vp });
    renderTask.current = task;
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [scale, pageSize, pageNo, load]);

  const locate: LocateResult | null = useMemo(() => {
    if (!items || !location || location.type !== 'text' || location.page !== pageNo) return null;
    return locateQuote(items, location.quote, location.occurrence);
  }, [items, location, pageNo]);

  const citedRegions = useMemo(() => (location?.type === 'region' && location.page === pageNo ? location.regions : []), [location, pageNo]);

  // Search hits on the current page, as rectangles.
  const searchRects = useMemo(() => {
    if (!items || !search) return [];
    const out: { rects: NormRect[]; current: boolean }[] = [];
    search.hits.forEach((h, i) => {
      if (h.page !== pageNo) return;
      const r = locateQuote(items, search.query, h.occ);
      out.push({ rects: r.rects, current: i === search.at });
    });
    return out;
  }, [items, search, pageNo]);

  // Bring the highlight into view once per open.
  useEffect(() => {
    if (scrolledToHighlight.current) return;
    const el = stageRef.current;
    if (!el || !pageSize) return;
    const first = locate?.rects[0] ?? (citedRegions[0] ? { x: citedRegions[0].box[0], y: citedRegions[0].box[1], w: citedRegions[0].box[2], h: citedRegions[0].box[3] } : undefined);
    if (!first) return;
    scrolledToHighlight.current = true;
    const cy = (first.y + first.h / 2) * pageSize.h * scale + STAGE_PAD;
    const cx = (first.x + first.w / 2) * pageSize.w * scale + STAGE_PAD;
    el.scrollTo({ top: Math.max(0, cy - el.clientHeight / 2), left: Math.max(0, cx - el.clientWidth / 2) });
  }, [locate, citedRegions, pageSize, scale]);

  const zoomBy = useCallback((f: number) => {
    setFit('none');
    setScale((s) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s * f)));
  }, []);
  const reset = () => {
    setFit(mode === 'expanded' ? 'auto' : 'width');
    setPageNo(page);
    scrolledToHighlight.current = false;
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  };

  const pages = load.state === 'ready' ? load.pages : 0;
  const go = (n: number) => setPageNo(Math.min(Math.max(1, n), pages || 1));

  const runSearch = async () => {
    const query = q.trim();
    if (!query || load.state !== 'ready') {
      setSearch(null);
      return;
    }
    const hits: { page: number; occ: number }[] = [];
    for (let n = 1; n <= load.pages; n++) {
      const p = await load.doc.getPage(n);
      const t = await pageText(file, p);
      const r = locateQuote(t, query);
      for (let i = 0; i < r.matches; i++) hits.push({ page: n, occ: i });
    }
    setSearch({ query, hits, at: 0 });
    if (hits[0]) setPageNo(hits[0].page);
  };
  const stepHit = (d: number) => {
    if (!search || !search.hits.length) return;
    const at = (search.at + d + search.hits.length) % search.hits.length;
    setSearch({ ...search, at });
    setPageNo(search.hits[at].page);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-' || e.key === '_') zoomBy(0.8);
    else if (e.key === '0') reset();
    else if (e.key === 'PageDown') go(pageNo + 1);
    else if (e.key === 'PageUp') go(pageNo - 1);
    else return;
    e.preventDefault();
  };

  const locationPage = location?.page;
  const noun = pageNoun;

  return (
    <div className={`pv pv-${mode}`}>
      {load.state === 'ready' && (
      <div className="pv-tools" role="group" aria-label="Document tools">
        {pages > 1 && (
          <span className="pv-pages">
            <button type="button" className="btn btn-icon btn-sm" onClick={() => go(pageNo - 1)} disabled={pageNo <= 1} aria-label="Previous page">
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <span className="t-num">
              Page {pageNo} of {pages}
            </span>
            <button type="button" className="btn btn-icon btn-sm" onClick={() => go(pageNo + 1)} disabled={pageNo >= pages} aria-label="Next page">
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </span>
        )}
        <span className="pv-zoom">
          <button type="button" className="btn btn-icon btn-sm" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className="t-num pv-zoom-v">{Math.round(scale * 100)}%</span>
          <button type="button" className="btn btn-icon btn-sm" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
            <Plus size={14} aria-hidden="true" />
          </button>
          <button type="button" className={`btn btn-sm ${fit === 'width' ? 'is-on' : ''}`} onClick={() => setFit('width')} aria-pressed={fit === 'width'} title="Fit to width">
            <MoveHorizontal size={14} aria-hidden="true" />
            Width
          </button>
          <button type="button" className={`btn btn-sm ${fit === 'page' ? 'is-on' : ''}`} onClick={() => setFit('page')} aria-pressed={fit === 'page'} title="Fit whole page">
            <Maximize2 size={14} aria-hidden="true" />
            Page
          </button>
          <button type="button" className="btn btn-icon btn-sm" onClick={reset} aria-label="Reset view" title="Reset view">
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        </span>
        {load.state === 'ready' && (
          <form
            className="pv-search"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <label className="search search-sm">
              <Search size={13} aria-hidden="true" />
              <span className="sr-only">Search in document</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in document" />
            </label>
            {search && (
              <span className="pv-search-result t-num">
                {search.hits.length === 0 ? (
                  'No matches'
                ) : (
                  <>
                    {search.at + 1} of {search.hits.length}
                    <button type="button" className="btn btn-icon btn-sm" onClick={() => stepHit(-1)} aria-label="Previous match">
                      <ChevronLeft size={13} aria-hidden="true" />
                    </button>
                    <button type="button" className="btn btn-icon btn-sm" onClick={() => stepHit(1)} aria-label="Next match">
                      <ChevronRight size={13} aria-hidden="true" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  onClick={() => {
                    setSearch(null);
                    setQ('');
                  }}
                  aria-label="Clear search"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            )}
          </form>
        )}
      </div>
      )}

      {load.state === 'ready' && !(quietWithoutLocation && !location) && (
        <HighlightNote location={location} locate={locate} items={items} pageNo={pageNo} noun={noun} citedRegions={citedRegions} onGo={go} />
      )}

      <div
        className={`pv-stage ${load.state === 'ready' ? '' : 'is-empty'}`}
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-label={`Document ${noun} ${pageNo}${pages ? ` of ${pages}` : ''}. Plus and minus zoom, 0 resets, Page Up and Page Down change ${noun}.`}
        onKeyDown={onKey}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1.15 : 0.87);
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('button, input')) return;
          const el = stageRef.current!;
          drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const el = stageRef.current!;
          el.scrollLeft = drag.current.l - (e.clientX - drag.current.x);
          el.scrollTop = drag.current.t - (e.clientY - drag.current.y);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {load.state === 'loading' && <p className="pv-msg">Opening the original…</p>}
        {load.state === 'error' && (
          <div className="pv-error" role="alert">
            <p className="notice-title">The original could not be opened</p>
            <p>{load.reason === 'missing' ? 'Nothing was found at the recorded location.' : load.reason === 'not-pdf' ? 'What the server returned for the recorded location is not a PDF, which usually means the file is missing.' : 'The file was found but could not be read as a PDF.'}</p>
            <p className="small">
              Location <span className="mono">{file}</span>. Nothing from this reference can be shown or checked here.
            </p>
          </div>
        )}
        {load.state === 'ready' && pageSize && (
          <div className="pv-page" style={{ width: Math.floor(pageSize.w * scale), height: Math.floor(pageSize.h * scale) }}>
            <canvas ref={canvasRef} className="pv-canvas" aria-hidden="true" />
            <div className="pv-overlay">
              {regions.map((r) => {
                const cited = citedRegions.some((c) => c.tag === r.tag);
                const selected = selectedTag === r.tag;
                return (
                  <button
                    key={r.tag}
                    type="button"
                    className={`pv-region ${selected ? 'is-selected' : ''} ${cited ? 'is-cited' : ''} ${r.identified === false ? 'is-unidentified' : ''}`}
                    style={pct({ x: r.box[0], y: r.box[1], w: r.box[2], h: r.box[3] })}
                    aria-pressed={selected}
                    aria-label={r.label ?? r.tag}
                    onClick={() => onSelectRegion?.(r)}
                  >
                    <span className="pv-region-tag">{r.tag}</span>
                  </button>
                );
              })}
              {citedRegions
                .filter((c) => !regions.some((r) => r.tag === c.tag))
                .map((c) => (
                  <span key={c.tag} className="pv-hl pv-hl-region" style={pct({ x: c.box[0], y: c.box[1], w: c.box[2], h: c.box[3] })} aria-hidden="true" />
                ))}
              {locate?.rects.map((r, i) => (
                <span key={i} className="pv-hl" style={pct(pad(r))} aria-hidden="true" />
              ))}
              {searchRects.map((h, i) => h.rects.map((r, j) => <span key={`${i}-${j}`} className={`pv-hl pv-hl-search ${h.current ? 'is-current' : ''}`} style={pct(pad(r))} aria-hidden="true" />))}
            </div>
          </div>
        )}
      </div>
      {load.state === 'ready' && locationPage !== undefined && locationPage !== pageNo && (
        <p className="pv-foot small muted">
          The cited {noun} is {locationPage}.{' '}
          <button type="button" className="link-btn" onClick={() => go(locationPage)}>
            Go to {noun} {locationPage}
          </button>
        </p>
      )}
    </div>
  );
}

const STAGE_PAD = 16;

/** Says plainly what the highlight is. Never implies precision the location does not have. */
function HighlightNote({ location, locate, items, pageNo, noun, citedRegions, onGo }: { location?: SourceLocation; locate: LocateResult | null; items: PageTextItem[] | null; pageNo: number; noun: string; citedRegions: { tag: string }[]; onGo: (n: number) => void }) {
  if (!location) return <p className="pv-note is-none">No location is recorded for this reference, so nothing is highlighted. The original is shown from {noun} {pageNo}.</p>;
  if (location.page !== pageNo) {
    return (
      <p className="pv-note is-none">
        Cited {noun} is {location.page}.{' '}
        <button type="button" className="link-btn" onClick={() => onGo(location.page)}>
          Go to {noun} {location.page}
        </button>
      </p>
    );
  }
  if (location.type === 'page') return <p className="pv-note is-page">{noun.charAt(0).toUpperCase() + noun.slice(1)} only, nothing highlighted. {location.reason}</p>;
  if (location.type === 'region') {
    const tags = citedRegions.map((r) => r.tag).join(', ');
    return <p className="pv-note is-exact">Cited region highlighted: {tags}.</p>;
  }
  if (!items) return <p className="pv-note">Locating the passage…</p>;
  if (!locate || locate.status === 'no-text') return <p className="pv-note is-none">This {noun} has no text layer (a scanned image), so the passage cannot be located or highlighted. The original is shown unchanged.</p>;
  if (locate.status === 'exact') return <p className="pv-note is-exact">Exact passage highlighted.</p>;
  if (locate.status === 'approximate')
    return (
      <p className="pv-note is-approx">
        Approximate: the quoted words appear {plural(locate.matches, 'time')} on this {noun}, so the first is highlighted. Searched for “{location.quote}”.
      </p>
    );
  return <p className="pv-note is-none">The quoted passage was not found on this {noun}, so nothing is highlighted. Searched for “{location.quote}”. The original is shown unchanged.</p>;
}
