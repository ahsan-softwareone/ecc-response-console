import { ArrowRight, Bell, Boxes, ChevronRight, CircleHelp, Gavel, Lightbulb, MessageSquare, Radio, RefreshCw, Siren, Split, Unlink } from 'lucide-react';
import { useState } from 'react';
import { isUnreviewed, linkedConcern } from '../../domain/brief';
import { recordLabel } from '../../domain/content';
import { useEcc } from '../../domain/store';
import { FEED_KIND_LABEL, type FeedEntry as Entry, type FeedKind } from '../../domain/types';
import { useUi } from '../App';
import { EvidenceCount, RefChips } from '../components/Chips';
import { RefLink } from '../components/RefLink';
import { SeverityTag } from '../components/Severity';
import { TrustMark } from '../components/TrustTag';
import { fmt, plural } from '../util';

export const FEED_ICON: Record<FeedKind, typeof Bell> = {
  notification: Bell,
  alert: Siren,
  finding: MessageSquare,
  equipment: Boxes,
  assessment: RefreshCw,
  conflict: Split,
  gap: CircleHelp,
  recommendation: Lightbulb,
  source: Unlink,
  decision: Gavel,
  response: Radio,
};

/** Observed, received and published, only where they differ. */
export function entryTimes(e: Entry): { label: string; at: number }[] {
  const out: { label: string; at: number }[] = [];
  if (e.observedAt !== undefined) out.push({ label: 'Observed', at: e.observedAt });
  if (e.receivedAt !== undefined && e.receivedAt !== e.observedAt) out.push({ label: 'Received', at: e.receivedAt });
  const last = out[out.length - 1];
  if (!last || last.at !== e.publishedAt) out.push({ label: 'Published', at: e.publishedAt });
  if (out.length === 1) return [{ label: '', at: out[0].at }];
  return out;
}

/**
 * One coherent thing learned or changed. Collapsed, it is one statement with its evidence count
 * and one action; expanded, it carries the full finding, what it replaced, uncertainty, every
 * citation and how it was produced.
 */
export function FeedEntryCard({ e, defaultOpen = false }: { e: Entry; defaultOpen?: boolean }) {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const Icon = FEED_ICON[e.feedKind];
  const open = e.consequential && !e.supersededBy && isUnreviewed(state, e);
  const selected = state.rail.open && state.rail.stack[state.rail.stack.length - 1] === e.id;
  const isRevision = e.feedKind === 'assessment' || !!e.before;
  const [expanded, setExpanded] = useState(defaultOpen);
  const concern = linkedConcern(state, e);
  const quote = (e.feedKind === 'finding' || e.feedKind === 'response') && e.attribution !== 'ECC agent';
  const times = entryTimes(e);
  const primary = e.observedAt !== undefined && e.observedAt !== e.publishedAt ? { label: 'observed', at: e.observedAt } : { label: '', at: e.publishedAt };
  const detailId = `${e.id}-d`;

  return (
    <article className={`fe fe-${e.feedKind} ${e.supersededBy ? 'is-superseded' : ''} ${open ? 'is-open-consequential' : ''} ${selected ? 'is-selected' : ''} ${expanded ? 'is-expanded' : ''}`} aria-labelledby={`${e.id}-t`}>
      <div className="fe-rail" aria-hidden="true">
        <Icon size={15} />
      </div>
      <div className="fe-main">
        <header className="fe-head">
          <span className="fe-kind">{isRevision && e.feedKind !== 'assessment' ? 'Revised' : FEED_KIND_LABEL[e.feedKind]}</span>
          {e.severity && <SeverityTag display={e.severity} source={e.sourceSeverity} size="sm" />}
          {e.trust && <TrustMark trust={e.trust} />}
          <span className="fe-time t-num" title={times.map((t) => `${t.label || 'Published'} ${fmt(t.at)}`).join(' · ')}>
            {primary.label && <span className="fe-time-k">{primary.label} </span>}
            {fmt(primary.at)}
          </span>
          {open && <span className="fe-flag">Important update · unread</span>}
        </header>
        {e.supersededBy && (
          <p className="fe-superseded">
            Superseded by <RefLink id={e.supersededBy} label={recordLabel(state, e.supersededBy)} />
          </p>
        )}
        <h3 className="fe-title" id={`${e.id}-t`}>
          {e.title}
        </h3>
        {!expanded && <p className="fe-summary">{e.summary ?? e.body}</p>}
        {expanded && (
          <div className="fe-detail" id={detailId}>
            {e.before && (
              <div className="fe-before">
                <span className="fe-k">Was</span>
                <span>{e.before}</span>
              </div>
            )}
            {quote ? (
              <div className="fe-quote">
                <p>{e.body}</p>
                <footer>{e.attribution}</footer>
              </div>
            ) : (
              <p className="fe-body">{e.body}</p>
            )}
            {e.why && (
              <div className="fe-line">
                <span className="fe-k">Why it matters</span>
                <span>{e.why}</span>
              </div>
            )}
            {e.uncertainty && (
              <div className="fe-line">
                <span className="fe-k">Uncertain</span>
                <span>{e.uncertainty}</span>
              </div>
            )}
            {e.severity && (
              <div className="fe-line">
                <span className="fe-k">Severity</span>
                <span>
                  Source sent <span className="mono">{e.sourceSeverity}</span>, shown as <SeverityTag display={e.severity} size="sm" />. Illustrative mapping, not approved policy.
                </span>
              </div>
            )}
            {e.group && e.group.length > 0 && (
              <div className="fe-line">
                <span className="fe-k">{plural(e.group.length, 'item')}</span>
                <span>{e.group.join(' · ')}</span>
              </div>
            )}
            <div className="fe-line">
              <span className="fe-k">Sources</span>
              <span>
                <RefChips ids={e.citations} emptyNote={e.noSupportNote ?? 'No reference cited.'} />
                {e.citations.length > 0 && e.noSupportNote && <span className="no-support"> {e.noSupportNote}</span>}
              </span>
            </div>
            {e.assets.filter((a) => state.assets.find((x) => x.id === a)?.identified).length > 0 && (
              <div className="fe-line">
                <span className="fe-k">Equipment</span>
                <span className="fe-assets">
                  {e.assets
                    .filter((a) => state.assets.find((x) => x.id === a)?.identified)
                    .map((a) => (
                      <button key={a} type="button" className="tag-btn" onClick={() => ui.openAsset(a)}>
                        {recordLabel(state, a)}
                      </button>
                    ))}
                </span>
              </div>
            )}
            {concern && (
              <div className="fe-line">
                <span className="fe-k">Attention item</span>
                <span>
                  <RefLink id={concern.action.ref} label={concern.title} />
                  {concern.status && <span className="muted"> · {concern.status}</span>}
                </span>
              </div>
            )}
            <div className="fe-line fe-meta">
              <span className="fe-k">Record</span>
              <span className="t-num">
                {!quote && <span>{e.attribution} · </span>}
                {times.map((t, i) => (
                  <span key={i}>
                    {i > 0 && ' · '}
                    {t.label ? `${t.label} ` : 'Published '}
                    {fmt(t.at)}
                  </span>
                ))}
                {e.repeatCount && e.repeatCount > 1 && (
                  <span>
                    {' '}
                    · {plural(e.repeatCount, 'attempt')}
                    {e.lastRepeatAt !== undefined && `, last ${fmt(e.lastRepeatAt)}`}
                  </span>
                )}
                {e.supersedes && (
                  <span>
                    {' '}
                    · Replaces <RefLink id={e.supersedes} label="earlier entry" />
                  </span>
                )}
                {e.activity.length > 0 && state.prototypeRole !== 'Observer' && (
                  <span>
                    {' '}
                    ·{' '}
                    <button type="button" className="link-btn" onClick={() => ui.openActivity(e.activity)}>
                      How this was produced
                    </button>
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
        <footer className="fe-foot">
          <EvidenceCount ids={e.citations} note={e.noSupportNote} />
          <span className="fe-foot-actions">
            <button type="button" className="fe-expand" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={() => setExpanded((x) => !x)}>
              <ChevronRight size={13} aria-hidden="true" className="fe-expand-chev" />
              {expanded ? 'Less' : 'Details'}
            </button>
            {e.action && (
              <button type="button" className={`btn btn-sm ${e.feedKind === 'recommendation' && !e.supersededBy ? 'btn-primary' : ''}`} onClick={() => dispatch({ type: 'OPEN_RECORD', id: e.action!.ref })}>
                {e.action.label}
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </span>
        </footer>
      </div>
    </article>
  );
}
