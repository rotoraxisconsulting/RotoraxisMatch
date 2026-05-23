import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { OfferApplication } from '../../types/offerRequest';
import { OfferRequestStatus } from '../../types/enums';
import { chatRepository } from './chatRepository';
import { activityRepository } from './activityRepository';

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const offerApplicationRepository = {
  async getAll(): Promise<OfferApplication[]> {
    return await storageAdapter.get<OfferApplication[]>(DB_KEYS.v2OfferApplications) ?? [];
  },

  async getById(id: string): Promise<OfferApplication | null> {
    const all = await this.getAll();
    return all.find((a) => a.id === id) ?? null;
  },

  async getForTechnician(technicianId: string): Promise<OfferApplication[]> {
    const all = await this.getAll();
    return all.filter((a) => a.technicianId === technicianId);
  },

  async getForOffer(offerId: string): Promise<OfferApplication[]> {
    const all = await this.getAll();
    return all.filter((a) => a.offerId === offerId);
  },

  async getForCompany(companyId: string): Promise<OfferApplication[]> {
    const all = await this.getAll();
    return all.filter((a) => a.companyId === companyId);
  },

  async create(data: {
    technicianId: string;
    offerId: string;
    companyId: string;
    coverNote?: string;
  }): Promise<OfferApplication> {
    const all = await this.getAll();

    const existingPending = all.find(
      (a) =>
        a.technicianId === data.technicianId &&
        a.offerId === data.offerId &&
        a.status === 'pending',
    );
    if (existingPending) throw new Error('You have already applied to this offer.');

    const now = new Date().toISOString();
    const application: OfferApplication = {
      kind: 'application',
      id: `oapp-${uuid()}`,
      technicianId: data.technicianId,
      offerId: data.offerId,
      companyId: data.companyId,
      status: 'pending',
      identityRevealed: false,
      documentsUnlocked: false,
      coverNote: data.coverNote,
      createdAt: now,
      updatedAt: now,
    };

    await storageAdapter.set(DB_KEYS.v2OfferApplications, [...all, application]);
    await activityRepository.create({
      type: 'application_received',
      recipientRole: 'company',
      recipientId: data.companyId,
      entityId: application.id,
    });
    return application;
  },

  async updateStatus(id: string, status: OfferRequestStatus): Promise<OfferApplication | null> {
    const all = await this.getAll();
    const idx = all.findIndex((a) => a.id === id);
    if (idx === -1) return null;

    const prev = all[idx];

    // TODO: Move this invariant to a Supabase trigger/Edge Function in the backend phase.
    // Local simulation of the on_offer_accepted trigger:
    const isAccepted = status === 'accepted';
    const updated: OfferApplication = {
      ...prev,
      status,
      identityRevealed: isAccepted,
      documentsUnlocked: isAccepted,
      updatedAt: new Date().toISOString(),
    };

    const next = [...all];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2OfferApplications, next);

    if (isAccepted) {
      await chatRepository.getOrCreateRoom({
        offerApplicationId: id,
        technicianId: prev.technicianId,
        companyId: prev.companyId,
      });
    }

    await activityRepository.create({
      type: isAccepted ? 'application_accepted' : 'application_rejected',
      recipientRole: 'technician',
      recipientId: prev.technicianId,
      entityId: id,
    });

    return updated;
  },

  async withdraw(id: string, technicianId: string): Promise<OfferApplication | null> {
    const app = await this.getById(id);
    if (!app || app.technicianId !== technicianId) return null;
    if (app.status !== 'pending') throw new Error('Only pending applications can be withdrawn.');
    return this.updateStatus(id, 'withdrawn');
  },
};
