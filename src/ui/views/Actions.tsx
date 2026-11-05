import { useEffect } from 'react';
import { actionGroups } from '../../domain/brief';
import { useEcc } from '../../domain/store';
import { OUTCOME_LABEL, type Recommendation, type ResponseAction } from '../../domain/types';
import { useUi } from '../App';
import { ActionStatusTag } from '../components/ActionStatus';
import { ActionDetails, DecisionDetails, RecommendationDetails } from '../rail/Details';
import { fmt } from '../util';

type Item = { id: string; title: string; sub: string; kind: 'rec' | 'act'; status?: ResponseAction['status'] };

function Group({ title, items, selected, onSelect, empty }: { title: string; items: Item[]; selected?: string; onSelect: (id: string) => void; empty: string }) {
  return (
    <div className="act-group">
      <div className="act-group-title">
        {title} {items.length > 0 && <span className="count">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <p className="act-empty">{empty}</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" className={`act-row ${selected === it.id ? 'is-selected' : ''}`} aria-pressed={selected === it.id} onClick={() => onSelect(it.id)}>
                <span className="act-row-title">{it.title}</span>
                <span className="act-row-sub">{it.status ? <ActionStatusTag status={it.status} /> : it.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Recommendation, human decision and reported response, read as one thread. */
function Thread({ id }: { id: string }) {
  const { state } = useEcc();
  const rec = state.recommendations.find((r) => r.id === id);
  const act = state.actions.find((a) => a.id === id);
  const dec = rec?.decisionId ? state.decisions.find((d) => d.id === rec.decisionId) : act?.decisionId ? state.decisions.find((d) => d.id === act.decisionId) : undefined;
  const recOfAct = dec ? state.recommendations.find((r) => r.id === dec.recommendationId) : undefined;
  const theRec = rec ?? recOfAct;
  const theAct = act ?? (dec?.actionId ? state.actions.find((a) => a.id === dec.actionId) : undefined);
  if (!theRec && !theAct) return <p className="empty">This item is no longer on the record.</p>;
  return (
    <div className="thread">
      <section className="thread-step" aria-label="Recommendation">
        <div className="thread-k">1 · Recommendation</div>
        {theRec ? <RecommendationDetails rec={theRec} withForm={theRec.status !== 'decided'} /> : <p className="thread-none">No recommendation. {theAct?.title} was reported to the record by the people doing it, with no decision in ECC.</p>}
      </section>
      <section className="thread-step" aria-label="Decision">
        <div className="thread-k">2 · Human decision</div>
        {dec ? <DecisionDetails dec={dec} /> : theRec?.status === 'deferred' ? <p className="thread-none">Deferred. Still on the review list; a decision can be recorded above.</p> : theRec ? <p className="thread-none">No decision recorded yet. Use the form above.</p> : <p className="thread-none">No decision recorded in ECC for this response.</p>}
      </section>
      <section className="thread-step" aria-label="Response">
        <div className="thread-k">3 · Reported response</div>
        {theAct ? <ActionDetails act={theAct} /> : dec ? <p className="thread-none">{dec.outcome === 'defer' ? 'Nothing to track while deferred.' : `Nothing to track: the decision was "${OUTCOME_LABEL[dec.outcome]}".`}</p> : <p className="thread-none">Nothing to track until a decision is recorded.</p>}
      </section>
    </div>
  );
}

export function Actions() {
  const { state } = useEcc();
  const ui = useUi();
  const g = actionGroups(state);
  const selected = ui.ws.actions.selected;
  const select = (id: string) => ui.setWs({ actions: { selected: id } });

  const recItem = (r: Recommendation): Item => ({ id: r.id, title: r.shortTitle.charAt(0).toUpperCase() + r.shortTitle.slice(1), sub: r.status === 'deferred' ? `Deferred · surfaced ${fmt(r.surfacedAt)}` : `Surfaced ${fmt(r.surfacedAt)}`, kind: 'rec' });
  const actItem = (a: ResponseAction): Item => ({ id: a.id, title: a.title, sub: '', kind: 'act', status: a.status });
  const decidedItem = (r: Recommendation): Item => {
    const d = state.decisions.find((x) => x.id === r.decisionId);
    return { id: r.id, title: r.shortTitle.charAt(0).toUpperCase() + r.shortTitle.slice(1), sub: d ? `${OUTCOME_LABEL[d.outcome]} · ${d.recordedByRole} · ${fmt(d.at)}` : 'Decided', kind: 'rec' };
  };

  const all = [...g.needsDecision.map(recItem), ...g.underway.map(actItem), ...g.completionReported.map(actItem), ...g.completionVerified.map(actItem), ...g.decidedNoResponse.map(decidedItem)];
  const valid = all.some((i) => i.id === selected);
  const defaultId = all[0]?.id;
  useEffect(() => {
    if (!valid && defaultId) ui.setWs({ actions: { selected: defaultId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, defaultId]);

  return (
    <div className="actions">
      <aside className="actions-list" aria-label="Actions">
        <Group title="Needs decision" items={g.needsDecision.map(recItem)} selected={selected} onSelect={select} empty={state.preparing ? 'Recommendations appear when the brief is ready.' : 'Nothing waiting for a decision.'} />
        <Group title="Response underway" items={g.underway.map(actItem)} selected={selected} onSelect={select} empty="Nothing reported underway." />
        <Group title="Completion reported" items={g.completionReported.map(actItem)} selected={selected} onSelect={select} empty="Nothing awaiting confirmation." />
        <Group title="Verified" items={g.completionVerified.map(actItem)} selected={selected} onSelect={select} empty="No completion verified yet." />
        {g.decidedNoResponse.length > 0 && <Group title="Decided, nothing to track" items={g.decidedNoResponse.map(decidedItem)} selected={selected} onSelect={select} empty="" />}
      </aside>
      <section className="actions-detail" aria-label="Selected action">
        {selected && valid ? (
          <Thread key={selected} id={selected} />
        ) : (
          <div className="empty-block">
            <p className="empty-title">{all.length === 0 ? 'No actions yet' : 'Nothing selected'}</p>
            <p>{all.length === 0 ? 'Recommendations for review and reported responses appear here as the brief is prepared.' : 'Select an item to read its recommendation, the human decision and what the field has reported.'}</p>
          </div>
        )}
      </section>
    </div>
  );
}
