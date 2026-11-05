import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { EquipmentWindow } from './EquipmentWindow';
import { AlertLog } from './AlertLog';
import { ResponseWindow } from './ResponseWindow';
import { DocumentWindow } from './DocumentWindow';

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
  const focus = fitsBoth ? null : (layout.focus ?? 'monitoring');

  // Divider dragging
  const startDrag = useCallback((kind: 'x' | 'y' | 'doc') => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    setDrag(kind);
    const move = (ev: PointerEvent) => {
      const s = useStore.getState().layout;
      if (kind === 'x') {
        const usable = rect.width - GUTTER * 2 - GUTTER;
        let monPx = s.monitoringSide === 'left' ? ev.clientX - rect.left - GUTTER - GUTTER / 2 : rect.right - GUTTER - ev.clientX - GUTTER / 2;
        monPx = Math.max(MIN_MONITORING, Math.min(usable - MIN_RESPONSE, monPx));
        setLayout({ splitX: monPx / usable });
      } else if (kind === 'y') {
        const usable = rect.height - GUTTER * 2 - GUTTER;
        let top = ev.clientY - rect.top - GUTTER - GUTTER / 2;
        top = Math.max(MIN_ROW, Math.min(usable - MIN_ROW, top));
        setLayout({ splitY: top / usable });
      } else {
        const usable = rect.height - GUTTER * 2 - GUTTER;
        let top = ev.clientY - rect.top - GUTTER - GUTTER / 2;
        top = Math.max(MIN_ROW, Math.min(usable - MIN_ROW, top));
        setLayout({ splitDoc: top / usable });
      }
    };
    const up = () => { setDrag(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [setLayout]);

  const monitoring = (
    <div className="col" style={{ flex: focus ? 1 : `0 0 ${(layout.splitX * 100).toFixed(2)}%`, minWidth: 0 }} data-col="monitoring">
      <div className="col" style={{ flex: `0 0 calc(${(layout.splitY * 100).toFixed(2)}% - ${GUTTER / 2}px)`, minHeight: MIN_ROW }}><EquipmentWindow /></div>
      <div className={`divider-y ${drag === 'y' ? 'active' : ''}`} onPointerDown={startDrag('y')} role="separator" aria-orientation="horizontal" aria-label="Resize equipment and alert log" data-testid="divider-y" />
      <div className="col" style={{ flex: 1, minHeight: MIN_ROW }}><AlertLog /></div>
    </div>
  );
  const response = (
    <div className="col" style={{ flex: 1, minWidth: 0 }} data-col="response">
      {viewer ? (
        <>
          <div className="col" style={{ flex: `0 0 calc(${(layout.splitDoc * 100).toFixed(2)}% - ${GUTTER / 2}px)`, minHeight: MIN_ROW }}><ResponseWindow /></div>
          <div className={`divider-y ${drag === 'doc' ? 'active' : ''}`} onPointerDown={startDrag('doc')} role="separator" aria-orientation="horizontal" aria-label="Resize response and document" data-testid="divider-doc" />
          <div className="col" style={{ flex: 1, minHeight: MIN_ROW }}><DocumentWindow /></div>
        </>
      ) : <ResponseWindow />}
    </div>
  );

  let body: ReactNode;
  const max = layout.maximized;
  if (max) {
    body = <div className="col" style={{ flex: 1 }}>{max === 'equipment' ? <EquipmentWindow /> : max === 'log' ? <AlertLog /> : max === 'response' ? <ResponseWindow /> : <DocumentWindow />}</div>;
  } else if (focus) {
    body = (
      <div className="col" style={{ flex: 1, gap: 10 }}>
        <div className="focusbar" role="tablist" aria-label="Focus mode">
          <button role="tab" aria-pressed={focus === 'monitoring'} onClick={() => setLayout({ focus: 'monitoring' })}>Monitoring</button>
          <button role="tab" aria-pressed={focus === 'response'} onClick={() => setLayout({ focus: 'response' })}>Response</button>
        </div>
        {focus === 'monitoring' ? monitoring : response}
      </div>
    );
  } else {
    const divider = <div className={`divider-x ${drag === 'x' ? 'active' : ''}`} onPointerDown={startDrag('x')} role="separator" aria-orientation="vertical" aria-label="Resize monitoring and response" data-testid="divider-x" />;
    body = layout.monitoringSide === 'left' ? <>{monitoring}{divider}{response}</> : <>{response}{divider}{monitoring}</>;
  }

  return (
    <div ref={ref} className={`dock ${drag === 'x' ? 'dragging' : drag ? 'dragging-y' : ''}`} data-testid="dock" data-focus={focus ?? ''} data-maximized={max ?? ''}>
      {body}
    </div>
  );
}
