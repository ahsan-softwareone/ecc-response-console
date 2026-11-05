import { ArrowUp, Check, Circle, CircleDot, Pause, Play, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { catchUp, feedEntries } from '../../domain/brief';
import { useEcc } from '../../domain/store';
import type { PrepStep } from '../../domain/types';
import { useUi } from '../App';
import { fmt, plural } from '../util';
import { FeedEntryCard } from './FeedEntry';

function StepGlyph({ status }: { status: PrepStep['status'] }) {
  if (status === 'done') return <Check size={13} aria-hidden="true" className="step-glyph step-done" />;
  if (status === 'attention') return <TriangleAlert size={13} aria-hidden="true" className="step-glyph step-attention" />;
  if (status === 'active') return <CircleDot size={13} aria-hidden="true" className="step-glyph step-active" />;
  return <Circle size={13} aria-hidden="true" className="step-glyph step-pending" />;
}

/**
 * The incident feed. Entries arrive as whole items. Nothing moves while someone is reading:
 * arrivals are held unless the reader is following at the top of the list. Pausing the feed
 * holds entries here only; the agent and the training simulation carry on regardless.
 */
export function Feed() {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const all = feedEntries(state);
  const shown = all.filter((e) => e.seq <= state.feedShownSeq);
  const held = all.filter((e) => e.seq > state.feedShownSeq);
  const [following, setFollowing] = useState(true);
  const [atTop, setAtTop] = useState(true);
  const [mode, setMode] = useState<'all' | 'catchup'>('all');
  const [announce, setAnnounce] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const cu = catchUp(state);

  // Following at the top: new entries appear as they arrive. Otherwise they are held.
  const heldCount = held.length;
  const newestHeldTitle = held[0]?.title;
  useEffect(() => {
    if (heldCount === 0) return;
    if (following && atTop && mode === 'all') {
      dispatch({ type: 'SHOW_NEW_FEED' });
      if (ui.settings.announceUpdates) setAnnounce(heldCount === 1 ? `New update: ${newestHeldTitle}` : `${heldCount} new updates`);
    } else if (ui.settings.announceUpdates) {
      setAnnounce(`${plural(heldCount, 'new update')} held`);
    }
  }, [heldCount, newestHeldTitle, following, atTop, mode, dispatch, ui.settings.announceUpdates]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtTop(el.scrollTop < 24);
  };
  const showHeld = () => {
    dispatch({ type: 'SHOW_NEW_FEED' });
    scrollRef.current?.scrollTo({ top: 0 });
    setAtTop(true);
  };

  const list = mode === 'catchup' ? cu.entries.filter((e) => e.seq <= state.feedShownSeq) : shown;

  return (
    <section className="feed" aria-labelledby="feed-title">
      <div className="feed-head">
        <div className="feed-title-row">
          <h2 id="feed-title">Incident feed</h2>
          <div className="feed-controls">
            <button type="button" className={`btn btn-sm ${following ? '' : 'is-paused'}`} aria-pressed={!following} onClick={() => setFollowing((f) => !f)} title={following ? 'Hold new entries here until you resume' : 'Show new entries as they arrive'}>
              {following ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
              {following ? 'Pause following' : 'Resume following'}
            </button>
            <button type="button" className={`btn btn-sm ${mode === 'catchup' ? 'is-on' : ''}`} aria-pressed={mode === 'catchup'} onClick={() => setMode((m) => (m === 'catchup' ? 'all' : 'catchup'))}>
              Since you last reviewed
            </button>
          </div>
        </div>
        <div className={`agent-now ${state.preparing ? 'is-preparing' : ''}`}>
          <span className="agent-pulse" aria-hidden="true" />
          <span className="agent-now-text">
            <span className="agent-now-k">Agent now</span>
            <span>{state.agentWork}</span>
          </span>
          <span className="feed-basis muted small">Newest first, by time published</span>
        </div>
        {!following && <p className="feed-note">Following paused: new entries are held until you resume. The brief keeps updating.</p>}
        {state.preparing && (
          <ol className="prep" aria-label="Preparing the brief">
            {state.prepSteps.map((p) => (
              <li key={p.label} className={`prep-step prep-${p.status}`}>
                <StepGlyph status={p.status} />
                <span className="prep-text">
                  <span className="prep-label">{p.label}</span>
                  {p.outcome && <span className="prep-outcome">{p.outcome}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {mode === 'catchup' && (
          <div className="catchup" role="group" aria-label="Since you last reviewed">
            <div className="catchup-summary">
              <span className="catchup-since">{cu.since === null ? 'No review point set. Showing everything since the incident began.' : `Since your review point at ${fmt(cu.since)}.`}</span>
              <dl className="catchup-counts">
                <div>
                  <dt>Important, unread</dt>
                  <dd>{cu.consequential.length}</dd>
                </div>
                <div>
                  <dt>Revisions</dt>
                  <dd>{cu.revisions.length}</dd>
                </div>
                <div>
                  <dt>Decisions and response</dt>
                  <dd>{cu.decisionsAndResponse.length}</dd>
                </div>
                <div>
                  <dt>All entries</dt>
                  <dd>{cu.entries.length}</dd>
                </div>
              </dl>
            </div>
            <div className="catchup-actions">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'MARK_REVIEW_POINT' })}>
                Set review point at {fmt(state.now)}
              </button>
              <span className="muted small">Marks where you have read to. It acknowledges nothing.</span>
            </div>
          </div>
        )}
      </div>

      <div className="feed-scroll" ref={scrollRef} onScroll={onScroll}>
        {heldCount > 0 && (
          <div className="feed-held">
            <button type="button" className="btn btn-sm btn-primary" onClick={showHeld}>
              <ArrowUp size={13} aria-hidden="true" />
              {plural(heldCount, 'new update')}
            </button>
            <span className="muted small">{following ? 'Held while you read further down.' : 'Held while following is paused.'}</span>
          </div>
        )}
        {list.length === 0 ? (
          <p className="empty">{mode === 'catchup' ? 'Nothing new since your review point.' : 'No entries yet.'}</p>
        ) : (
          <ol className="feed-list">
            {list.map((e) => (
              <li key={e.id}>
                <FeedEntryCard e={e} />
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </section>
  );
}
