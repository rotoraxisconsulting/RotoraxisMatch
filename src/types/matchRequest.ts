export type MatchRequestStatus = 'sent' | 'accepted' | 'rejected';

export interface MatchRequest {
  id: string;
  companyId: string;
  technicianId: string;
  status: MatchRequestStatus;
  identityRevealed: boolean;
  createdAt: string;
  message?: string;
}
