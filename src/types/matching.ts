// A match score is ALWAYS tied to a specific offer + technician pair.
// It is never a global score on a technician_profile row.
export interface MatchScore {
  offerId: string;      // the offer this score belongs to
  technicianId: string; // the technician this score belongs to
  total: number;        // 0–100
  label: MatchLabel;
  breakdown: {
    verified: number;
    habilitation: number;
    license: number;
    availability: number;
    experience: number;
    location: number;
  };
}

export type MatchLabel = 'Excellent match' | 'Strong match' | 'Partial match' | 'Low match';
