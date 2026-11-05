import { Dialog } from '../components/Dialog';
import { SourceViewer } from './SourceViewer';

/** Focused full-area investigation of one original. Closing restores the view and focus beneath it. */
export function ExpandedViewer({ id, rev, onClose }: { id: string; rev?: string; onClose: () => void }) {
  return (
    <Dialog title="Original source" onClose={onClose} variant="full" className="viewer-dialog" labelledBy="viewer-title">
      <SourceViewer id={id} rev={rev} mode="expanded" onLeave={onClose} />
    </Dialog>
  );
}
