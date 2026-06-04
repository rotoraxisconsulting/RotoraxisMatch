import { supabase } from '../../lib/supabase';
import { Document } from '../../types/document';
import { DocumentStatus } from '../../types/enums';
import { mapDocumentRow, throwIfError } from './supabaseMappers';

export const documentRepositoryV2 = {
  async getAll(): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('id, technician_id, type, file_name, storage_path, status, uploaded_at, reviewed_at, rejection_reason, expires_at')
      .order('uploaded_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapDocumentRow);
  },

  async getById(id: string): Promise<Document | null> {
    const { data, error } = await supabase
      .from('documents')
      .select('id, technician_id, type, file_name, storage_path, status, uploaded_at, reviewed_at, rejection_reason, expires_at')
      .eq('id', id)
      .maybeSingle();
    throwIfError(error);
    return data ? mapDocumentRow(data as any) : null;
  },

  async getForTechnician(technicianId: string): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('id, technician_id, type, file_name, storage_path, status, uploaded_at, reviewed_at, rejection_reason, expires_at')
      .eq('technician_id', technicianId)
      .order('uploaded_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapDocumentRow);
  },

  async getVerifiedForTechnician(technicianId: string): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('id, technician_id, type, file_name, storage_path, status, uploaded_at, reviewed_at, rejection_reason, expires_at')
      .eq('technician_id', technicianId)
      .eq('status', 'verified')
      .order('uploaded_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapDocumentRow);
  },

  async updateStatus(
    id: string,
    status: DocumentStatus,
    rejectionReason?: string,
  ): Promise<Document | null> {
    const update = {
      status,
      reviewed_at: status === 'pending' ? null : new Date().toISOString(),
      rejection_reason: status === 'rejected' ? rejectionReason ?? 'Document rejected' : null,
    };
    const { data, error } = await supabase
      .from('documents')
      .update(update)
      .eq('id', id)
      .select('id, technician_id, type, file_name, storage_path, status, uploaded_at, reviewed_at, rejection_reason, expires_at')
      .maybeSingle();
    throwIfError(error);
    return data ? mapDocumentRow(data as any) : null;
  },

  async add(doc: Document): Promise<Document> {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        technician_id: doc.technicianId,
        type: doc.type,
        file_name: doc.fileName,
        storage_path: doc.storagePath,
        status: doc.status,
        expires_at: doc.expiresAt ?? null,
      })
      .select('id, technician_id, type, file_name, storage_path, status, uploaded_at, reviewed_at, rejection_reason, expires_at')
      .single();
    throwIfError(error);
    return mapDocumentRow(data as any);
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from('documents').delete().eq('id', id);
    throwIfError(error);
    return true;
  },
};
