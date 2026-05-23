import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { OfferRequest } from '../../types/offerRequest';
import { OfferRequestStatus } from '../../types/enums';
import { chatRepository } from './chatRepository';
import { activityRepository } from './activityRepository';

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const offerRequestRepository = {
  async getAll(): Promise<OfferRequest[]> {
    return await storageAdapter.get<OfferRequest[]>(DB_KEYS.v2OfferRequests) ?? [];
  },

  async getById(id: string): Promise<OfferRequest | null> {
    const all = await this.getAll();
    return all.find((r) => r.id === id) ?? null;
  },

  async getForTechnician(technicianId: string): Promise<OfferRequest[]> {
    const all = await this.getAll();
    return all.filter((r) => r.technicianId === technicianId);
  },

  async getForCompany(companyId: string): Promise<OfferRequest[]> {
    const all = await this.getAll();
    return all.filter((r) => r.companyId === companyId);
  },

  async create(data: {
    companyId: string;
    technicianId: string;
    offerId?: string;
    message?: string;
  }): Promise<OfferRequest> {
    const all = await this.getAll();

    const existingPending = all.find(
      (r) =>
        r.companyId === data.companyId &&
        r.technicianId === data.technicianId &&
        r.status === 'pending' &&
        (data.offerId ? r.offerId === data.offerId : !r.offerId),
    );
    if (existingPending) throw new Error('A pending direct offer already exists for this technician.');

    const now = new Date().toISOString();
    const request: OfferRequest = {
      kind: 'direct_offer',
      id: `oreq-${uuid()}`,
      companyId: data.companyId,
      technicianId: data.technicianId,
      offerId: data.offerId,
      status: 'pending',
      identityRevealed: false,
      documentsUnlocked: false,
      message: data.message,
      createdAt: now,
      updatedAt: now,
    };

    await storageAdapter.set(DB_KEYS.v2OfferRequests, [...all, request]);
    await activityRepository.create({
      type: 'direct_offer_received',
      recipientRole: 'technician',
      recipientId: data.technicianId,
      entityId: request.id,
    });
    return request;
  },

  async updateStatus(id: string, status: OfferRequestStatus): Promise<OfferRequest | null> {
    const all = await this.getAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return null;

    const prev = all[idx];

    // TODO: Move this invariant to a Supabase trigger/Edge Function in the backend phase.
    // Local simulation of the on_offer_accepted trigger:
    const isAccepted = status === 'accepted';
    const updated: OfferRequest = {
      ...prev,
      status,
      identityRevealed: isAccepted,
      documentsUnlocked: isAccepted,
      updatedAt: new Date().toISOString(),
    };

    const next = [...all];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2OfferRequests, next);

    if (isAccepted) {
      await chatRepository.getOrCreateRoom({
        offerRequestId: id,
        technicianId: prev.technicianId,
        companyId: prev.companyId,
      });
    }

    await activityRepository.create({
      type: isAccepted ? 'direct_offer_accepted' : 'direct_offer_rejected',
      recipientRole: 'company',
      recipientId: prev.companyId,
      entityId: id,
    });

    return updated;
  },

  async withdraw(id: string, technicianId: string): Promise<OfferRequest | null> {
    const req = await this.getById(id);
    if (!req || req.technicianId !== technicianId) return null;
    if (req.status !== 'pending') throw new Error('Only pending requests can be withdrawn.');
    return this.updateStatus(id, 'withdrawn');
  },
};
