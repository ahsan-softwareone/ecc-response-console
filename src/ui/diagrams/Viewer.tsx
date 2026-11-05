import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';

export const SHEET_W = 900;
export const SHEET_H = 560;

/**
 * Zoom and pan for an illustrative sheet. Buttons, keyboard (+ - 0, arrows) and drag all work.
 * Plain wheel scrolls the page; Ctrl/Cmd + wheel zooms, so the sheet never traps scrolling.
 */
export function Viewer({ label, children, caption }: { label: string; children: ReactNode; caption: ReactNode }) {
  const [k, setK] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const zoom = useCallback((factor: number, cx = SHEET_W / 2, cy = SHEET_H / 2) => {
    setK((prev) => {
      const next = Math.min(4, Math.max(0.5, prev * factor));
      const r = next / prev;
      setTx((t) => cx - (cx - t) * r);
      setTy((t) => cy - (cy - t) * r);
      return next;
    });
  }, []);
  const reset = () => {
    setK(1);
    setTx(0);
    setTy(0);
  };

  const toSheet = (e: { clientX: number; clientY: number }) => {
    const el = svgRef.current;
    if (!el) return { x: SHEET_W / 2, y: SHEET_H / 2 };
    const r = el.getBoundingClientRect();
    const scale = Math.min(r.width / SHEET_W, r.height / SHEET_H);
    const ox = (r.width - SHEET_W * scale) / 2;
    const oy = (r.height - SHEET_H * scale) / 2;
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale, scale };
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const step = 40;
    if (e.key === '+' || e.key === '=') zoom(1.25);
    else if (e.key === '-' || e.key === '_') zoom(0.8);
    else if (e.key === '0') reset();
    else if (e.key === 'ArrowLeft') setTx((t) => t + step);
    else if (e.key === 'ArrowRight') setTx((t) => t - step);
    else if (e.key === 'ArrowUp') setTy((t) => t + step);
    else if (e.key === 'ArrowDown') setTy((t) => t - step);
    else return;
    e.preventDefault();
  };

  return (
    <div className="viewer">
      <div className="viewer-tools" role="group" aria-label="Zoom and pan">
        <button type="button" className="btn btn-icon btn-sm" onClick={() => zoom(1.25)} aria-label="Zoom in">
          <Plus size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-icon btn-sm" onClick={() => zoom(0.8)} aria-label="Zoom out">
          <Minus size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-icon btn-sm" onClick={reset} aria-label="Fit sheet">
          <Maximize2 size={14} aria-hidden="true" />
        </button>
        <span className="viewer-zoom t-num">{Math.round(k * 100)}%</span>
        <span className="viewer-hint">Drag to pan · Ctrl + wheel to zoom · Keys + − 0 and arrows</span>
      </div>
      <div
        className="viewer-stage"
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use plus and minus to zoom, arrows to pan.`}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('[role="button"]')) return;
          drag.current = { x: e.clientX, y: e.clientY, tx, ty };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const { scale = 1 } = toSheet(e);
          setTx(drag.current.tx + (e.clientX - drag.current.x) / scale);
          setTy(drag.current.ty + (e.clientY - drag.current.y) / scale);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const p = toSheet(e);
          zoom(e.deltaY < 0 ? 1.15 : 0.87, p.x, p.y);
        }}
      >
        <svg ref={svgRef} className="sheet" viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
          <g transform={`translate(${tx} ${ty}) scale(${k})`}>{children}</g>
        </svg>
      </div>
      <div className="viewer-caption">{caption}</div>
    </div>
  );
}

export interface NodeState {
  selected: boolean;
  highlighted: boolean;
  identified: boolean;
  relation?: string;
  label: string;
  onSelect: () => void;
}

/** Keyboard-reachable node wrapper for anything selectable on a sheet. */
export function Node({ st, className = '', children }: { st: NodeState; className?: string; children: ReactNode }) {
  return (
    <g
      className={`dnode ${className} ${st.selected ? 'is-selected' : ''} ${st.highlighted ? 'is-highlighted' : ''} ${st.identified ? '' : 'is-unidentified'} ${st.relation ? `rel-${st.relation}` : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={st.selected}
      aria-label={st.label}
      onClick={st.onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          st.onSelect();
        }
      }}
    >
      {children}
    </g>
  );
}
