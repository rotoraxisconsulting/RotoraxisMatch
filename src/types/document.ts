import { DocumentStatus } from './enums'; // owned by enums.ts — not re-exported here

export type DocumentType = 'license' | 'medical' | 'id' | 'training' | 'resume' | 'other';

// V2 Document — adds storagePath, verifiedAt, verifiedBy, expiresAt
export interface Document {
  id: string;
  technicianId: string;
  type: DocumentType;
  fileName: string;
  storagePath: string; // local path in demo; Supabase Storage path later
  status: DocumentStatus;
  uploadedAt: string;
  verifiedAt?: string;
  verifiedBy?: string; // admin profile id
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
