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

/**
 * @deprecated V1 screen shape produced by v2DocumentToV1() and still consumed
 * by the technician/admin document screens, AdminDocumentCard, and the
 * technician/admin dashboard hooks. New code should use Document. Remove this
 * interface only after those consumers use Document directly and the adapter
 * conversion is retired.
 */
export interface TechnicianDocument {
  id: string;
  technicianId: string;
  type: DocumentType;
  fileName: string;
  status: DocumentStatus;
  uploadedAt: string;
}
