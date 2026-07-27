/**
 * V1-shaped type, kept alive on purpose via v2CompatAdapters.ts
 * (v2OfferRequestToMatchRequest — status 'sent' maps to V2 'pending'). This
 * is the real, working shape behind company/search, admin screens, and the
 * map today — NOT dead code and NOT safely deletable as a quick cleanup
 * (confirmed by consumer grep, docs/PHASE5_INVENTORY.md item c, 2026-07-26).
 * Retiring it in favor of OfferRequest (src/types/offerRequest.ts)
 * everywhere is tracked as its own future mission ("V2 UI migration —
 * retire v2CompatAdapters", see docs/MISSION_PART66.md backlog), not part
 * of the Part-66 coherence mission's Fase 5.
 */
export type MatchRequestStatus = 'sent' | 'accepted' | 'rejected';

/**
 * V1-shaped type, kept alive on purpose via v2CompatAdapters.ts — see the
 * note on MatchRequestStatus above. Same retirement plan, same "not a Fase
 * 5 cleanup item" caveat.
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
