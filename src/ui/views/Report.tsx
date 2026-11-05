import { Check, Copy, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { composeSitrep, sitrepPlainText } from '../../domain/content';
import { INCIDENT, RECORDERS } from '../../domain/scenario';
import { useEcc } from '../../domain/store';
import type { DraftSection, EccState, LogEntry } from '../../domain/types';
import { RefLink } from '../components/RefLink';
import { fmt, plural, RAIL_DRAFT_PREFIX } from '../util';

/** Material record entries that arrived after the draft was composed. */
export function draftUpdates(s: EccState): LogEntry[] {
  if (!s.draft) return [];
  const since = s.draft.basedOnSeq;
  return s.log.filter((l) => l.material && l.seq > since);
}

function GrowTextarea({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea id={id} ref={ref} className="draft-text" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} rows={1} />;
}

function SectionEditor({ sec }: { sec: DraftSection }) {
  const { dispatch } = useEcc();
  const edited = sec.text !== sec.baseText;
  return (
    <div className={`draft-section ${sec.incomingText ? 'has-incoming' : ''}`}>
      <div className="draft-section-head">
        <label htmlFor={`sec-${sec.id}`} className="draft-section-title">
          {sec.title}
        </label>
        <span className="draft-marks">
          {edited && <span className="draft-mark">Edited by you</span>}
          {sec.changedInLastRefresh && <span className="draft-mark draft-mark-new">Updated in last refresh</span>}
          {sec.incomingText && <span className="draft-mark draft-mark-new">New agent text to review</span>}
        </span>
      </div>
      {sec.incomingText ? (
        <div className="draft-compare">
          <div className="draft-compare-col">
            <div className="draft-compare-k">Your text (kept)</div>
            <GrowTextarea id={`sec-${sec.id}`} value={sec.text} label={`${sec.title}, your text`} onChange={(v) => dispatch({ type: 'EDIT_SECTION', id: sec.id, text: v })} />
            <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'RESOLVE_SECTION', id: sec.id, choice: 'keep-mine' })}>
              Keep mine
            </button>
          </div>
          <div className="draft-compare-col">
            <div className="draft-compare-k">New agent text</div>
            <pre className="draft-incoming">{sec.incomingText}</pre>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'RESOLVE_SECTION', id: sec.id, choice: 'use-new' })}>
              Use new text
            </button>
          </div>
        </div>
      ) : (
        <GrowTextarea id={`sec-${sec.id}`} value={sec.text} label={sec.title} onChange={(v) => dispatch({ type: 'EDIT_SECTION', id: sec.id, text: v })} />
      )}
    </div>
  );
}

function EmptyReport() {
  const { state, dispatch } = useEcc();
  const sections = composeSitrep(state);
  const openIssues = state.issues.filter((i) => i.status !== 'answered').length;
  return (
    <div className="report-empty">
      <div className="report-empty-main">
        <FileText size={28} aria-hidden="true" className="report-empty-icon" />
        <h2>No situation report drafted</h2>
        <p>A draft composed now would carry information as of {fmt(state.now)}, in the words the record uses, including what is unknown. Every section can be edited before anyone else sees it.</p>
        {state.preparing && <p className="note-prep">The brief is still being prepared. A draft made now is based on what is known so far and can be refreshed later.</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'GENERATE_DRAFT' })} data-autofocus>
            Generate draft as of {fmt(state.now)}
          </button>
          <span className="form-note">Nothing is sent from this prototype.</span>
        </div>
      </div>
      <div className="report-empty-side">
        <div className="field-label">The draft will contain</div>
        <ol className="report-outline">
          {sections.map((s) => (
            <li key={s.id}>
              <span className="report-outline-title">{s.title}</span>
              <span className="report-outline-preview">{s.text.split('\n')[0]}</span>
            </li>
          ))}
        </ol>
        <p className="muted small">
          {plural(state.decisions.length, 'decision')} · {plural(state.actions.length, 'response item')} · {plural(openIssues, 'open question')}
        </p>
      </div>
    </div>
  );
}

export function Report() {
  const { state, dispatch } = useEcc();
  const d = state.draft;
  const [byId, setById] = useState(RECORDERS[0].id);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (copied === 'idle') return;
    const t = setTimeout(() => setCopied('idle'), 4000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const text = sitrepPlainText(state);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      setCopied('failed');
      requestAnimationFrame(() => fallbackRef.current?.select());
    }
  };

  if (!d) {
    return (
      <div className="page">
        <EmptyReport />
      </div>
    );
  }

  const updates = draftUpdates(state);
  const openIssues = state.issues.filter((i) => i.status !== 'answered');
  const toReview = state.recommendations.filter((r) => r.status === 'awaiting-review' || r.status === 'deferred');
  const editedSinceReview = d.reviewed === undefined && d.history.length > 0;
  const pending = d.sections.filter((s) => s.incomingText).length;

  return (
    <div className="report-layout">
      <div className="report-doc">
        <div className="report-doc-head">
          <div className="report-kicker">Situation report · Fictional training data</div>
          <h2 className="report-title">
            {INCIDENT.id}: {INCIDENT.title}
          </h2>
          <div className="report-sub">
            {INCIDENT.facility}, {INCIDENT.area}
          </div>
        </div>
        <div className="report-status">
          <span className="tag">Draft {d.version}</span>
          <span className="t-num">Information as of {fmt(d.asOf)}</span>
          {d.reviewed ? (
            <span className="report-reviewed">
              <Check size={13} aria-hidden="true" /> Reviewed by {d.reviewed.by} at {fmt(d.reviewed.at)}
            </span>
          ) : (
            <span className="tag tag-draft">Not marked reviewed</span>
          )}
          {pending > 0 && <span className="tag tag-caution">{plural(pending, 'section')} with new text to review</span>}
        </div>

        <div className={`draft-notice ${updates.length ? 'is-stale' : ''}`} role="status">
          {updates.length === 0 ? (
            <span className="draft-notice-text">No material updates since this draft.</span>
          ) : (
            <>
              <span className="draft-notice-text">
                Newer information: {plural(updates.length, 'material update')} since {fmt(d.asOf)}. Refreshing keeps your edits and shows new agent text beside them.
              </span>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'REFRESH_DRAFT' })}>
                <RefreshCw size={13} aria-hidden="true" />
                Refresh draft to {fmt(state.now)}
              </button>
            </>
          )}
        </div>

        {d.sections.map((sec) => (
          <SectionEditor key={sec.id} sec={sec} />
        ))}

        <div className="report-foot">
          <div className="report-foot-row">
            <label className="inline-field">
              <span>Reviewed by</span>
              <select value={byId} onChange={(e) => setById(e.target.value)}>
                {RECORDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.role}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'MARK_DRAFT_REVIEWED', byId })} disabled={!!d.reviewed}>
              {d.reviewed ? 'Marked reviewed' : 'Mark reviewed'}
            </button>
            <button type="button" className="btn" onClick={copy}>
              <Copy size={13} aria-hidden="true" />
              Copy text
            </button>
            <span className="copy-feedback" role="status">
              {copied === 'done' && 'Copied to the clipboard.'}
              {copied === 'failed' && 'Clipboard not available. The text is selected below.'}
            </span>
          </div>
          <p className="muted small">
            Marking reviewed records who looked at this draft and when; an edit clears it. Nothing is sent from this prototype.
            {editedSinceReview && ' This draft replaced an earlier version; the earlier review does not carry over.'}
          </p>
          {copied === 'failed' && <textarea ref={fallbackRef} className="copy-fallback" readOnly value={sitrepPlainText(state)} aria-label="Report text for manual copy" />}
        </div>
      </div>

      <aside className="report-aside" aria-label="Draft context">
        <section>
          <div className="field-label">Newer information</div>
          {updates.length === 0 ? (
            <p className="muted small">None since this draft.</p>
          ) : (
            <ul className="plain-list">
              {updates.map((u) => (
                <li key={u.seq}>
                  <span className="mono muted">{fmt(u.at)}</span> {u.ref ? <RefLink id={u.ref} label={u.title} className="ref-plain" /> : u.title}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <div className="field-label">Versions</div>
          <ul className="plain-list version-list">
            <li className="version-row is-current">
              <span>
                Draft {d.version} · as of {fmt(d.asOf)}
              </span>
              <span className="muted small">Current</span>
            </li>
            {d.history
              .slice()
              .reverse()
              .map((h) => (
                <li key={h.version} className="version-row">
                  <span>
                    Draft {h.version} · as of {fmt(h.asOf)} · {h.reviewed ? `reviewed by ${h.reviewed.by}` : 'not reviewed'}
                  </span>
                  <button type="button" className="link-btn" onClick={() => dispatch({ type: 'OPEN_RECORD', id: `${RAIL_DRAFT_PREFIX}${h.version}` })}>
                    View
                  </button>
                </li>
              ))}
          </ul>
        </section>
        <section>
          <div className="field-label">Open while drafting</div>
          {openIssues.length === 0 && toReview.length === 0 ? (
            <p className="muted small">Nothing open.</p>
          ) : (
            <ul className="plain-list aside-list">
              {toReview.map((r) => (
                <li key={r.id}>
                  <span className="aside-k">Awaiting review</span>
                  <RefLink id={r.id} label={r.title} className="ref-plain" />
                </li>
              ))}
              {openIssues.map((i) => (
                <li key={i.id}>
                  <span className="aside-k">{i.type === 'conflict' ? 'Conflict' : i.type === 'missing' ? 'Gap' : i.type === 'stale' ? 'Out of date' : 'Unavailable'}</span>
                  <RefLink id={i.id} label={i.title} className="ref-plain" />
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="muted small">No distribution exists in this prototype. Nothing is sent.</p>
      </aside>
    </div>
  );
}
