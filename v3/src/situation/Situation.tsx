import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../store';
import { EquipmentWindow } from './EquipmentWindow';
import { AlertLog } from './AlertLog';
import { ResponseWindow } from './ResponseWindow';
import { DocumentWindow } from './DocumentWindow';
import { Divider, PanelsRecovery } from '../ui/Split';

// Hand-built docking: two columns, draggable dividers, swap, maximize/restore,
// optional third docked window, and focus mode when both sides cannot meet
// their minimum widths.
const MIN_MONITORING = 540;
const MIN_RESPONSE = 420;
const MIN_ROW = 150;
const GUTTER = 12;

export function Situation() {
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);
  const viewer = useStore((s) => s.viewer);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<null | 'x' | 'y' | 'doc'>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth - GUTTER * 2, h: el.clientHeight - GUTTER * 2 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitsBoth = size.w === 0 || size.w - GUTTER >= MIN_MONITORING + MIN_RESPONSE;

  // Divider deltas (px) become fractions of the usable width/height; the shared Divider owns the drag/keyboard mechanics.
  const onDeltaX = useCallback((px: number) => {
    const el = ref.current; if (!el) return;
    const usable = el.clientWidth - GUTTER * 2 - GUTTER;
    const s = useStore.getState().layout;
    const cur = s.splitX * usable + (s.monitoringSide === 'left' ? px : -px);
    setLayout({ splitX: Math.max(MIN_MONITORING, Math.min(usable - MIN_RESPONSE, cur)) / usable });
  }, [setLayout]);
  const onDeltaRow = useCallback((key: 'splitY' | 'splitDoc') => (px: number) => {
    const el = ref.current; if (!el) return;
    const usable = el.clientHeight - GUTTER * 2 - GUTTER;
    const cur = useStore.getState().layout[key] * usable + px;
    setLayout({ [key]: Math.max(MIN_ROW, Math.min(usable - MIN_ROW, cur)) / usable } as Partial<typeof layout>);
  }, [setLayout, layout]);
  void drag; void setDrag;

  // Every window stays mounted whether hidden or maximized elsewhere, so forms, selections, filters and scroll positions survive.
  const hidden = useStore((s) => s.hiddenPanels);
  const hasDoc = !!viewer && viewer.dock !== false;
  const max = layout.maximized === 'document' && !hasDoc ? null : layout.maximized;
  const shows = (id: string) => (max ? max === id : !hidden[`situation.${id}`]);
  const showEq = shows('equipment'), showLog = shows('log'), showResp = shows('response'), showDoc = hasDoc && shows('document');
  const showMon = showEq || showLog, showRes = showResp || showDoc;
  const allHidden = !showMon && !showRes;
  const focus = !max && !fitsBoth && showMon && showRes ? (layout.focus ?? 'monitoring') : null;
  const OFF: CSSProperties = { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none' };
  const monVisible = showMon && focus !== 'response', resVisible = showRes && focus !== 'monitoring';
  const both = monVisible && resVisible;

  return (
    <div ref={ref} className="dock" data-testid="dock" data-focus={focus ?? ''} data-maximized={max ?? ''} style={{ flexDirection: layout.monitoringSide === 'left' ? 'row' : 'row-reverse' }}>
      {focus && (
        <div className="focusbar floating" role="tablist" aria-label="Focus mode">
          <button role="tab" aria-pressed={focus === 'monitoring'} onClick={() => setLayout({ focus: 'monitoring' })}>Monitoring</button>
          <button role="tab" aria-pressed={focus === 'response'} onClick={() => setLayout({ focus: 'response' })}>Response</button>
        </div>
      )}
      <div className="col" style={monVisible ? { flex: both ? `0 0 ${(layout.splitX * 100).toFixed(2)}%` : 1, minWidth: 0 } : OFF} data-col="monitoring" aria-hidden={!monVisible || undefined}>
        <div className="col" style={showEq ? { flex: showLog ? `0 0 calc(${(layout.splitY * 100).toFixed(2)}% - ${GUTTER / 2}px)` : 1, minHeight: MIN_ROW } : OFF} aria-hidden={!showEq || undefined}><EquipmentWindow /></div>
        {showEq && showLog && <Divider orientation="horizontal" onDelta={onDeltaRow('splitY')} onReset={() => setLayout({ splitY: 0.55 })} label="Resize equipment and alert log" testId="divider-y" />}
        <div className="col" style={showLog ? { flex: 1, minHeight: MIN_ROW } : OFF} aria-hidden={!showLog || undefined}><AlertLog /></div>
      </div>
      {both && <Divider orientation="vertical" onDelta={onDeltaX} onReset={() => setLayout({ splitX: 0.56 })} label="Resize monitoring and response" testId="divider-x" />}
      <div className="col" style={resVisible ? { flex: 1, minWidth: 0 } : OFF} data-col="response" aria-hidden={!resVisible || undefined}>
        <div className="col" style={showResp ? { flex: showDoc ? `0 0 calc(${(layout.splitDoc * 100).toFixed(2)}% - ${GUTTER / 2}px)` : 1, minHeight: MIN_ROW } : OFF} aria-hidden={!showResp || undefined}><ResponseWindow /></div>
        {showResp && showDoc && <Divider orientation="horizontal" onDelta={onDeltaRow('splitDoc')} onReset={() => setLayout({ splitDoc: 0.45 })} label="Resize response and document" testId="divider-doc" />}
        {hasDoc && <div className="col" style={showDoc ? { flex: 1, minHeight: MIN_ROW } : OFF} aria-hidden={!showDoc || undefined}><DocumentWindow /></div>}
      </div>
      {allHidden && <PanelsRecovery />}
    </div>
  );
}
