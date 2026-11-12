import type { ReactNode } from 'react';
import { useStore, type WindowId } from '../store';
import { IconButton } from '../ui/ui';

export function WindowFrame({ id, title, meta, actions, children, headExtra, bare }: { id: WindowId; title: ReactNode; meta?: ReactNode; actions?: ReactNode; headExtra?: ReactNode; children: ReactNode; /** Embedded in a layout that has its own controls: no maximize or hide. */ bare?: boolean }) {
  const maximized = useStore((s) => s.layout.maximized);
  const maximize = useStore((s) => s.maximize);
  const hidePanel = useStore((s) => s.hidePanel);
  const isMax = maximized === id;
  return (
    <section className="win" data-window={id} data-panel={`situation.${id}`} aria-label={typeof title === 'string' ? title : id}>
      <header className="win-h">
        <span className="title">{title}</span>
        {meta && <span className="meta">{meta}</span>}
        {headExtra}
        <span className="spacer" />
        <div className="actions">
          {actions}
          {!bare && <><IconButton className="sm" name={isMax ? 'restore' : 'max'} title={isMax ? 'Restore layout' : 'Maximize panel'} onClick={() => maximize(isMax ? null : id)} testId={`max-win-${id}`} />
          <IconButton className="sm" name="hide" title="Hide panel" onClick={() => hidePanel(`situation.${id}`)} testId={`hide-win-${id}`} /></>}
        </div>
      </header>
      <div className="win-b">{children}</div>
    </section>
  );
}
