import { Check, CircleCheck, CircleHelp, Clock, MessageSquare, Scale, Split, Unlink } from 'lucide-react';
import { TRUST_SHORT } from '../../domain/brief';
import { TRUST_LABEL, type Trust } from '../../domain/types';

const ICON: Record<Trust, typeof Check> = {
  verified: Check,
  reported: MessageSquare,
  assessment: Scale,
  conflict: Split,
  unknown: CircleHelp,
  'not-reported': CircleHelp,
  unavailable: Unlink,
  stale: Clock,
  'confirmed-absent': CircleCheck,
};

/** One small, restrained tag. The words come from TRUST_LABEL; the colour never stands alone. */
export function TrustTag({ trust, size = 'md' }: { trust: Trust; size?: 'sm' | 'md' }) {
  const Icon = ICON[trust];
  return (
    <span className={`trust trust-${trust} trust-${size}`}>
      <Icon aria-hidden="true" size={size === 'sm' ? 12 : 13} strokeWidth={2.25} />
      <span>{TRUST_LABEL[trust]}</span>
    </span>
  );
}

/** Inline mark for the brief: icon and short word, no box. Says how far a line can be relied on, never whether it is good news. */
export function TrustMark({ trust, title }: { trust: Trust; title?: string }) {
  const Icon = ICON[trust];
  return (
    <span className={`tm tm-${trust}`} title={title ?? TRUST_LABEL[trust]}>
      <Icon aria-hidden="true" size={12} strokeWidth={2.4} />
      <span>{TRUST_SHORT[trust]}</span>
    </span>
  );
}
