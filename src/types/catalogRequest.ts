export type CatalogRequestStatus = 'pending' | 'approved' | 'rejected' | 'merged';

// A user-submitted "I can't find my aircraft/engine rating" request — free
// text only, never inserted into the official aircraft_type_ratings catalog
// and never used for matching until an admin resolves it into a real
// catalog row (resolvedAircraftTypeRatingId). status/reviewedAt/reviewedBy-
// equivalents are server-owned: always 'pending'/undefined on insert, only
// ever changed by an admin flow (not implemented in this phase).
export interface CatalogRequest {
  id: string;
  requestedBy: string;
  rawText: string;
  context?: string;
  status: CatalogRequestStatus;
  resolvedAircraftTypeRatingId?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}
