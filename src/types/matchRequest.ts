/**
 * @deprecated V1 compat type. Use OfferRequest (src/types/offerRequest.ts) for new code.
 * Status 'sent' maps to V2 'pending' via v2OfferRequestToMatchRequest().
 * Remove once all consumers (company/search, admin screens, map) are migrated to V2.
 */
export type MatchRequestStatus = 'sent' | 'accepted' | 'rejected';

/**
 * @deprecated V1 compat type. Use OfferRequest (src/types/offerRequest.ts) for new code.
 */
export interface MatchRequest {
  id: string;
  companyId: string;
  technicianId: string;
  status: MatchRequestStatus;
  identityRevealed: boolean;
  createdAt: string;
  message?: string;
}
