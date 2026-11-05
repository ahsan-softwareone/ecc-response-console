import { ArrowUpRight, Search, X } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import { useState } from 'react';
import { documentUse, visibleConnections } from '../../domain/brief';
import { SHEET_REGIONS } from '../../domain/catalog';
import { recordLabel } from '../../domain/content';
import { useEcc } from '../../domain/store';
import { CONNECTION_LABEL, RELATION_LABEL, type Asset, type AssetRelation, type Connection, type DiagramView, type SourceLocation } from '../../domain/types';
import { useUi } from '../App';
import { RefChips } from '../components/Chips';
import { Tabs } from '../components/Tabs';
import { TrustMark } from '../components/TrustTag';
import { DependencySheet } from '../diagrams/Dependency';
import { Viewer, type NodeState } from '../diagrams/Viewer';
import { AssetDetail } from '../rail/Details';
import type { SheetRegion } from '../viewer/PdfViewer';
import { fmt } from '../util';

const PdfViewer = lazy(() => import('../viewer/PdfViewer'));

const GROUPS: AssetRelation[] = ['verified-involved', 'reported-involved', 'potentially-relevant', 'context'];

const SHEETS: Record<DiagramView, { label: string; docId?: string; number: string; rev: string; caption: string }> = {
  pid: { label: 'P&ID', docId: 'KD-PID31', number: 'PID-31-02', rev: 'Rev B', caption: 'Illustrative P&ID, not a validated engineering drawing. Line connections were extracted automatically and have not been engineer-checked.' },
  layout: { label: 'Area layout', docId: 'KD-LAY31', number: 'PLT-31-02', rev: 'Rev A', caption: 'Illustrative plot plan, not a validated engineering drawing. Distances are not to scale.' },
  dependency: { label: 'Dependency', number: 'Connections on record', rev: '', caption: 'Connections the agent has on record. A connection, a shared skid or a shared drawing does not establish current impact.' },
};

function Navigator({ assets, selected, onSelect }: { assets: Asset[]; selected?: string; onSelect: (id: string) => void }) {
  const { state } = useEcc();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const matches = (a: Asset) => !needle || a.tag.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) || a.area.toLowerCase().includes(needle);
  const filtered = assets.filter(matches);
  return (
    <div className="asset-nav">
      <label className="search">
        <Search size={14} aria-hidden="true" />
        <span className="sr-only">Search equipment and areas</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tag, name or area" />
      </label>
      {assets.length === 0 && <p className="empty">Identifying equipment and area from the initial report.</p>}
      {assets.length > 0 && filtered.length === 0 && <p className="empty">Nothing matches “{q}”.</p>}
      {GROUPS.map((g) => {
        const items = filtered.filter((a) => a.relation === g);
        if (items.length === 0) return null;
        return (
          <div key={g} className="asset-group">
            <div className="asset-group-title">
              {RELATION_LABEL[g]} <span className="count">{items.length}</span>
            </div>
            <ul>
              {items.map((a) => (
                <li key={a.id}>
                  <button type="button" className={`asset-row rel-${a.relation} ${selected === a.id ? 'is-selected' : ''}`} aria-pressed={selected === a.id} onClick={() => onSelect(a.id)}>
                    <span className="asset-tag">{a.tag}</span>
                    <span className="asset-name">{a.name}</span>
                    <span className="asset-cond">
                      <TrustMark trust={a.condition.trust} />
                      <span className="t-num muted">{fmt(a.condition.at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {state.preparing && assets.length > 0 && <p className="muted small">Still identifying. More items may appear as records are retrieved.</p>}
    </div>
  );
}

/** What the current sheet has to do with this incident: who cites it, and what is drawn on it. */
function OnSheet({ view, identified, connections, select, selected }: { view: DiagramView; identified: Asset[]; connections: Connection[]; select: (id: string) => void; selected?: string }) {
  const { state } = useEcc();
  const sheet = SHEETS[view];
  const doc = sheet.docId ? state.knowledge.find((d) => d.id === sheet.docId) : undefined;
  const use = doc ? documentUse(state, doc) : [];
  const drawn = doc ? identified.filter((a) => doc.equipment.includes(a.tag) || (a.assetType === 'area' && doc.area.includes(a.tag))) : identified;
  if (view === 'dependency') {
    return (
      <section className="on-sheet" aria-labelledby="os-title">
        <h3 id="os-title">Connections on record</h3>
        {connections.length === 0 ? (
          <p className="muted small">None yet between identified items.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Kind</th>
                  <th>What the record says</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button type="button" className="tag-btn" onClick={() => select(c.from)}>
                        {recordLabel(state, c.from)}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="tag-btn" onClick={() => select(c.to)}>
                        {recordLabel(state, c.to)}
                      </button>
                    </td>
                    <td>{CONNECTION_LABEL[c.connectionKind]}</td>
                    <td className="wrap-normal">
                      <div>{c.label}</div>
                      <RefChips ids={c.provenance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="on-sheet" aria-labelledby="os-title">
      <h3 id="os-title">On this sheet</h3>
      <div className="on-sheet-tags">
        <span className="muted small">Identified in this incident:</span>
        {drawn.length === 0 ? (
          <span className="muted small">nothing yet</span>
        ) : (
          drawn.map((a) => (
            <button key={a.id} type="button" className={`tag-btn ${selected === a.id ? 'is-on' : ''}`} aria-pressed={selected === a.id} onClick={() => select(a.id)}>
              {a.tag}
            </button>
          ))
        )}
      </div>
      {use.length === 0 ? (
        <p className="muted small">No finding in this incident cites this sheet yet.</p>
      ) : (
        <ul className="use-list">
          {use.map((u) => (
            <li key={u.citation.id}>
              <div className="use-head">
                <RefChips ids={[u.citation.id]} />
              </div>
              <div className="use-supports">{u.citation.supports}</div>
              <div className="use-entries">
                <span className="fe-k">Cited by</span>
                <RefChips ids={u.entries.map((e) => e.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Assets() {
  const { state } = useEcc();
  const ui = useUi();
  const { selected, view, highlight } = ui.ws.assets;
  const identified = state.assets.filter((a) => a.identified);
  const sel = identified.find((a) => a.id === selected);
  const connections = visibleConnections(state);
  const setView = (v: DiagramView) => ui.setWs({ assets: { ...ui.ws.assets, view: v } });
  const select = (id: string) => ui.setWs({ assets: { ...ui.ws.assets, selected: id } });
  const clearHighlight = () => ui.setWs({ assets: { ...ui.ws.assets, highlight: [] } });

  const node = useMemo(
    () =>
      (id: string): NodeState => {
        const a = state.assets.find((x) => x.id === id);
        return {
          selected: selected === id,
          highlighted: !!a && highlight.includes(a.tag),
          identified: !!a?.identified,
          relation: a?.identified ? a.relation : undefined,
          label: a ? `${a.tag}, ${a.name}, ${a.identified ? RELATION_LABEL[a.relation] : 'not identified in this incident'}` : id,
          onSelect: () => {
            if (a?.identified) select(id);
          },
        };
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.assets, selected, highlight],
  );

  const sheet = SHEETS[view];
  const doc = sheet.docId ? state.knowledge.find((d) => d.id === sheet.docId) : undefined;
  const rev = doc?.revisions.find((r) => r.sheet === view);
  // Regions on the real sheet: every item is selectable once the agent has identified it.
  const regions: SheetRegion[] = view === 'dependency' ? [] : SHEET_REGIONS[view].map((r) => {
    const a = state.assets.find((x) => x.id === r.assetId);
    return { tag: r.tag, assetId: r.assetId, box: r.box, identified: !!a?.identified, label: a ? `${a.tag}, ${a.name}, ${a.identified ? RELATION_LABEL[a.relation] : 'not identified in this incident'}` : r.tag };
  });
  const cited: SourceLocation | undefined = view !== 'dependency' && highlight.length ? { type: 'region', page: 1, regions: SHEET_REGIONS[view].filter((r) => highlight.includes(r.tag)).map(({ tag, box }) => ({ tag, box })) } : undefined;

  return (
    <div className="assets">
      <aside className="assets-nav" aria-label="Equipment and areas">
        <Navigator assets={identified} selected={selected} onSelect={select} />
      </aside>
      <section className="assets-work" aria-label="Engineering workspace">
        <Tabs
          tabs={[
            { id: 'pid', label: 'P&ID' },
            { id: 'layout', label: 'Area layout' },
            { id: 'dependency', label: 'Dependency' },
          ]}
          active={view}
          onChange={setView}
          label="Engineering views"
          aside={
            <span className="sheet-id">
              <span className="mono">{sheet.number}</span> {sheet.rev && <span className="tag">{sheet.rev}</span>}
              {sheet.docId && rev?.file && (
                <button type="button" className="link-btn" onClick={() => ui.openSource(sheet.docId!, rev.rev)}>
                  Expand sheet <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              )}
              {sheet.docId && (
                <button type="button" className="link-btn" onClick={() => ui.openKnowledge(sheet.docId)}>
                  Open in Knowledge <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              )}
            </span>
          }
        />
        {highlight.length > 0 && view !== 'dependency' && (
          <div className="highlight-bar" role="status">
            <span>
              Cited region:{' '}
              {highlight.map((t) => (
                <span key={t} className="tag tag-mono">
                  {t}
                </span>
              ))}
            </span>
            <button type="button" className="btn btn-sm btn-quiet" onClick={clearHighlight}>
              <X size={13} aria-hidden="true" /> Clear
            </button>
          </div>
        )}
        {view === 'dependency' ? (
          <Viewer key={view} label={`${sheet.label} sheet ${sheet.number}`} caption={<span>{sheet.caption}</span>}>
            <DependencySheet assets={identified} connections={connections} node={node} />
          </Viewer>
        ) : rev?.file ? (
          <div className="sheet-viewer">
            <Suspense fallback={<p className="pv-msg">Loading the sheet viewer…</p>}>
              <PdfViewer key={view} file={rev.file} page={1} location={cited} regions={regions} selectedTag={sel?.tag} onSelectRegion={(r) => r.assetId && state.assets.find((x) => x.id === r.assetId)?.identified && select(r.assetId)} mode="panel" pageNoun="sheet" quietWithoutLocation />
            </Suspense>
            <p className="viewer-caption">
              {sheet.caption} Equipment boxes are selection targets added by ECC; they are not part of the drawing.
              {identified.length < state.assets.length && ' Items not yet identified by the agent are shown without a box.'}
            </p>
          </div>
        ) : (
          <p className="empty">No sheet file is held for this drawing.</p>
        )}
        <OnSheet view={view} identified={identified} connections={connections} select={select} selected={selected} />
      </section>
      <aside className="assets-detail" aria-label="Selected item">
        {sel ? (
          <AssetDetail key={sel.id} a={sel} />
        ) : (
          <div className="empty-block">
            <p className="empty-title">No item selected</p>
            <p>Select equipment or an area from the list or on a sheet to see why it is listed, its reported condition, connections and linked records.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
