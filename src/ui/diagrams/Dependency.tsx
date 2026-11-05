import { CONNECTION_LABEL, RELATION_LABEL, type Asset, type Connection } from '../../domain/types';
import { Node, SHEET_H, SHEET_W, type NodeState } from './Viewer';

const POS: Record<string, { x: number; y: number }> = {
  'AST-T-3201': { x: 120, y: 250 },
  'AST-P-3104A': { x: 420, y: 110 },
  'AST-P-3104B': { x: 420, y: 300 },
  'AST-AREA-31': { x: 420, y: 480 },
  'AST-PR-31': { x: 770, y: 300 },
  'AST-AREA-33': { x: 770, y: 480 },
};
const W = 140;
const H = 62;

/** Dependency view: what is on record about how items relate. No line here means current impact. */
export function DependencySheet({ assets, connections, node }: { assets: Asset[]; connections: Connection[]; node: (id: string) => NodeState }) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const edge = (c: Connection) => {
    const a = POS[c.from];
    const b = POS[c.to];
    if (!a || !b) return null;
    // Parallel edges between the same pair are offset so both stay readable.
    const dup = connections.filter((x) => (x.from === c.from && x.to === c.to) || (x.from === c.to && x.to === c.from));
    const idx = dup.indexOf(c);
    const off = dup.length > 1 ? (idx - (dup.length - 1) / 2) * 64 : 0;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * off;
    const ny = (dx / len) * off;
    const x1 = a.x + nx;
    const y1 = a.y + ny;
    const x2 = b.x + nx;
    const y2 = b.y + ny;
    // Shorten so the line stops at the box edge.
    const tx = x2 - (dx / len) * (W / 2 + 6);
    const ty = y2 - (dy / len) * (H / 2 + 6);
    const sx = x1 + (dx / len) * (W / 2 + 6);
    const sy = y1 + (dy / len) * (H / 2 + 6);
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    return (
      <g key={c.id} className={`dedge dedge-${c.connectionKind}`}>
        <line x1={sx} y1={sy} x2={tx} y2={ty} markerEnd={c.connectionKind === 'process' ? 'url(#dep-arrow)' : undefined} />
        <text x={mx} y={my - 6} textAnchor="middle" className="dedge-label">
          <tspan className="dedge-kind">{CONNECTION_LABEL[c.connectionKind]}</tspan>
          <tspan x={mx} dy={13}>
            {c.connectionKind === 'assessment' ? 'possible, not observed' : c.label.length > 34 ? `${c.label.slice(0, 32)}…` : c.label}
          </tspan>
        </text>
      </g>
    );
  };
  return (
    <>
      <defs>
        <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="dep-arrowhead" />
        </marker>
      </defs>
      <rect className="sheet-paper" x={0} y={0} width={SHEET_W} height={SHEET_H} />
      <text x={22} y={34} className="dnote dnote-strong">
        Dependency view · connections on record between identified items
      </text>
      <text x={22} y={52} className="dnote">
        A shared drawing or a listed dependency is not a statement that an item is affected now.
      </text>
      {connections.map(edge)}
      {Object.entries(POS).map(([id, p]) => {
        const a = byId.get(id);
        if (!a) return null;
        const st = node(id);
        return (
          <Node key={id} st={st} className="dep-node">
            <rect className="dnode-hit" x={p.x - W / 2 - 4} y={p.y - H / 2 - 4} width={W + 8} height={H + 8} />
            <rect className="dep-box" x={p.x - W / 2} y={p.y - H / 2} width={W} height={H} rx={a.assetType === 'area' ? 10 : 4} />
            <text x={p.x} y={p.y - 6} className="dtag" textAnchor="middle">
              {a.tag}
            </text>
            <text x={p.x} y={p.y + 12} className="dsub" textAnchor="middle">
              {a.relation === 'potentially-relevant' ? 'Potentially relevant' : RELATION_LABEL[a.relation]}
            </text>
          </Node>
        );
      })}
      <g className="dep-legend" transform={`translate(22 ${SHEET_H - 92})`}>
        <rect x={0} y={0} width={236} height={74} />
        <line x1={12} y1={18} x2={52} y2={18} className="dedge-line dedge-process" markerEnd="url(#dep-arrow)" />
        <text x={62} y={22} className="dsmall">
          {CONNECTION_LABEL.process}
        </text>
        <line x1={12} y1={40} x2={52} y2={40} className="dedge-line dedge-proximity" />
        <text x={62} y={44} className="dsmall">
          {CONNECTION_LABEL.proximity}
        </text>
        <line x1={12} y1={62} x2={52} y2={62} className="dedge-line dedge-assessment" />
        <text x={62} y={66} className="dsmall">
          {CONNECTION_LABEL.assessment}
        </text>
      </g>
      <text x={SHEET_W - 22} y={SHEET_H - 22} textAnchor="end" className="sheet-stamp">
        Illustrative. Positions are laid out for reading, not plant geometry.
      </text>
    </>
  );
}
