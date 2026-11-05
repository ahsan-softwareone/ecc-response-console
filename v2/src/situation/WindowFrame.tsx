import type { ReactNode } from 'react';
import { useStore, type WindowId } from '../store';
import { IconButton } from '../ui/ui';

export function WindowFrame({ id, title, meta, actions, children, headExtra }: { id: WindowId; title: ReactNode; meta?: ReactNode; actions?: ReactNode; headExtra?: ReactNode; children: ReactNode }) {
  const maximized = useStore((s) => s.layout.maximized);
  const maximize = useStore((s) => s.maximize);
  const isMax = maximized === id;
  return (
    <section className="win" data-window={id} aria-label={typeof title === 'string' ? title : id}>
      <header className="win-h">
        <span className="title">{title}</span>
        {meta && <span className="meta">{meta}</span>}
        {headExtra}
        <span className="spacer" />
        <div className="actions">
          {actions}
          <IconButton className="sm" name={isMax ? 'restore' : 'max'} title={isMax ? 'Restore layout' : 'Maximize window'} onClick={() => maximize(isMax ? null : id)} />
        </div>
      </header>
      <div className="win-b">{children}</div>
    </section>
  );
}
