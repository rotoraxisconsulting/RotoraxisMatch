export type DocumentType = 'license' | 'medical' | 'training' | 'id' | 'resume' | 'other';

export type DocumentStatus = 'verified' | 'pending' | 'rejected';

export interface TechnicianDocument {
  id: string;
  technicianId: string;
  type: DocumentType;
  fileName: string;
  status: DocumentStatus;
  uploadedAt: string;
}
