import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { IconButton } from './ui';
import { Icon } from './Icon';
import { resetCurrentTab } from './panels';

// One divider for every adjacent-panel layout. Pointer drag, arrow-key resizing,
// double-click reset, role="separator". While dragging, text selection and canvas /
// PDF pointer capture are suppressed on the whole document.

export const KEY_STEP = 16;

export function Divider({ orientation, onDelta, onReset, label, testId, className = '' }: {
  /** 'vertical' bar resizes columns (left/right); 'horizontal' bar resizes rows (top/bottom). */
  orientation: 'vertical' | 'horizontal';
  onDelta: (px: number) => void;
  onReset?: () => void;
  label: string;
  testId?: string;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    let last = orientation === 'vertical' ? e.clientX : e.clientY;
    setActive(true);
    document.body.classList.add('is-resizing', orientation === 'vertical' ? 'resize-x' : 'resize-y');
    const move = (ev: PointerEvent) => { const cur = orientation === 'vertical' ? ev.clientX : ev.clientY; const d = cur - last; if (d) { last = cur; onDelta(d); } };
    const up = () => { setActive(false); document.body.classList.remove('is-resizing', 'resize-x', 'resize-y'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }, [orientation, onDelta]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const dec = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp', inc = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === dec) { e.preventDefault(); onDelta(-step); } else if (e.key === inc) { e.preventDefault(); onDelta(step); } else if ((e.key === 'Home' || e.key === 'Enter') && onReset) { e.preventDefault(); onReset(); }
  };
  return (
    <div className={`${orientation === 'vertical' ? 'divider-x' : 'divider-y'} ${active ? 'active' : ''} ${className}`} role="separator" aria-orientation={orientation} aria-label={label} tabIndex={0}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={onReset} data-testid={testId} title={`${label} · drag, arrow keys, double-click to reset`} />
  );
}

/**
 * Two adjacent panels with a persisted, clamped divider. The side pane ("start" or
 * "end") keeps a stored pixel size; the other pane fills. Stored sizes are never
 * rewritten by clamping: a small window only clamps for display.
 */
export function SplitPane({ id, direction = 'row', side = 'start', defaultSize, min, children, className = '', testId }: {
  id: string;
  direction?: 'row' | 'column';
  side?: 'start' | 'end';
  defaultSize: number;
  /** [side pane minimum, other pane minimum] in px */
  min: [number, number];
  children: [ReactNode, ReactNode];
  className?: string;
  testId?: string;
}) {
  const stored = useStore((s) => s.splits[id]);
  const setSplit = useStore((s) => s.setSplit);
  const storedMax = useStore((s) => s.maximizedPanes[id] ?? null);
  const hiddenA = useStore((s) => !!s.hiddenPanels[`${id}.a`]);
  const hiddenB = useStore((s) => !!s.hiddenPanels[`${id}.b`]);
  const [focusPane, setFocusPane] = useState<'a' | 'b'>('b');
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const GAP = 12;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setAvail(direction === 'row' ? el.clientWidth : el.clientHeight));
    ro.observe(el); setAvail(direction === 'row' ? el.clientWidth : el.clientHeight);
    return () => ro.disconnect();
  }, [direction]);
  const want = stored ?? defaultSize;
  const maxSide = Math.max(min[0], avail - GAP - min[1]);
  const size = avail ? Math.min(Math.max(min[0], want), maxSide) : want;
  const onDelta = useCallback((d: number) => {
    const dir = side === 'start' ? 1 : -1;
    const cur = useStore.getState().splits[id] ?? defaultSize;
    const el = ref.current; const a = el ? (direction === 'row' ? el.clientWidth : el.clientHeight) : 0;
    const limit = a ? Math.max(min[0], a - GAP - min[1]) : Infinity;
    setSplit(id, Math.min(Math.max(min[0], Math.min(cur, limit) + d * dir), limit));
  }, [id, side, direction, defaultSize, min, setSplit]);
  const [a, b] = children;
  // Too narrow for both minimums: show one at a time rather than unreadable columns.
  const narrow = avail > 0 && direction === 'row' && !hiddenA && !hiddenB && !storedMax && avail < min[0] + min[1] + GAP;
  const maximized = storedMax ?? (hiddenA && !hiddenB ? 'b' : hiddenB && !hiddenA ? 'a' : narrow ? focusPane : null);
  const sideStyle = direction === 'row' ? { flex: `0 0 ${size}px`, width: size, minWidth: 0 } : { flex: `0 0 ${size}px`, height: size, minHeight: 0 };
  const fillStyle = { flex: '1 1 0', minWidth: 0, minHeight: 0 };
  // A maximized pane fills the layout; the other stays mounted but hidden (its scroll,
  // selection and half-edited text survive), and stored sizes are untouched.
  const hiddenStyle = { position: 'absolute' as const, inset: 0, visibility: 'hidden' as const, pointerEvents: 'none' as const };
  const styleFor = (pane: 'a' | 'b') => (maximized ? (maximized === pane ? { flex: '1 1 0', minWidth: 0, minHeight: 0 } : hiddenStyle) : (side === (pane === 'a' ? 'start' : 'end') ? sideStyle : fillStyle));
  const divider = <Divider orientation={direction === 'row' ? 'vertical' : 'horizontal'} onDelta={onDelta} onReset={() => setSplit(id, defaultSize)} label={`Resize ${id}`} testId={`split-${id}`} />;
  return (
    <MaxContext.Provider value={id}>
      <div ref={ref} className={`split ${direction} ${className}`} data-testid={testId ?? `splitpane-${id}`} data-size={size} data-stored={stored ?? ''} data-maximized={maximized ?? ''} style={{ display: 'flex', flexDirection: direction, flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
        {narrow && <div className="focusbar floating" role="tablist" aria-label="Panel focus" data-testid={`focus-${id}`}><button role="tab" aria-pressed={focusPane === 'a'} onClick={() => setFocusPane('a')}>First panel</button><button role="tab" aria-pressed={focusPane === 'b'} onClick={() => setFocusPane('b')}>Second panel</button></div>}
        <div className="split-a" style={hiddenA && hiddenB ? hiddenStyle : styleFor('a')} data-pane="a" data-panel={`${id}.a`} aria-hidden={maximized === 'b' || (hiddenA && hiddenB) || undefined}>{a}</div>
        {!maximized && !(hiddenA && hiddenB) && divider}
        <div className="split-b" style={hiddenA && hiddenB ? hiddenStyle : styleFor('b')} data-pane="b" data-panel={`${id}.b`} aria-hidden={maximized === 'a' || (hiddenA && hiddenB) || undefined}>{b}</div>
        {hiddenA && hiddenB && <PanelsRecovery />}
      </div>
    </MaxContext.Provider>
  );
}

const MaxContext = createContext<string | null>(null);

/** Shown when every panel on a tab is hidden. */
export function PanelsRecovery() {
  return (
    <div className="recovery" data-testid="panels-recovery">
      <Icon name="windows" size={22} />
      <p>All panels on this tab are hidden. Nothing was lost, and the agent and incident are unaffected.</p>
      <button className="btn sm" onClick={resetCurrentTab} data-testid="recovery-reset">Restore default layout</button>
    </div>
  );
}

/** Maximize / restore / hide controls for a pane inside a SplitPane; same icons, titles and behaviour as the Situation windows. */
export function PaneMaximize({ pane }: { pane: 'a' | 'b' }) {
  const id = useContext(MaxContext);
  const maximized = useStore((s) => (id ? s.maximizedPanes[id] ?? null : null));
  const setMaximizedPane = useStore((s) => s.setMaximizedPane);
  const hidePanel = useStore((s) => s.hidePanel);
  if (!id) return null;
  const isMax = maximized === pane;
  return <>
    <IconButton className="sm" name={isMax ? 'restore' : 'max'} title={isMax ? 'Restore layout' : 'Maximize panel'} onClick={() => setMaximizedPane(id, isMax ? null : pane)} testId={`max-${id}-${pane}`} />
    <IconButton className="sm" name="hide" title="Hide panel" onClick={() => hidePanel(`${id}.${pane}`)} testId={`hide-${id}-${pane}`} />
  </>;
}
