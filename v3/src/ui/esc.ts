// Escape dismisses only the top temporary view: popovers, dialogs, drawers and overlays
// register here in the order they open, and one key press closes one layer.
import { useEffect, useRef } from 'react';

const stack: { current: () => void }[] = [];
let installed = false;
function install() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !stack.length) return;
    e.preventDefault(); e.stopPropagation();
    stack[stack.length - 1].current();
  }, true);
}
export function useEscape(active: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    install();
    stack.push(ref);
    return () => { const i = stack.indexOf(ref); if (i >= 0) stack.splice(i, 1); };
  }, [active]);
}
