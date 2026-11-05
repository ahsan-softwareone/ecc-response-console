import { useEffect, useRef, useState } from 'react';
import { recordLabel, resolveRecord, suggestedQuestions } from '../../domain/content';
import { useEcc } from '../../domain/store';
import { useUi } from '../App';
import type { AnswerPart } from '../../domain/types';
import { RefList } from '../components/RefLink';
import { fmt } from '../util';

const PART_LABEL: Record<AnswerPart['kind'], string> = { fact: 'Fact', assessment: 'Agent assessment', gap: 'Not on record', note: 'Note' };

/** Deterministic mock. Answers come only from the incident record and cite it with meaningful labels. */
export function Assistant() {
  const { state, dispatch } = useEcc();
  const [q, setQ] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { ws } = useUi();
  // The open record comes first, then whatever is selected in the current workspace.
  const selected = state.view === 'assets' ? ws.assets.selected : state.view === 'actions' ? ws.actions.selected : state.view === 'knowledge' ? ws.knowledge.docId : undefined;
  const focus = state.rail.stack[state.rail.stack.length - 1] ?? selected;
  const focused = focus ? resolveRecord(state, focus) : undefined;
  const focusLabel = focused ? recordLabel(state, focus) : undefined;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [state.chat.length]);

  const ask = (question: string) => {
    if (!question.trim()) return;
    dispatch({ type: 'ASK', question, focus });
    setQ('');
  };

  return (
    <div className="assistant" role="tabpanel">
      <div className="assistant-focus">
        <span className="focus-chip">
          <span className="muted">About</span>
          <span>{focusLabel ?? 'the whole incident'}</span>
        </span>
        <span>Answers come only from this incident's record.</span>
      </div>
      <div className="assistant-log" aria-live="polite">
        {state.chat.length === 0 && <p className="assistant-intro">Ask about reports, equipment, decisions and what remains unknown. Nothing is estimated; when the record cannot answer, it says so.</p>}
        {state.chat.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <div className="msg-meta t-num">
              {m.role === 'user' ? 'You' : 'Assistant'} · {fmt(m.at)}
              {m.contextLabel && ` · about ${m.contextLabel}`}
            </div>
            {m.text && <p className="msg-text">{m.text}</p>}
            {m.parts && (
              <ol className="msg-parts">
                {m.parts.map((p, i) => (
                  <li key={i} className={`part part-${p.kind}`}>
                    <span className="part-kind">{PART_LABEL[p.kind]}</span>
                    <span className="part-text">{p.text}</span>
                    {p.refs.length > 0 && (
                      <span className="part-refs">
                        <RefList ids={p.refs} label="" />
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="assistant-input">
        <div className="suggested" role="group" aria-label="Suggested questions">
          {suggestedQuestions(state, focus).map((s) => (
            <button key={s} type="button" className="chip" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <label htmlFor="ask-input" className="sr-only">
            Ask a question
          </label>
          <input id="ask-input" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the record" autoComplete="off" />
          <button type="submit" className="btn btn-primary">
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
