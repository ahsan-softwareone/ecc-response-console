import { useStore } from '../store';
import { DocViewer } from '../viewer/DocViewer';
import { WindowFrame } from './WindowFrame';

/** Optional third docked window: the original document for the current investigation. */
export function DocumentWindow() {
  const viewer = useStore((s) => s.viewer);
  const closeViewer = useStore((s) => s.closeViewer);
  if (!viewer) return <WindowFrame id="document" title="Document"><div className="empty">No document open</div></WindowFrame>;
  return (
    <WindowFrame id="document" title="Document" meta={<span>from {viewer.origin}</span>}>
      <DocViewer target={viewer} onClose={closeViewer} closeTitle="Close document (keeps selection)" />
    </WindowFrame>
  );
}
