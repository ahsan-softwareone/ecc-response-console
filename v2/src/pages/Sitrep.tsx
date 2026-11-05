import { useState } from 'react';
import { EMERGENCY_META, USER } from '../data/scenario';
import { useDerived } from '../lib/derive';
import { clock, dateTime, elapsedParts, pad2 } from '../lib/time';
import { useStore, type SitrepVersion } from '../store';
import { Icon } from '../ui/Icon';

type Fields = SitrepVersion['fields'];
const FIELD_LABELS: { k: keyof Fields; l: string }[] = [
  { k: 'situation', l: 'Situation' }, { k: 'actions', l: 'Actions taken' }, { k: 'decisions', l: 'Decisions' }, { k: 'resources', l: 'Resources' }, { k: 'next', l: 'Next update / outlook' },
];

interface Entry { id: string; kind: 'agent' | 'stored'; title: string; time: number; status: 'draft' | 'review' | 'approved'; fields: Fields; step: number; v?: SitrepVersion }

export function Sitrep() {
  const d = useDerived();
  const startedAt = useStore((s) => s.startedAt);
  const versions = useStore((s) => s.sitrepVersions);
  const { sitrepStartReview, sitrepEdit, sitrepApprove } = useStore.getState();
  const [sel, setSel] = useState<string | null>(null);
  const startReview = (fields: Fields, step: number) => { const id = `sr-${Date.now()}`; sitrepStartReview(fields, step, `${USER.name} · ${USER.role}`, id); setSel(id); };

  const agentDrafts: Entry[] = d.steps.filter((s) => s.sitrep).map((s): Entry => ({ id: `agent-${s.index}`, kind: 'agent', title: `Agent draft · step ${s.index}`, time: d.stepEnd(s.index), status: 'draft', fields: s.sitrep!, step: s.index })).filter((e) => e.time <= Date.now());
  const stored: Entry[] = versions.map((v) => ({ id: v.id, kind: 'stored', title: `SITREP ${v.number} · ${v.status === 'approved' ? 'approved' : 'in review'}`, time: v.createdAt, status: v.status, fields: v.fields, step: v.basedOnStep, v }));
  const entries = [...agentDrafts, ...stored].sort((a, b) => b.time - a.time);
  const cur = entries.find((e) => e.id === sel) ?? entries[0];

  const exportText = (e: Entry) => {
    const { h, m } = elapsedParts(e.time - startedAt);
    const lines = [`# SITREP — ${EMERGENCY_META.facility} · ${EMERGENCY_META.title}`, '', `Training scenario · illustrative data · ${e.title}`, `Issued ${dateTime(e.time)} · ${pad2(h)} h ${pad2(m)} m since emergency started`, e.v?.approvedBy ? `Approved by ${e.v.approvedBy} at ${clock(e.v.approvedAt!)}` : `Status: ${e.status}`, ''];
    for (const f of FIELD_LABELS) lines.push(`## ${f.l}`, e.fields[f.k], '');
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `SITREP-${e.title.replace(/[^a-z0-9]+/gi, '-')}.md`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page" data-testid="page-sitrep">
      <div className="pane w-side">
        <div className="pane-h"><span className="title">SITREP</span><span className="meta sidenote">{entries.length} versions</span></div>
        <div className="pane-b">
          <div className="list">
            {entries.map((e) => (
              <div key={e.id} className="li" role="button" tabIndex={0} aria-selected={cur?.id === e.id} onClick={() => setSel(e.id)} onKeyDown={(ev) => { if (ev.key === 'Enter') setSel(e.id); }} data-testid={`sitrep-${e.id}`}>
                <div className="t"><span className="grow">{e.title}</span><span className={`chip ${e.status === 'approved' ? 'soft' : 'outline'}`}>{e.status === 'approved' ? 'Approved' : e.status === 'review' ? 'In review' : 'Draft'}</span></div>
                <div className="m"><span className="num">{clock(e.time)}</span><span>{e.kind === 'agent' ? 'ECC agent' : e.v?.author}</span><span>based on step {e.step}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="pane grow">
        {cur && (
          <>
            <div className="pane-h">
              <span className="title">{cur.title}</span>
              <span className="spacer" />
              {cur.kind === 'agent' && <button className="btn" onClick={() => startReview(cur.fields, cur.step)} data-testid="sitrep-review">Start review from this draft</button>}
              {cur.kind === 'stored' && cur.status === 'review' && <button className="btn primary" onClick={() => sitrepApprove(cur.id, `${USER.name} · ${USER.role}`)} data-testid="sitrep-approve"><Icon name="check" size={14} /> Approve</button>}
              {cur.kind === 'stored' && cur.status === 'approved' && <button className="btn" onClick={() => exportText(cur)} data-testid="sitrep-export"><Icon name="download" size={14} /> Export</button>}
            </div>
            <div className="pane-b">
              <div className="detail">
                <div className="sidenote">{cur.v?.approvedBy ? `Approved by ${cur.v.approvedBy} · ${clock(cur.v.approvedAt!)} · frozen` : cur.status === 'review' ? 'Editable until approved' : 'Agent draft · start a review to edit'}</div>
                <div className="sitrep-grid">
                  {FIELD_LABELS.map((f) => (
                    <div key={f.k} className="sitrep-field">
                      <label className="label">{f.l}</label>
                      {cur.kind === 'stored' && cur.status === 'review' ? (
                        <textarea className="textarea" value={cur.fields[f.k]} onChange={(e) => sitrepEdit(cur.id, { [f.k]: e.target.value })} data-testid={`sitrep-field-${f.k}`} />
                      ) : <div className="ro">{cur.fields[f.k]}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
