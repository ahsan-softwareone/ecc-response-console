import { Check, CircleDot, CircleHelp, Clock, TriangleAlert } from 'lucide-react';
import { ACTION_STATUS_LABEL, type ActionStatus as Status } from '../../domain/types';

const ICON: Record<Status, typeof Check> = {
  'no-report': CircleHelp,
  'in-progress': CircleDot,
  'could-not-complete': TriangleAlert,
  'completion-reported': Clock,
  'completion-verified': Check,
};

/** Response status. Only "completion verified" is allowed to look settled. */
export function ActionStatusTag({ status }: { status: Status }) {
  const Icon = ICON[status];
  return (
    <span className={`astatus astatus-${status}`}>
      <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
      <span>{ACTION_STATUS_LABEL[status]}</span>
    </span>
  );
}
