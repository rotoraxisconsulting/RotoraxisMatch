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

// Pure conflict checks backing offerRequestRepository.create() and
// offerApplicationRepository.create() — extracted so the branching that
// decides whether a new direct-offer/application is allowed can be unit
// tested without a live Supabase connection. Each repository stays
// responsible for fetching the rows; these functions only decide.

/**
 * Guard for offerRequestRepository.create() (a company sending a direct
 * offer to a technician). `existingRequests` must already be scoped to
 * this (companyId, technicianId) pair; `existingApplicationsForOffer`
 * must already be scoped to this (companyId, technicianId, offerId) —
 * pass `[]` when `offerId` is undefined (an open-ended direct offer has
 * no matching application table to check).
 */
export function evaluateDirectOfferConflict(
  existingRequests: { status: OfferRequestStatus; offerId?: string }[],
  existingApplicationsForOffer: { status: OfferRequestStatus }[],
  offerId: string | undefined,
): string | null {
  const activeRequest = existingRequests.find((request) =>
    isActiveOfferRelationStatus(request.status) &&
    (offerId ? request.offerId === offerId : !request.offerId),
  );
  if (activeRequest) return 'An active direct offer already exists for this technician.';

  if (offerId) {
    const activeApplication = existingApplicationsForOffer.find((application) =>
      isActiveOfferRelationStatus(application.status),
    );
    if (activeApplication) return 'This technician already has an active application for this offer.';
  }

  return null;
}

/**
 * Guard for offerApplicationRepository.create() (a technician applying to
 * an offer). One application per technician per offer, regardless of
 * status, was already decided and implemented once — see
 * docs/archive/V2_S0B_H6_ONE_APPLICATION_PER_OFFER_REPORT.md (2026-05-31), back
 * when this repository read/wrote a local JSON array. That guard clause
 * did not survive the rewrite to real Supabase queries — the ported
 * create() checked for a conflicting direct offer but never checked its
 * own table at all, silently regressing H6's rule (confirmed by reading
 * that report while auditing this method for Fase 3b hardening, not a
 * newly-invented rule). This function restores it.
 *
 * `existingActiveDirectOffer` is the technician's active direct offer for
 * this same offer, if any. `existingApplication` is the technician's own
 * offer_applications row for this offer, if any — at
 * most one can ever exist (UNIQUE(technician_id, offer_id), migration
 * 001) and its status can never be re-opened once terminal (rejected/
 * expired/withdrawn — see assertOfferRelationTransition/
 * assert_offer_relation_transition, both of which map every terminal
 * status to zero allowed outgoing transitions). So a terminal existing row
 * always blocks a new attempt too — same one-shot-per-offer rule, just a
 * friendlier message than the raw unique-constraint violation Postgres
 * would otherwise surface.
 */
export function evaluateApplicationConflict(
  existingActiveDirectOffer: { status: OfferRequestStatus } | undefined | null,
  existingApplication: { status: OfferRequestStatus } | undefined | null,
): string | null {
  if (existingActiveDirectOffer && isActiveOfferRelationStatus(existingActiveDirectOffer.status)) {
    return 'You already have a direct offer for this role. Review it from Direct Offers.';
  }

  if (existingApplication) {
    if (isActiveOfferRelationStatus(existingApplication.status)) {
      return 'You already have an active application for this offer.';
    }
    return 'You already applied to this offer previously — re-applying is not available once an application has been withdrawn or decided.';
  }

  return null;
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
