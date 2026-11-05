import { useEcc } from '../../domain/store';
import { Field } from '../components/bits';
import { fmt } from '../util';

export function DraftVersion({ version }: { version: number }) {
  const { state } = useEcc();
  const h = state.draft?.history.find((x) => x.version === version);
  if (!h) return <p className="empty">This version is no longer on the record.</p>;
  return (
    <div className="detail">
      <div className="detail-kicker">Earlier version · read only</div>
      <h3 className="detail-title">Draft {h.version}</h3>
      <p className="muted small">
        Information as of {fmt(h.asOf)} · {h.reviewed ? `Reviewed by ${h.reviewed.by} at ${fmt(h.reviewed.at)}` : 'Not marked reviewed'}
      </p>
      {h.sections.map((s) => (
        <Field key={s.id} label={s.title}>
          <pre className="pre-text">{s.text}</pre>
        </Field>
      ))}
    </div>
  );
}
