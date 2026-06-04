import { supabase } from '../../lib/supabase';
import { OfferRequest } from '../../types/offerRequest';
import { OfferRequestStatus } from '../../types/enums';
import { isActiveOfferRelationStatus } from '../../utils/offerRelationStateMachine';
import { isOfferOpenForTechnicians, offerRepository } from './offerRepository';
import { mapOfferApplicationRow, mapOfferRequestRow, throwIfError } from './supabaseMappers';

const SELECT_FIELDS = 'id, company_id, technician_id, offer_id, status, identity_revealed, documents_unlocked, message, created_at, updated_at';

export const offerRequestRepository = {
  async getAll(): Promise<OfferRequest[]> {
    const { data, error } = await supabase
      .from('offer_requests')
      .select(SELECT_FIELDS)
      .order('updated_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRequestRow);
  },

  async getById(id: string): Promise<OfferRequest | null> {
    const { data, error } = await supabase
      .from('offer_requests')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .maybeSingle();
    throwIfError(error);
    return data ? mapOfferRequestRow(data as any) : null;
  },

  async getForTechnician(technicianId: string): Promise<OfferRequest[]> {
    const { data, error } = await supabase
      .from('offer_requests')
      .select(SELECT_FIELDS)
      .eq('technician_id', technicianId)
      .order('updated_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRequestRow);
  },

  async getForCompany(companyId: string): Promise<OfferRequest[]> {
    const { data, error } = await supabase
      .from('offer_requests')
      .select(SELECT_FIELDS)
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapOfferRequestRow);
  },

  async create(data: {
    companyId: string;
    technicianId: string;
    offerId?: string;
    message?: string;
  }): Promise<OfferRequest> {
    if (data.offerId) {
      const offer = await offerRepository.getById(data.offerId);
      if (!isOfferOpenForTechnicians(offer) || offer?.companyId !== data.companyId) {
        throw new Error('Closed or unpublished offers cannot be sent as direct offers.');
      }
    }

    const { data: existingRequests, error: reqError } = await supabase
      .from('offer_requests')
      .select(SELECT_FIELDS)
      .eq('company_id', data.companyId)
      .eq('technician_id', data.technicianId);
    throwIfError(reqError);
    const activeRequest = ((existingRequests ?? []) as any[])
      .map(mapOfferRequestRow)
      .find((request) =>
        isActiveOfferRelationStatus(request.status) &&
        (data.offerId ? request.offerId === data.offerId : !request.offerId),
      );
    if (activeRequest) throw new Error('An active direct offer already exists for this technician.');

    if (data.offerId) {
      const { data: existingApplications, error: appError } = await supabase
        .from('offer_applications')
        .select('id, technician_id, offer_id, company_id, status, identity_revealed, documents_unlocked, cover_note, created_at, updated_at')
        .eq('company_id', data.companyId)
        .eq('technician_id', data.technicianId)
        .eq('offer_id', data.offerId);
      throwIfError(appError);
      const activeApplication = ((existingApplications ?? []) as any[])
        .map(mapOfferApplicationRow)
        .find((application) => isActiveOfferRelationStatus(application.status));
      if (activeApplication) {
        throw new Error('This technician already has an active application for this offer.');
      }
    }

    const { data: inserted, error } = await supabase
      .from('offer_requests')
      .insert({
        company_id: data.companyId,
        technician_id: data.technicianId,
        offer_id: data.offerId ?? null,
        message: data.message ?? null,
      })
      .select(SELECT_FIELDS)
      .single();
    throwIfError(error);
    return mapOfferRequestRow(inserted as any);
  },

  async updateStatus(id: string, status: OfferRequestStatus): Promise<OfferRequest | null> {
    const { data, error } = await supabase
      .from('offer_requests')
      .update({ status })
      .eq('id', id)
      .select(SELECT_FIELDS)
      .maybeSingle();
    throwIfError(error);
    return data ? mapOfferRequestRow(data as any) : null;
  },

  async withdraw(id: string, technicianId: string): Promise<OfferRequest | null> {
    const req = await this.getById(id);
    if (!req || req.technicianId !== technicianId) return null;
    if (req.status !== 'pending') throw new Error('Only pending requests can be withdrawn.');
    return this.updateStatus(id, 'withdrawn');
  },
};
