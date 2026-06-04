import { DocumentStatus } from './enums'; // owned by enums.ts — not re-exported here

export type DocumentType = 'license' | 'medical' | 'id' | 'training' | 'resume' | 'other';

// V2 Document — simple MVP review fields; no audit log, no reviewer identity, no auto-expiration
export interface Document {
  id: string;
  technicianId: string;
  type: DocumentType;
  fileName: string;
  storagePath: string; // Supabase Storage path
  status: DocumentStatus;
  uploadedAt: string;
  reviewedAt?: string;      // set when admin changes status (verified / rejected / expired)
  rejectionReason?: string; // set when status becomes rejected; cleared on other transitions
  expiresAt?: string;
}

/** @deprecated use Document instead */
export interface TechnicianDocument {
  id: string;
  technicianId: string;
  type: DocumentType;
  fileName: string;
  status: DocumentStatus;
  uploadedAt: string;
}
