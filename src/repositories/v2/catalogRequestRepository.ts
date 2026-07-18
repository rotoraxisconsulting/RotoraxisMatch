import { supabase } from '../../lib/supabase';
import { CatalogRequest } from '../../types/catalogRequest';
import { DbRow, mapCatalogRequestRow, throwIfError } from './supabaseMappers';

const SELECT = 'id, requested_by, raw_text, context, status, resolved_aircraft_type_rating_id, admin_notes, created_at, updated_at';

// "I can't find my aircraft/engine rating" requests. Never treated as a
// normalized catalog entry — status/resolvedAircraftTypeRatingId/adminNotes
// are server-owned (see migration 016's force_catalog_request_defaults
// trigger) and an admin review/approval flow is explicitly out of scope for
// this phase.
export const catalogRequestRepository = {
  async create(data: {
    requestedBy: string;
    rawText: string;
    context?: string;
  }): Promise<CatalogRequest> {
    const { data: inserted, error } = await supabase
      .from('catalog_requests')
      .insert({
        requested_by: data.requestedBy,
        raw_text: data.rawText,
        context: data.context ?? null,
      })
      .select(SELECT)
      .single();
    throwIfError(error);
    return mapCatalogRequestRow(inserted as DbRow);
  },

  async getForUser(userId: string): Promise<CatalogRequest[]> {
    const { data, error } = await supabase
      .from('catalog_requests')
      .select(SELECT)
      .eq('requested_by', userId)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as DbRow[]).map(mapCatalogRequestRow);
  },
};
