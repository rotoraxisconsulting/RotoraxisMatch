import { OfferRequestStatus } from '../types/enums';
import { ActivityType } from '../types/activity';

export type OfferRelationKind = 'direct_offer' | 'application';

const TERMINAL_STATUSES = new Set<OfferRequestStatus>([
  'accepted',
  'rejected',
  'expired',
  'withdrawn',
]);

const ALLOWED_TRANSITIONS: Record<OfferRequestStatus, OfferRequestStatus[]> = {
  pending: ['accepted', 'rejected', 'expired', 'withdrawn'],
  accepted: [],
  rejected: [],
  expired: [],
  withdrawn: [],
};

export function isActiveOfferRelationStatus(status: OfferRequestStatus): boolean {
  return status === 'pending' || status === 'accepted';
}

export function assertOfferRelationTransition(
  from: OfferRequestStatus,
  to: OfferRequestStatus,
): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    const terminalHint = TERMINAL_STATUSES.has(from) ? ' Terminal records cannot be changed.' : '';
    throw new Error(`Invalid status transition from ${from} to ${to}.${terminalHint}`);
  }
}

export function shouldUnlockAcceptedRelation(status: OfferRequestStatus): boolean {
  return status === 'accepted';
}

export function getStatusActivityType(
  kind: OfferRelationKind,
  status: OfferRequestStatus,
): ActivityType | null {
  if (kind === 'direct_offer') {
    if (status === 'accepted') return 'direct_offer_accepted';
    if (status === 'rejected') return 'direct_offer_rejected';
    return null;
  }

  if (status === 'accepted') return 'application_accepted';
  if (status === 'rejected') return 'application_rejected';
  return null;
}
