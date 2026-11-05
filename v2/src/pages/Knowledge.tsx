import { useMemo, useState } from 'react';
import { useDerived, type DocView } from '../lib/derive';
import { useStore, type ViewerTarget } from '../store';
import { Icon } from '../ui/Icon';
import { DocViewer } from '../viewer/DocViewer';

const TYPE_ORDER = ['Procedure', 'Operating limits', 'P&ID', 'Area layout', 'Dependency view', 'Past-incident report'] as const;

export function Knowledge() {
  const d = useDerived();
  const selectedId = useStore((s) => s.knowledgeDoc);
  const setKnowledgeDoc = useStore((s) => s.setKnowledgeDoc);
  const [q, setQ] = useState('');
  const [rev, setRev] = useState<string | null>(null);

  const docs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return d.docs.filter((x) => !needle || `${x.title} ${x.number} ${x.type} ${x.equipment.join(' ')} ${x.summary}`.toLowerCase().includes(needle));
  }, [d.docs, q]);
  const doc: DocView | undefined = d.docById.get(selectedId ?? '') ?? docs[0];
  const revision = doc?.revisions.find((r) => r.revision === rev) ?? doc?.current;
  const target: ViewerTarget | null = doc && revision ? { docId: doc.id, revision: revision.revision, page: 1, label: '', locate: 'page-only', origin: 'Knowledge' } : null;

  return (
    <div className="page" data-testid="page-knowledge">
      <div className="pane w-side">
        <div className="pane-h"><span className="title">Knowledge</span><span className="meta sidenote">{d.docs.length} documents</span></div>
        <div className="search"><Icon name="search" size={15} /><input className="input" placeholder="Search title, number, type, equipment" value={q} onChange={(e) => setQ(e.target.value)} data-testid="knowledge-search" /></div>
        <div className="pane-b">
          <div className="list">
            {TYPE_ORDER.map((type) => {
              const items = docs.filter((x) => x.type === type);
              if (!items.length) return null;
              return (
                <div key={type}>
                  <div className="group-h label">{type}</div>
                  {items.map((x) => (
                    <div key={x.id} className="li" role="button" tabIndex={0} aria-selected={doc?.id === x.id} onClick={() => { setKnowledgeDoc(x.id); setRev(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setKnowledgeDoc(x.id); setRev(null); } }} data-testid={`doc-${x.id}`}>
                      <div className="t"><span className="grow">{x.title}</span></div>
                      <div className="m"><span>{x.number}</span><span>Rev {x.current.revision}</span>{x.revisions.length > 1 && <span>{x.revisions.length} revisions</span>}{x.type === 'Past-incident report' && <span className="chip outline">Reference only</span>}</div>
                    </div>
                  ))}
                </div>
              );
            })}
            {docs.length === 0 && <div className="empty">No documents match</div>}
          </div>
        </div>
      </div>
      <div className="pane grow">
        {doc && revision && target ? (
          <>
            <div className="pane-h">
              <span className="title">Original document</span>
              <span className="sidenote">Linked: {doc.equipment.join(', ')}</span>
              <span className="spacer" />
              {doc.revisions.length > 1 && (
                <span className="seg" data-testid="rev-switch">
                  {doc.revisions.map((r) => <button key={r.revision} aria-pressed={revision.revision === r.revision} onClick={() => setRev(r.revision)}>Rev {r.revision} · {r.status}</button>)}
                </span>
              )}
            </div>
            <div className="pane-b" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <DocViewer key={`${doc.id}-${revision.revision}`} target={target} />
            </div>
          </>
        ) : <div className="empty">Select a document</div>}
      </div>
    </div>
  );
}
